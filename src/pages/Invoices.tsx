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
import { Plus, FileText, Clock, CheckCircle, AlertCircle, Send, Eye, Download, Search, X } from 'lucide-react';
import { InvoicesGuide } from '@/components/guides/InvoicesGuide';
import { CreateInvoiceDialog } from '@/components/invoices/CreateInvoiceDialog';
import { format } from 'date-fns';

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
  const { selectedCompany } = useCompany();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [viewItems, setViewItems] = useState<InvoiceItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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
      setInvoices((data || []) as Invoice[]);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
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
    try {
      // Check if customer already exists
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('name', invoice.customer_name)
        .maybeSingle();
      
      if (existing) {
        toast.info('Customer already saved');
        return;
      }

      await supabase.from('customers').insert({
        name: invoice.customer_name,
        email: invoice.customer_email,
        phone: invoice.customer_phone,
        address: invoice.customer_address,
        company_id: invoice.company_id,
        marketplace_source: 'invoice',
      });
      toast.success(`Saved ${invoice.customer_name} to customer directory`);
    } catch (err) {
      toast.error('Failed to save customer');
    }
  };

  const updateStatus = async (id: string, status: Invoice['status']) => {
    try {
      const updateData: Record<string, any> = { status };
      if (status === 'paid') updateData.paid_date = new Date().toISOString().split('T')[0];

      const { error } = await supabase.from('invoices').update(updateData).eq('id', id);
      if (error) throw error;

      // If marked paid, update AR
      if (status === 'paid') {
        const invoice = invoices.find(i => i.id === id);
        if (invoice) {
          await supabase
            .from('accounts_receivable')
            .update({ status: 'paid', paid_amount: invoice.total, balance_due: 0 })
            .eq('invoice_id', id);
        }
      }

      toast.success('Invoice updated');
      fetchInvoices();
    } catch (error) {
      console.error('Error updating invoice:', error);
      toast.error('Failed to update invoice');
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
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {search || statusFilter !== 'all' ? 'No invoices match your filters' : 'No invoices yet — click "New Invoice" to create one'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => {
                    const config = STATUS_CONFIG[invoice.status];
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono font-medium">{invoice.invoice_number}</TableCell>
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
            <DialogTitle className="font-display">Invoice {viewInvoice?.invoice_number}</DialogTitle>
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
