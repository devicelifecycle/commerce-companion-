import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, FileText, Clock, CheckCircle, AlertCircle, Send } from 'lucide-react';
import { InvoicesGuide } from '@/components/guides/InvoicesGuide';
import { format } from 'date-fns';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string | null;
  subtotal: number;
  tax_amount: number;
  total: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issue_date: string;
  due_date: string;
  paid_date: string | null;
  created_at: string;
}

const STATUS_CONFIG = {
  draft: { label: 'Draft', icon: FileText, className: 'bg-muted text-muted-foreground' },
  sent: { label: 'Sent', icon: Send, className: 'bg-info/10 text-info' },
  paid: { label: 'Paid', icon: CheckCircle, className: 'bg-success/10 text-success' },
  overdue: { label: 'Overdue', icon: AlertCircle, className: 'bg-destructive/10 text-destructive' },
  cancelled: { label: 'Cancelled', icon: AlertCircle, className: 'bg-muted text-muted-foreground' },
};

export default function Invoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_email: '',
    subtotal: '',
    tax_amount: '0',
    due_days: '30',
    notes: '',
  });

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const generateInvoiceNumber = () => {
    const prefix = 'INV';
    const date = format(new Date(), 'yyyyMM');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${date}-${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const subtotal = parseFloat(formData.subtotal);
    const taxAmount = parseFloat(formData.tax_amount) || 0;
    const total = subtotal + taxAmount;
    
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + parseInt(formData.due_days));
    
    try {
      const { error } = await supabase.from('invoices').insert({
        invoice_number: generateInvoiceNumber(),
        customer_name: formData.customer_name,
        customer_email: formData.customer_email || null,
        subtotal,
        tax_amount: taxAmount,
        total,
        status: 'draft',
        issue_date: new Date().toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        created_by: user?.id,
      });

      if (error) throw error;
      
      toast.success('Invoice created successfully');
      setDialogOpen(false);
      setFormData({
        customer_name: '',
        customer_email: '',
        subtotal: '',
        tax_amount: '0',
        due_days: '30',
        notes: '',
      });
      fetchInvoices();
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error('Failed to create invoice');
    }
  };

  const updateStatus = async (id: string, status: Invoice['status']) => {
    try {
      const updateData: { status: Invoice['status']; paid_date?: string | null } = { status };
      if (status === 'paid') {
        updateData.paid_date = new Date().toISOString().split('T')[0];
      }
      
      const { error } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
      toast.success('Invoice updated');
      fetchInvoices();
    } catch (error) {
      console.error('Error updating invoice:', error);
      toast.error('Failed to update invoice');
    }
  };

  const totalOutstanding = invoices
    .filter(i => i.status === 'sent' || i.status === 'overdue')
    .reduce((sum, i) => sum + Number(i.total), 0);
  
  const totalPaid = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + Number(i.total), 0);
  
  const overdueCount = invoices.filter(i => i.status === 'overdue').length;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded-xl" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">Invoices</h1>
            <p className="text-muted-foreground mt-1">Create and manage customer invoices</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="h-4 w-4 mr-2" />
                New Invoice
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display">Create Invoice</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Customer Name</Label>
                  <Input
                    value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    placeholder="Customer or company name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Customer Email (optional)</Label>
                  <Input
                    type="email"
                    value={formData.customer_email}
                    onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                    placeholder="customer@example.com"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Subtotal</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.subtotal}
                      onChange={(e) => setFormData({ ...formData, subtotal: e.target.value })}
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tax Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.tax_amount}
                      onChange={(e) => setFormData({ ...formData, tax_amount: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Payment Terms</Label>
                  <Select
                    value={formData.due_days}
                    onValueChange={(value) => setFormData({ ...formData, due_days: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Net 7</SelectItem>
                      <SelectItem value="15">Net 15</SelectItem>
                      <SelectItem value="30">Net 30</SelectItem>
                      <SelectItem value="60">Net 60</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="pt-2 border-t border-border">
                  <div className="flex justify-between text-lg font-semibold">
                    <span>Total</span>
                    <span>{formatCurrency(
                      (parseFloat(formData.subtotal) || 0) + (parseFloat(formData.tax_amount) || 0)
                    )}</span>
                  </div>
                </div>
                <Button type="submit" className="w-full gradient-primary">Create Invoice</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <InvoicesGuide />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Outstanding</p>
                  <p className="text-2xl font-bold font-display text-warning">{formatCurrency(totalOutstanding)}</p>
                </div>
                <div className="p-3 rounded-xl bg-warning/10">
                  <Clock className="h-5 w-5 text-warning" />
                </div>
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
                <div className="p-3 rounded-xl bg-success/10">
                  <CheckCircle className="h-5 w-5 text-success" />
                </div>
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
                <div className="p-3 rounded-xl bg-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <FileText className="h-5 w-5" />
              All Invoices
            </CardTitle>
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
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No invoices yet
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((invoice) => {
                    const config = STATUS_CONFIG[invoice.status];
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono font-medium">{invoice.invoice_number}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{invoice.customer_name}</p>
                            {invoice.customer_email && (
                              <p className="text-xs text-muted-foreground">{invoice.customer_email}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{format(new Date(invoice.issue_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell>{format(new Date(invoice.due_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell>
                          <Badge className={config.className}>{config.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(Number(invoice.total))}</TableCell>
                        <TableCell>
                          <Select
                            value={invoice.status}
                            onValueChange={(value) => updateStatus(invoice.id, value as Invoice['status'])}
                          >
                            <SelectTrigger className="w-[100px] h-8">
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
    </DashboardLayout>
  );
}
