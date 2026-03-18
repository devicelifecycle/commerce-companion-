import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createPurchaseJournalEntry } from '@/lib/accounting/journalAutomation';
import { useAuth } from '@/lib/auth';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { PackageCheck, AlertCircle, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface ReceivePODialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  poId: string | null;
}

interface PODetail {
  id: string;
  po_number: string;
  supplier_name: string;
  supplier_id: string | null;
  company_id: string | null;
  total_amount: number;
  gst_hst_amount: number | null;
  pst_qst_amount: number | null;
  subtotal: number;
  status: string;
}

interface POItem {
  id: string;
  description: string;
  quantity: number;
  unit_cost: number;
  gst_hst_amount: number | null;
  pst_qst_amount: number | null;
  total_cost: number;
}

interface ReceiveLine {
  po_item_id: string;
  description: string;
  ordered_qty: number;
  received_qty: number;
  condition: string;
  notes: string;
  action: 'accept' | 'return_to_supplier' | 'write_off';
}

export function ReceivePODialog({ open, onOpenChange, onSuccess, poId }: ReceivePODialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [po, setPO] = useState<PODetail | null>(null);
  const [poItems, setPOItems] = useState<POItem[]>([]);
  const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>([]);
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [createAP, setCreateAP] = useState(true);

  useEffect(() => {
    if (open && poId) {
      loadPOData();
    }
  }, [open, poId]);

  const loadPOData = async () => {
    if (!poId) return;
    const [{ data: poData }, { data: items }] = await Promise.all([
      supabase.from('purchase_orders').select('*').eq('id', poId).single(),
      supabase.from('purchase_order_items').select('*').eq('purchase_order_id', poId),
    ]);

    if (poData) setPO(poData as unknown as PODetail);
    if (items) {
      setPOItems(items as POItem[]);
      setReceiveLines(items.map((item: any) => ({
        po_item_id: item.id,
        description: item.description,
        ordered_qty: item.quantity,
        received_qty: item.quantity,
        condition: 'passed',
        notes: '',
        action: 'accept',
      })));
    }
  };

  const updateLine = (index: number, updates: Partial<ReceiveLine>) => {
    setReceiveLines(prev => prev.map((line, i) => {
      if (i !== index) return line;
      const updated = { ...line, ...updates };
      // Auto-set action based on condition
      if (updates.condition && updates.condition !== 'passed') {
        updated.action = 'return_to_supplier';
      } else if (updates.condition === 'passed') {
        updated.action = 'accept';
      }
      return updated;
    }));
  };

  const totalReceived = receiveLines.reduce((sum, l) => sum + l.received_qty, 0);
  const totalOrdered = receiveLines.reduce((sum, l) => sum + l.ordered_qty, 0);
  const isPartial = totalReceived < totalOrdered && totalReceived > 0;
  const defectiveLines = receiveLines.filter(l => l.condition !== 'passed' && l.received_qty > 0);
  const hasDefectiveItems = defectiveLines.length > 0;

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const handleSubmit = async () => {
    if (!po || !user) return;
    const validLines = receiveLines.filter(l => l.received_qty > 0);
    if (validLines.length === 0) {
      toast.error('Receive at least one item');
      return;
    }

    setLoading(true);
    try {
      // 1. Generate GRN number
      const { count } = await supabase
        .from('goods_received_notes')
        .select('id', { count: 'exact', head: true });
      const grnNum = `GRN-${format(new Date(), 'yyyyMMdd')}-${String((count || 0) + 1).padStart(3, '0')}`;

      // 2. Create GRN
      const { data: grn, error: grnError } = await supabase.from('goods_received_notes').insert({
        grn_number: grnNum,
        received_date: receivedDate,
        status: isPartial ? 'partial' : 'completed',
        notes: notes || null,
        supplier_id: po.supplier_id,
        purchase_order_id: po.id,
        company_id: po.company_id,
        received_by: user.id,
      }).select('id').single();

      if (grnError) throw grnError;

      // 3. Create GRN items
      if (grn) {
        const grnItems = validLines.map(line => ({
          grn_id: grn.id,
          purchase_order_item_id: line.po_item_id,
          quantity_received: line.received_qty,
          condition_status: line.condition,
          notes: line.notes || null,
        }));
        const { error: itemsError } = await supabase.from('grn_items').insert(grnItems);
        if (itemsError) throw itemsError;
      }

      // 4. Update PO status
      const newStatus = isPartial ? 'partially_received' : 'received';
      await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', po.id);

      // 5. Add accepted items to products inventory
      const acceptedLines = validLines.filter(l => l.condition === 'passed' || l.action === 'accept');
      for (const line of acceptedLines) {
        const poItem = poItems.find(p => p.id === line.po_item_id);
        if (!poItem) continue;

        const { data: existingProduct } = await supabase
          .from('products')
          .select('id, quantity_on_hand')
          .eq('company_id', po.company_id!)
          .ilike('name', line.description)
          .maybeSingle();

        if (existingProduct) {
          await supabase.from('products').update({
            quantity_on_hand: existingProduct.quantity_on_hand + line.received_qty,
            cost_price: poItem.unit_cost,
          }).eq('id', existingProduct.id);
        } else {
          await supabase.from('products').insert({
            name: line.description,
            company_id: po.company_id,
            supplier_id: po.supplier_id,
            cost_price: poItem.unit_cost,
            quantity_on_hand: line.received_qty,
            status: 'active',
            created_by: user.id,
          });
        }
      }

      // 6. Handle defective/damaged items — create supplier RMAs
      const returnLines = validLines.filter(l => l.condition !== 'passed' && l.action === 'return_to_supplier');
      if (returnLines.length > 0) {
        const year = new Date().getFullYear();
        const { count: rmaCount } = await supabase.from('return_authorizations').select('id', { count: 'exact', head: true });
        let rmaIdx = (rmaCount || 0) + 1;

        for (const line of returnLines) {
          const poItem = poItems.find(p => p.id === line.po_item_id);
          const rmaNumber = `RMA-P-${year}-${String(rmaIdx++).padStart(4, '0')}`;
          const { error: rmaError } = await supabase.from('return_authorizations').insert({
            rma_number: rmaNumber,
            return_type: 'purchase_return',
            reason: `${line.condition}: ${line.description}`,
            status: 'pending',
            resolution_type: 'refund',
            company_id: po.company_id,
            supplier_id: po.supplier_id,
            purchase_order_id: po.id,
            original_cost: poItem ? poItem.unit_cost * line.received_qty : 0,
            refund_amount: poItem ? poItem.total_cost : 0,
            notes: line.notes || `Auto-created from receiving PO ${po.po_number}. Condition: ${line.condition}`,
            created_by: user.id,
            device_condition_on_return: line.condition,
          });
          if (rmaError) {
            console.error('RMA creation error:', rmaError);
            toast.error(`Failed to create return for "${line.description}": ${rmaError.message}`);
          }
        }
        toast.info(`${returnLines.length} supplier return(s) created in Returns`);
      }

      // 7. Auto-create AP entry if requested (only for accepted items value)
      if (createAP) {
        const acceptedItems = validLines.filter(l => l.action === 'accept' || l.condition === 'passed');
        const totalOrderedQty = receiveLines.reduce((s, l) => s + l.ordered_qty, 0);
        const acceptedQty = acceptedItems.reduce((s, l) => s + l.received_qty, 0);
        const ratio = totalOrderedQty > 0 ? acceptedQty / totalOrderedQty : 1;
        const apAmount = parseFloat((po.total_amount * ratio).toFixed(2));
        const apGst = parseFloat(((po.gst_hst_amount || 0) * ratio).toFixed(2));
        const apPst = parseFloat(((po.pst_qst_amount || 0) * ratio).toFixed(2));
        const apSubtotal = parseFloat((apAmount - apGst - apPst).toFixed(2));

        if (apAmount > 0) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);

          const { data: apRecord, error: apError } = await supabase.from('accounts_payable').insert({
            vendor_name: po.supplier_name,
            vendor_id: po.supplier_id,
            original_amount: apAmount,
            balance_due: apAmount,
            gst_hst_amount: apGst,
            pst_amount: apPst,
            bill_date: receivedDate,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'unpaid',
            category: 'inventory_purchase',
            description: `PO ${po.po_number} — ${po.supplier_name}`,
            bill_number: po.po_number,
            company_id: po.company_id,
            created_by: user.id,
          }).select('id').single();

          if (apError) {
            console.error('AP creation error:', apError);
            toast.warning('PO received but AP entry failed — create manually in Accounts Payable');
          } else {
            toast.success(`AP entry created for ${fmtCurrency(apAmount)}`);
          }

          // 8. Auto-post journal entry: Dr. Inventory + Dr. GST/HST Paid / Cr. AP
          if (po.company_id) {
            const VES_ID = '4e0fa3a6-06a9-4618-8513-f66143c05b28';
            const isVES = po.company_id === VES_ID;
            try {
              await createPurchaseJournalEntry({
                companyId: po.company_id,
                purchaseId: apRecord?.id || po.id,
                receiveDate: receivedDate,
                supplierName: po.supplier_name,
                poNumber: po.po_number,
                unitCost: apSubtotal,
                gstHstAmount: apGst,
                qstAmount: apPst,
                totalAmount: apAmount,
                deviceDescription: `PO ${po.po_number} — bulk items`,
                isVES,
              });
              toast.success('Journal entry posted (Dr. Inventory / Cr. AP)');
            } catch (jeErr: any) {
              console.error('Journal entry error:', jeErr);
              toast.warning('AP created but journal entry failed — post manually');
            }
          }
        }
      }

      // 9. Create product lot records for accepted items
      for (const line of acceptedLines) {
        const poItem = poItems.find(p => p.id === line.po_item_id);
        if (!poItem) continue;

        // Find or get the product that was just created/updated
        const { data: product } = await supabase
          .from('products')
          .select('id')
          .eq('company_id', po.company_id!)
          .ilike('name', line.description)
          .maybeSingle();

        if (product) {
          // Generate lot number from PO number
          const lotNumber = `LOT-${po.po_number}-${line.po_item_id.slice(0, 4)}`;
          await supabase.from('product_lots').insert({
            product_id: product.id,
            lot_number: lotNumber,
            quantity: line.received_qty,
            cost_price: poItem.unit_cost,
            received_date: receivedDate,
            supplier_id: po.supplier_id,
            notes: `From PO ${po.po_number}`,
          });
        }
      }

      toast.success(`GRN ${grnNum} created — PO marked as ${newStatus.replace('_', ' ')}`);
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'Failed to receive PO');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setPO(null);
    setPOItems([]);
    setReceiveLines([]);
    setReceivedDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setCreateAP(true);
  };

  if (!po) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            Receive PO — {po.po_number}
          </DialogTitle>
          <DialogDescription>
            Record items received from <strong>{po.supplier_name}</strong>. A Goods Received Note (GRN) will be created automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Received Date</Label>
              <Input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <Badge variant={isPartial ? 'secondary' : 'default'} className="text-xs">
                {totalReceived} / {totalOrdered} items
              </Badge>
              {isPartial && (
                <Badge variant="outline" className="text-xs text-warning border-warning">
                  <AlertCircle className="h-3 w-3 mr-1" /> Partial
                </Badge>
              )}
            </div>
          </div>

          {/* Items to receive */}
          <div className="space-y-2">
            <span className="font-medium text-sm">Items to Receive</span>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-16 text-center">Ordered</TableHead>
                  <TableHead className="w-20 text-center">Received</TableHead>
                  <TableHead className="w-28">Condition</TableHead>
                  <TableHead className="w-32">Action</TableHead>
                  <TableHead className="w-28">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receiveLines.map((line, index) => (
                  <TableRow key={line.po_item_id} className={line.condition !== 'passed' ? 'bg-destructive/5' : ''}>
                    <TableCell className="text-sm">{line.description}</TableCell>
                    <TableCell className="text-center font-mono">{line.ordered_qty}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={line.ordered_qty}
                        value={line.received_qty}
                        onChange={e => updateLine(index, { received_qty: Math.min(parseInt(e.target.value) || 0, line.ordered_qty) })}
                        className="h-8 text-center"
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={line.condition} onValueChange={v => updateLine(index, { condition: v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="passed">✓ Passed</SelectItem>
                          <SelectItem value="damaged">⚠ Damaged</SelectItem>
                          <SelectItem value="defective">✕ Defective</SelectItem>
                          <SelectItem value="wrong_item">↩ Wrong Item</SelectItem>
                          <SelectItem value="missing">∅ Missing/Short</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {line.condition !== 'passed' ? (
                        <Select value={line.action} onValueChange={(v: any) => updateLine(index, { action: v })}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="return_to_supplier">Return to Supplier</SelectItem>
                            <SelectItem value="accept">Accept As-Is</SelectItem>
                            <SelectItem value="write_off">Write Off</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="Optional"
                        value={line.notes}
                        onChange={e => updateLine(index, { notes: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Defective items warning */}
          {hasDefectiveItems && (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-warning">
                  {defectiveLines.length} item(s) flagged with issues
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Items marked "Return to Supplier" will automatically create a supplier RMA in Returns. 
                  "Accept As-Is" records the condition but keeps the item. 
                  "Write Off" records a loss.
                </p>
              </div>
            </div>
          )}

          <Separator />

          {/* AP auto-generation toggle with checkbox */}
          <label className="flex items-start gap-3 rounded-lg border p-3 bg-muted/30 cursor-pointer">
            <Checkbox
              checked={createAP}
              onCheckedChange={(v) => setCreateAP(v === true)}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium">Auto-create Accounts Payable</p>
              <p className="text-xs text-muted-foreground">
                Creates an AP entry for {fmtCurrency(po.total_amount)} due in 30 days (Net 30).
                {hasDefectiveItems && ' Amount will be adjusted for returned items.'}
              </p>
            </div>
          </label>

          <div className="space-y-1.5">
            <Label className="text-xs">Receiving Notes</Label>
            <Textarea
              placeholder="Any notes about this shipment..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Processing...' : `Receive ${totalReceived} Item${totalReceived !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
