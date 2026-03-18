import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';
import { createExpenseRefundJournalEntry } from '@/lib/accounting/journalAutomation';
import { format } from 'date-fns';

const EXPENSE_ACCOUNT_MAP: Record<string, string> = {
  inventory: '5000',
  shipping: '5100',
  rent: '6000',
  utilities: '6010',
  telecommunications: '6020',
  office: '6030',
  software: '6040',
  equipment: '6050',
  professional_services: '6060',
  marketing: '6100',
  travel: '6110',
  insurance: '6120',
  payroll: '6200',
  bank_fees: '6300',
  marketplace_fees: '5200',
  genovation_ai: '6040',
  other: '6900',
};

const REFUND_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit_card_refund', label: 'Credit Card Refund' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'interac_etransfer', label: 'Interac E-Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_note', label: 'Vendor Credit Note' },
  { value: 'other', label: 'Other' },
];

interface ExpenseRefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: {
    id: string;
    description: string;
    amount: number;
    gst_hst_amount: number;
    pst_amount: number;
    total_amount: number;
    category: string;
    vendor: string | null;
    company_id: string | null;
  } | null;
  onSuccess: () => void;
}

export function ExpenseRefundDialog({ open, onOpenChange, expense, onSuccess }: ExpenseRefundDialogProps) {
  const { user } = useAuth();
  const { companies } = useCompany();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    refund_amount: '',
    refund_date: format(new Date(), 'yyyy-MM-dd'),
    reason: '',
    refund_method: 'bank_transfer',
    reference_number: '',
    notes: '',
    is_full_refund: true,
  });

  const maxRefund = expense ? (expense.total_amount || expense.amount) : 0;

  const handleSubmit = async () => {
    if (!expense || !user) return;

    const refundAmount = formData.is_full_refund
      ? maxRefund
      : parseFloat(formData.refund_amount);

    if (!refundAmount || refundAmount <= 0) {
      toast.error('Enter a valid refund amount');
      return;
    }
    if (refundAmount > maxRefund) {
      toast.error(`Refund cannot exceed ${maxRefund.toFixed(2)}`);
      return;
    }

    setSaving(true);
    try {
      // Calculate proportional tax refund
      const proportion = refundAmount / maxRefund;
      const gstRefund = (expense.gst_hst_amount || 0) * proportion;
      const pstRefund = (expense.pst_amount || 0) * proportion;
      const baseRefund = refundAmount - gstRefund - pstRefund;

      // Insert refund record
      const { data: refund, error } = await supabase
        .from('expense_refunds')
        .insert({
          expense_id: expense.id,
          company_id: expense.company_id,
          refund_amount: refundAmount,
          refund_date: formData.refund_date,
          reason: formData.reason || null,
          refund_method: formData.refund_method,
          reference_number: formData.reference_number || null,
          notes: formData.notes || null,
          created_by: user.id,
        } as any)
        .select()
        .single();

      if (error) throw error;

      // Create reversal journal entry
      if (expense.company_id) {
        const company = companies.find(c => c.id === expense.company_id);
        const isVES = company?.code === 'VES';
        const accountCode = EXPENSE_ACCOUNT_MAP[expense.category] || '6900';

        await createExpenseRefundJournalEntry({
          companyId: expense.company_id,
          refundId: (refund as any).id,
          refundDate: formData.refund_date,
          expenseAccountCode: accountCode,
          amount: baseRefund,
          gstHstAmount: gstRefund,
          qstAmount: pstRefund,
          totalAmount: refundAmount,
          description: expense.description,
          vendor: expense.vendor || 'Unknown',
          isVES: isVES || false,
        });
      }

      toast.success('Refund recorded with reversal journal entry');
      onOpenChange(false);
      onSuccess();
      // Reset form
      setFormData({
        refund_amount: '',
        refund_date: format(new Date(), 'yyyy-MM-dd'),
        reason: '',
        refund_method: 'bank_transfer',
        reference_number: '',
        notes: '',
        is_full_refund: true,
      });
    } catch (error: any) {
      console.error('Error recording refund:', error);
      toast.error(error.message || 'Failed to record refund');
    } finally {
      setSaving(false);
    }
  };

  if (!expense) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-[hsl(var(--success))]" />
            Record Expense Refund
          </DialogTitle>
          <DialogDescription>
            Record a refund received for: <strong>{expense.description}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Original expense info */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Original Amount</span>
              <span className="font-medium">${(expense.total_amount || expense.amount).toFixed(2)}</span>
            </div>
            {expense.gst_hst_amount > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Includes GST/HST</span>
                <span>${expense.gst_hst_amount.toFixed(2)}</span>
              </div>
            )}
            {expense.pst_amount > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Includes PST</span>
                <span>${expense.pst_amount.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Full or partial */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={formData.is_full_refund ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFormData(p => ({ ...p, is_full_refund: true }))}
            >
              Full Refund
            </Button>
            <Button
              type="button"
              variant={!formData.is_full_refund ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFormData(p => ({ ...p, is_full_refund: false }))}
            >
              Partial Refund
            </Button>
          </div>

          {!formData.is_full_refund && (
            <div>
              <Label>Refund Amount</Label>
              <Input
                type="number"
                step="0.01"
                max={maxRefund}
                value={formData.refund_amount}
                onChange={(e) => setFormData(p => ({ ...p, refund_amount: e.target.value }))}
                placeholder={`Max: $${maxRefund.toFixed(2)}`}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Refund Date</Label>
              <Input
                type="date"
                value={formData.refund_date}
                onChange={(e) => setFormData(p => ({ ...p, refund_date: e.target.value }))}
              />
            </div>
            <div>
              <Label>Refund Method</Label>
              <Select value={formData.refund_method} onValueChange={(v) => setFormData(p => ({ ...p, refund_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REFUND_METHODS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Reference Number</Label>
            <Input
              value={formData.reference_number}
              onChange={(e) => setFormData(p => ({ ...p, reference_number: e.target.value }))}
              placeholder="e.g. refund confirmation #"
            />
          </div>

          <div>
            <Label>Reason for Refund</Label>
            <Textarea
              value={formData.reason}
              onChange={(e) => setFormData(p => ({ ...p, reason: e.target.value }))}
              placeholder="e.g. Duplicate charge, returned goods, service cancellation..."
              rows={2}
            />
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Recording...' : 'Record Refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
