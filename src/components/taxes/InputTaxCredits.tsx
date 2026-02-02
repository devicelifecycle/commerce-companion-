import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Download, Receipt, Calculator, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface ITCRecord {
  id: string;
  reference_type: string;
  reference_number: string | null;
  vendor_name: string | null;
  expense_date: string;
  gst_hst_amount: number;
  qst_amount: number;
  is_eligible: boolean;
  eligibility_percentage: number;
  claimable_amount: number;
  category: string | null;
  notes: string | null;
}

interface ExpenseForITC {
  id: string;
  description: string;
  vendor: string | null;
  expense_date: string;
  gst_hst_amount: number;
  pst_amount: number;
  category: string;
}

export function InputTaxCredits() {
  const { selectedCompany } = useCompany();
  const [records, setRecords] = useState<ITCRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseForITC[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    reference_type: 'expense',
    reference_number: '',
    vendor_name: '',
    expense_date: format(new Date(), 'yyyy-MM-dd'),
    gst_hst_amount: '',
    qst_amount: '',
    is_eligible: true,
    eligibility_percentage: '100',
    category: '',
    notes: '',
  });
  const [selectedExpenses, setSelectedExpenses] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
  }, [selectedCompany]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch ITC records
      let query = supabase
        .from('input_tax_credits')
        .select('*')
        .order('expense_date', { ascending: false });

      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data: itcData, error } = await query;
      if (error) throw error;
      setRecords((itcData || []) as ITCRecord[]);

      // Fetch expenses with tax amounts
      let expenseQuery = supabase
        .from('expenses')
        .select('id, description, vendor, expense_date, gst_hst_amount, pst_amount, category')
        .gt('gst_hst_amount', 0)
        .order('expense_date', { ascending: false });

      if (selectedCompany) {
        expenseQuery = expenseQuery.eq('company_id', selectedCompany.id);
      }

      const { data: expenseData } = await expenseQuery;
      setExpenses((expenseData || []) as ExpenseForITC[]);
    } catch (error) {
      console.error('Error fetching ITCs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.gst_hst_amount) {
      toast.error('GST/HST amount is required');
      return;
    }

    try {
      const { error } = await supabase
        .from('input_tax_credits')
        .insert({
          company_id: selectedCompany?.id,
          reference_type: formData.reference_type,
          reference_number: formData.reference_number || null,
          vendor_name: formData.vendor_name || null,
          expense_date: formData.expense_date,
          gst_hst_amount: parseFloat(formData.gst_hst_amount),
          qst_amount: parseFloat(formData.qst_amount) || 0,
          is_eligible: formData.is_eligible,
          eligibility_percentage: parseFloat(formData.eligibility_percentage),
          category: formData.category || null,
          notes: formData.notes || null,
        });

      if (error) throw error;
      toast.success('ITC record created');
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create ITC');
    }
  };

  const handleImportFromExpenses = async () => {
    if (selectedExpenses.length === 0) {
      toast.error('Select at least one expense');
      return;
    }

    try {
      const expensesToImport = expenses.filter(e => selectedExpenses.includes(e.id));
      
      const itcsToInsert = expensesToImport.map(exp => ({
        company_id: selectedCompany?.id,
        expense_id: exp.id,
        reference_type: 'expense',
        reference_number: exp.id.slice(0, 8),
        vendor_name: exp.vendor,
        expense_date: exp.expense_date,
        gst_hst_amount: exp.gst_hst_amount,
        qst_amount: 0,
        is_eligible: true,
        eligibility_percentage: 100,
        category: exp.category,
      }));

      const { error } = await supabase
        .from('input_tax_credits')
        .insert(itcsToInsert);

      if (error) throw error;
      toast.success(`${itcsToInsert.length} ITCs imported from expenses`);
      setImportDialogOpen(false);
      setSelectedExpenses([]);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to import ITCs');
    }
  };

  const resetForm = () => {
    setFormData({
      reference_type: 'expense',
      reference_number: '',
      vendor_name: '',
      expense_date: format(new Date(), 'yyyy-MM-dd'),
      gst_hst_amount: '',
      qst_amount: '',
      is_eligible: true,
      eligibility_percentage: '100',
      category: '',
      notes: '',
    });
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const totalGstHst = records.reduce((sum, r) => sum + Number(r.gst_hst_amount), 0);
  const totalQst = records.reduce((sum, r) => sum + Number(r.qst_amount || 0), 0);
  const totalClaimable = records.filter(r => r.is_eligible).reduce((sum, r) => sum + Number(r.claimable_amount), 0);
  const ineligibleAmount = records.filter(r => !r.is_eligible).reduce((sum, r) => sum + Number(r.gst_hst_amount) + Number(r.qst_amount || 0), 0);

  const handleExport = () => {
    const headers = ['Date', 'Vendor', 'Reference', 'Category', 'GST/HST', 'QST', 'Eligible', '%', 'Claimable'];
    const rows = records.map(r => [
      r.expense_date,
      r.vendor_name || '',
      r.reference_number || '',
      r.category || '',
      r.gst_hst_amount.toFixed(2),
      (r.qst_amount || 0).toFixed(2),
      r.is_eligible ? 'Yes' : 'No',
      r.eligibility_percentage,
      r.claimable_amount.toFixed(2),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `input-tax-credits-${format(new Date(), 'yyyy-MM-dd')}.csv`;
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Total GST/HST Paid</p>
            <p className="text-xl font-bold">{formatCurrency(totalGstHst)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Total QST Paid</p>
            <p className="text-xl font-bold">{formatCurrency(totalQst)}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/10">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Claimable ITCs</p>
            <p className="text-xl font-bold text-emerald-500">{formatCurrency(totalClaimable)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Non-Eligible</p>
            <p className="text-xl font-bold text-muted-foreground">{formatCurrency(ineligibleAmount)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
          <Receipt className="h-4 w-4 mr-2" />
          Import from Expenses
        </Button>
        <Button variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add ITC
        </Button>
      </div>

      {/* ITC Records */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Input Tax Credits
            <Badge variant="outline">{records.length} records</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No ITCs recorded yet</p>
              <p className="text-sm text-muted-foreground">Import from expenses or add manually</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">GST/HST</TableHead>
                  <TableHead className="text-right">QST</TableHead>
                  <TableHead>Eligible</TableHead>
                  <TableHead className="text-right">Claimable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map(record => (
                  <TableRow key={record.id}>
                    <TableCell>{format(new Date(record.expense_date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{record.vendor_name || '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{record.reference_number || '-'}</TableCell>
                    <TableCell>
                      {record.category && <Badge variant="outline">{record.category}</Badge>}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(record.gst_hst_amount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(record.qst_amount || 0)}</TableCell>
                    <TableCell>
                      {record.is_eligible ? (
                        <Badge className="bg-emerald-500">{record.eligibility_percentage}%</Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(record.claimable_amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add ITC Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Input Tax Credit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Reference Type</Label>
                <Select
                  value={formData.reference_type}
                  onValueChange={(v) => setFormData({ ...formData, reference_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="ap">Accounts Payable</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reference #</Label>
                <Input
                  value={formData.reference_number}
                  onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                  placeholder="Invoice/Receipt #"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vendor Name</Label>
                <Input
                  value={formData.vendor_name}
                  onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                  placeholder="Vendor"
                />
              </div>
              <div className="space-y-2">
                <Label>Expense Date</Label>
                <Input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>GST/HST Amount *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.gst_hst_amount}
                  onChange={(e) => setFormData({ ...formData, gst_hst_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>QST Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.qst_amount}
                  onChange={(e) => setFormData({ ...formData, qst_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="eligible"
                  checked={formData.is_eligible}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_eligible: !!checked })}
                />
                <Label htmlFor="eligible">Eligible for ITC</Label>
              </div>
              <div className="space-y-2">
                <Label>Eligibility %</Label>
                <Input
                  type="number"
                  value={formData.eligibility_percentage}
                  onChange={(e) => setFormData({ ...formData, eligibility_percentage: e.target.value })}
                  disabled={!formData.is_eligible}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Office Supplies, Software"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>Add ITC</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from Expenses Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import ITCs from Expenses</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {expenses.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                No expenses with GST/HST amounts found
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedExpenses.length === expenses.length}
                        onCheckedChange={(checked) => {
                          setSelectedExpenses(checked ? expenses.map(e => e.id) : []);
                        }}
                      />
                    </TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">GST/HST</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map(expense => (
                    <TableRow key={expense.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedExpenses.includes(expense.id)}
                          onCheckedChange={(checked) => {
                            setSelectedExpenses(prev =>
                              checked
                                ? [...prev, expense.id]
                                : prev.filter(id => id !== expense.id)
                            );
                          }}
                        />
                      </TableCell>
                      <TableCell>{format(new Date(expense.expense_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>{expense.description}</TableCell>
                      <TableCell>{expense.vendor || '-'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(expense.gst_hst_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleImportFromExpenses} disabled={selectedExpenses.length === 0}>
              Import {selectedExpenses.length} ITCs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
