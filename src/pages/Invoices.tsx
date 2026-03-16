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
import { Plus, FileText, Clock, CheckCircle, AlertCircle, Send, Eye, Download, Search, X, Trash2, Copy, CreditCard } from 'lucide-react';
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
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
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

const STATUS_CONFIG = {
  draft: { label: 'Draft', icon: FileText, className: 'bg-muted text-muted-foreground' },
  sent: { label: 'Sent', icon: Send, className: 'bg-info/10 text-info' },
  paid: { label: 'Paid', icon: CheckCircle, className: 'bg-success/10 text-success' },
  overdue: { label: 'Overdue', icon: AlertCircle, className: 'bg-destructive/10 text-destructive' },
  cancelled: { label: 'Cancelled', icon: AlertCircle, className: 'bg-muted text-muted-foreground' },
};

const TAX_LABELS: Record<string, string> = {
  hst: 'HST 13%',
  gst: 'GST 5%',
  zero_rated: 'Zero-Rated',
  tax_inclusive: 'Tax Incl.',
};

export default function Invoices() {
  const { selectedCompany, accessibleCompanies } = useCompany();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [viewItems, setViewItems] = useState<InvoiceItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [duplicateInvoice, setDuplicateInvoice] = useState<Invoice | null>(null);

  // Quick action: open "Create Invoice" dialog via Alt+N
  useQuickActionListener('create-invoice', useCallback(() => setCreateOpen(true), []));

  useEffect(() => {
    fetchInvoices();
  }, [selectedCompany]);

  const fetchInvoices = async () => {
    try {
      let query = supabase.from('invoices').select('*').order('created_at', { ascending: false });
      if (selectedCompany) query = query.eq('company_id', selectedCompany.id);

      const { data, error } = await query;
      if (error) throw error;
      const fetched = (data || []) as Invoice[];

      // Auto-detect overdue: sent invoices past due date
      const today = new Date().toISOString().split('T')[0];
      const overdueIds: string[] = [];
      fetched.forEach(inv => {
        if (inv.status === 'sent' && inv.due_date < today) {
          inv.status = 'overdue';
          overdueIds.push(inv.id);
        }
      });
      // Batch update overdue in DB
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
    const { data } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoice.id)
      .order('created_at');
    setViewItems((data || []) as InvoiceItem[]);
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

  // Save customer to CRM if new
  const saveCustomerFromInvoice = async (invoice: Invoice) => {
    if (!invoice.customer_name) return;
    const normalizedName = toTitleCase(invoice.customer_name);
    try {
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('name', normalizedName)
        .maybeSingle();
      
      if (existing) {
        toast.info('Customer already saved');
        return;
      }

      await supabase.from('customers').insert({
        name: normalizedName,
        email: invoice.customer_email,
        phone: invoice.customer_phone,
        address: invoice.customer_address,
        company_id: invoice.company_id,
        marketplace_source: 'invoice',
        channel: 'In-Store',
      });
      toast.success(`Saved ${normalizedName} to customer directory`);
    } catch (err) {
      toast.error('Failed to save customer');
    }
  };

  // Duplicate an invoice (clone with new dates)
  const handleDuplicate = async (source: Invoice) => {
    try {
      // Fetch line items from original
      const { data: items } = await supabase
        .from('invoice_items')
        .select('description, quantity, unit_price, total, tax_treatment, device_id')
        .eq('invoice_id', source.id);

      const companyCode = getCompanyCode(source.company_id);
      const prefix = companyCode || 'INV';
      const date = format(new Date(), 'yyyyMM');
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const invoiceNumber = `${prefix}-${date}-${random}`;

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const { data: newInv, error } = await supabase.from('invoices').insert({
        invoice_number: invoiceNumber,
        customer_name: source.customer_name,
        customer_email: source.customer_email,
        customer_address: source.customer_address,
        customer_phone: source.customer_phone,
        customer_gst_hst_number: source.customer_gst_hst_number,
        subtotal: source.subtotal,
        tax_amount: source.tax_amount,
        total: source.total,
        status: 'draft' as any,
        issue_date: new Date().toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        notes: source.notes,
        company_id: source.company_id,
      }).select('id').single();

      if (error) throw error;

      // Clone line items (without device_id to avoid marking devices as sold again)
      if (items && items.length > 0 && newInv) {
        const clonedItems = items.map(i => ({
          invoice_id: newInv.id,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total: i.total,
          tax_treatment: i.tax_treatment,
          device_id: null, // Don't link to same device
        }));
        await supabase.from('invoice_items').insert(clonedItems);
      }

      toast.success(`Duplicated as ${invoiceNumber} (Draft)`);
      fetchInvoices();
    } catch (err) {
      console.error('Duplicate error:', err);
      toast.error('Failed to duplicate invoice');
    }
  };

  const updateStatus = async (id: string, status: Invoice['status']) => {
    try {
      const updateData: Record<string, any> = { status };
      if (status === 'paid') updateData.paid_date = new Date().toISOString().split('T')[0];

      const { error } = await supabase.from('invoices').update(updateData).eq('id', id);
      if (error) throw error;

      const invoice = invoices.find(i => i.id === id);

      // If marked paid, update AR
      if (status === 'paid' && invoice) {
        await supabase
          .from('accounts_receivable')
          .update({ status: 'paid', paid_amount: invoice.total, balance_due: 0 })
          .eq('invoice_id', id);
      }

      // If cancelled, reverse AR and void journal entries
      if (status === 'cancelled' && invoice) {
        // Cancel AR record
        await supabase
          .from('accounts_receivable')
          .update({ status: 'cancelled', balance_due: 0, notes: `Cancelled - Invoice ${invoice.invoice_number}` })
          .eq('invoice_id', id);

        // Void related journal entries
        const { data: journalEntries } = await supabase
          .from('journal_entries')
          .select('id')
          .eq('reference_id', id)
          .eq('reference_type', 'sale');

        if (journalEntries && journalEntries.length > 0) {
          for (const je of journalEntries) {
            // Reverse account balances
            const { data: lines } = await supabase
              .from('journal_entry_lines')
              .select('account_id, debit_amount, credit_amount')
              .eq('journal_entry_id', je.id);

            if (lines) {
              for (const line of lines) {
                const { data: account } = await supabase
                  .from('chart_of_accounts')
                  .select('current_balance, normal_balance')
                  .eq('id', line.account_id)
                  .single();

                if (account) {
                  const debit = Number(line.debit_amount || 0);
                  const credit = Number(line.credit_amount || 0);
                  const current = Number(account.current_balance || 0);
                  // Reverse: subtract what was added
                  const newBalance = account.normal_balance === 'debit'
                    ? current - debit + credit
                    : current - credit + debit;

                  await supabase
                    .from('chart_of_accounts')
                    .update({ current_balance: newBalance })
                    .eq('id', line.account_id);
                }
              }
            }

            // Mark journal entry as voided
            await supabase
              .from('journal_entries')
              .update({ status: 'voided', description: `[VOIDED] ` })
              .eq('id', je.id);
          }
        }
      }

      toast.success(status === 'cancelled' ? 'Invoice cancelled — AR reversed and journal entries voided' : 'Invoice updated');
      fetchInvoices();
    } catch (error) {
      console.error('Error updating invoice:', error);
      toast.error('Failed to update invoice');
    }
  };

  const deleteInvoice = async (id: string) => {
    try {
      const invoice = invoices.find(i => i.id === id);
      
      // First cancel to reverse accounting if not already cancelled
      if (invoice && invoice.status !== 'cancelled') {
        await updateStatus(id, 'cancelled');
      }

      // Delete invoice items first (FK constraint)
      await supabase.from('invoice_items').delete().eq('invoice_id', id);
      
      // Delete AR records
      await supabase.from('accounts_receivable').delete().eq('invoice_id', id);

      // Delete journal entry lines and entries
      const { data: journalEntries } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('reference_id', id);

      if (journalEntries) {
        for (const je of journalEntries) {
          await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', je.id);
          await supabase.from('journal_entries').delete().eq('id', je.id);
        }
      }

      // Delete the invoice
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
      const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [invoices, search, statusFilter]);

  const totalOutstanding = invoices
    .filter(i => i.status === 'sent' || i.status === 'overdue')
    .reduce((sum, i) => sum + Number(i.total), 0);

  const totalPaid = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + Number(i.total), 0);

  const overdueCount = invoices.filter(i => i.status === 'overdue').length;

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
                  <p className="text-sm text-muted-foreground">Outstanding</p>
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
                <SelectTrigger className="w-[130px] h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
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
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {search || statusFilter !== 'all' ? 'No invoices match your filters' : 'No invoices yet — click "New Invoice" to create one'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => {
                    const config = STATUS_CONFIG[invoice.status];
                    const code = getCompanyCode(invoice.company_id);
                    return (
                      <TableRow key={invoice.id}>
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
                        <TableCell>{format(new Date(invoice.due_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell><Badge className={config.className}>{config.label}</Badge></TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(invoice.subtotal))}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(invoice.tax_amount))}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(Number(invoice.total))}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => viewInvoiceDetails(invoice)} title="View">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadInvoicePdf(invoice.id)} title="Print/PDF">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicate(invoice)} title="Duplicate">
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Select value={invoice.status} onValueChange={v => updateStatus(invoice.id, v as Invoice['status'])}>
                              <SelectTrigger className="w-[90px] h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="draft">Draft</SelectItem>
                                <SelectItem value="sent">Sent</SelectItem>
                                <SelectItem value="paid">Paid</SelectItem>
                                <SelectItem value="overdue">Overdue</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
                              </SelectContent>
                            </Select>
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
      <Dialog open={!!viewInvoice} onOpenChange={() => setViewInvoice(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              Invoice {viewInvoice?.invoice_number}
              {viewInvoice && (() => {
                const code = getCompanyCode(viewInvoice.company_id);
                return code ? (
                  <Badge variant="outline" className={`text-[10px] font-medium ${COMPANY_BADGE[code] || ''}`}>{code}</Badge>
                ) : null;
              })()}
            </DialogTitle>
          </DialogHeader>
          {viewInvoice && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div><span className="text-muted-foreground">Customer:</span> <strong>{viewInvoice.customer_name}</strong></div>
                {viewInvoice.customer_email && <div><span className="text-muted-foreground">Email:</span> {viewInvoice.customer_email}</div>}
                {viewInvoice.customer_phone && <div><span className="text-muted-foreground">Phone:</span> {viewInvoice.customer_phone}</div>}
                {viewInvoice.customer_gst_hst_number && <div><span className="text-muted-foreground">GST/HST #:</span> {viewInvoice.customer_gst_hst_number}</div>}
                {viewInvoice.customer_address && <div className="col-span-2"><span className="text-muted-foreground">Address:</span> {viewInvoice.customer_address}</div>}
              </div>

              <Separator />

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

              <div className="space-y-1 bg-muted/30 rounded-lg p-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(Number(viewInvoice.subtotal))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(Number(viewInvoice.tax_amount))}</span></div>
                <Separator />
                <div className="flex justify-between font-bold text-base"><span>Total</span><span className="text-primary">{formatCurrency(Number(viewInvoice.total))}</span></div>
              </div>

              {viewInvoice.notes && (
                <div className="text-xs text-muted-foreground bg-muted/20 p-2 rounded"><strong>Notes:</strong> {viewInvoice.notes}</div>
              )}

              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => downloadInvoicePdf(viewInvoice.id)}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Print / PDF
                </Button>
                <Button size="sm" variant="outline" onClick={() => saveCustomerFromInvoice(viewInvoice)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Save Customer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
    </PermissionGuard>
  );
}
