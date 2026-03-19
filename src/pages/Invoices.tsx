import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/lib/auth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PermissionGuard } from '@/components/layout/PermissionGuard';
import { useQuickActionListener } from '@/hooks/useGlobalShortcuts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Plus, FileText, Clock, CheckCircle, AlertCircle, Download, Search, X, Trash2, Copy, CreditCard, DollarSign, Pencil, Save, TriangleAlert } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { InvoicesGuide } from '@/components/guides/InvoicesGuide';
import { CreateInvoiceDialog } from '@/components/invoices/CreateInvoiceDialog';
import { format } from 'date-fns';
import { toTitleCase } from '@/lib/utils';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_gst_hst_number: string | null;
  subtotal: number;
  tax_amount: number;
  total: number;
  status: string;
  issue_date: string;
  due_date: string;
  paid_date: string | null;
  notes: string | null;
  created_at: string;
  company_id: string | null;
}

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  tax_treatment: string;
  device_id: string | null;
}

interface ARRecord {
  id: string;
  invoice_id: string;
  original_amount: number;
  paid_amount: number | null;
  balance_due: number | null;
  status: string | null;
}

interface ARPayment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  notes: string | null;
  created_at: string | null;
}

type DisplayStatus = 'outstanding' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';

const STATUS_CONFIG: Record<DisplayStatus, { label: string; icon: any; className: string }> = {
  outstanding: { label: 'Outstanding', icon: Clock, className: 'bg-warning/10 text-warning' },
  partially_paid: { label: 'Partially Paid', icon: CreditCard, className: 'bg-info/10 text-info' },
  paid: { label: 'Paid', icon: CheckCircle, className: 'bg-success/10 text-success' },
  overdue: { label: 'Overdue', icon: AlertCircle, className: 'bg-destructive/10 text-destructive' },
  cancelled: { label: 'Cancelled', icon: AlertCircle, className: 'bg-muted text-muted-foreground' },
};

const PAYMENT_METHODS = ['Cash', 'E-Transfer', 'Credit Card', 'Debit Card', 'Cheque', 'Wire Transfer', 'Other'] as const;

const TAX_LABELS: Record<string, string> = {
  hst: 'HST 13%',
  gst: 'GST 5%',
  zero_rated: 'Zero-Rated',
  tax_inclusive: 'Tax Incl.',
};

const TAX_RATES: Record<string, number> = {
  hst: 0.13,
  gst: 0.05,
  zero_rated: 0,
  tax_inclusive: 0.13,
};

export default function Invoices() {
  const { user } = useAuth();
  const { selectedCompany, accessibleCompanies } = useCompany();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [arRecords, setArRecords] = useState<ARRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Detail view state
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [viewItems, setViewItems] = useState<InvoiceItem[]>([]);
  const [viewPayments, setViewPayments] = useState<ARPayment[]>([]);
  const [viewAR, setViewAR] = useState<ARRecord | null>(null);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editDueDate, setEditDueDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerEmail, setEditCustomerEmail] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerAddress, setEditCustomerAddress] = useState('');
  const [editCustomerGstHst, setEditCustomerGstHst] = useState('');
  const [editItems, setEditItems] = useState<InvoiceItem[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  // Payment dialog state
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('E-Transfer');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  useQuickActionListener('create-invoice', useCallback(() => setCreateOpen(true), []));

  useEffect(() => { fetchInvoices(); }, [selectedCompany]);

  const fetchInvoices = async () => {
    try {
      let invoiceQuery = supabase.from('invoices').select('*').order('created_at', { ascending: false });
      let arQuery = supabase.from('accounts_receivable').select('id, invoice_id, original_amount, paid_amount, balance_due, status');
      if (selectedCompany) {
        invoiceQuery = invoiceQuery.eq('company_id', selectedCompany.id);
        arQuery = arQuery.eq('company_id', selectedCompany.id);
      }
      const [invoiceRes, arRes] = await Promise.all([invoiceQuery, arQuery]);
      if (invoiceRes.error) throw invoiceRes.error;
      if (arRes.error) throw arRes.error;

      const fetched = (invoiceRes.data || []) as Invoice[];
      const arData = (arRes.data || []) as ARRecord[];
      setArRecords(arData);

      // Auto-detect overdue
      const today = new Date().toISOString().split('T')[0];
      const overdueIds: string[] = [];
      fetched.forEach(inv => {
        if ((inv.status === 'sent' || inv.status === 'partially_paid') && inv.due_date < today) {
          inv.status = 'overdue';
          overdueIds.push(inv.id);
        }
      });
      if (overdueIds.length > 0) {
        supabase.from('invoices').update({ status: 'overdue' as any }).in('id', overdueIds).then();
      }
      setInvoices(fetched);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const getDisplayStatus = useCallback((invoice: Invoice): DisplayStatus => {
    if (invoice.status === 'cancelled') return 'cancelled';

    const ar = arRecords.find(a => a.invoice_id === invoice.id);
    const paidAmount = Number(ar?.paid_amount ?? 0);
    const invoiceTotal = Number(invoice.total);

    if (paidAmount >= invoiceTotal - 0.01) return 'paid';

    const today = new Date().toISOString().split('T')[0];
    if (paidAmount > 0) {
      return invoice.due_date < today ? 'overdue' : 'partially_paid';
    }

    return invoice.due_date < today ? 'overdue' : 'outstanding';
  }, [arRecords]);

  const getBalanceRemaining = useCallback((invoice: Invoice): number => {
    const ar = arRecords.find(a => a.invoice_id === invoice.id);
    if (!ar) return Number(invoice.total);

    const originalAmount = Number(ar.original_amount ?? invoice.total);
    const paidAmount = Number(ar.paid_amount ?? 0);
    return Math.max(0, originalAmount - paidAmount);
  }, [arRecords]);

  const getCompanyCode = (companyId: string | null) => {
    if (!companyId) return null;
    return accessibleCompanies.find(c => c.id === companyId)?.code || null;
  };

  const COMPANY_BADGE: Record<string, string> = {
    VES: 'bg-violet-500/15 text-violet-700 border-violet-500/30',
    TGW: 'bg-sky-500/15 text-sky-700 border-sky-500/30',
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  // ─── Detail View ───────────────────────────────────────────────
  const viewInvoiceDetails = async (invoice: Invoice) => {
    setViewInvoice(invoice);
    setEditMode(false);

    const [itemsRes, arRes] = await Promise.all([
      supabase.from('invoice_items').select('*').eq('invoice_id', invoice.id).order('created_at'),
      supabase.from('accounts_receivable').select('id, invoice_id, original_amount, paid_amount, balance_due, status').eq('invoice_id', invoice.id).maybeSingle(),
    ]);

    const items = (itemsRes.data || []) as InvoiceItem[];
    setViewItems(items);
    const ar = arRes.data as ARRecord | null;
    setViewAR(ar);

    if (ar) {
      const { data: payments } = await supabase
        .from('ar_payments')
        .select('id, amount, payment_date, payment_method, notes, created_at')
        .eq('accounts_receivable_id', ar.id)
        .order('payment_date', { ascending: false });
      setViewPayments((payments || []) as ARPayment[]);
    } else {
      setViewPayments([]);
    }
  };

  // Refresh detail view data (called after payment)
  const refreshDetailView = async (invoiceId: string) => {
    // Refresh main list
    await fetchInvoices();
    // Re-fetch the invoice for detail view
    const { data: inv } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
    if (inv) {
      setViewInvoice(inv as Invoice);
      // Re-fetch AR and payments
      const { data: ar } = await supabase
        .from('accounts_receivable')
        .select('id, invoice_id, original_amount, paid_amount, balance_due, status')
        .eq('invoice_id', invoiceId).maybeSingle();
      setViewAR(ar as ARRecord | null);
      if (ar) {
        const { data: payments } = await supabase
          .from('ar_payments')
          .select('id, amount, payment_date, payment_method, notes, created_at')
          .eq('accounts_receivable_id', ar.id)
          .order('payment_date', { ascending: false });
        setViewPayments((payments || []) as ARPayment[]);
      }
    }
  };

  // ─── Edit Mode ─────────────────────────────────────────────────
  const enterEditMode = () => {
    if (!viewInvoice) return;
    setEditMode(true);
    setEditDueDate(viewInvoice.due_date);
    setEditNotes(viewInvoice.notes || '');
    setEditCustomerName(viewInvoice.customer_name);
    setEditCustomerEmail(viewInvoice.customer_email || '');
    setEditCustomerPhone(viewInvoice.customer_phone || '');
    setEditCustomerAddress(viewInvoice.customer_address || '');
    setEditCustomerGstHst(viewInvoice.customer_gst_hst_number || '');
    setEditItems(viewItems.map(i => ({ ...i })));
  };

  const addEditLineItem = () => {
    setEditItems(prev => [...prev, {
      id: `new-${Date.now()}`,
      description: '',
      quantity: 1,
      unit_price: 0,
      total: 0,
      tax_treatment: 'hst',
      device_id: null,
    }]);
  };

  const updateEditItem = (id: string, updates: Partial<InvoiceItem>) => {
    setEditItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, ...updates };
      updated.total = updated.quantity * updated.unit_price;
      return updated;
    }));
  };

  const removeEditItem = (id: string) => {
    if (editItems.length <= 1) return;
    setEditItems(prev => prev.filter(i => i.id !== id));
  };

  const editCalculations = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;
    editItems.forEach(li => {
      const lineTotal = li.quantity * li.unit_price;
      const rate = TAX_RATES[li.tax_treatment] || 0;
      if (li.tax_treatment === 'tax_inclusive') {
        const preTax = lineTotal / (1 + rate);
        subtotal += preTax;
        totalTax += lineTotal - preTax;
      } else {
        subtotal += lineTotal;
        totalTax += lineTotal * rate;
      }
    });
    return { subtotal, totalTax, grandTotal: subtotal + totalTax };
  }, [editItems]);

  const saveEdits = async () => {
    if (!viewInvoice) return;
    const validItems = editItems.filter(i => i.description.trim() && i.unit_price > 0);
    if (validItems.length === 0) { toast.error('At least one valid line item required'); return; }

    setEditSaving(true);
    try {
      const newSubtotal = Math.round(editCalculations.subtotal * 100) / 100;
      const newTax = Math.round(editCalculations.totalTax * 100) / 100;
      const newTotal = Math.round(editCalculations.grandTotal * 100) / 100;
      const oldTotal = Number(viewInvoice.total);

      // Update invoice
      await supabase.from('invoices').update({
        due_date: editDueDate,
        notes: editNotes.trim() || null,
        customer_name: toTitleCase(editCustomerName),
        customer_email: editCustomerEmail.trim() || null,
        customer_phone: editCustomerPhone.trim() || null,
        customer_address: editCustomerAddress.trim() || null,
        customer_gst_hst_number: editCustomerGstHst.trim() || null,
        subtotal: newSubtotal,
        tax_amount: newTax,
        total: newTotal,
      }).eq('id', viewInvoice.id);

      // Delete old items and insert new ones
      await supabase.from('invoice_items').delete().eq('invoice_id', viewInvoice.id);
      const itemsToInsert = validItems.map(li => ({
        invoice_id: viewInvoice.id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        total: li.quantity * li.unit_price,
        tax_treatment: li.tax_treatment,
        device_id: li.device_id,
      }));
      await supabase.from('invoice_items').insert(itemsToInsert);

      // Update AR if total changed
      if (Math.abs(newTotal - oldTotal) > 0.01) {
        const { data: ar } = await supabase
          .from('accounts_receivable')
          .select('id, paid_amount')
          .eq('invoice_id', viewInvoice.id)
          .maybeSingle();

        if (ar) {
          const paidAmount = Number(ar.paid_amount || 0);
          const newBalance = Math.max(0, newTotal - paidAmount);
          const isFullyPaid = newBalance <= 0.01;
          await supabase.from('accounts_receivable').update({
            original_amount: newTotal,
            status: isFullyPaid ? 'paid' : paidAmount > 0 ? 'partially_paid' : 'outstanding',
          }).eq('id', ar.id);

          // Update invoice status to match
          if (isFullyPaid) {
            await supabase.from('invoices').update({ status: 'paid' as any }).eq('id', viewInvoice.id);
          } else if (paidAmount > 0) {
            await supabase.from('invoices').update({ status: 'partially_paid' as any }).eq('id', viewInvoice.id);
          } else {
            await supabase.from('invoices').update({ status: 'sent' as any }).eq('id', viewInvoice.id);
          }
        }

        // Create adjustment journal entry if total changed
        try {
          const diff = newTotal - oldTotal;
          const companyCode = getCompanyCode(viewInvoice.company_id);
          const isVES = companyCode === 'VES';
          const arAccount = isVES ? '1050' : '1051';
          const revenueAccount = isVES ? '4400' : '4401';
          const { createAutoJournalEntry, getAccountIdByCode } = await import('@/lib/accounting/journalAutomation');
          const [arAccId, revAccId] = await Promise.all([
            getAccountIdByCode(viewInvoice.company_id!, arAccount),
            getAccountIdByCode(viewInvoice.company_id!, revenueAccount),
          ]);
          if (arAccId && revAccId && Math.abs(diff) > 0.01) {
            // Calculate how much is subtotal vs tax change
            const oldSubtotal = Number(viewInvoice.subtotal);
            const subtotalDiff = newSubtotal - oldSubtotal;

            await createAutoJournalEntry({
              companyId: viewInvoice.company_id!,
              entryDate: new Date().toISOString().split('T')[0],
              description: `Invoice ${viewInvoice.invoice_number} adjustment`,
              referenceType: 'sale',
              referenceId: viewInvoice.id,
              lines: diff > 0 ? [
                { accountCode: arAccount, accountId: arAccId, description: `AR adjustment - Invoice ${viewInvoice.invoice_number}`, debitAmount: Math.abs(diff), creditAmount: 0 },
                { accountCode: revenueAccount, accountId: revAccId, description: `Revenue adjustment - Invoice ${viewInvoice.invoice_number}`, debitAmount: 0, creditAmount: Math.abs(subtotalDiff) },
                ...(Math.abs(diff - subtotalDiff) > 0.01 ? [{
                  accountCode: isVES ? '4200' : '4201',
                  accountId: await getAccountIdByCode(viewInvoice.company_id!, isVES ? '4200' : '4201') || revAccId,
                  description: `Tax adjustment - Invoice ${viewInvoice.invoice_number}`,
                  debitAmount: 0,
                  creditAmount: Math.abs(diff - subtotalDiff),
                }] : []),
              ] : [
                { accountCode: revenueAccount, accountId: revAccId, description: `Revenue reversal - Invoice ${viewInvoice.invoice_number}`, debitAmount: Math.abs(subtotalDiff), creditAmount: 0 },
                ...(Math.abs(diff - subtotalDiff) > 0.01 ? [{
                  accountCode: isVES ? '4200' : '4201',
                  accountId: await getAccountIdByCode(viewInvoice.company_id!, isVES ? '4200' : '4201') || revAccId,
                  description: `Tax reversal - Invoice ${viewInvoice.invoice_number}`,
                  debitAmount: Math.abs(diff - subtotalDiff),
                  creditAmount: 0,
                }] : []),
                { accountCode: arAccount, accountId: arAccId, description: `AR adjustment - Invoice ${viewInvoice.invoice_number}`, debitAmount: 0, creditAmount: Math.abs(diff) },
              ],
            });
          }
        } catch (jeErr) {
          console.error('Adjustment journal entry failed:', jeErr);
        }
      }

      toast.success('Invoice updated');
      setEditMode(false);
      await refreshDetailView(viewInvoice.id);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Actions ───────────────────────────────────────────────────
  const downloadInvoicePdf = async (invoiceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-invoice-pdf', { body: { invoiceId } });
      if (error) throw error;
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(data.html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }
    } catch (err) {
      console.error('PDF error:', err);
      toast.error('Failed to generate invoice PDF');
    }
  };

  const saveCustomerFromInvoice = async (invoice: Invoice) => {
    if (!invoice.customer_name) return;
    const normalizedName = toTitleCase(invoice.customer_name);
    try {
      const { data: existing } = await supabase.from('customers').select('id').eq('name', normalizedName).maybeSingle();
      if (existing) { toast.info('Customer already saved'); return; }
      await supabase.from('customers').insert({
        name: normalizedName, email: invoice.customer_email, phone: invoice.customer_phone,
        address: invoice.customer_address, company_id: invoice.company_id, marketplace_source: 'invoice', channel: 'In-Store',
      });
      toast.success(`Saved ${normalizedName} to customer directory`);
    } catch { toast.error('Failed to save customer'); }
  };

  const handleDuplicate = async (source: Invoice) => {
    try {
      const { data: items } = await supabase.from('invoice_items').select('description, quantity, unit_price, total, tax_treatment, device_id').eq('invoice_id', source.id);
      const companyCode = getCompanyCode(source.company_id);
      const prefix = companyCode || 'INV';
      const date = format(new Date(), 'yyyyMM');
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const invoiceNumber = `${prefix}-${date}-${random}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const { data: newInv, error } = await supabase.from('invoices').insert({
        invoice_number: invoiceNumber, customer_name: source.customer_name, customer_email: source.customer_email,
        customer_address: source.customer_address, customer_phone: source.customer_phone,
        customer_gst_hst_number: source.customer_gst_hst_number, subtotal: source.subtotal, tax_amount: source.tax_amount,
        total: source.total, status: 'sent' as any, issue_date: new Date().toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0], notes: source.notes, company_id: source.company_id,
      }).select('id').single();
      if (error) throw error;

      if (items && items.length > 0 && newInv) {
        await supabase.from('invoice_items').insert(items.map(i => ({
          invoice_id: newInv.id, description: i.description, quantity: i.quantity,
          unit_price: i.unit_price, total: i.total, tax_treatment: i.tax_treatment, device_id: null,
        })));
      }
      toast.success(`Duplicated as ${invoiceNumber}`);
      fetchInvoices();
    } catch (err) {
      console.error('Duplicate error:', err);
      toast.error('Failed to duplicate invoice');
    }
  };

  // ─── Payment ───────────────────────────────────────────────────
  const openPaymentDialog = (invoice: Invoice) => {
    const balance = getBalanceRemaining(invoice);
    setPaymentInvoice(invoice);
    setPaymentAmount(String(balance));
    setPaymentMethod('E-Transfer');
    setPaymentDate(new Date().toISOString().split('T')[0]);
  };

  const recordPayment = async () => {
    if (!paymentInvoice) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid payment amount'); return; }

    setPaymentSubmitting(true);
    try {
      const invoiceTotal = Number(paymentInvoice.total);

      // Find or create AR record
      let arRecord: { id: string; paid_amount: number | null; original_amount: number } | null = null;
      const { data: existingAR } = await supabase
        .from('accounts_receivable')
        .select('id, paid_amount, original_amount')
        .eq('invoice_id', paymentInvoice.id)
        .maybeSingle();

      if (existingAR) {
        arRecord = existingAR;
      } else {
        // Create AR record if missing
        const { data: newAR, error: arErr } = await supabase
          .from('accounts_receivable')
          .insert({
            company_id: paymentInvoice.company_id,
            invoice_id: paymentInvoice.id,
            source_type: 'invoice',
            source_reference: paymentInvoice.invoice_number,
            customer_name: paymentInvoice.customer_name,
            original_amount: invoiceTotal,
            paid_amount: 0,
            due_date: paymentInvoice.due_date,
            status: 'outstanding',
          })
          .select('id, paid_amount, original_amount')
          .single();

        if (arErr || !newAR) {
          console.error('Failed to create AR:', arErr);
          throw arErr || new Error('Unable to create AR record for this invoice');
        }

        arRecord = newAR;
      }

      const originalAmount = Number(arRecord.original_amount || invoiceTotal);
      const previouslyPaid = Number(arRecord.paid_amount || 0);
      const currentBalance = Math.max(0, originalAmount - previouslyPaid);

      if (amount > currentBalance + 0.01) {
        toast.error(`Payment exceeds balance (${formatCurrency(currentBalance)})`);
        return;
      }

      const newTotalPaid = previouslyPaid + amount;
      const newBalance = Math.max(0, originalAmount - newTotalPaid);
      const isFullyPaid = newBalance <= 0.01;

      // Insert payment record
      const { error: payErr } = await supabase.from('ar_payments').insert({
        accounts_receivable_id: arRecord.id,
        amount,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        notes: `Payment for Invoice ${paymentInvoice.invoice_number}`,
        created_by: user?.id,
      });
      if (payErr) {
        console.error('AR payment insert error:', payErr);
        throw payErr;
      }

      // Update AR paid amount, balance_due, and status
      const { error: arUpdateErr } = await supabase
        .from('accounts_receivable')
        .update({
          paid_amount: newTotalPaid,
          balance_due: newBalance,
          status: isFullyPaid ? 'paid' : 'partially_paid',
        })
        .eq('id', arRecord.id);
      if (arUpdateErr) {
        console.error('AR update error:', arUpdateErr);
        throw arUpdateErr;
      }

      // Update invoice status
      const updateData: Record<string, any> = isFullyPaid
        ? { status: 'paid', paid_date: paymentDate }
        : { status: 'partially_paid', paid_date: null };
      const { error: invUpdateErr } = await supabase.from('invoices').update(updateData).eq('id', paymentInvoice.id);
      if (invUpdateErr) {
        console.error('Invoice update error:', invUpdateErr);
        throw invUpdateErr;
      }

      // Journal entry: Dr. Cash / Cr. AR
      try {
        const companyCode = getCompanyCode(paymentInvoice.company_id);
        const isVES = companyCode === 'VES';
        const cashAccount = isVES ? '1000' : '1001';
        const arAccount = isVES ? '1050' : '1051';
        const { createAutoJournalEntry, getAccountIdByCode } = await import('@/lib/accounting/journalAutomation');
        const [cashAccId, arAccId] = await Promise.all([
          getAccountIdByCode(paymentInvoice.company_id!, cashAccount),
          getAccountIdByCode(paymentInvoice.company_id!, arAccount),
        ]);
        if (cashAccId && arAccId) {
          await createAutoJournalEntry({
            companyId: paymentInvoice.company_id!,
            entryDate: paymentDate,
            description: `Payment received - Invoice ${paymentInvoice.invoice_number} (${paymentMethod})`,
            referenceType: 'payment_received',
            referenceId: paymentInvoice.id,
            lines: [
              { accountCode: cashAccount, accountId: cashAccId, description: `Cash received - ${paymentInvoice.customer_name}`, debitAmount: amount, creditAmount: 0 },
              { accountCode: arAccount, accountId: arAccId, description: `AR payment - Invoice ${paymentInvoice.invoice_number}`, debitAmount: 0, creditAmount: amount },
            ],
          });
        }
      } catch (jeErr) {
        console.error('Payment journal entry failed:', jeErr);
        toast.warning('Payment recorded but journal entry failed');
      }

      toast.success(isFullyPaid
        ? `Invoice ${paymentInvoice.invoice_number} fully paid`
        : `Partial payment of ${formatCurrency(amount)} recorded — ${formatCurrency(Math.max(0, newBalance))} remaining`
      );

      const invoiceId = paymentInvoice.id;
      setPaymentInvoice(null);
      // Refresh detail view if it was open
      if (viewInvoice?.id === invoiceId) {
        await refreshDetailView(invoiceId);
      } else {
        await fetchInvoices();
      }
    } catch (err) {
      console.error('Payment error:', err);
      toast.error('Failed to record payment');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const cancelInvoice = async (id: string) => {
    try {
      const invoice = invoices.find(i => i.id === id);
      if (!invoice) return;

      await supabase.from('invoices').update({ status: 'cancelled' as any }).eq('id', id);
      await supabase.from('accounts_receivable')
        .update({ status: 'cancelled', notes: `Cancelled - Invoice ${invoice.invoice_number}` })
        .eq('invoice_id', id);

      const { data: journalEntries } = await supabase.from('journal_entries').select('id').eq('reference_id', id).eq('reference_type', 'sale');
      if (journalEntries && journalEntries.length > 0) {
        for (const je of journalEntries) {
          const { data: lines } = await supabase.from('journal_entry_lines').select('account_id, debit_amount, credit_amount').eq('journal_entry_id', je.id);
          if (lines) {
            for (const line of lines) {
              const { data: account } = await supabase.from('chart_of_accounts').select('current_balance, normal_balance').eq('id', line.account_id).single();
              if (account) {
                const debit = Number(line.debit_amount || 0), credit = Number(line.credit_amount || 0), current = Number(account.current_balance || 0);
                const newBal = account.normal_balance === 'debit' ? current - debit + credit : current - credit + debit;
                await supabase.from('chart_of_accounts').update({ current_balance: newBal }).eq('id', line.account_id);
              }
            }
          }
          await supabase.from('journal_entries').update({ status: 'voided', description: `[VOIDED] ` }).eq('id', je.id);
        }
      }
      toast.success('Invoice cancelled — AR reversed and journal entries voided');
      fetchInvoices();
    } catch (error) {
      console.error('Error cancelling invoice:', error);
      toast.error('Failed to cancel invoice');
    }
  };

  const deleteInvoice = async (id: string) => {
    try {
      const invoice = invoices.find(i => i.id === id);
      if (invoice && invoice.status !== 'cancelled') await cancelInvoice(id);
      await supabase.from('invoice_items').delete().eq('invoice_id', id);
      const { data: arRecord } = await supabase.from('accounts_receivable').select('id').eq('invoice_id', id).maybeSingle();
      if (arRecord) await supabase.from('ar_payments').delete().eq('accounts_receivable_id', arRecord.id);
      await supabase.from('accounts_receivable').delete().eq('invoice_id', id);
      const { data: jes } = await supabase.from('journal_entries').select('id').eq('reference_id', id);
      if (jes) for (const je of jes) {
        await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', je.id);
        await supabase.from('journal_entries').delete().eq('id', je.id);
      }
      await supabase.from('invoices').delete().eq('id', id);
      toast.success(`Invoice ${invoice?.invoice_number} deleted`);
      fetchInvoices();
    } catch (error: any) {
      console.error('Error deleting invoice:', error);
      toast.error(error.message || 'Failed to delete invoice');
    }
  };

  // ─── Computed ──────────────────────────────────────────────────
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchSearch = !search.trim() ||
        inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
        inv.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        inv.customer_email?.toLowerCase().includes(search.toLowerCase());
      if (statusFilter === 'all') return matchSearch;
      return matchSearch && getDisplayStatus(inv) === statusFilter;
    });
  }, [invoices, search, statusFilter, getDisplayStatus]);

  const totalOutstanding = useMemo(() => {
    return invoices
      .filter(i => { const ds = getDisplayStatus(i); return ds === 'outstanding' || ds === 'overdue' || ds === 'partially_paid'; })
      .reduce((sum, i) => sum + getBalanceRemaining(i), 0);
  }, [invoices, getDisplayStatus, getBalanceRemaining]);

  const totalPaid = invoices.filter(i => getDisplayStatus(i) === 'paid').reduce((sum, i) => sum + Number(i.total), 0);
  const overdueCount = invoices.filter(i => getDisplayStatus(i) === 'overdue').length;

  // ─── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted rounded-xl" />)}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <PermissionGuard permission="invoices_view" title="Invoices">
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">Invoices</h1>
            <p className="text-muted-foreground mt-1">Create and manage customer invoices for off-marketplace sales</p>
          </div>
          <Button className="gradient-primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Invoice
          </Button>
        </div>

        <InvoicesGuide />

        <Alert variant="destructive" className="border-destructive bg-destructive/10">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Partial Payments Not Supported</AlertTitle>
          <AlertDescription>
            This invoice section does not currently support partial payment tracking. Outstanding balances will not update when partial payments are recorded. Please refer to the <strong>Invoice Payment History</strong> when making adjustments for such transactions.
          </AlertDescription>
        </Alert>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Outstanding Balance</p>
                  <p className="text-2xl font-bold font-display text-warning">{formatCurrency(totalOutstanding)}</p>
                </div>
                <div className="p-3 rounded-xl bg-warning/10"><Clock className="h-5 w-5 text-warning" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Paid</p>
                  <p className="text-2xl font-bold font-display text-success">{formatCurrency(totalPaid)}</p>
                </div>
                <div className="p-3 rounded-xl bg-success/10"><CheckCircle className="h-5 w-5 text-success" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Overdue</p>
                  <p className="text-2xl font-bold font-display text-destructive">{overdueCount}</p>
                  <p className="text-xs text-muted-foreground">invoices need attention</p>
                </div>
                <div className="p-3 rounded-xl bg-destructive/10"><AlertCircle className="h-5 w-5 text-destructive" /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Invoices Table */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="font-display flex items-center gap-2">
                <FileText className="h-5 w-5" /> All Invoices
              </CardTitle>
              <div className="flex-1" />
              <div className="relative min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search invoice #, customer..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="outstanding">Outstanding</SelectItem>
                  <SelectItem value="partially_paid">Partially Paid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              {(statusFilter !== 'all' || search) && (
                <Button variant="ghost" size="sm" onClick={() => { setStatusFilter('all'); setSearch(''); }}>
                  <X className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {search || statusFilter !== 'all' ? 'No invoices match your filters' : 'No invoices yet — click "New Invoice" to create one'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => {
                    const displayStatus = getDisplayStatus(invoice);
                    const config = STATUS_CONFIG[displayStatus];
                    const code = getCompanyCode(invoice.company_id);
                    const balance = getBalanceRemaining(invoice);
                    return (
                      <TableRow key={invoice.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => viewInvoiceDetails(invoice)}>
                        <TableCell className="font-mono font-medium">{invoice.invoice_number}</TableCell>
                        <TableCell>
                          {code && <Badge variant="outline" className={`text-[10px] font-medium ${COMPANY_BADGE[code] || ''}`}>{code}</Badge>}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{invoice.customer_name}</p>
                            {invoice.customer_email && <p className="text-[10px] text-muted-foreground">{invoice.customer_email}</p>}
                          </div>
                        </TableCell>
                        <TableCell>{format(new Date(invoice.issue_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell><Badge className={config.className}>{config.label}</Badge></TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(Number(invoice.total))}</TableCell>
                        <TableCell className="text-right">
                          {displayStatus === 'paid' || displayStatus === 'cancelled' ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={balance > 0 ? 'font-semibold text-warning' : 'text-muted-foreground'}>{formatCurrency(balance)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadInvoicePdf(invoice.id)} title="Print/PDF">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicate(invoice)} title="Duplicate">
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Invoice {invoice.invoice_number}?</AlertDialogTitle>
                                  <AlertDialogDescription>This will permanently delete this invoice, reverse all accounting entries (AR, journal entries), and cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteInvoice(invoice.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={fetchInvoices} />

      {/* ─── Invoice Detail / Edit Dialog ─────────────────────────── */}
      <Dialog open={!!viewInvoice} onOpenChange={() => { setViewInvoice(null); setViewPayments([]); setViewAR(null); setEditMode(false); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 flex-wrap">
              Invoice {viewInvoice?.invoice_number}
              {viewInvoice && (() => {
                const code = getCompanyCode(viewInvoice.company_id);
                const displayStatus = getDisplayStatus(viewInvoice);
                const config = STATUS_CONFIG[displayStatus];
                return (
                  <>
                    {code && <Badge variant="outline" className={`text-[10px] font-medium ${COMPANY_BADGE[code] || ''}`}>{code}</Badge>}
                    <Badge className={config.className}>{config.label}</Badge>
                  </>
                );
              })()}
              {viewInvoice && !editMode && getDisplayStatus(viewInvoice) !== 'cancelled' && (
                <Button variant="ghost" size="sm" className="ml-auto" onClick={enterEditMode}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          {viewInvoice && !editMode && (
            <div className="space-y-4 text-sm">
              {/* Customer info */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div><span className="text-muted-foreground">Customer:</span> <strong>{viewInvoice.customer_name}</strong></div>
                {viewInvoice.customer_email && <div><span className="text-muted-foreground">Email:</span> {viewInvoice.customer_email}</div>}
                {viewInvoice.customer_phone && <div><span className="text-muted-foreground">Phone:</span> {viewInvoice.customer_phone}</div>}
                {viewInvoice.customer_gst_hst_number && <div><span className="text-muted-foreground">GST/HST #:</span> {viewInvoice.customer_gst_hst_number}</div>}
                <div><span className="text-muted-foreground">Issue Date:</span> {format(new Date(viewInvoice.issue_date), 'MMM d, yyyy')}</div>
                <div><span className="text-muted-foreground">Due Date:</span> {format(new Date(viewInvoice.due_date), 'MMM d, yyyy')}</div>
                {viewInvoice.customer_address && <div className="col-span-2"><span className="text-muted-foreground">Address:</span> {viewInvoice.customer_address}</div>}
              </div>

              <Separator />

              {/* Line items */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Tax</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewItems.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.description}</TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(item.unit_price))}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{TAX_LABELS[item.tax_treatment] || item.tax_treatment}</Badge></TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(item.total))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Totals & Balance */}
              <div className="space-y-1 bg-muted/30 rounded-lg p-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(Number(viewInvoice.subtotal))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(Number(viewInvoice.tax_amount))}</span></div>
                <Separator />
                <div className="flex justify-between font-bold text-base"><span>Total</span><span>{formatCurrency(Number(viewInvoice.total))}</span></div>
                {viewAR && (() => {
                  const paidAmount = Number(viewAR.paid_amount || 0);
                  const balanceRemaining = Math.max(0, Number(viewAR.original_amount || viewInvoice.total) - paidAmount);
                  return (
                    <>
                      <div className="flex justify-between text-success"><span>Paid</span><span>{formatCurrency(paidAmount)}</span></div>
                      <Separator />
                      <div className="flex justify-between font-bold text-base">
                        <span>Balance Remaining</span>
                        <span className={balanceRemaining > 0 ? 'text-warning' : 'text-success'}>
                          {formatCurrency(balanceRemaining)}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Payment History */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5" /> Payment History
                </h4>
                {viewPayments.length === 0 ? (
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
                    No payments recorded yet.
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/50 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Method</TableHead>
                          <TableHead className="text-xs text-right">Amount</TableHead>
                          <TableHead className="text-xs">Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewPayments.map(p => (
                          <TableRow key={p.id}>
                            <TableCell className="text-xs">{format(new Date(p.payment_date), 'MMM d, yyyy')}</TableCell>
                            <TableCell className="text-xs">{p.payment_method || '—'}</TableCell>
                            <TableCell className="text-xs text-right font-semibold text-success">{formatCurrency(Number(p.amount))}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{p.notes || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {viewInvoice.notes && (
                <div className="text-xs text-muted-foreground bg-muted/20 p-2 rounded"><strong>Notes:</strong> {viewInvoice.notes}</div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => downloadInvoicePdf(viewInvoice.id)}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Print / PDF
                </Button>
                <Button size="sm" variant="outline" onClick={() => saveCustomerFromInvoice(viewInvoice)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Save Customer
                </Button>
                {getDisplayStatus(viewInvoice) !== 'paid' && getDisplayStatus(viewInvoice) !== 'cancelled' && (
                  <>
                    <Button size="sm" onClick={() => openPaymentDialog(viewInvoice)}>
                      <CreditCard className="h-3.5 w-3.5 mr-1.5" /> Record Payment
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive">
                          Cancel Invoice
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel Invoice {viewInvoice.invoice_number}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will cancel the invoice, reverse all accounting entries (AR, journal entries), and mark it as cancelled. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Invoice</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => { cancelInvoice(viewInvoice.id); setViewInvoice(null); }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Yes, Cancel Invoice
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ─── Edit Mode ─────────────────────────────────────────── */}
          {viewInvoice && editMode && (
            <div className="space-y-4 text-sm">
              {/* Customer fields */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Customer Name *</Label>
                    <Input value={editCustomerName} onChange={e => setEditCustomerName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email</Label>
                    <Input value={editCustomerEmail} onChange={e => setEditCustomerEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone</Label>
                    <Input value={editCustomerPhone} onChange={e => setEditCustomerPhone(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">GST/HST #</Label>
                    <Input value={editCustomerGstHst} onChange={e => setEditCustomerGstHst(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Address</Label>
                  <Input value={editCustomerAddress} onChange={e => setEditCustomerAddress(e.target.value)} />
                </div>
              </div>

              <Separator />

              {/* Dates & Notes */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Due Date</Label>
                  <Input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} className="text-xs" />
                </div>
              </div>

              <Separator />

              {/* Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Line Items</h3>
                  <Button type="button" variant="outline" size="sm" onClick={addEditLineItem}>
                    <Plus className="h-3 w-3 mr-1" /> Add Item
                  </Button>
                </div>

                <div className="grid grid-cols-[1fr_60px_90px_110px_32px] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">
                  <span>Description</span><span>Qty</span><span>Price</span><span>Tax</span><span />
                </div>

                {editItems.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1fr_60px_90px_110px_32px] gap-2 items-center">
                    <Input
                      className="text-xs h-8"
                      value={item.description}
                      onChange={e => updateEditItem(item.id, { description: e.target.value })}
                      placeholder="Description"
                    />
                    <Input
                      type="number"
                      className="text-xs h-8"
                      value={item.quantity}
                      min={1}
                      onChange={e => updateEditItem(item.id, { quantity: parseInt(e.target.value) || 1 })}
                    />
                    <Input
                      type="number"
                      className="text-xs h-8"
                      value={item.unit_price}
                      step="0.01"
                      min={0}
                      onChange={e => updateEditItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })}
                    />
                    <Select value={item.tax_treatment} onValueChange={v => updateEditItem(item.id, { tax_treatment: v })}>
                      <SelectTrigger className="h-8 text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hst" className="text-xs">HST 13%</SelectItem>
                        <SelectItem value="gst" className="text-xs">GST 5%</SelectItem>
                        <SelectItem value="zero_rated" className="text-xs">Zero-Rated</SelectItem>
                        <SelectItem value="tax_inclusive" className="text-xs">Tax Incl.</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeEditItem(item.id)} disabled={editItems.length <= 1}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Edit totals preview */}
              <div className="space-y-1 bg-muted/30 rounded-lg p-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(editCalculations.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(editCalculations.totalTax)}</span></div>
                <Separator />
                <div className="flex justify-between font-bold text-base"><span>New Total</span><span className="text-primary">{formatCurrency(editCalculations.grandTotal)}</span></div>
                {Math.abs(editCalculations.grandTotal - Number(viewInvoice.total)) > 0.01 && (
                  <p className="text-[10px] text-info mt-1">
                    Total changed by {formatCurrency(editCalculations.grandTotal - Number(viewInvoice.total))} — AR and journal entries will be adjusted automatically.
                  </p>
                )}
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={saveEdits} disabled={editSaving}>
                  <Save className="h-3.5 w-3.5 mr-1.5" /> {editSaving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditMode(false)} disabled={editSaving}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Record Payment Dialog ────────────────────────────────── */}
      <Dialog open={!!paymentInvoice} onOpenChange={() => setPaymentInvoice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Record Payment</DialogTitle>
          </DialogHeader>
          {paymentInvoice && (() => {
            const balance = getBalanceRemaining(paymentInvoice);
            return (
              <div className="space-y-4">
                <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span className="font-mono font-medium">{paymentInvoice.invoice_number}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{paymentInvoice.customer_name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Invoice Total</span><span>{formatCurrency(Number(paymentInvoice.total))}</span></div>
                  <Separator />
                  <div className="flex justify-between font-semibold"><span>Balance Remaining</span><span className="text-warning">{formatCurrency(balance)}</span></div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Payment Amount *</label>
                    <Input type="number" step="0.01" min="0.01" max={balance} value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" />
                    {parseFloat(paymentAmount) > 0 && parseFloat(paymentAmount) < balance && (
                      <p className="text-[10px] text-info">Partial payment — {formatCurrency(balance - parseFloat(paymentAmount))} will remain outstanding</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Payment Method *</label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Payment Date *</label>
                    <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                  </div>
                </div>

                <div className="text-[10px] text-muted-foreground bg-muted/20 rounded-md p-2.5 border border-border/40">
                  <strong>Accounting:</strong> Dr. Cash / Cr. Accounts Receivable — AR balance will be reduced by the payment amount.
                </div>

                <Button onClick={recordPayment} disabled={paymentSubmitting} className="w-full">
                  {paymentSubmitting ? 'Processing...' : `Record ${formatCurrency(parseFloat(paymentAmount) || 0)} Payment`}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
    </PermissionGuard>
  );
}
