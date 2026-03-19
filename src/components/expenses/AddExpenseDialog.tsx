import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Receipt, Upload, Building2, Calendar, CreditCard } from 'lucide-react';
import { createExpenseJournalEntry } from '@/lib/accounting/journalAutomation';

interface Subcategory {
  category: string;
  subcategory: string;
  description: string | null;
}

interface AllocationRule {
  category: string;
  subcategory: string | null;
  default_ves_percentage: number;
  default_tgw_percentage: number;
}

interface AddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editExpense?: any;
}

const EXPENSE_CATEGORIES = [
  { value: 'inventory', label: 'Inventory Purchase', group: 'COGS' },
  { value: 'shipping', label: 'Shipping & Logistics', group: 'COGS' },
  { value: 'rent', label: 'Rent & Lease', group: 'Operating' },
  { value: 'utilities', label: 'Utilities', group: 'Operating' },
  { value: 'telecommunications', label: 'Telecommunications', group: 'Operating' },
  { value: 'office', label: 'Office Supplies', group: 'Operating' },
  { value: 'software', label: 'Software & Subscriptions', group: 'Operating' },
  { value: 'equipment', label: 'Equipment & Tools', group: 'Operating' },
  { value: 'professional_services', label: 'Professional Services', group: 'Operating' },
  { value: 'marketing', label: 'Marketing & Advertising', group: 'Operating' },
  { value: 'travel', label: 'Travel & Transportation', group: 'Operating' },
  { value: 'insurance', label: 'Insurance', group: 'Operating' },
  { value: 'payroll', label: 'Payroll & Benefits', group: 'Operating' },
  { value: 'bank_fees', label: 'Bank Fees & Charges', group: 'Financial' },
  { value: 'marketplace_fees', label: 'Marketplace Fees', group: 'Financial' },
  { value: 'genovation_ai', label: 'GenovationAI', group: 'Operating' },
  { value: 'other', label: 'Other', group: 'Other' },
];

// Map expense categories to chart of accounts codes
const CATEGORY_ACCOUNT_MAP: Record<string, string> = {
  inventory: '5000',
  shipping: '6100',
  rent: '6200',
  utilities: '6200',
  telecommunications: '6200',
  office: '6500',
  software: '6900',
  equipment: '7100',
  professional_services: '6600',
  marketing: '6400',
  travel: '7100',
  insurance: '6300',
  payroll: '6000',
  bank_fees: '7100',
  marketplace_fees: '6100',
  genovation_ai: '6900',
  other: '7100',
};

const TAX_CATEGORIES = [
  { value: 'hst_13', label: 'HST 13% (Ontario)', rate: 0.13, gstRate: 0.13, pstRate: 0 },
  { value: 'hst_15', label: 'HST 15% (NS/NB/NL/PEI)', rate: 0.15, gstRate: 0.15, pstRate: 0 },
  { value: 'gst_pst_bc', label: 'GST 5% + PST 7% (BC)', rate: 0.12, gstRate: 0.05, pstRate: 0.07 },
  { value: 'gst_pst_sk', label: 'GST 5% + PST 6% (SK)', rate: 0.11, gstRate: 0.05, pstRate: 0.06 },
  { value: 'gst_pst_mb', label: 'GST 5% + PST 7% (MB)', rate: 0.12, gstRate: 0.05, pstRate: 0.07 },
  { value: 'gst_qst', label: 'GST 5% + QST 9.975% (QC)', rate: 0.14975, gstRate: 0.05, pstRate: 0.09975 },
  { value: 'gst_only', label: 'GST 5% only (AB/NT/NU/YT)', rate: 0.05, gstRate: 0.05, pstRate: 0 },
  { value: 'zero_rated', label: 'Zero-rated / Exempt', rate: 0, gstRate: 0, pstRate: 0 },
  { value: 'no_tax', label: 'No tax (US / International)', rate: 0, gstRate: 0, pstRate: 0 },
];

const PAYMENT_METHODS = [
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'interac_etransfer', label: 'Interac E-Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'tax_inclusive', label: 'Tax Inclusive' },
  { value: 'other', label: 'Other' },
];

const RECURRING_FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
];

export function AddExpenseDialog({ open, onOpenChange, onSuccess, editExpense }: AddExpenseDialogProps) {
  const { user } = useAuth();
  const { selectedCompany, companies, isSuperAdmin } = useCompany();
  const [loading, setLoading] = useState(false);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [allocationRules, setAllocationRules] = useState<AllocationRule[]>([]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    tax_category: 'hst_13',
    category: 'other',
    subcategory: '',
    expense_date: new Date().toISOString().split('T')[0],
    vendor: '',
    notes: '',
    payment_method: 'credit_card',
    is_tax_deductible: true,
    is_shared: false,
    allocation_ves: 50,
    allocation_tgw: 50,
    is_recurring: false,
    recurring_frequency: '',
    recurring_end_date: '',
    company_id: selectedCompany?.id || '',
  });

  useEffect(() => {
    if (open) {
      fetchSubcategories();
      fetchAllocationRules();
      if (editExpense) {
        setFormData({
          description: editExpense.description || '',
          amount: editExpense.amount?.toString() || '',
          tax_category: 'hst_13',
          category: editExpense.category || 'other',
          subcategory: editExpense.subcategory || '',
          expense_date: editExpense.expense_date || new Date().toISOString().split('T')[0],
          vendor: editExpense.vendor || '',
          notes: editExpense.notes || '',
          payment_method: editExpense.payment_method || 'credit_card',
          is_tax_deductible: editExpense.is_tax_deductible ?? true,
          is_shared: editExpense.is_shared ?? false,
          allocation_ves: editExpense.allocation_ves ?? 50,
          allocation_tgw: editExpense.allocation_tgw ?? 50,
          is_recurring: editExpense.is_recurring ?? false,
          recurring_frequency: editExpense.recurring_frequency || '',
          recurring_end_date: editExpense.recurring_end_date || '',
          company_id: editExpense.company_id || selectedCompany?.id || '',
        });
      } else {
        resetForm();
      }
    }
  }, [open, editExpense, selectedCompany]);

  const fetchSubcategories = async () => {
    const { data } = await supabase.from('expense_subcategories').select('*');
    setSubcategories((data || []) as Subcategory[]);
  };

  const fetchAllocationRules = async () => {
    const { data } = await supabase.from('expense_allocation_rules').select('*');
    setAllocationRules((data || []) as AllocationRule[]);
  };

  const resetForm = () => {
    setFormData({
      description: '',
      amount: '',
      tax_category: 'hst_13',
      category: 'other',
      subcategory: '',
      expense_date: new Date().toISOString().split('T')[0],
      vendor: '',
      notes: '',
      payment_method: 'credit_card',
      is_tax_deductible: true,
      is_shared: false,
      allocation_ves: 50,
      allocation_tgw: 50,
      is_recurring: false,
      recurring_frequency: '',
      recurring_end_date: '',
      company_id: selectedCompany?.id || '',
    });
    setReceiptFile(null);
  };

  const handleCategoryChange = (category: string) => {
    setFormData(prev => ({ ...prev, category, subcategory: '' }));
    
    // Apply default allocation rule if exists
    const rule = allocationRules.find(r => r.category === category && !r.subcategory);
    if (rule) {
      setFormData(prev => ({
        ...prev,
        category,
        is_shared: true,
        allocation_ves: rule.default_ves_percentage,
        allocation_tgw: rule.default_tgw_percentage,
      }));
    }
  };

  const handleSubcategoryChange = (subcategory: string) => {
    setFormData(prev => ({ ...prev, subcategory }));
    
    // Apply subcategory-specific allocation rule if exists
    const rule = allocationRules.find(r => 
      r.category === formData.category && r.subcategory === subcategory
    );
    if (rule) {
      setFormData(prev => ({
        ...prev,
        subcategory,
        is_shared: true,
        allocation_ves: rule.default_ves_percentage,
        allocation_tgw: rule.default_tgw_percentage,
      }));
    }
  };

  const handleAllocationChange = (value: number[]) => {
    const ves = value[0];
    setFormData(prev => ({
      ...prev,
      allocation_ves: ves,
      allocation_tgw: 100 - ves,
    }));
  };

  const calculateTotals = () => {
    const amount = parseFloat(formData.amount) || 0;
    const taxCat = TAX_CATEGORIES.find(t => t.value === formData.tax_category);
    const gst = amount * (taxCat?.gstRate || 0);
    const pst = amount * (taxCat?.pstRate || 0);
    return {
      subtotal: amount,
      gst,
      pst,
      total: amount + gst + pst,
    };
  };

  const handleSubmit = async () => {
    if (!formData.description || !formData.amount) {
      toast.error('Please fill in required fields');
      return;
    }

    if (!formData.category || formData.category === '') {
      toast.error('Please select a category');
      return;
    }

    if (!formData.vendor || formData.vendor.trim() === '') {
      toast.error('Please enter a vendor');
      return;
    }

    if (!formData.is_shared && !formData.company_id && !isSuperAdmin) {
      toast.error('Please select a company');
      return;
    }

    setLoading(true);
    try {
      let receiptUrl = editExpense?.receipt_url || null;

      // Upload receipt if provided
      if (receiptFile) {
        const fileExt = receiptFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const { error: uploadError, data: uploadData } = await supabase.storage
          .from('receipts')
          .upload(fileName, receiptFile);

        if (uploadError) throw uploadError;
        receiptUrl = uploadData.path;
      }

      const computedTotals = calculateTotals();

      const expenseData = {
        description: formData.description,
        amount: parseFloat(formData.amount),
        gst_hst_amount: computedTotals.gst,
        pst_amount: computedTotals.pst,
        total_amount: computedTotals.total,
        category: formData.category as any,
        subcategory: formData.subcategory || null,
        expense_date: formData.expense_date,
        vendor: formData.vendor || null,
        notes: formData.notes || null,
        payment_method: formData.payment_method,
        is_tax_deductible: formData.is_tax_deductible,
        is_shared: formData.is_shared,
        allocation_ves: formData.is_shared ? formData.allocation_ves : 100,
        allocation_tgw: formData.is_shared ? formData.allocation_tgw : 0,
        is_recurring: formData.is_recurring,
        recurring_frequency: formData.is_recurring ? formData.recurring_frequency : null,
        recurring_end_date: formData.is_recurring && formData.recurring_end_date ? formData.recurring_end_date : null,
        company_id: formData.is_shared ? null : formData.company_id,
        receipt_url: receiptUrl,
        created_by: user?.id,
      };

      if (editExpense) {
        const { error } = await supabase
          .from('expenses')
          .update(expenseData)
          .eq('id', editExpense.id);
        if (error) throw error;
        toast.success('Expense updated');
      } else {
        const { data: insertedExpense, error } = await supabase.from('expenses').insert(expenseData).select('id').single();
        if (error) throw error;

        // Create journal entry for new expenses
        if (insertedExpense) {
          const targetCompanyId = formData.is_shared ? null : formData.company_id;
          
          if (formData.is_shared) {
            // Shared expense: create split journal entries for both companies
            for (const company of companies) {
              const isVES = company.code === 'VES';
              const allocationPct = isVES ? formData.allocation_ves : formData.allocation_tgw;
              if (allocationPct <= 0) continue;

              const allocatedAmount = (parseFloat(formData.amount) || 0) * (allocationPct / 100);
              const allocatedGst = computedTotals.gst * (allocationPct / 100);
              const allocatedPst = computedTotals.pst * (allocationPct / 100);
              const allocatedTotal = allocatedAmount + allocatedGst + allocatedPst;

              const baseAccountCode = CATEGORY_ACCOUNT_MAP[formData.category] || '7100';
              const accountCode = !isVES && ['6200','6300','6400','6500','6600','6700','6800','6900','7000','7100'].includes(baseAccountCode)
                ? (parseInt(baseAccountCode) + 2).toString()
                : isVES ? baseAccountCode : baseAccountCode.replace(/0$/, '1');

              try {
                await createExpenseJournalEntry({
                  companyId: company.id,
                  expenseId: insertedExpense.id,
                  expenseDate: formData.expense_date,
                  vendor: formData.vendor || 'Unknown',
                  description: `${formData.description} (${allocationPct}% allocation)`,
                  expenseAccountCode: accountCode,
                  amount: allocatedAmount,
                  gstHstAmount: allocatedGst,
                  qstAmount: allocatedPst,
                  totalAmount: allocatedTotal,
                  isVES,
                  isPaidImmediately: ['credit_card', 'debit_card', 'cash'].includes(formData.payment_method),
                  allocationVES: formData.allocation_ves,
                  allocationTGW: formData.allocation_tgw,
                });
              } catch (jeError) {
                console.error(`Journal entry for ${company.code} failed:`, jeError);
              }
            }
          } else if (targetCompanyId) {
            const isVES = companies.find(c => c.id === targetCompanyId)?.code === 'VES';
            const baseAccountCode = CATEGORY_ACCOUNT_MAP[formData.category] || '7100';
            const accountCode = !isVES && ['6200','6300','6400','6500','6600','6700','6800','6900','7000','7100'].includes(baseAccountCode)
              ? (parseInt(baseAccountCode) + 2).toString()
              : isVES ? baseAccountCode : baseAccountCode.replace(/0$/, '1');

            try {
              await createExpenseJournalEntry({
                companyId: targetCompanyId,
                expenseId: insertedExpense.id,
                expenseDate: formData.expense_date,
                vendor: formData.vendor || 'Unknown',
                description: formData.description,
                expenseAccountCode: accountCode,
                amount: computedTotals.subtotal,
                gstHstAmount: computedTotals.gst,
                qstAmount: computedTotals.pst,
                totalAmount: computedTotals.total,
                isVES: isVES ?? true,
                isPaidImmediately: ['credit_card', 'debit_card', 'cash'].includes(formData.payment_method),
              });
            } catch (jeError) {
              console.error('Journal entry creation failed:', jeError);
            }
          }
        }
        toast.success('Expense added');
      }

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving expense:', error);
      toast.error(error.message || 'Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  const totals = calculateTotals();
  const filteredSubcategories = subcategories.filter(s => s.category === formData.category);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            {editExpense ? 'Edit Expense' : 'Add Expense'}
          </DialogTitle>
          <DialogDescription>
            {editExpense ? 'Update expense details' : 'Record a new business expense'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Basic Info */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What was this expense for?"
            />
          </div>

          {/* Company / Shared */}
          <div className="p-4 rounded-lg border bg-muted/30 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <Label className="font-medium">Allocation</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_shared"
                  checked={formData.is_shared}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_shared: checked as boolean })}
                />
                <Label htmlFor="is_shared" className="text-sm">Shared expense</Label>
              </div>
            </div>

            {formData.is_shared ? (
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span>Virtual eShop: {formData.allocation_ves}%</span>
                  <span>Tech Genius Warehouse: {formData.allocation_tgw}%</span>
                </div>
                <Slider
                  value={[formData.allocation_ves]}
                  onValueChange={handleAllocationChange}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Virtual eShop pays {((totals.total * formData.allocation_ves) / 100).toFixed(2)} • 
                  Tech Genius Warehouse pays {((totals.total * formData.allocation_tgw) / 100).toFixed(2)}
                </p>
              </div>
            ) : (
              <Select 
                value={formData.company_id} 
                onValueChange={(v) => setFormData({ ...formData, company_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.code} - {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Category & Subcategory */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formData.category} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subcategory</Label>
              <Select 
                value={formData.subcategory || 'none'} 
                onValueChange={(v) => handleSubcategoryChange(v === 'none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {filteredSubcategories.map(sub => (
                    <SelectItem key={sub.subcategory} value={sub.subcategory}>
                      {sub.subcategory.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Amount & Tax */}
          <div className="space-y-2">
            <Label>Amount (Before Tax) *</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label>Tax Category</Label>
            <Select value={formData.tax_category} onValueChange={(v) => setFormData({ ...formData, tax_category: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAX_CATEGORIES.map(tc => (
                  <SelectItem key={tc.value} value={tc.value}>{tc.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tax Breakdown */}
          {(totals.gst > 0 || totals.pst > 0) && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              {totals.gst > 0 && (
                <div className="p-2 rounded bg-muted/50 flex justify-between">
                  <span className="text-muted-foreground">GST/HST</span>
                  <span className="font-medium">${totals.gst.toFixed(2)}</span>
                </div>
              )}
              {totals.pst > 0 && (
                <div className="p-2 rounded bg-muted/50 flex justify-between">
                  <span className="text-muted-foreground">PST/QST</span>
                  <span className="font-medium">${totals.pst.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Total Display */}
          <div className="p-3 rounded-lg bg-muted/50 flex justify-between items-center">
            <span className="font-medium">Total Amount</span>
            <span className="text-xl font-bold">
              ${totals.total.toFixed(2)}
            </span>
          </div>

          {/* Date & Vendor */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Date
              </Label>
              <Input
                type="date"
                value={formData.expense_date}
                onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Input
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                placeholder="Vendor name"
              />
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <CreditCard className="h-3 w-3" />
              Payment Method
            </Label>
            <Select 
              value={formData.payment_method} 
              onValueChange={(v) => setFormData({ ...formData, payment_method: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(pm => (
                  <SelectItem key={pm.value} value={pm.value}>{pm.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Receipt Upload */}
          <div className="space-y-2">
            <Label>Receipt</Label>
            <div className="border-2 border-dashed rounded-lg p-4 text-center">
              <input
                type="file"
                id="receipt-upload"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              />
              <label htmlFor="receipt-upload" className="cursor-pointer">
                <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {receiptFile ? receiptFile.name : 'Click to upload receipt'}
                </p>
              </label>
            </div>
          </div>

          {/* Recurring */}
          <div className="p-4 rounded-lg border space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_recurring"
                checked={formData.is_recurring}
                onCheckedChange={(checked) => setFormData({ ...formData, is_recurring: checked as boolean })}
              />
              <Label htmlFor="is_recurring">Recurring expense</Label>
            </div>

            {formData.is_recurring && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select 
                    value={formData.recurring_frequency} 
                    onValueChange={(v) => setFormData({ ...formData, recurring_frequency: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRING_FREQUENCIES.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>End Date (optional)</Label>
                  <Input
                    type="date"
                    value={formData.recurring_end_date}
                    onChange={(e) => setFormData({ ...formData, recurring_end_date: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Tax Deductible */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="tax_deductible"
              checked={formData.is_tax_deductible}
              onCheckedChange={(checked) => setFormData({ ...formData, is_tax_deductible: checked as boolean })}
            />
            <Label htmlFor="tax_deductible">Tax deductible</Label>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional details..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : editExpense ? 'Update Expense' : 'Add Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
