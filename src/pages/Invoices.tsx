import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PermissionGuard } from '@/components/layout/PermissionGuard';
import { useQuickActionListener } from '@/hooks/useGlobalShortcuts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Plus, FileText, Clock, CheckCircle, AlertCircle, Download, Search, X, Trash2, Copy, CreditCard, DollarSign } from 'lucide-react';
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

// Display status derived from AR data
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

export default function Invoices() {
  const { selectedCompany, accessibleCompanies } = useCompany();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [arRecords, setArRecords] = useState<ARRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [viewItems, setViewItems] = useState<InvoiceItem[]>([]);
  const [viewPayments, setViewPayments] = useState<ARPayment[]>([]);
  const [viewAR, setViewAR] = useState<ARRecord | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Payment dialog state
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('E-Transfer');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  useQuickActionListener('create-invoice', useCallback(() => setCreateOpen(true), []));

  useEffect(() => {
    fetchInvoices();
  }, [selectedCompany]);

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

      const fetched = (invoiceRes.data || []) as Invoice[];
      const arData = (arRes.data || []) as ARRecord[];
      
      setArRecords(arData);

      // Auto-detect overdue and update DB
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

  // Derive display status from AR data
  const getDisplayStatus = useCallback((invoice: Invoice): DisplayStatus => {
    if (invoice.status === 'cancelled') return 'cancelled';
    if (invoice.status === 'paid') return 'paid';
    
    const ar = arRecords.find(a => a.invoice_id === invoice.id);
    const paidAmount = Number(ar?.paid_amount || 0);
    const invoiceTotal = Number(invoice.total);
    
    if (paidAmount >= invoiceTotal - 0.01) return 'paid';
    
    const today = new Date().toISOString().split('T')[0];
    const isOverdue = invoice.due_date < today;
    
    if (paidAmount > 0) return 'partially_paid';
    if (isOverdue || invoice.status === 'overdue') return 'overdue';
    return 'outstanding';
  }, [arRecords]);

  const getBalanceRemaining = useCallback((invoice: Invoice): number => {
    const ar = arRecords.find(a => a.invoice_id === invoice.id);
    if (ar) return Math.max(0, Number(ar.balance_due || 0));
    return Number(invoice.total);
  }, [arRecords]);

  const getCompanyCode = (companyId: string | null) => {
    if (!companyId) return null;
    return accessibleCompanies.find(c => c.id === companyId)?.code || null;
  };

  const COMPANY_BADGE: Record<string, string> = {
    VES: 'bg-violet-500/15 text-violet-700 border-violet-500/30',
    TGW: 'bg-sky-500/15 text-sky-700 border-sky-500/30',
  };

  const viewInvoiceDetails = async (invoice: Invoice) => {
    setViewInvoice(invoice);
    
    // Fetch items, AR record, and payments in parallel
    const [itemsRes, arRes] = await Promise.all([
      supabase.from('invoice_items').select('*').eq('invoice_id', invoice.id).order('created_at'),
      supabase.from('accounts_receivable').select('id, invoice_id, original_amount, paid_amount, balance_due, status').eq('invoice_id', invoice.id).maybeSingle(),
    ]);
    
    setViewItems((itemsRes.data || []) as InvoiceItem[]);
    const ar = arRes.data as ARRecord | null;
    setViewAR(ar);
    
    // Fetch payment history if AR exists
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

  const downloadInvoicePdf = async (invoiceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-invoice-pdf', {
        body: { invoiceId },
      });
      if (error) throw error;
      const html = data.html;
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
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
        const clonedItems = items.map(i => ({
          invoice_id: newInv.id, description: i.description, quantity: i.quantity,
          unit_price: i.unit_price, total: i.total, tax_treatment: i.tax_treatment, device_id: null,
        }));
        await supabase.from('invoice_items').insert(clonedItems);
      }
      toast.success(`Duplicated as ${invoiceNumber}`);
      fetchInvoices();
    } catch (err) {
      console.error('Duplicate error:', err);
      toast.error('Failed to duplicate invoice');
    }
  };

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

      const { data: arRecord } = await supabase
        .from('accounts_receivable')
        .select('id, paid_amount, balance_due, original_amount')
        .eq('invoice_id', paymentInvoice.id)
        .maybeSingle();

      const previouslyPaid = Number(arRecord?.paid_amount || 0);
      const newTotalPaid = previouslyPaid + amount;
      const newBalance = invoiceTotal - newTotalPaid;
      const isFullyPaid = newBalance <= 0.01;

      if (arRecord) {
        await supabase.from('ar_payments').insert({
          accounts_receivable_id: arRecord.id, amount, payment_date: paymentDate,
          payment_method: paymentMethod, notes: `Payment for Invoice ${paymentInvoice.invoice_number}`,
        });
        await supabase.from('accounts_receivable').update({
          paid_amount: newTotalPaid, balance_due: Math.max(0, newBalance),
          status: isFullyPaid ? 'paid' : 'partially_paid',
        }).eq('id', arRecord.id);
      }

      // Auto-assign invoice status based on payment
      const newStatus = isFullyPaid ? 'paid' : 'partially_paid';
      const updateData: Record<string, any> = { status: newStatus };
      if (isFullyPaid) updateData.paid_date = paymentDate;
      await supabase.from('invoices').update(updateData).eq('id', paymentInvoice.id);

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
            companyId: paymentInvoice.company_id!, entryDate: paymentDate,
            description: `Payment received - Invoice ${paymentInvoice.invoice_number} (${paymentMethod})`,
            referenceType: 'payment_received', referenceId: paymentInvoice.id,
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
      setPaymentInvoice(null);
      fetchInvoices();
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

      // Cancel AR record
      await supabase
        .from('accounts_receivable')
        .update({ status: 'cancelled', balance_due: 0, notes: `Cancelled - Invoice ${invoice.invoice_number}` })
        .eq('invoice_id', id);

      // Void related journal entries
      const { data: journalEntries } = await supabase
        .from('journal_entries').select('id').eq('reference_id', id).eq('reference_type', 'sale');

      if (journalEntries && journalEntries.length > 0) {
        for (const je of journalEntries) {
          const { data: lines } = await supabase
            .from('journal_entry_lines').select('account_id, debit_amount, credit_amount').eq('journal_entry_id', je.id);
          if (lines) {
            for (const line of lines) {
              const { data: account } = await supabase
                .from('chart_of_accounts').select('current_balance, normal_balance').eq('id', line.account_id).single();
              if (account) {
                const debit = Number(line.debit_amount || 0);
                const credit = Number(line.credit_amount || 0);
                const current = Number(account.current_balance || 0);
                const newBalance = account.normal_balance === 'debit' ? current - debit + credit : current - credit + debit;
                await supabase.from('chart_of_accounts').update({ current_balance: newBalance }).eq('id', line.account_id);
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
      if (invoice && invoice.status !== 'cancelled') {
        await cancelInvoice(id);
      }
      await supabase.from('invoice_items').delete().eq('invoice_id', id);
      
      // Delete AR payments first
      const { data: arRecord } = await supabase.from('accounts_receivable').select('id').eq('invoice_id', id).maybeSingle();
      if (arRecord) {
        await supabase.from('ar_payments').delete().eq('accounts_receivable_id', arRecord.id);
      }
      await supabase.from('accounts_receivable').delete().eq('invoice_id', id);

      const { data: journalEntries } = await supabase.from('journal_entries').select('id').eq('reference_id', id);
      if (journalEntries) {
        for (const je of journalEntries) {
          await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', je.id);
          await supabase.from('journal_entries').delete().eq('id', je.id);
        }
      }

      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) throw error;
      toast.success(`Invoice ${invoice?.invoice_number} deleted`);
      fetchInvoices();
    } catch (error: any) {
      console.error('Error deleting invoice:', error);
      toast.error(error.message || 'Failed to delete invoice');
    }
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchSearch = !search.trim() ||
        inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
        inv.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        inv.customer_email?.toLowerCase().includes(search.toLowerCase());
      if (statusFilter === 'all') return matchSearch;
      const displayStatus = getDisplayStatus(inv);
      return matchSearch && displayStatus === statusFilter;
    });
  }, [invoices, search, statusFilter, getDisplayStatus]);

  const totalOutstanding = useMemo(() => {
    return invoices
      .filter(i => {
        const ds = getDisplayStatus(i);
        return ds === 'outstanding' || ds === 'overdue' || ds === 'partially_paid';
      })
      .reduce((sum, i) => sum + getBalanceRemaining(i), 0);
  }, [invoices, getDisplayStatus, getBalanceRemaining]);

  const totalPaid = invoices.filter(i => getDisplayStatus(i) === 'paid').reduce((sum, i) => sum + Number(i.total), 0);
  const overdueCount = invoices.filter(i => getDisplayStatus(i) === 'overdue').length;

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

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
                <Input
                  placeholder="Search invoice #, customer..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
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
                      <TableRow
                        key={invoice.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => viewInvoiceDetails(invoice)}
                      >
                        <TableCell className="font-mono font-medium">{invoice.invoice_number}</TableCell>
                        <TableCell>
                          {code && (
                            <Badge variant="outline" className={`text-[10px] font-medium ${COMPANY_BADGE[code] || ''}`}>
                              {code}
                            </Badge>
                          )}
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
                            <span className={balance > 0 ? 'font-semibold text-warning' : 'text-muted-foreground'}>
                              {formatCurrency(balance)}
                            </span>
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
                                  <AlertDialogDescription>
                                    This will permanently delete this invoice, reverse all accounting entries (AR, journal entries), and cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteInvoice(invoice.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Delete
                                  </AlertDialogAction>
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

      {/* View Invoice Detail Dialog */}
      <Dialog open={!!viewInvoice} onOpenChange={() => { setViewInvoice(null); setViewPayments([]); setViewAR(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
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
            </DialogTitle>
          </DialogHeader>
          {viewInvoice && (
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
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{TAX_LABELS[item.tax_treatment] || item.tax_treatment}</Badge>
                      </TableCell>
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
                {viewAR && (
                  <>
                    <div className="flex justify-between text-success"><span>Paid</span><span>{formatCurrency(Number(viewAR.paid_amount || 0))}</span></div>
                    <Separator />
                    <div className="flex justify-between font-bold text-base">
                      <span>Balance Remaining</span>
                      <span className={Number(viewAR.balance_due || 0) > 0 ? 'text-warning' : 'text-success'}>
                        {formatCurrency(Number(viewAR.balance_due || 0))}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Payment History */}
              {viewPayments.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" /> Payment History
                  </h4>
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
                </div>
              )}

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
                    <Button size="sm" onClick={() => { setViewInvoice(null); openPaymentDialog(viewInvoice); }}>
                      <CreditCard className="h-3.5 w-3.5 mr-1.5" /> Record Payment
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => { cancelInvoice(viewInvoice.id); setViewInvoice(null); }}>
                      Cancel Invoice
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
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
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={balance}
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value)}
                      placeholder="0.00"
                    />
                    {parseFloat(paymentAmount) > 0 && parseFloat(paymentAmount) < balance && (
                      <p className="text-[10px] text-info">Partial payment — {formatCurrency(balance - parseFloat(paymentAmount))} will remain outstanding</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Payment Method *</label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map(m => (
                          <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                        ))}
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
