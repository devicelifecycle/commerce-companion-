import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { PackageCheck, AlertCircle } from 'lucide-react';
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
        received_qty: item.quantity, // default to full quantity
        condition: 'passed',
        notes: '',
      })));
    }
  };

  const updateLine = (index: number, updates: Partial<ReceiveLine>) => {
    setReceiveLines(prev => prev.map((line, i) => i === index ? { ...line, ...updates } : line));
  };

  const totalReceived = receiveLines.reduce((sum, l) => sum + l.received_qty, 0);
  const totalOrdered = receiveLines.reduce((sum, l) => sum + l.ordered_qty, 0);
  const isPartial = totalReceived < totalOrdered && totalReceived > 0;

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

      // 5. Auto-create AP entry if requested
      if (createAP) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30); // Net 30

        const { error: apError } = await supabase.from('accounts_payable').insert({
          vendor_name: po.supplier_name,
          vendor_id: po.supplier_id,
          original_amount: po.total_amount,
          balance_due: po.total_amount,
          gst_hst_amount: po.gst_hst_amount || 0,
          pst_amount: po.pst_qst_amount || 0,
          bill_date: receivedDate,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'unpaid',
          category: 'inventory_purchase',
          description: `PO ${po.po_number} — ${po.supplier_name}`,
          bill_number: po.po_number,
          company_id: po.company_id,
          created_by: user.id,
        });
        if (apError) {
          console.error('AP creation error:', apError);
          toast.warning('PO received but AP entry failed — create manually in Accounts Payable');
        } else {
          toast.success('Accounts Payable entry created automatically');
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
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
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
                  <AlertCircle className="h-3 w-3 mr-1" /> Partial Receive
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
                  <TableHead className="w-20 text-center">Ordered</TableHead>
                  <TableHead className="w-24 text-center">Receiving</TableHead>
                  <TableHead className="w-32">Condition</TableHead>
                  <TableHead className="w-36">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receiveLines.map((line, index) => (
                  <TableRow key={line.po_item_id}>
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
                          <SelectItem value="passed">Passed</SelectItem>
                          <SelectItem value="damaged">Damaged</SelectItem>
                          <SelectItem value="defective">Defective</SelectItem>
                          <SelectItem value="wrong_item">Wrong Item</SelectItem>
                        </SelectContent>
                      </Select>
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

          <Separator />

          {/* AP auto-generation toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div>
              <p className="text-sm font-medium">Auto-create Accounts Payable</p>
              <p className="text-xs text-muted-foreground">Creates an AP entry for {fmtCurrency(po.total_amount)} due in 30 days</p>
            </div>
            <Button
              variant={createAP ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCreateAP(!createAP)}
            >
              {createAP ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

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
