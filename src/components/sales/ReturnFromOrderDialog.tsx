import { useState } from 'react';
import { emitRefetch } from '@/hooks/useDataRefetch';
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
    tax_amount?: number | null;
    device_id: string | null;
    company_id: string | null;
    marketplace?: string;
  };
  onSuccess: () => void;
}

type ResolutionType = 'refund' | 'exchange' | 'repair' | 'adjustment';

const RETURN_REASONS = [
  { value: 'Defective', label: 'Defective' },
  { value: 'Wrong Item', label: 'Wrong Item Sent' },
  { value: 'Changed Mind', label: 'Changed Mind / Buyer Remorse' },
  { value: 'Not as Described', label: 'Not as Described' },
  { value: 'Damaged in Transit', label: 'Damaged in Transit' },
  { value: 'Late Delivery', label: 'Late Delivery' },
  { value: 'Missing Parts', label: 'Missing Parts / Accessories' },
  { value: 'Marketplace Claim', label: 'Marketplace Claim (A-to-Z / Chargeback)' },
  { value: 'Warranty', label: 'Warranty Claim' },
  { value: 'Other', label: 'Other' },
];

export function ReturnFromOrderDialog({ open, onOpenChange, sale, onSuccess }: ReturnFromOrderDialogProps) {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  const [refundAmount, setRefundAmount] = useState(sale.sale_price.toString());
  const [reason, setReason] = useState('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [restockDevice, setRestockDevice] = useState(true);
  const [notes, setNotes] = useState('');
  const [resolutionType, setResolutionType] = useState<ResolutionType>('refund');
  const [deviceCondition, setDeviceCondition] = useState('');
  const [outboundTracking, setOutboundTracking] = useState('');
  const [repairNotes, setRepairNotes] = useState('');
  const [replacementDeviceId, setReplacementDeviceId] = useState<string | null>(null);
  const [marketplaceInitiated, setMarketplaceInitiated] = useState(false);

  // Adjustment type doesn't require device condition
  const needsDeviceCondition = resolutionType !== 'adjustment';
  // Adjustment doesn't return the physical item
  const showRestockToggle = sale.device_id && resolutionType !== 'adjustment';

  const handleSubmit = async () => {
    if (!reason) {
      toast.error('Please select a reason');
      return;
    }
    if (needsDeviceCondition && !deviceCondition) {
      toast.error('Please assess the device condition');
      return;
    }
    if ((resolutionType === 'refund' || resolutionType === 'adjustment') && (!refundAmount || parseFloat(refundAmount) <= 0)) {
      toast.error('Please enter a valid refund amount');
      return;
    }

    setLoading(true);
    try {
      const companyCode = selectedCompany?.code || 'XX';
      const prefix = resolutionType === 'adjustment' ? 'ADJ' : 'RMA-S';
      const rmaNumber = `${prefix}-${companyCode}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(5, '0')}`;

      // Customer returns are auto-resolved — no approval needed
      const finalStatus = resolutionType === 'refund' || resolutionType === 'adjustment' 
        ? 'refunded' 
        : 'completed';

      const { data: rmaData, error: rmaError } = await supabase
        .from('return_authorizations')
        .insert({
          company_id: sale.company_id,
          rma_number: rmaNumber,
          return_type: 'sales_return',
          sale_id: sale.id,
          device_id: resolutionType === 'adjustment' ? null : sale.device_id,
          customer_name: sale.customer_name,
          reason,
          original_cost: sale.sale_price,
          refund_amount: (resolutionType === 'refund' || resolutionType === 'adjustment') ? parseFloat(refundAmount) : 0,
          notes,
          status: finalStatus,
          created_by: user?.id,
          resolution_type: resolutionType,
          device_condition_on_return: needsDeviceCondition ? deviceCondition : null,
          outbound_tracking_number: outboundTracking || null,
          repair_notes: resolutionType === 'repair' ? repairNotes : null,
          replacement_device_id: resolutionType === 'exchange' && replacementDeviceId ? replacementDeviceId : null,
          refund_date: (resolutionType === 'refund' || resolutionType === 'adjustment') ? new Date().toISOString().split('T')[0] : null,
          tax_refunded: (resolutionType !== 'adjustment' && sale.tax_amount) ? sale.tax_amount : 0,
          marketplace_initiated: marketplaceInitiated,
          refund_reason_detail: reasonDetail || null,
        } as any)
        .select('id')
        .single();

      if (rmaError) throw rmaError;

      // Adjustment: no device status changes, just accounting
      if (resolutionType !== 'adjustment') {
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

        // For exchange, mark original device returned and replacement as sold
        if (resolutionType === 'exchange') {
          if (sale.device_id && !restockDevice) {
            await supabase
              .from('devices')
              .update({ status: 'in_stock' as any })
              .eq('id', sale.device_id);
          }
          if (replacementDeviceId) {
            await supabase
              .from('devices')
              .update({ status: 'sold' as any, sale_price: sale.sale_price })
              .eq('id', replacementDeviceId);
          }
        }

        // For repair, mark device as in_repair and create a device_repairs record
        if (resolutionType === 'repair' && sale.device_id) {
          await supabase
            .from('devices')
            .update({ status: 'in_repair' as any })
            .eq('id', sale.device_id);

          // Create linked repair record in the device_repairs module
          await supabase
            .from('device_repairs')
            .insert({
              device_id: sale.device_id,
              company_id: sale.company_id,
              status: 'pending',
              notes: `Linked to RMA ${rmaNumber}. ${repairNotes || ''}`.trim(),
              created_by: user?.id,
            });
        }
      }

      // Trigger accounting reversal entries automatically
      if (rmaData?.id) {
        try {
          await supabase.functions.invoke('process-return-accounting', {
            body: { return_id: rmaData.id },
          });
        } catch (accErr) {
          console.error('Return accounting error:', accErr);
        }
      }

      const resLabels: Record<ResolutionType, string> = {
        refund: 'Refund processed',
        exchange: 'Exchange completed',
        repair: 'Repair initiated',
        adjustment: 'Adjustment/credit issued',
      };
      toast.success(`${rmaNumber} — ${resLabels[resolutionType]}`);
      emitRefetch('sales');
      emitRefetch('returns');
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
          <DialogTitle>Initiate Return / Adjustment</DialogTitle>
          <DialogDescription>
            Process a return, exchange, repair, or credit for order {sale.order_number}
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
            <Select value={resolutionType} onValueChange={(v) => setResolutionType(v as ResolutionType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="refund">💰 Full/Partial Refund — Return money & item</SelectItem>
                <SelectItem value="adjustment">🏷️ Adjustment/Credit — Partial credit, no item return</SelectItem>
                <SelectItem value="exchange">🔄 Exchange — Send replacement device</SelectItem>
                <SelectItem value="repair">🔧 Repair & Return — Fix and send back</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Marketplace initiated flag */}
          <div className="flex items-center justify-between bg-muted/20 border border-border/40 rounded-lg p-3">
            <div>
              <p className="text-sm font-medium">Marketplace-initiated</p>
              <p className="text-xs text-muted-foreground">Flag if the marketplace forced this refund (A-to-Z, chargeback)</p>
            </div>
            <Switch checked={marketplaceInitiated} onCheckedChange={setMarketplaceInitiated} />
          </div>

          {/* Device Condition Assessment — not needed for adjustments */}
          {needsDeviceCondition && (
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
          )}

          <div className="space-y-2">
            <Label>Reason for Return *</Label>
            <Select value={reason || 'none'} onValueChange={(v) => setReason(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a reason</SelectItem>
                {RETURN_REASONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optional detail for the reason */}
          <div className="space-y-2">
            <Label>Reason Details (optional)</Label>
            <Textarea
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              placeholder="Additional context about why this return/adjustment is being made..."
              rows={2}
            />
          </div>

          {/* Refund amount — for refund and adjustment */}
          {(resolutionType === 'refund' || resolutionType === 'adjustment') && (
            <div className="space-y-2">
              <Label>
                {resolutionType === 'adjustment' ? 'Credit/Adjustment Amount' : 'Refund Amount'}
              </Label>
              <Input
                type="number"
                step="0.01"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {resolutionType === 'adjustment' 
                  ? 'Courtesy credit — item stays with customer, no physical return'
                  : 'Adjust for partial refund if needed'
                }
              </p>
            </div>
          )}

          {/* Exchange info */}
          {resolutionType === 'exchange' && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-3">
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Exchange Details</p>
              <div className="space-y-2">
                <Label>Replacement Device</Label>
                <DeviceSearchCombobox
                  value={replacementDeviceId}
                  onSelect={(device) => setReplacementDeviceId(device?.id ?? null)}
                  companyId={sale.company_id || undefined}
                  placeholder="Search replacement device by IMEI, SKU..."
                />
                <p className="text-xs text-muted-foreground">Select the device being sent as replacement</p>
              </div>
              <div className="space-y-2">
                <Label>Outbound Tracking Number</Label>
                <Input
                  value={outboundTracking}
                  onChange={(e) => setOutboundTracking(e.target.value)}
                  placeholder="Tracking # for replacement shipment"
                />
              </div>
            </div>
          )}

          {/* Repair info — links to Device Repairs module */}
          {resolutionType === 'repair' && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 space-y-3">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Repair & Return</p>
              <p className="text-xs text-muted-foreground">
                A repair record will be created in the Device Repairs module and linked to this RMA.
              </p>
              <div className="space-y-2">
                <Label>Issue Description / Repair Notes</Label>
                <Textarea
                  value={repairNotes}
                  onChange={(e) => setRepairNotes(e.target.value)}
                  placeholder="Describe the issue and planned repair..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Return Tracking Number</Label>
                <Input
                  value={outboundTracking}
                  onChange={(e) => setOutboundTracking(e.target.value)}
                  placeholder="Tracking # when sending repaired device back"
                />
              </div>
            </div>
          )}

          {/* Restock toggle — not for adjustments */}
          {showRestockToggle && (
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
            {loading ? 'Processing...' : 
              resolutionType === 'refund' ? 'Process Refund' : 
              resolutionType === 'adjustment' ? 'Issue Credit' :
              resolutionType === 'exchange' ? 'Create Exchange' : 
              'Create Repair'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
