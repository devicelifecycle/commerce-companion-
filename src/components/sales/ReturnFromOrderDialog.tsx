import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { DeviceSearchCombobox } from '@/components/inventory/DeviceSearchCombobox';

interface ReturnFromOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: {
    id: string;
    order_number: string;
    customer_name: string | null;
    sale_price: number;
    device_id: string | null;
    company_id: string | null;
  };
  onSuccess: () => void;
}

export function ReturnFromOrderDialog({ open, onOpenChange, sale, onSuccess }: ReturnFromOrderDialogProps) {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  const [refundAmount, setRefundAmount] = useState(sale.sale_price.toString());
  const [reason, setReason] = useState('');
  const [restockDevice, setRestockDevice] = useState(true);
  const [notes, setNotes] = useState('');
  const [resolutionType, setResolutionType] = useState<'refund' | 'exchange' | 'repair'>('refund');
  const [deviceCondition, setDeviceCondition] = useState('');
  const [outboundTracking, setOutboundTracking] = useState('');
  const [repairNotes, setRepairNotes] = useState('');

  const handleSubmit = async () => {
    if (!reason) {
      toast.error('Please select a reason');
      return;
    }
    if (!deviceCondition) {
      toast.error('Please assess the device condition');
      return;
    }

    setLoading(true);
    try {
      const companyCode = selectedCompany?.code || 'XX';
      const rmaNumber = `RMA-S-${companyCode}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(5, '0')}`;

      const { error: rmaError } = await supabase
        .from('return_authorizations')
        .insert({
          company_id: sale.company_id,
          rma_number: rmaNumber,
          return_type: 'sales_return',
          sale_id: sale.id,
          device_id: sale.device_id,
          customer_name: sale.customer_name,
          reason,
          original_cost: sale.sale_price,
          refund_amount: resolutionType === 'refund' ? parseFloat(refundAmount) : 0,
          notes,
          status: 'pending',
          created_by: user?.id,
          resolution_type: resolutionType,
          device_condition_on_return: deviceCondition,
          outbound_tracking_number: outboundTracking || null,
          repair_notes: resolutionType === 'repair' ? repairNotes : null,
        } as any);

      if (rmaError) throw rmaError;

      // If restock, update device back to in_stock
      if (restockDevice && sale.device_id) {
        await supabase
          .from('devices')
          .update({ status: 'in_stock' as any, sale_price: null })
          .eq('id', sale.device_id);

        await supabase
          .from('sales')
          .update({ device_id: null, accounting_status: 'revenue_only' })
          .eq('id', sale.id);
      }

      // For exchange/repair, device stays linked but status reflects the action
      if ((resolutionType === 'exchange' || resolutionType === 'repair') && sale.device_id) {
        await supabase
          .from('devices')
          .update({ status: (resolutionType === 'repair' ? 'in_repair' : 'in_stock') as any })
          .eq('id', sale.device_id);
      }

      toast.success(`Return ${rmaNumber} created — ${resolutionType === 'refund' ? 'Refund' : resolutionType === 'exchange' ? 'Exchange' : 'Repair'}`);
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create return');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Initiate Return</DialogTitle>
          <DialogDescription>
            Process a return for order {sale.order_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="bg-muted/30 border border-border/40 rounded-lg p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order</span>
              <span className="font-medium">{sale.order_number}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted-foreground">Customer</span>
              <span>{sale.customer_name || '—'}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted-foreground">Sale Amount</span>
              <span className="font-medium">
                {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(sale.sale_price)}
              </span>
            </div>
          </div>

          {/* Resolution Type */}
          <div className="space-y-2">
            <Label>Resolution *</Label>
            <Select value={resolutionType} onValueChange={(v) => setResolutionType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="refund">💰 Refund — Return money to customer</SelectItem>
                <SelectItem value="exchange">🔄 Exchange — Send replacement device</SelectItem>
                <SelectItem value="repair">🔧 Repair — Fix and send back</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Device Condition Assessment */}
          <div className="space-y-2">
            <Label>Device Condition on Return *</Label>
            <Select value={deviceCondition || 'none'} onValueChange={(v) => setDeviceCondition(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Assess condition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select condition</SelectItem>
                <SelectItem value="working">✅ Working — Fully functional</SelectItem>
                <SelectItem value="defective">⚠️ Defective — Has issues but repairable</SelectItem>
                <SelectItem value="damaged">🔨 Damaged — Physical damage</SelectItem>
                <SelectItem value="unrepairable">❌ Unrepairable — Beyond repair</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reason for Return *</Label>
            <Select value={reason || 'none'} onValueChange={(v) => setReason(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a reason</SelectItem>
                <SelectItem value="Defective">Defective</SelectItem>
                <SelectItem value="Wrong Item">Wrong Item</SelectItem>
                <SelectItem value="Changed Mind">Changed Mind</SelectItem>
                <SelectItem value="Not as Described">Not as Described</SelectItem>
                <SelectItem value="Damaged in Transit">Damaged in Transit</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Refund amount — only for refund resolution */}
          {resolutionType === 'refund' && (
            <div className="space-y-2">
              <Label>Refund Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Adjust if partial refund</p>
            </div>
          )}

          {/* Exchange info */}
          {resolutionType === 'exchange' && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-3">
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Exchange Details</p>
              <div className="space-y-2">
                <Label>Outbound Tracking Number</Label>
                <Input
                  value={outboundTracking}
                  onChange={(e) => setOutboundTracking(e.target.value)}
                  placeholder="Tracking # for replacement shipment"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The replacement device can be linked later from the Returns page once shipped.
              </p>
            </div>
          )}

          {/* Repair info */}
          {resolutionType === 'repair' && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 space-y-3">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Repair Details</p>
              <div className="space-y-2">
                <Label>Repair Notes</Label>
                <Textarea
                  value={repairNotes}
                  onChange={(e) => setRepairNotes(e.target.value)}
                  placeholder="Describe the issue and planned repair..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Outbound Tracking Number</Label>
                <Input
                  value={outboundTracking}
                  onChange={(e) => setOutboundTracking(e.target.value)}
                  placeholder="Tracking # when sending repaired device back"
                />
              </div>
            </div>
          )}

          {/* Restock toggle — available for all resolution types when device is linked */}
          {sale.device_id && (
            <div className="flex items-center justify-between bg-muted/20 border border-border/40 rounded-lg p-3">
              <div>
                <p className="text-sm font-medium">Add device back to inventory</p>
                <p className="text-xs text-muted-foreground">Unlink device from this order and set status back to in-stock</p>
              </div>
              <Switch checked={restockDevice} onCheckedChange={setRestockDevice} />
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading} variant="destructive">
            {loading ? 'Processing...' : resolutionType === 'refund' ? 'Create Return' : resolutionType === 'exchange' ? 'Create Exchange' : 'Create Repair'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
