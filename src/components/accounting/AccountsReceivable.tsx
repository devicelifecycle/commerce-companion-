import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, DollarSign, Download, ArrowUpRight, Clock } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

interface ARRecord {
  id: string;
  source_type: string;
  source_reference: string | null;
  marketplace: string | null;
  customer_name: string | null;
  original_amount: number;
  paid_amount: number;
  balance_due: number;
  due_date: string;
  expected_payment_date: string | null;
  status: string;
  notes: string | null;
}

interface ARPayment {
  id: string;
  accounts_receivable_id: string;
  payment_date: string;
  amount: number;
  payment_method: string | null;
  reference_number: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  outstanding: 'bg-blue-500',
  partial: 'bg-amber-500',
  paid: 'bg-emerald-500',
  overdue: 'bg-destructive',
  written_off: 'bg-muted',
};

export function AccountsReceivable() {
  const { selectedCompany } = useCompany();
  const [records, setRecords] = useState<ARRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ARRecord | null>(null);
  const [formData, setFormData] = useState({
    source_type: 'marketplace',
    source_reference: '',
    marketplace: '',
    customer_name: '',
    original_amount: '',
    due_date: format(new Date(), 'yyyy-MM-dd'),
    expected_payment_date: '',
    notes: '',
  });
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method: 'bank_transfer',
    reference_number: '',
  });

  useEffect(() => {
    fetchRecords();
  }, [selectedCompany]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('accounts_receivable')
        .select('*')
        .order('due_date', { ascending: true });

      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      setRecords((data || []) as ARRecord[]);
    } catch (error) {
      console.error('Error fetching AR:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.original_amount || !formData.due_date) {
      toast.error('Amount and due date are required');
      return;
    }

    try {
      const { error } = await supabase
        .from('accounts_receivable')
        .insert({
          company_id: selectedCompany?.id,
          source_type: formData.source_type,
          source_reference: formData.source_reference || null,
          marketplace: formData.marketplace || null,
          customer_name: formData.customer_name || null,
          original_amount: parseFloat(formData.original_amount),
          due_date: formData.due_date,
          expected_payment_date: formData.expected_payment_date || null,
          notes: formData.notes || null,
        });

      if (error) throw error;
      toast.success('AR record created');
      setDialogOpen(false);
      resetForm();
      fetchRecords();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create record');
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedRecord || !paymentData.amount) {
      toast.error('Payment amount is required');
      return;
    }

    try {
      const amount = parseFloat(paymentData.amount);
      
      // Insert payment
      const { error: paymentError } = await supabase
        .from('ar_payments')
        .insert({
          accounts_receivable_id: selectedRecord.id,
          payment_date: paymentData.payment_date,
          amount,
          payment_method: paymentData.payment_method,
          reference_number: paymentData.reference_number || null,
        });

      if (paymentError) throw paymentError;

      // Update AR record
      const newPaidAmount = selectedRecord.paid_amount + amount;
      const newStatus = newPaidAmount >= selectedRecord.original_amount ? 'paid' : 'partial';

      const { error: updateError } = await supabase
        .from('accounts_receivable')
        .update({
          paid_amount: newPaidAmount,
          status: newStatus,
        })
        .eq('id', selectedRecord.id);

      if (updateError) throw updateError;

      toast.success('Payment recorded');
      setPaymentDialogOpen(false);
      setPaymentData({
        amount: '',
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        payment_method: 'bank_transfer',
        reference_number: '',
      });
      fetchRecords();
    } catch (error: any) {
      toast.error(error.message || 'Failed to record payment');
    }
  };

  const resetForm = () => {
    setFormData({
      source_type: 'marketplace',
      source_reference: '',
      marketplace: '',
      customer_name: '',
      original_amount: '',
      due_date: format(new Date(), 'yyyy-MM-dd'),
      expected_payment_date: '',
      notes: '',
    });
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  // Aging buckets
  const getAgingBucket = (dueDate: string) => {
    const days = differenceInDays(new Date(), new Date(dueDate));
    if (days <= 0) return 'current';
    if (days <= 30) return '0-30';
    if (days <= 60) return '31-60';
    if (days <= 90) return '61-90';
    return '90+';
  };

  const agingData = {
    current: records.filter(r => r.status !== 'paid' && getAgingBucket(r.due_date) === 'current'),
    '0-30': records.filter(r => r.status !== 'paid' && getAgingBucket(r.due_date) === '0-30'),
    '31-60': records.filter(r => r.status !== 'paid' && getAgingBucket(r.due_date) === '31-60'),
    '61-90': records.filter(r => r.status !== 'paid' && getAgingBucket(r.due_date) === '61-90'),
    '90+': records.filter(r => r.status !== 'paid' && getAgingBucket(r.due_date) === '90+'),
  };

  const totalOutstanding = records
    .filter(r => r.status !== 'paid')
    .reduce((sum, r) => sum + Number(r.balance_due), 0);

  const getFilteredRecords = () => {
    switch (activeTab) {
      case 'outstanding':
        return records.filter(r => r.status === 'outstanding' || r.status === 'partial');
      case 'overdue':
        return records.filter(r => r.status === 'overdue' || (r.status !== 'paid' && differenceInDays(new Date(), new Date(r.due_date)) > 0));
      case 'paid':
        return records.filter(r => r.status === 'paid');
      default:
        return records;
    }
  };

  const handleExport = () => {
    const headers = ['Source', 'Reference', 'Marketplace', 'Customer', 'Original', 'Paid', 'Balance', 'Due Date', 'Status'];
    const rows = records.map(r => [
      r.source_type,
      r.source_reference || '',
      r.marketplace || '',
      r.customer_name || '',
      r.original_amount,
      r.paid_amount,
      r.balance_due,
      r.due_date,
      r.status,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts-receivable-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Total Outstanding</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(totalOutstanding)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Current</p>
              <p className="text-xl font-bold text-emerald-500">
                {formatCurrency(agingData.current.reduce((s, r) => s + Number(r.balance_due), 0))}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">1-30 Days</p>
              <p className="text-xl font-bold text-amber-500">
                {formatCurrency(agingData['0-30'].reduce((s, r) => s + Number(r.balance_due), 0))}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">31-60 Days</p>
              <p className="text-xl font-bold text-orange-500">
                {formatCurrency(agingData['31-60'].reduce((s, r) => s + Number(r.balance_due), 0))}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">90+ Days</p>
              <p className="text-xl font-bold text-destructive">
                {formatCurrency(agingData['90+'].reduce((s, r) => s + Number(r.balance_due), 0))}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-emerald-500" />
              Accounts Receivable
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                New AR Entry
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All ({records.length})</TabsTrigger>
              <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
              <TabsTrigger value="overdue">Overdue</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
            </TabsList>
            <TabsContent value={activeTab} className="mt-4">
              {getFilteredRecords().length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No records found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Customer/Marketplace</TableHead>
                      <TableHead className="text-right">Original</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredRecords().map(record => (
                      <TableRow key={record.id}>
                        <TableCell className="capitalize">{record.source_type}</TableCell>
                        <TableCell>{record.source_reference || '-'}</TableCell>
                        <TableCell>
                          {record.marketplace ? (
                            <Badge variant="outline" className="capitalize">{record.marketplace}</Badge>
                          ) : record.customer_name || '-'}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(record.original_amount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(record.paid_amount)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(record.balance_due)}
                        </TableCell>
                        <TableCell>{format(new Date(record.due_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell>
                          <Badge className={`${STATUS_COLORS[record.status]} text-white capitalize`}>
                            {record.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {record.status !== 'paid' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedRecord(record);
                                setPaymentData({
                                  ...paymentData,
                                  amount: record.balance_due.toString(),
                                });
                                setPaymentDialogOpen(true);
                              }}
                            >
                              <DollarSign className="h-4 w-4 mr-1" />
                              Pay
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* New AR Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Accounts Receivable Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Source Type</Label>
                <Select
                  value={formData.source_type}
                  onValueChange={(v) => setFormData({ ...formData, source_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketplace">Marketplace</SelectItem>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reference #</Label>
                <Input
                  value={formData.source_reference}
                  onChange={(e) => setFormData({ ...formData, source_reference: e.target.value })}
                  placeholder="Settlement ID, Invoice #"
                />
              </div>
            </div>
            {formData.source_type === 'marketplace' && (
              <div className="space-y-2">
                <Label>Marketplace</Label>
                <Select
                  value={formData.marketplace}
                  onValueChange={(v) => setFormData({ ...formData, marketplace: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select marketplace" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amazon">Amazon</SelectItem>
                    <SelectItem value="bestbuy">BestBuy</SelectItem>
                    <SelectItem value="shopify">Shopify</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {formData.source_type !== 'marketplace' && (
              <div className="space-y-2">
                <Label>Customer Name</Label>
                <Input
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  placeholder="Customer name"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.original_amount}
                  onChange={(e) => setFormData({ ...formData, original_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date *</Label>
                <Input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Expected Payment Date</Label>
              <Input
                type="date"
                value={formData.expected_payment_date}
                onChange={(e) => setFormData({ ...formData, expected_payment_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedRecord && (
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Balance Due</p>
                <p className="text-2xl font-bold">{formatCurrency(selectedRecord.balance_due)}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Amount *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Payment Date *</Label>
                <Input
                  type="date"
                  value={paymentData.payment_date}
                  onChange={(e) => setPaymentData({ ...paymentData, payment_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select
                  value={paymentData.payment_method}
                  onValueChange={(v) => setPaymentData({ ...paymentData, payment_method: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="credit_card">Credit Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reference #</Label>
                <Input
                  value={paymentData.reference_number}
                  onChange={(e) => setPaymentData({ ...paymentData, reference_number: e.target.value })}
                  placeholder="Transaction ID"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment}>Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
