import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { DeviceSearchCombobox } from '@/components/inventory/DeviceSearchCombobox';
import { emitRefetch } from '@/hooks/useDataRefetch';

interface SupplierReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected items (from bulk select in inventory) */
  preselectedItems?: Array<{
    id: string;
    type: 'device' | 'product' | 'repair_part';
    name: string;
    cost: number;
    supplierId?: string | null;
  }>;
  onSuccess?: () => void;
}

export function SupplierReturnDialog({ open, onOpenChange, preselectedItems, onSuccess }: SupplierReturnDialogProps) {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [flow, setFlow] = useState<'items' | 'supplier'>('items');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);

  // Form state
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedPOId, setSelectedPOId] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [deviceCondition, setDeviceCondition] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [resolutionType, setResolutionType] = useState<'refund' | 'exchange' | 'repair'>('refund');

  useEffect(() => {
    if (!open) return;
    fetchSuppliers();
    // If preselected items, auto-resolve supplier
    if (preselectedItems?.length) {
      const suppId = preselectedItems[0].supplierId;
      if (suppId) setSelectedSupplierId(suppId);
      const totalCost = preselectedItems.reduce((s, i) => s + i.cost, 0);
      setRefundAmount(totalCost.toString());
    }
  }, [open]);

  const fetchSuppliers = async () => {
    let q = supabase.from('suppliers').select('id, name');
    if (selectedCompany) q = q.eq('company_id', selectedCompany.id);
    const { data } = await q;
    setSuppliers(data || []);
  };

  const fetchPOs = async (supplierId: string) => {
    let q = supabase.from('purchase_orders')
      .select('id, po_number, total_amount, status')
      .eq('supplier_id', supplierId)
      .order('po_date', { ascending: false })
      .limit(50);
    if (selectedCompany) q = q.eq('company_id', selectedCompany.id);
    const { data } = await q;
    setPurchaseOrders(data || []);
  };

  const handleSupplierChange = (id: string) => {
    setSelectedSupplierId(id);
    setSelectedPOId('');
    if (id) fetchPOs(id);
  };

  const handleSubmit = async () => {
    if (!reason) { toast.error('Please provide a reason'); return; }
    if (!deviceCondition) { toast.error('Please assess item condition'); return; }
    
    // Need either preselected items or a manually selected device
    const hasItems = (preselectedItems && preselectedItems.length > 0) || selectedDeviceId;
    if (!hasItems && !selectedSupplierId) { toast.error('Please select items or a supplier'); return; }

    setLoading(true);
    try {
      const companyCode = selectedCompany?.code || 'XX';

      // Create RMAs - one per preselected item or one for manual selection
      const itemsToProcess = preselectedItems?.length ? preselectedItems : [{
        id: selectedDeviceId!,
        type: 'device' as const,
        name: 'Device',
        cost: parseFloat(refundAmount) || 0,
        supplierId: selectedSupplierId || null,
      }];

      for (const item of itemsToProcess) {
        const rmaNumber = `RMA-P-${companyCode}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(5, '0')}`;
        
        await supabase.from('return_authorizations').insert({
          company_id: selectedCompany?.id,
          rma_number: rmaNumber,
          return_type: 'purchase_return',
          device_id: item.type === 'device' ? item.id : null,
          supplier_id: item.supplierId || selectedSupplierId || null,
          purchase_order_id: selectedPOId || null,
          reason,
          original_cost: item.cost,
          refund_amount: resolutionType === 'refund' ? item.cost : 0,
          notes,
          status: 'pending',
          created_by: user?.id,
          resolution_type: resolutionType,
          device_condition_on_return: deviceCondition,
        } as any);
      }

      toast.success(`${itemsToProcess.length} supplier return RMA(s) created`);
      emitRefetch('returns');
      emitRefetch('inventory');
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create supplier return');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Supplier Return (RMA)</DialogTitle>
          <DialogDescription>
            Return defective or incorrect items back to supplier
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Pre-selected items summary */}
          {preselectedItems && preselectedItems.length > 0 && (
            <div className="bg-muted/30 border border-border/40 rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                Items to Return ({preselectedItems.length})
              </p>
              <div className="space-y-1 text-sm max-h-32 overflow-y-auto">
                {preselectedItems.map(item => (
                  <div key={item.id} className="flex justify-between">
                    <span>{item.name}</span>
                    <span className="font-medium">${item.cost.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Flow selection — only when no preselected items */}
          {!preselectedItems?.length && (
            <Tabs value={flow} onValueChange={(v) => setFlow(v as any)}>
              <TabsList className="w-full">
                <TabsTrigger value="items" className="flex-1">Select Item</TabsTrigger>
                <TabsTrigger value="supplier" className="flex-1">Select Supplier / PO</TabsTrigger>
              </TabsList>
              <TabsContent value="items" className="mt-3 space-y-3">
                <div className="space-y-2">
                  <Label>Device to Return</Label>
                  <DeviceSearchCombobox
                    value={selectedDeviceId}
                    onSelect={(device) => {
                      setSelectedDeviceId(device?.id ?? null);
                      if (device) {
                        setRefundAmount((device as any).cost_price?.toString() || '');
                        if ((device as any).supplier_id) setSelectedSupplierId((device as any).supplier_id);
                      }
                    }}
                    companyId={selectedCompany?.id}
                    placeholder="Search by IMEI, SKU, model..."
                  />
                </div>
              </TabsContent>
              <TabsContent value="supplier" className="mt-3 space-y-3">
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Select value={selectedSupplierId} onValueChange={handleSupplierChange}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {purchaseOrders.length > 0 && (
                  <div className="space-y-2">
                    <Label>Purchase Order (optional)</Label>
                    <Select value={selectedPOId || 'none'} onValueChange={(v) => setSelectedPOId(v === 'none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Link to a PO" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No PO linked</SelectItem>
                        {purchaseOrders.map(po => (
                          <SelectItem key={po.id} value={po.id}>
                            {po.po_number} — ${po.total_amount} ({po.status})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Device to Return</Label>
                  <DeviceSearchCombobox
                    value={selectedDeviceId}
                    onSelect={(device) => {
                      setSelectedDeviceId(device?.id ?? null);
                      if (device) setRefundAmount((device as any).cost_price?.toString() || '');
                    }}
                    companyId={selectedCompany?.id}
                    placeholder="Search device..."
                  />
                </div>
              </TabsContent>
            </Tabs>
          )}

          {/* Resolution */}
          <div className="space-y-2">
            <Label>Resolution *</Label>
            <Select value={resolutionType} onValueChange={(v) => setResolutionType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="refund">💰 Refund — Get money back from supplier</SelectItem>
                <SelectItem value="exchange">🔄 Exchange — Supplier sends replacement</SelectItem>
                <SelectItem value="repair">🔧 Repair — Supplier fixes and returns</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Item Condition */}
          <div className="space-y-2">
            <Label>Item Condition *</Label>
            <Select value={deviceCondition || 'none'} onValueChange={(v) => setDeviceCondition(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Assess condition" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select condition</SelectItem>
                <SelectItem value="defective">⚠️ Defective — DOA or malfunction</SelectItem>
                <SelectItem value="damaged">🔨 Damaged — Physical damage</SelectItem>
                <SelectItem value="wrong_item">📦 Wrong Item — Received incorrect product</SelectItem>
                <SelectItem value="working">✅ Working — Cosmetic issue or surplus</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label>Reason for Return *</Label>
            <Select value={reason || 'none'} onValueChange={(v) => setReason(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a reason</SelectItem>
                <SelectItem value="Defective">Defective / DOA</SelectItem>
                <SelectItem value="Wrong Item">Wrong Item Received</SelectItem>
                <SelectItem value="Damaged in Transit">Damaged in Transit</SelectItem>
                <SelectItem value="Quality Issue">Quality Below Standard</SelectItem>
                <SelectItem value="Overstock">Overstock / Not Needed</SelectItem>
                <SelectItem value="Warranty">Warranty Claim</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Refund amount */}
          {resolutionType === 'refund' && (
            <div className="space-y-2">
              <Label>Expected Refund Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details about the return..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating...' : `Create Supplier RMA${preselectedItems && preselectedItems.length > 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
