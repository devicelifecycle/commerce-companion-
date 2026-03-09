import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createPaymentMadeJournalEntry } from '@/lib/accounting/journalAutomation';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { BatchActionBar, exportToCsv } from '@/components/ui/batch-action-bar';
import { useTableSelection } from '@/hooks/useTableSelection';
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
import { Plus, DollarSign, Download, ArrowDownRight, FileText, Search, Trash2 } from 'lucide-react';
import { format, differenceInDays, addDays } from 'date-fns';

interface Vendor {
  id: string;
  name: string;
}

interface APRecord {
  id: string;
  vendor_id: string | null;
  vendor_name: string;
  bill_number: string | null;
  bill_date: string;
  due_date: string;
  original_amount: number;
  paid_amount: number;
  balance_due: number;
  gst_hst_amount: number;
  pst_amount: number;
  status: string;
  description: string | null;
  category: string | null;
  payment_terms: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  unpaid: 'bg-blue-500',
  partial: 'bg-amber-500',
  paid: 'bg-emerald-500',
  overdue: 'bg-destructive',
  void: 'bg-muted',
};

const PAYMENT_TERMS = [
  { value: 'due_on_receipt', label: 'Due on Receipt' },
  { value: 'net_15', label: 'Net 15' },
  { value: 'net_30', label: 'Net 30' },
  { value: 'net_60', label: 'Net 60' },
];

interface AccountsPayableProps {
  companyFilter?: 'consolidated' | string;
}

export function AccountsPayable({ companyFilter }: AccountsPayableProps = {}) {
  const { selectedCompany, companies } = useCompany();

  // Determine effective company ID based on companyFilter prop or selectedCompany
  const effectiveCompanyId = companyFilter && companyFilter !== 'consolidated'
    ? companyFilter
    : companyFilter === 'consolidated'
      ? null
      : selectedCompany?.id || null;
  const [records, setRecords] = useState<APRecord[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<APRecord | null>(null);
  const [formData, setFormData] = useState({
    vendor_id: '',
    vendor_name: '',
    bill_number: '',
    bill_date: format(new Date(), 'yyyy-MM-dd'),
    due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    original_amount: '',
    gst_hst_amount: '',
    pst_amount: '',
    description: '',
    category: '',
    payment_terms: 'net_30',
  });
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method: 'bank_transfer',
    check_number: '',
    reference_number: '',
  });

  useEffect(() => {
    fetchData();
  }, [effectiveCompanyId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch AP records
      let query = supabase
        .from('accounts_payable')
        .select('*')
        .order('due_date', { ascending: true });

      if (effectiveCompanyId) {
        query = query.eq('company_id', effectiveCompanyId);
      }

      const { data: apData, error: apError } = await query;
      if (apError) throw apError;

      setRecords((apData || []) as APRecord[]);

      // Fetch vendors
      const { data: vendorData } = await supabase
        .from('vendors')
        .select('id, name')
        .order('name');
      
      setVendors((vendorData || []) as Vendor[]);
    } catch (error) {
      console.error('Error fetching AP:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.original_amount || !formData.due_date || !formData.vendor_name) {
      toast.error('Vendor, amount and due date are required');
      return;
    }

    try {
      const { error } = await supabase
        .from('accounts_payable')
        .insert({
          company_id: effectiveCompanyId || selectedCompany?.id,
          vendor_id: formData.vendor_id || null,
          vendor_name: formData.vendor_name,
          bill_number: formData.bill_number || null,
          bill_date: formData.bill_date,
          due_date: formData.due_date,
          original_amount: parseFloat(formData.original_amount),
          gst_hst_amount: parseFloat(formData.gst_hst_amount) || 0,
          pst_amount: parseFloat(formData.pst_amount) || 0,
          description: formData.description || null,
          category: formData.category || null,
          payment_terms: formData.payment_terms,
        });

      if (error) throw error;
      toast.success('Bill created');
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create bill');
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
        .from('ap_payments')
        .insert({
          accounts_payable_id: selectedRecord.id,
          payment_date: paymentData.payment_date,
          amount,
          payment_method: paymentData.payment_method,
          check_number: paymentData.check_number || null,
          reference_number: paymentData.reference_number || null,
        });

      if (paymentError) throw paymentError;

      // Update AP record
      const newPaidAmount = selectedRecord.paid_amount + amount;
      const newBalanceDue = selectedRecord.original_amount - newPaidAmount;
      const newStatus = newBalanceDue <= 0 ? 'paid' : 'partial';

      const { error: updateError } = await supabase
        .from('accounts_payable')
        .update({
          paid_amount: newPaidAmount,
          balance_due: Math.max(0, newBalanceDue),
          status: newStatus,
        })
        .eq('id', selectedRecord.id);

      if (updateError) throw updateError;

      // Create journal entry: Dr. Accounts Payable, Cr. Cash
      const companyId = effectiveCompanyId || selectedCompany?.id;
      if (companyId) {
        const companyCode = companies.find(c => c.id === companyId)?.code;
        try {
          await createPaymentMadeJournalEntry({
            companyId,
            paymentDate: paymentData.payment_date,
            amount,
            referenceId: selectedRecord.id,
            supplierName: selectedRecord.vendor_name,
            isVES: companyCode === 'VES',
          });
        } catch (jeError) {
          console.error('AP payment journal entry failed:', jeError);
          toast.warning('Payment recorded but journal entry could not be created');
        }
      }

      toast.success('Payment recorded with journal entry');
      setPaymentDialogOpen(false);
      setPaymentData({
        amount: '',
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        payment_method: 'bank_transfer',
        check_number: '',
        reference_number: '',
      });
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to record payment');
    }
  };

  const resetForm = () => {
    setFormData({
      vendor_id: '',
      vendor_name: '',
      bill_number: '',
      bill_date: format(new Date(), 'yyyy-MM-dd'),
      due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      original_amount: '',
      gst_hst_amount: '',
      pst_amount: '',
      description: '',
      category: '',
      payment_terms: 'net_30',
    });
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const getAgingBucket = (dueDate: string) => {
    const days = differenceInDays(new Date(), new Date(dueDate));
    if (days <= 0) return 'current';
    if (days <= 30) return '0-30';
    if (days <= 60) return '31-60';
    if (days <= 90) return '61-90';
    return '90+';
  };

  const totalPayable = records
    .filter(r => r.status !== 'paid' && r.status !== 'void')
    .reduce((sum, r) => sum + Number(r.balance_due), 0);

  const getFilteredRecords = () => {
    switch (activeTab) {
      case 'unpaid':
        return records.filter(r => r.status === 'unpaid' || r.status === 'partial');
      case 'overdue':
        return records.filter(r => r.status !== 'paid' && r.status !== 'void' && differenceInDays(new Date(), new Date(r.due_date)) > 0);
      case 'paid':
        return records.filter(r => r.status === 'paid');
      default:
        return records;
    }
  };

  const handleExport = () => {
    const headers = ['Vendor', 'Bill #', 'Bill Date', 'Due Date', 'Original', 'Paid', 'Balance', 'Status'];
    const rows = records.map(r => [
      r.vendor_name,
      r.bill_number || '',
      r.bill_date,
      r.due_date,
      r.original_amount,
      r.paid_amount,
      r.balance_due,
      r.status,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts-payable-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleVendorSelect = (vendorId: string) => {
    const vendor = vendors.find(v => v.id === vendorId);
    if (vendor) {
      setFormData({
        ...formData,
        vendor_id: vendorId,
        vendor_name: vendor.name,
      });
    }
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Total Payable</p>
              <p className="text-2xl font-bold text-destructive">{formatCurrency(totalPayable)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Due This Week</p>
              <p className="text-xl font-bold text-amber-500">
                {formatCurrency(
                  records
                    .filter(r => r.status !== 'paid' && differenceInDays(new Date(r.due_date), new Date()) <= 7 && differenceInDays(new Date(r.due_date), new Date()) >= 0)
                    .reduce((s, r) => s + Number(r.balance_due), 0)
                )}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Overdue</p>
              <p className="text-xl font-bold text-destructive">
                {formatCurrency(
                  records
                    .filter(r => r.status !== 'paid' && differenceInDays(new Date(), new Date(r.due_date)) > 0)
                    .reduce((s, r) => s + Number(r.balance_due), 0)
                )}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Bills Count</p>
              <p className="text-xl font-bold">{records.filter(r => r.status !== 'paid').length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ArrowDownRight className="h-5 w-5 text-destructive" />
              Accounts Payable
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                New Bill
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All ({records.length})</TabsTrigger>
              <TabsTrigger value="unpaid">Unpaid</TabsTrigger>
              <TabsTrigger value="overdue">Overdue</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
            </TabsList>
            <TabsContent value={activeTab} className="mt-4">
              {getFilteredRecords().length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No bills found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Bill #</TableHead>
                      <TableHead>Bill Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredRecords().map(record => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.vendor_name}</TableCell>
                        <TableCell>{record.bill_number || '-'}</TableCell>
                        <TableCell>{format(new Date(record.bill_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell>{format(new Date(record.due_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="text-right">{formatCurrency(record.original_amount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(record.paid_amount)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(record.balance_due)}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${STATUS_COLORS[record.status]} text-white capitalize`}>
                            {record.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {record.status !== 'paid' && record.status !== 'void' && (
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

      {/* New Bill Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              New Vendor Bill
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Vendor *</Label>
              {vendors.length > 0 ? (
                <Select value={formData.vendor_id} onValueChange={handleVendorSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={formData.vendor_name}
                  onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                  placeholder="Vendor name"
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bill Number</Label>
                <Input
                  value={formData.bill_number}
                  onChange={(e) => setFormData({ ...formData, bill_number: e.target.value })}
                  placeholder="INV-001"
                />
              </div>
              <div className="space-y-2">
                <Label>Payment Terms</Label>
                <Select
                  value={formData.payment_terms}
                  onValueChange={(v) => setFormData({ ...formData, payment_terms: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bill Date</Label>
                <Input
                  type="date"
                  value={formData.bill_date}
                  onChange={(e) => setFormData({ ...formData, bill_date: e.target.value })}
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
            <div className="grid grid-cols-3 gap-4">
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
                <Label>GST/HST</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.gst_hst_amount}
                  onChange={(e) => setFormData({ ...formData, gst_hst_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>PST</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.pst_amount}
                  onChange={(e) => setFormData({ ...formData, pst_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Bill description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>Create Bill</Button>
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
                <p className="text-sm text-muted-foreground">{selectedRecord.vendor_name}</p>
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
                    <SelectItem value="credit_card">Credit Card</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Check #</Label>
                <Input
                  value={paymentData.check_number}
                  onChange={(e) => setPaymentData({ ...paymentData, check_number: e.target.value })}
                  placeholder="Check number"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reference #</Label>
              <Input
                value={paymentData.reference_number}
                onChange={(e) => setPaymentData({ ...paymentData, reference_number: e.target.value })}
                placeholder="Transaction reference"
              />
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
