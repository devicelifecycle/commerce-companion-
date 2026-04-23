import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createPaymentMadeJournalEntry } from '@/lib/accounting/journalAutomation';
import { useAuth } from '@/lib/auth';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { FileText, DollarSign, Package, Plus, User, Calendar, Building2, Truck, PackageCheck } from 'lucide-react';
import { format } from 'date-fns';
import { emitRefetch } from '@/hooks/useDataRefetch';

interface PODetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
  poId: string | null;
  canManage: boolean;
  /** Opens the Receive Items / GRN flow for this PO. Closes this dialog first. */
  onInitiateGRN?: (poId: string) => void;
}

export function PODetailDialog({ open, onOpenChange, onUpdate, poId, canManage, onInitiateGRN }: PODetailDialogProps) {
  const { user } = useAuth();
  const [po, setPO] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [grns, setGrns] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [creatorName, setCreatorName] = useState<string>('—');
  const [supplierInfo, setSupplierInfo] = useState<any>(null);

  // Payment form
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [syncToAP, setSyncToAP] = useState(true);

  const VES_ID = '4e0fa3a6-06a9-4618-8513-f66143c05b28';

  useEffect(() => {
    if (open && poId) loadAll();
  }, [open, poId]);

  const loadAll = async () => {
    if (!poId) return;
    const [poRes, itemsRes, grnsRes, paymentsRes] = await Promise.all([
      supabase.from('purchase_orders').select('*').eq('id', poId).single(),
      supabase.from('purchase_order_items').select('*').eq('purchase_order_id', poId),
      supabase.from('goods_received_notes').select('*').eq('purchase_order_id', poId).order('received_date', { ascending: false }),
      supabase.from('po_payments').select('*').eq('purchase_order_id', poId).order('payment_date', { ascending: false }),
    ]);

    if (poRes.data) {
      setPO(poRes.data);
      // Load creator profile
      if (poRes.data.created_by) {
        const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('user_id', poRes.data.created_by).single();
        setCreatorName(profile?.full_name || profile?.email || '—');
      }
      // Load supplier details
      if (poRes.data.supplier_id) {
        const { data: sup } = await supabase.from('suppliers').select('*').eq('id', poRes.data.supplier_id).single();
        if (sup) setSupplierInfo(sup);
      }
    }
    if (itemsRes.data) setItems(itemsRes.data);
    if (paymentsRes.data) setPayments(paymentsRes.data);

    // Enrich GRNs with line counts, total qty received, and receiver names
    if (grnsRes.data && grnsRes.data.length > 0) {
      const grnIds = grnsRes.data.map((g: any) => g.id);
      const receiverIds = Array.from(new Set(grnsRes.data.map((g: any) => g.received_by).filter(Boolean)));
      const [{ data: grnItems }, { data: receivers }] = await Promise.all([
        supabase.from('grn_items').select('grn_id, quantity_received').in('grn_id', grnIds),
        receiverIds.length
          ? supabase.from('profiles').select('user_id, full_name, email').in('user_id', receiverIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const itemsByGrn = new Map<string, { lines: number; qty: number }>();
      (grnItems || []).forEach((row: any) => {
        const cur = itemsByGrn.get(row.grn_id) || { lines: 0, qty: 0 };
        cur.lines += 1;
        cur.qty += Number(row.quantity_received) || 0;
        itemsByGrn.set(row.grn_id, cur);
      });
      const receiverByUser = new Map<string, string>();
      (receivers || []).forEach((r: any) => {
        receiverByUser.set(r.user_id, r.full_name || r.email || '—');
      });
      const enriched = grnsRes.data.map((g: any) => ({
        ...g,
        _lineCount: itemsByGrn.get(g.id)?.lines || 0,
        _qtyTotal: itemsByGrn.get(g.id)?.qty || 0,
        _receiverName: g.received_by ? (receiverByUser.get(g.received_by) || '—') : '—',
      }));
      setGrns(enriched);
    } else {
      setGrns([]);
    }
  };

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = po ? po.total_amount - totalPaid : 0;

  const recordPayment = async () => {
    if (!po || !user) return;
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (amt > balance + 0.01) { toast.error('Payment exceeds balance due'); return; }

    setPaymentLoading(true);
    try {
      // 1. Record PO payment
      const { error } = await supabase.from('po_payments').insert({
        purchase_order_id: po.id,
        payment_date: paymentDate,
        amount: amt,
        payment_method: paymentMethod || null,
        reference_number: paymentRef || null,
        notes: paymentNotes || null,
        created_by: user.id,
      });
      if (error) throw error;

      // 2. Update PO payment status
      const newPaid = totalPaid + amt;
      const newStatus = newPaid >= po.total_amount ? 'paid' : 'partial';
      await supabase.from('purchase_orders').update({
        payment_status: newStatus,
        paid_amount: newPaid,
        payment_date: paymentDate,
        payment_method: paymentMethod || po.payment_method,
        payment_reference: paymentRef || po.payment_reference,
      }).eq('id', po.id);

      // 3. Sync to AP — find linked AP record and update it
      if (syncToAP && po.company_id) {
        const { data: apRecord } = await supabase
          .from('accounts_payable')
          .select('id, paid_amount, original_amount, balance_due')
          .eq('company_id', po.company_id)
          .eq('bill_number', po.po_number)
          .maybeSingle();

        if (apRecord) {
          const apNewPaid = (apRecord.paid_amount || 0) + amt;
          const apNewBalance = apRecord.original_amount - apNewPaid;
          const apStatus = apNewBalance <= 0.01 ? 'paid' : 'partial';

          // Create AP payment record
          await supabase.from('ap_payments').insert({
            accounts_payable_id: apRecord.id,
            payment_date: paymentDate,
            amount: amt,
            payment_method: paymentMethod || null,
            reference_number: paymentRef || null,
            notes: paymentNotes || `Synced from PO ${po.po_number} payment`,
            created_by: user.id,
          });

          // Update AP balance
          await supabase.from('accounts_payable').update({
            paid_amount: apNewPaid,
            status: apStatus,
          }).eq('id', apRecord.id);

          // 4. Post journal entry: Dr. AP / Cr. Cash
          const isVES = po.company_id === VES_ID;
          try {
            await createPaymentMadeJournalEntry({
              companyId: po.company_id,
              paymentDate,
              amount: amt,
              referenceId: apRecord.id,
              supplierName: po.supplier_name,
              isVES,
            });
          } catch (jeErr) {
            console.error('Journal entry error:', jeErr);
            toast.warning('Payment recorded but journal entry failed');
          }

          toast.success(`AP updated: ${fmtCurrency(apNewBalance)} remaining`);
        } else {
          toast.info('No linked AP record found — payment recorded on PO only');
        }
      }

      toast.success(`Payment of ${fmtCurrency(amt)} recorded`);
      setShowPaymentForm(false);
      setPaymentAmount('');
      setPaymentRef('');
      setPaymentNotes('');
      loadAll();
      onUpdate();
      emitRefetch('purchase_orders');
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment');
    } finally {
      setPaymentLoading(false);
    }
  };

  if (!po) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <FileText className="h-5 w-5" />
            {po.po_number}
            <Badge variant={po.status === 'received' || po.status === 'completed' ? 'default' : 'secondary'} className="capitalize ml-2">
              {po.status?.replace('_', ' ')}
            </Badge>
            <Badge variant={po.payment_status === 'paid' ? 'default' : po.payment_status === 'partial' ? 'outline' : 'secondary'} className="capitalize">
              {po.payment_status}
            </Badge>
            {canManage && onInitiateGRN && (po.status === 'pending' || po.status === 'partially_received') && (
              <Button
                size="sm"
                className="ml-auto h-7 text-xs"
                onClick={() => { onInitiateGRN(po.id); onOpenChange(false); }}
              >
                <PackageCheck className="h-3.5 w-3.5 mr-1" /> Initiate GRN
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Summary header */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Supplier</p>
              <p className="font-medium">{po.supplier_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">PO Date</p>
              <p className="font-medium">{format(new Date(po.po_date), 'MMM d, yyyy')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Created By</p>
              <p className="font-medium">{creatorName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Truck className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Expected Delivery</p>
              <p className="font-medium">{po.expected_delivery_date ? format(new Date(po.expected_delivery_date), 'MMM d, yyyy') : '—'}</p>
            </div>
          </div>
        </div>

        {/* Supplier details (if available) */}
        {supplierInfo && (
          <div className="rounded-lg border p-3 bg-muted/20 text-xs grid grid-cols-2 md:grid-cols-4 gap-2">
            {supplierInfo.email && <div><span className="text-muted-foreground">Email:</span> {supplierInfo.email}</div>}
            {supplierInfo.phone && <div><span className="text-muted-foreground">Phone:</span> {supplierInfo.phone}</div>}
            {supplierInfo.gst_hst_number && <div><span className="text-muted-foreground">GST/HST #:</span> {supplierInfo.gst_hst_number}</div>}
            {supplierInfo.city && <div><span className="text-muted-foreground">Location:</span> {supplierInfo.city}{supplierInfo.province ? `, ${supplierInfo.province}` : ''}</div>}
          </div>
        )}

        <Tabs defaultValue="items" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="items">Line Items ({items.length})</TabsTrigger>
            <TabsTrigger value="receiving">GRNs ({grns.length})</TabsTrigger>
            <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
          </TabsList>

          {/* Line Items Tab */}
          <TabsContent value="items" className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center w-16">Qty</TableHead>
                  <TableHead className="text-right w-24">Unit Cost</TableHead>
                  <TableHead className="text-right w-20">GST/HST</TableHead>
                  <TableHead className="text-right w-20">PST</TableHead>
                  <TableHead className="text-right w-24">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-center font-mono">{item.quantity}</TableCell>
                    <TableCell className="text-right font-mono">{fmtCurrency(item.unit_cost)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtCurrency(item.gst_hst_amount || 0)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtCurrency(item.pst_qst_amount || 0)}</TableCell>
                    <TableCell className="text-right font-mono font-medium">{fmtCurrency(item.total_cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="rounded-lg border p-3 bg-muted/30 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmtCurrency(po.subtotal)}</span></div>
              {po.gst_hst_amount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">GST/HST</span><span>{fmtCurrency(po.gst_hst_amount)}</span></div>}
              {po.pst_qst_amount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">PST/QST</span><span>{fmtCurrency(po.pst_qst_amount)}</span></div>}
              <Separator className="my-1" />
              <div className="flex justify-between font-medium"><span>Total</span><span>{fmtCurrency(po.total_amount)}</span></div>
            </div>
          </TabsContent>

          {/* GRNs Tab */}
          <TabsContent value="receiving" className="space-y-3">
            {grns.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-sm text-muted-foreground">No goods received yet</p>
                {canManage && onInitiateGRN && (po.status === 'pending' || po.status === 'partially_received') && (
                  <Button size="sm" onClick={() => { onInitiateGRN(po.id); onOpenChange(false); }}>
                    <PackageCheck className="h-3.5 w-3.5 mr-1" /> Initiate GRN
                  </Button>
                )}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>GRN #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Lines</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead>Received By</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grns.map(g => (
                      <TableRow key={g.id}>
                        <TableCell className="font-mono font-medium text-xs">{g.grn_number}</TableCell>
                        <TableCell>{format(new Date(g.received_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell><Badge variant={g.status === 'completed' ? 'default' : 'secondary'} className="capitalize">{g.status}</Badge></TableCell>
                        <TableCell className="text-center font-mono">{g._lineCount}</TableCell>
                        <TableCell className="text-center font-mono">{g._qtyTotal}</TableCell>
                        <TableCell className="text-xs">{g._receiverName}</TableCell>
                        <TableCell className="text-muted-foreground text-xs max-w-[180px] truncate" title={g.notes || ''}>{g.notes || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {canManage && onInitiateGRN && po.status === 'partially_received' && (
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => { onInitiateGRN(po.id); onOpenChange(false); }}>
                      <PackageCheck className="h-3.5 w-3.5 mr-1" /> Receive Remaining Items
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="space-y-3">
            {/* Payment summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold font-mono">{fmtCurrency(po.total_amount)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="text-lg font-bold font-mono text-primary">{fmtCurrency(totalPaid)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className={`text-lg font-bold font-mono ${balance > 0 ? 'text-destructive' : 'text-primary'}`}>{fmtCurrency(balance)}</p>
              </div>
            </div>

            {payments.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>{format(new Date(p.payment_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="capitalize">{p.payment_method?.replace('_', ' ') || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{p.reference_number || '—'}</TableCell>
                      <TableCell className="text-right font-mono font-medium">{fmtCurrency(p.amount)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{p.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Record payment form */}
            {canManage && balance > 0 && (
              <>
                {!showPaymentForm ? (
                  <Button variant="outline" size="sm" onClick={() => { setShowPaymentForm(true); setPaymentAmount(balance.toFixed(2)); }}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Record Payment
                  </Button>
                ) : (
                  <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
                    <p className="text-sm font-medium">Record Payment</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Amount *</Label>
                        <Input type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Date</Label>
                        <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Method</Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="wire_transfer">Wire Transfer</SelectItem>
                            <SelectItem value="e_transfer">E-Transfer</SelectItem>
                            <SelectItem value="credit_card">Credit Card</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="cheque">Cheque</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Reference #</Label>
                        <Input value={paymentRef} onChange={e => setPaymentRef(e.target.value)} placeholder="Transaction ref..." />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Notes</Label>
                      <Input value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="Optional..." />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={syncToAP} onCheckedChange={(v) => setSyncToAP(v === true)} />
                      <span className="text-sm">Also record AP payment &amp; post journal entry (Dr. AP / Cr. Cash)</span>
                    </label>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setShowPaymentForm(false)}>Cancel</Button>
                      <Button size="sm" onClick={recordPayment} disabled={paymentLoading}>
                        {paymentLoading ? 'Saving...' : `Pay ${fmtCurrency(parseFloat(paymentAmount) || 0)}`}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {balance <= 0 && payments.length > 0 && (
              <div className="text-center py-2">
                <Badge variant="default" className="text-xs">✓ Fully Paid</Badge>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {po.notes && (
          <div className="text-sm">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-muted-foreground">{po.notes}</p>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          Created {format(new Date(po.created_at), 'MMM d, yyyy h:mm a')}
          {po.payment_method && ` · Payment method: ${po.payment_method.replace('_', ' ')}`}
        </div>
      </DialogContent>
    </Dialog>
  );
}
