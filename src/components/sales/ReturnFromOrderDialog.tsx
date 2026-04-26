import { useState, useMemo } from 'react';
import { emitRefetch } from '@/hooks/useDataRefetch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { DeviceSearchCombobox } from '@/components/inventory/DeviceSearchCombobox';
import { Check, ChevronRight, AlertTriangle, ArrowLeft } from 'lucide-react';

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
type Step = 1 | 2 | 3;

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

const RESOLUTION_OPTIONS: { value: ResolutionType; label: string; desc: string; emoji: string }[] = [
  { value: 'refund',     emoji: '💰', label: 'Refund',          desc: 'Return money & item — reverses Revenue, AR, Tax, COGS' },
  { value: 'adjustment', emoji: '🏷️', label: 'Credit / Adjustment', desc: 'Partial credit, item stays with customer' },
  { value: 'exchange',   emoji: '🔄', label: 'Exchange',        desc: 'Send a replacement device' },
  { value: 'repair',     emoji: '🔧', label: 'Repair & Return', desc: 'Receive, fix, and return — opens repair record' },
];

export function ReturnFromOrderDialog({ open, onOpenChange, sale, onSuccess }: ReturnFromOrderDialogProps) {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [confirmed, setConfirmed] = useState(false);

  const [resolutionType, setResolutionType] = useState<ResolutionType>('refund');
  const [reason, setReason] = useState('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [marketplaceInitiated, setMarketplaceInitiated] = useState(false);

  const [refundAmount, setRefundAmount] = useState(sale.sale_price.toString());
  const [restockDevice, setRestockDevice] = useState(true);
  const [deviceCondition, setDeviceCondition] = useState('');
  const [outboundTracking, setOutboundTracking] = useState('');
  const [repairNotes, setRepairNotes] = useState('');
  const [replacementDeviceId, setReplacementDeviceId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const needsDeviceCondition = !!sale.device_id && restockDevice && resolutionType !== 'adjustment';
  const showRestockToggle = !!sale.device_id && resolutionType !== 'adjustment';
  const needsRefundAmount = resolutionType === 'refund' || resolutionType === 'adjustment';

  const formatCurrency = (v: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  // Validation per step
  const step1Errors = useMemo(() => {
    const errs: string[] = [];
    if (!reason) errs.push('Reason for return');
    return errs;
  }, [reason]);

  const step2Errors = useMemo(() => {
    const errs: string[] = [];
    if (needsRefundAmount) {
      const amt = parseFloat(refundAmount);
      if (!refundAmount || isNaN(amt) || amt <= 0) errs.push('Valid amount > 0');
      if (resolutionType === 'refund' && amt > sale.sale_price) errs.push(`Cannot exceed sale price ${formatCurrency(sale.sale_price)}`);
    }
    if (needsDeviceCondition && !deviceCondition) errs.push('Device condition assessment');
    if (resolutionType === 'exchange' && !replacementDeviceId) errs.push('Replacement device');
    if (resolutionType === 'repair' && !repairNotes.trim()) errs.push('Repair issue description');
    return errs;
  }, [needsRefundAmount, refundAmount, needsDeviceCondition, deviceCondition, resolutionType, replacementDeviceId, repairNotes, sale.sale_price]);

  const resetAll = () => {
    setStep(1);
    setConfirmed(false);
    setResolutionType('refund');
    setReason('');
    setReasonDetail('');
    setMarketplaceInitiated(false);
    setRefundAmount(sale.sale_price.toString());
    setRestockDevice(true);
    setDeviceCondition('');
    setOutboundTracking('');
    setRepairNotes('');
    setReplacementDeviceId(null);
    setNotes('');
  };

  const handleClose = (next: boolean) => {
    if (!next) resetAll();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!confirmed) {
      toast.error('Please confirm the action before submitting');
      return;
    }

    setLoading(true);
    try {
      const companyCode = selectedCompany?.code || 'XX';
      const prefix = resolutionType === 'adjustment' ? 'ADJ' : 'RMA-S';
      const rmaNumber = `${prefix}-${companyCode}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(5, '0')}`;

      const finalStatus = resolutionType === 'refund' || resolutionType === 'adjustment' ? 'refunded' : 'completed';

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
          refund_amount: needsRefundAmount ? parseFloat(refundAmount) : 0,
          notes,
          status: finalStatus,
          created_by: user?.id,
          resolution_type: resolutionType,
          device_condition_on_return: needsDeviceCondition ? deviceCondition : null,
          outbound_tracking_number: outboundTracking || null,
          repair_notes: resolutionType === 'repair' ? repairNotes : null,
          replacement_device_id: resolutionType === 'exchange' && replacementDeviceId ? replacementDeviceId : null,
          refund_date: needsRefundAmount ? new Date().toISOString().split('T')[0] : null,
          tax_refunded: (resolutionType !== 'adjustment' && sale.tax_amount) ? sale.tax_amount : 0,
          marketplace_initiated: marketplaceInitiated,
          refund_reason_detail: reasonDetail || null,
        } as any)
        .select('id')
        .single();

      if (rmaError) throw rmaError;

      if (resolutionType !== 'adjustment') {
        if (restockDevice && sale.device_id) {
          await supabase.from('devices').update({ status: 'in_stock' as any, sale_price: null }).eq('id', sale.device_id);
          await supabase.from('sales').update({ device_id: null, accounting_status: 'revenue_only' }).eq('id', sale.id);
        }
        if (resolutionType === 'exchange') {
          if (sale.device_id && !restockDevice) {
            await supabase.from('devices').update({ status: 'in_stock' as any }).eq('id', sale.device_id);
          }
          if (replacementDeviceId) {
            await supabase.from('devices').update({ status: 'sold' as any, sale_price: sale.sale_price }).eq('id', replacementDeviceId);
          }
        }
        if (resolutionType === 'repair' && sale.device_id) {
          // Route the device into the Refurbishment Queue.
          // device.status is the master ('in_repair'); refurbishment_status tracks the sub-stage so the
          // queue picks it up immediately (Refurbishment.tsx filters on refurbishment_status in pending/in_progress).
          await supabase.from('devices').update({
            status: 'in_repair',
            refurbishment_status: 'pending',
            refurbishment_started_at: new Date().toISOString(),
            refurbishment_notes: repairNotes || null,
          }).eq('id', sale.device_id);
          await supabase.from('device_repairs').insert({
            device_id: sale.device_id,
            company_id: sale.company_id,
            status: 'pending',
            notes: `Linked to RMA ${rmaNumber}. ${repairNotes || ''}`.trim(),
            created_by: user?.id,
          });
        }
      }

      if (rmaData?.id) {
        try {
          await supabase.functions.invoke('process-return-accounting', { body: { return_id: rmaData.id } });
        } catch (accErr) {
          console.error('Return accounting error:', accErr);
        }
      }

      const labels: Record<ResolutionType, string> = {
        refund: 'Refund processed', exchange: 'Exchange completed', repair: 'Repair initiated', adjustment: 'Credit issued',
      };
      toast.success(`${rmaNumber} — ${labels[resolutionType]}`);
      emitRefetch('sales');
      emitRefetch('returns');
      handleClose(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create return');
    } finally {
      setLoading(false);
    }
  };

  const StepDot = ({ n, label }: { n: Step; label: string }) => {
    const active = step === n;
    const done = step > n;
    return (
      <div className="flex items-center gap-2 flex-1">
        <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border ${
          done ? 'bg-primary text-primary-foreground border-primary'
            : active ? 'bg-primary/10 text-primary border-primary'
            : 'bg-muted text-muted-foreground border-border'
        }`}>
          {done ? <Check className="h-3.5 w-3.5" /> : n}
        </div>
        <span className={`text-xs font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
        {n < 3 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 ml-auto" />}
      </div>
    );
  };

  const selectedResolution = RESOLUTION_OPTIONS.find(r => r.value === resolutionType)!;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Initiate Return / Adjustment</DialogTitle>
          <DialogDescription>
            Order <span className="font-mono">{sale.order_number}</span> · Customer {sale.customer_name || '—'} · {formatCurrency(sale.sale_price)}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-3 px-1">
          <StepDot n={1} label="Intent" />
          <StepDot n={2} label="Details" />
          <StepDot n={3} label="Review" />
        </div>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          {/* ── STEP 1 — Intent ── */}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Resolution Type *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {RESOLUTION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setResolutionType(opt.value)}
                      className={`text-left rounded-lg border p-3 transition-colors ${
                        resolutionType === opt.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-border/80 hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">{opt.emoji}</span>
                        <span className="text-sm font-semibold">{opt.label}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Reason for Return *</Label>
                <Select value={reason || 'none'} onValueChange={(v) => setReason(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a reason</SelectItem>
                    {RETURN_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Reason Details (optional)</Label>
                <Textarea value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)}
                  placeholder="Additional context about this return..." rows={2} />
              </div>

              <div className="flex items-center justify-between bg-muted/20 border border-border/40 rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium">Marketplace-initiated</p>
                  <p className="text-xs text-muted-foreground">Flag if forced by marketplace (A-to-Z, chargeback)</p>
                </div>
                <Switch checked={marketplaceInitiated} onCheckedChange={setMarketplaceInitiated} />
              </div>

              {step1Errors.length > 0 && (
                <div className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Required: {step1Errors.join(', ')}
                </div>
              )}
            </>
          )}

          {/* ── STEP 2 — Details ── */}
          {step === 2 && (
            <>
              {needsRefundAmount && (
                <div className="space-y-2">
                  <Label>{resolutionType === 'adjustment' ? 'Credit Amount *' : 'Refund Amount *'}</Label>
                  <Input type="number" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
                  <p className="text-xs text-muted-foreground">
                    Sale total: {formatCurrency(sale.sale_price)} · Tax to refund: {formatCurrency(sale.tax_amount || 0)}
                  </p>
                </div>
              )}

              {needsDeviceCondition && (
                <div className="space-y-2">
                  <Label>Device Condition on Return *</Label>
                  <Select value={deviceCondition || 'none'} onValueChange={(v) => setDeviceCondition(v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Assess condition" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select condition</SelectItem>
                      <SelectItem value="working">✅ Working — Fully functional</SelectItem>
                      <SelectItem value="defective">⚠️ Defective — Repairable</SelectItem>
                      <SelectItem value="damaged">🔨 Damaged — Physical damage</SelectItem>
                      <SelectItem value="unrepairable">❌ Unrepairable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {resolutionType === 'exchange' && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-3">
                  <p className="text-sm font-medium">Exchange Details</p>
                  <div className="space-y-2">
                    <Label>Replacement Device *</Label>
                    <DeviceSearchCombobox
                      value={replacementDeviceId}
                      onSelect={(d) => setReplacementDeviceId(d?.id ?? null)}
                      companyId={sale.company_id || undefined}
                      placeholder="Search by IMEI, SKU..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Outbound Tracking</Label>
                    <Input value={outboundTracking} onChange={(e) => setOutboundTracking(e.target.value)} placeholder="Tracking #" />
                  </div>
                </div>
              )}

              {resolutionType === 'repair' && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 space-y-3">
                  <p className="text-sm font-medium">Repair & Return</p>
                  <p className="text-xs text-muted-foreground">A repair record will be created in Device Repairs and linked to this RMA.</p>
                  <div className="space-y-2">
                    <Label>Issue / Repair Notes *</Label>
                    <Textarea value={repairNotes} onChange={(e) => setRepairNotes(e.target.value)}
                      placeholder="Describe the issue and planned repair..." rows={2} />
                  </div>
                  <div className="space-y-2">
                    <Label>Return Tracking</Label>
                    <Input value={outboundTracking} onChange={(e) => setOutboundTracking(e.target.value)} placeholder="Tracking # for repaired device" />
                  </div>
                </div>
              )}

              {showRestockToggle && (
                <div className="flex items-center justify-between bg-muted/20 border border-border/40 rounded-lg p-3">
                  <div>
                    <p className="text-sm font-medium">Add device back to inventory</p>
                    <p className="text-xs text-muted-foreground">Unlink and set device back to in-stock</p>
                  </div>
                  <Switch checked={restockDevice} onCheckedChange={setRestockDevice} />
                </div>
              )}

              <div className="space-y-2">
                <Label>Internal Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional details..." rows={2} />
              </div>

              {step2Errors.length > 0 && (
                <div className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Required: {step2Errors.join(', ')}
                </div>
              )}
            </>
          )}

          {/* ── STEP 3 — Review ── */}
          {step === 3 && (
            <>
              <div className="rounded-lg border border-border/60 divide-y divide-border/60 bg-muted/10">
                <div className="flex justify-between p-3">
                  <span className="text-xs text-muted-foreground">Resolution</span>
                  <span className="text-sm font-medium">{selectedResolution.emoji} {selectedResolution.label}</span>
                </div>
                <div className="flex justify-between p-3">
                  <span className="text-xs text-muted-foreground">Reason</span>
                  <span className="text-sm">{reason}{marketplaceInitiated && <Badge variant="outline" className="ml-2 text-[9px]">Marketplace</Badge>}</span>
                </div>
                {needsRefundAmount && (
                  <div className="flex justify-between p-3">
                    <span className="text-xs text-muted-foreground">{resolutionType === 'adjustment' ? 'Credit' : 'Refund'} amount</span>
                    <span className="text-sm font-semibold">{formatCurrency(parseFloat(refundAmount) || 0)}</span>
                  </div>
                )}
                {needsDeviceCondition && (
                  <div className="flex justify-between p-3">
                    <span className="text-xs text-muted-foreground">Device condition</span>
                    <span className="text-sm">{deviceCondition}</span>
                  </div>
                )}
                {resolutionType === 'exchange' && (
                  <div className="flex justify-between p-3">
                    <span className="text-xs text-muted-foreground">Replacement</span>
                    <span className="text-sm">Selected device · {outboundTracking || 'no tracking'}</span>
                  </div>
                )}
                {showRestockToggle && (
                  <div className="flex justify-between p-3">
                    <span className="text-xs text-muted-foreground">Device action</span>
                    <span className="text-sm">{restockDevice ? 'Restock to inventory' : 'Keep linked to sale'}</span>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  This will create RMA <span className="font-mono font-semibold">{(resolutionType === 'adjustment' ? 'ADJ' : 'RMA-S')}-…</span> and post reversal journal entries automatically. This action is logged and reversible only by deleting the RMA.
                </div>
              </div>

              <label className="flex items-start gap-2 cursor-pointer p-2 rounded-md hover:bg-muted/30">
                <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <span className="text-sm">I confirm the details above are correct and want to {selectedResolution.label.toLowerCase()} this order.</span>
              </label>
            </>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep((step - 1) as Step)} disabled={loading}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => handleClose(false)} disabled={loading}>Cancel</Button>
            {step < 3 ? (
              <Button
                onClick={() => setStep((step + 1) as Step)}
                disabled={(step === 1 && step1Errors.length > 0) || (step === 2 && step2Errors.length > 0)}
              >
                Continue <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading || !confirmed} variant="destructive">
                {loading ? 'Processing...' : `Confirm ${selectedResolution.label}`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
