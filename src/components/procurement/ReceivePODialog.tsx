import { useState, useEffect } from 'react';
import { emitRefetch } from '@/hooks/useDataRefetch';
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
import { PackageCheck, AlertCircle, AlertTriangle, Plus, Trash2, Package, Wrench, Receipt } from 'lucide-react';
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
  po_type?: string;
}

interface POItem {
  id: string;
  description: string;
  quantity: number;
  unit_cost: number;
  gst_hst_amount: number | null;
  pst_qst_amount: number | null;
  total_cost: number;
  item_type: string;
}

/** Each PO line item can have multiple split rows with different conditions */
interface SplitRow {
  id: string; // unique key for React
  qty: number;
  condition: string;
  action: 'accept' | 'return_to_supplier' | 'write_off';
  notes: string;
}

interface ReceiveGroup {
  po_item_id: string;
  description: string;
  ordered_qty: number;
  item_type: string;
  splits: SplitRow[];
}

let splitCounter = 0;
const newSplitId = () => `split-${++splitCounter}`;

export function ReceivePODialog({ open, onOpenChange, onSuccess, poId }: ReceivePODialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [po, setPO] = useState<PODetail | null>(null);
  const [poItems, setPOItems] = useState<POItem[]>([]);
  const [groups, setGroups] = useState<ReceiveGroup[]>([]);
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [createAP, setCreateAP] = useState(true);

  useEffect(() => {
    if (open && poId) {
      splitCounter = 0;
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
      setGroups(items.map((item: any) => ({
        po_item_id: item.id,
        description: item.description,
        ordered_qty: item.quantity,
        item_type: item.item_type || 'inventory',
        splits: [{
          id: newSplitId(),
          qty: item.quantity,
          condition: 'passed',
          action: 'accept' as const,
          notes: '',
        }],
      })));
    }
  };

  const updateSplit = (groupIdx: number, splitIdx: number, updates: Partial<SplitRow>) => {
    setGroups(prev => prev.map((g, gi) => {
      if (gi !== groupIdx) return g;
      return {
        ...g,
        splits: g.splits.map((s, si) => {
          if (si !== splitIdx) return s;
          const updated = { ...s, ...updates };
          if (updates.condition && updates.condition !== 'passed') {
            updated.action = 'return_to_supplier';
          } else if (updates.condition === 'passed') {
            updated.action = 'accept';
          }
          return updated;
        }),
      };
    }));
  };

  const addSplit = (groupIdx: number) => {
    setGroups(prev => prev.map((g, gi) => {
      if (gi !== groupIdx) return g;
      const usedQty = g.splits.reduce((s, r) => s + r.qty, 0);
      const remaining = Math.max(0, g.ordered_qty - usedQty);
      return {
        ...g,
        splits: [...g.splits, {
          id: newSplitId(),
          qty: remaining,
          condition: 'damaged',
          action: 'return_to_supplier' as const,
          notes: '',
        }],
      };
    }));
  };

  const removeSplit = (groupIdx: number, splitIdx: number) => {
    setGroups(prev => prev.map((g, gi) => {
      if (gi !== groupIdx || g.splits.length <= 1) return g;
      return { ...g, splits: g.splits.filter((_, si) => si !== splitIdx) };
    }));
  };

  // Flatten all splits for summary
  const allSplits = groups.flatMap(g => g.splits.map(s => ({ ...s, po_item_id: g.po_item_id, description: g.description, ordered_qty: g.ordered_qty, item_type: g.item_type })));
  const totalReceived = allSplits.reduce((sum, s) => sum + s.qty, 0);
  const totalOrdered = groups.reduce((sum, g) => sum + g.ordered_qty, 0);
  const isPartial = totalReceived < totalOrdered && totalReceived > 0;
  const defectiveSplits = allSplits.filter(s => s.condition !== 'passed' && s.qty > 0);
  const hasDefectiveItems = defectiveSplits.length > 0;

  // Validation: check if any group exceeds ordered qty
  const overAllocated = groups.some(g => g.splits.reduce((s, r) => s + r.qty, 0) > g.ordered_qty);

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const handleSubmit = async () => {
    if (!po || !user) return;
    if (overAllocated) {
      toast.error('Some items have more received than ordered — fix the quantities');
      return;
    }

    const validSplits = allSplits.filter(s => s.qty > 0);
    if (validSplits.length === 0) {
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

      // 3. Create GRN items — one per split row
      if (grn) {
        const grnItems = validSplits.map(split => ({
          grn_id: grn.id,
          purchase_order_item_id: split.po_item_id,
          quantity_received: split.qty,
          condition_status: split.condition,
          notes: split.notes || null,
        }));
        const { error: itemsError } = await supabase.from('grn_items').insert(grnItems);
        if (itemsError) throw itemsError;
      }

      // 4. Update PO status
      const newStatus = isPartial ? 'partially_received' : 'received';
      await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', po.id);

      // 5. Add accepted items to inventory — route based on item_type per line
      const acceptedByItem = new Map<string, { qty: number; description: string; po_item_id: string; item_type: string }>();
      for (const split of validSplits) {
        if (split.condition === 'passed' || split.action === 'accept') {
          const existing = acceptedByItem.get(split.po_item_id);
          if (existing) {
            existing.qty += split.qty;
          } else {
            acceptedByItem.set(split.po_item_id, { qty: split.qty, description: split.description, po_item_id: split.po_item_id, item_type: split.item_type });
          }
        }
      }

      for (const [, item] of acceptedByItem) {
        const poItem = poItems.find(p => p.id === item.po_item_id);
        if (!poItem) continue;

        if (item.item_type === 'expense') {
          // Route to expenses table — tools/supplies not for inventory
          const totalCost = poItem.unit_cost * item.qty;
          const gst = (poItem.gst_hst_amount || 0) * (item.qty / poItem.quantity);
          const pst = (poItem.pst_qst_amount || 0) * (item.qty / poItem.quantity);
          await supabase.from('expenses').insert({
            description: `${item.description} (PO ${po.po_number})`,
            amount: totalCost,
            gst_hst_amount: parseFloat(gst.toFixed(2)),
            pst_amount: parseFloat(pst.toFixed(2)),
            category: 'supplies' as any,
            subcategory: 'Tools & Equipment',
            vendor: po.supplier_name,
            expense_date: receivedDate,
            company_id: po.company_id,
            created_by: user.id,
            payment_method: 'credit',
            notes: `Auto-created from PO ${po.po_number}`,
          });
          toast.info(`Expense recorded for ${item.description}`);
        } else if (item.item_type === 'repair_parts') {
          // Route to repair_parts table — match by normalized key first, then ilike name
          const inputKey = item.description.toLowerCase().replace(/[^a-z0-9]/g, '');
          
          // Try exact name match first
          let existingPart: any = null;
          const { data: exactMatch } = await supabase
            .from('repair_parts')
            .select('id, quantity_on_hand')
            .eq('company_id', po.company_id!)
            .ilike('name', item.description)
            .maybeSingle();
          existingPart = exactMatch;

          // If no exact match, try fuzzy match on existing parts
          if (!existingPart) {
            const { data: allParts } = await supabase
              .from('repair_parts')
              .select('id, name, quantity_on_hand')
              .eq('company_id', po.company_id!);
            if (allParts) {
              existingPart = allParts.find((p: any) => {
                const partKey = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                return partKey === inputKey || 
                  (inputKey.length > 5 && partKey.length > 5 && partKey.includes(inputKey.slice(0, 6)));
              });
            }
          }

          if (existingPart) {
            await supabase.from('repair_parts').update({
              quantity_on_hand: existingPart.quantity_on_hand + item.qty,
              unit_cost: poItem.unit_cost,
            }).eq('id', existingPart.id);
          } else {
            await supabase.from('repair_parts').insert({
              name: item.description,
              company_id: po.company_id,
              supplier_id: po.supplier_id,
              unit_cost: poItem.unit_cost,
              quantity_on_hand: item.qty,
              category: 'general',
              is_active: true,
              created_by: user.id,
            });
          }
        } else {
          // Route to products table (inventory & product types)
          const { data: existingProduct } = await supabase
            .from('products')
            .select('id, quantity_on_hand')
            .eq('company_id', po.company_id!)
            .ilike('name', item.description)
            .maybeSingle();

          if (existingProduct) {
            await supabase.from('products').update({
              quantity_on_hand: existingProduct.quantity_on_hand + item.qty,
              cost_price: poItem.unit_cost,
            }).eq('id', existingProduct.id);
          } else {
            // Auto-create product if it doesn't exist
            await supabase.from('products').insert({
              name: item.description,
              company_id: po.company_id,
              supplier_id: po.supplier_id,
              cost_price: poItem.unit_cost,
              quantity_on_hand: item.qty,
              status: 'active',
              created_by: user.id,
            });
            toast.info(`New product "${item.description}" auto-created`);
          }
        }
      }

      // 6. Handle defective/damaged items — create supplier RMAs (one per split row)
      const returnSplits = validSplits.filter(s => s.condition !== 'passed' && s.action === 'return_to_supplier');
      if (returnSplits.length > 0) {
        const year = new Date().getFullYear();
        const { count: rmaCount } = await supabase.from('return_authorizations').select('id', { count: 'exact', head: true });
        let rmaIdx = (rmaCount || 0) + 1;

        for (const split of returnSplits) {
          const poItem = poItems.find(p => p.id === split.po_item_id);
          const rmaNumber = `RMA-P-${year}-${String(rmaIdx++).padStart(4, '0')}`;
          const { error: rmaError } = await supabase.from('return_authorizations').insert({
            rma_number: rmaNumber,
            return_type: 'purchase_return',
            reason: `${split.condition}: ${split.description} (${split.qty} units)`,
            status: 'pending',
            resolution_type: 'refund',
            company_id: po.company_id,
            supplier_id: po.supplier_id,
            purchase_order_id: po.id,
            original_cost: poItem ? poItem.unit_cost * split.qty : 0,
            refund_amount: poItem ? poItem.unit_cost * split.qty : 0,
            notes: split.notes || `Auto-created from receiving PO ${po.po_number}. Condition: ${split.condition}. Qty: ${split.qty}`,
            created_by: user.id,
            device_condition_on_return: split.condition,
          });
          if (rmaError) {
            console.error('RMA creation error:', rmaError);
            toast.error(`Failed to create return for "${split.description}": ${rmaError.message}`);
          }
        }
        toast.info(`${returnSplits.length} supplier return(s) created in Returns`);
      }

      // 7. Update existing AP entry (created when PO was first created) or create if missing
      if (createAP) {
        let acceptedQty = 0;
        for (const [, item] of acceptedByItem) acceptedQty += item.qty;
        const ratio = totalOrdered > 0 ? acceptedQty / totalOrdered : 1;
        const apAmount = parseFloat((po.total_amount * ratio).toFixed(2));
        const apGst = parseFloat(((po.gst_hst_amount || 0) * ratio).toFixed(2));
        const apPst = parseFloat(((po.pst_qst_amount || 0) * ratio).toFixed(2));
        const apSubtotal = parseFloat((apAmount - apGst - apPst).toFixed(2));

        if (apAmount > 0) {
          // Check if AP already exists from PO creation
          const { data: existingAP } = await supabase
            .from('accounts_payable')
            .select('id')
            .eq('bill_number', po.po_number)
            .eq('company_id', po.company_id)
            .limit(1);

          let apRecordId: string | null = null;

          if (existingAP && existingAP.length > 0) {
            // Update existing AP with final received amounts
            apRecordId = existingAP[0].id;
            await supabase.from('accounts_payable').update({
              original_amount: apAmount,
              balance_due: apAmount,
              gst_hst_amount: apGst,
              pst_amount: apPst,
              description: `PO ${po.po_number} — ${po.supplier_name} (received)`,
            }).eq('id', apRecordId);
            toast.success(`AP entry updated for ${fmtCurrency(apAmount)}`);
          } else {
            // Create AP if it doesn't exist (e.g., legacy POs created before this fix)
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
              apRecordId = apRecord?.id || null;
              toast.success(`AP entry created for ${fmtCurrency(apAmount)}`);
            }
          }

          // 8. Auto-post journal entry
          if (po.company_id) {
            const VES_ID = '4e0fa3a6-06a9-4618-8513-f66143c05b28';
            const isVES = po.company_id === VES_ID;
            try {
              await createPurchaseJournalEntry({
                companyId: po.company_id,
                purchaseId: apRecordId || po.id,
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

      // 9. Create product lot records for accepted inventory items only
      for (const [, item] of acceptedByItem) {
        if (item.item_type !== 'inventory' && item.item_type !== 'product') continue; // skip expense & repair_parts
        const poItem = poItems.find(p => p.id === item.po_item_id);
        if (!poItem) continue;

        const { data: product } = await supabase
          .from('products')
          .select('id')
          .eq('company_id', po.company_id!)
          .ilike('name', item.description)
          .maybeSingle();

        if (product) {
          const lotNumber = `LOT-${po.po_number}-${item.po_item_id.slice(0, 4)}`;
          await supabase.from('product_lots').insert({
            product_id: product.id,
            lot_number: lotNumber,
            quantity: item.qty,
            cost_price: poItem.unit_cost,
            received_date: receivedDate,
            supplier_id: po.supplier_id,
            notes: `From PO ${po.po_number}`,
          });
        }
      }

      toast.success(`GRN ${grnNum} created — PO marked as ${newStatus.replace('_', ' ')}`);
      emitRefetch('purchase_orders');
      emitRefetch('inventory');
      emitRefetch('expenses');
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
    setGroups([]);
    setReceivedDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setCreateAP(true);
  };

  if (!po) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            Receive PO — {po.po_number}
          </DialogTitle>
          <DialogDescription>
            Record items received from <strong>{po.supplier_name}</strong>. Use "Split" to separate good and defective units within the same line item.
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
              {overAllocated && (
                <Badge variant="destructive" className="text-xs">
                  Over-allocated!
                </Badge>
              )}
            </div>
          </div>

          {/* Items to receive — grouped with splits */}
          <div className="space-y-3">
            <span className="font-medium text-sm">Items to Receive</span>
            {groups.map((group, groupIdx) => {
              const groupTotal = group.splits.reduce((s, r) => s + r.qty, 0);
              const isOver = groupTotal > group.ordered_qty;
              return (
                <div key={group.po_item_id} className={`rounded-lg border p-3 space-y-2 ${isOver ? 'border-destructive bg-destructive/5' : 'bg-muted/20'}`}>
                  {/* Group header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{group.description}</span>
                      {group.item_type === 'expense' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-[hsl(var(--accent))] bg-[hsl(var(--accent)/.1)] border-[hsl(var(--accent)/.25)]">
                          <Receipt className="h-2.5 w-2.5" /> Expense
                        </Badge>
                      )}
                      {group.item_type === 'repair_parts' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-[hsl(var(--warning))] bg-[hsl(var(--warning)/.1)] border-[hsl(var(--warning)/.25)]">
                          <Wrench className="h-2.5 w-2.5" /> Repair
                        </Badge>
                      )}
                      {group.item_type === 'inventory' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-[hsl(var(--info))] bg-[hsl(var(--info)/.1)] border-[hsl(var(--info)/.25)]">
                          <Package className="h-2.5 w-2.5" /> Device
                        </Badge>
                      )}
                      {group.item_type === 'product' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-[hsl(var(--success))] bg-[hsl(var(--success)/.1)] border-[hsl(var(--success)/.25)]">
                          <Package className="h-2.5 w-2.5" /> Product
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs font-mono">
                        Ordered: {group.ordered_qty}
                      </Badge>
                      {isOver && (
                        <Badge variant="destructive" className="text-xs">
                          Total {groupTotal} exceeds {group.ordered_qty}
                        </Badge>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => addSplit(groupIdx)}
                    >
                      <Plus className="h-3 w-3" /> Split
                    </Button>
                  </div>

                  {/* Split rows */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20 text-center">Qty</TableHead>
                        <TableHead className="w-32">Condition</TableHead>
                        <TableHead className="w-36">Action</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.splits.map((split, splitIdx) => (
                        <TableRow key={split.id} className={split.condition !== 'passed' ? 'bg-destructive/5' : ''}>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              max={group.ordered_qty}
                              value={split.qty}
                              onChange={e => updateSplit(groupIdx, splitIdx, { qty: Math.max(0, parseInt(e.target.value) || 0) })}
                              className="h-8 text-center"
                            />
                          </TableCell>
                          <TableCell>
                            <Select value={split.condition} onValueChange={v => updateSplit(groupIdx, splitIdx, { condition: v })}>
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
                            {split.condition !== 'passed' ? (
                              <Select value={split.action} onValueChange={(v: any) => updateSplit(groupIdx, splitIdx, { action: v })}>
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
                              <span className="text-xs text-muted-foreground">
                                {group.item_type === 'expense' ? 'Accept → Expense' : group.item_type === 'repair_parts' ? 'Accept → Repair Parts' : 'Accept → Inventory'}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="Optional"
                              value={split.notes}
                              onChange={e => updateSplit(groupIdx, splitIdx, { notes: e.target.value })}
                              className="h-8 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            {group.splits.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => removeSplit(groupIdx, splitIdx)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}
          </div>

          {/* Defective items warning */}
          {hasDefectiveItems && (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-warning">
                  {defectiveSplits.length} split(s) flagged with issues ({defectiveSplits.reduce((s, d) => s + d.qty, 0)} units)
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  "Return to Supplier" auto-creates a supplier RMA. "Accept As-Is" adds to inventory with noted condition. "Write Off" records a loss.
                </p>
              </div>
            </div>
          )}

          <Separator />

          {/* AP auto-generation toggle */}
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
          <Button onClick={handleSubmit} disabled={loading || overAllocated}>
            {loading ? 'Processing...' : `Receive ${totalReceived} Item${totalReceived !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
