import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Receipt, TrendingUp, TrendingDown, Scale } from 'lucide-react';
import { format } from 'date-fns';

interface TaxRecord {
  id: string;
  tax_type: string;
  amount: number;
  tax_period_start: string;
  tax_period_end: string;
  jurisdiction: string | null;
  notes: string | null;
  created_at: string;
}

const TAX_TYPES = [
  { value: 'sales_tax_collected', label: 'Sales Tax Collected' },
  { value: 'sales_tax_paid', label: 'Sales Tax Paid' },
  { value: 'income_tax', label: 'Income Tax' },
  { value: 'other', label: 'Other' },
];

export default function Taxes() {
  const { user } = useAuth();
  const [taxRecords, setTaxRecords] = useState<TaxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    tax_type: 'sales_tax_collected',
    amount: '',
    tax_period_start: new Date().toISOString().split('T')[0],
    tax_period_end: new Date().toISOString().split('T')[0],
    jurisdiction: '',
    notes: '',
  });

  useEffect(() => {
    fetchTaxRecords();
  }, []);

  const fetchTaxRecords = async () => {
    try {
      const { data, error } = await supabase
        .from('tax_records')
        .select('*')
        .order('tax_period_end', { ascending: false });

      if (error) throw error;
      setTaxRecords(data || []);
    } catch (error) {
      console.error('Error fetching tax records:', error);
      toast.error('Failed to load tax records');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { error } = await supabase.from('tax_records').insert([{
        tax_type: formData.tax_type as 'sales_tax_collected' | 'sales_tax_paid' | 'income_tax' | 'other',
        amount: parseFloat(formData.amount),
        tax_period_start: formData.tax_period_start,
        tax_period_end: formData.tax_period_end,
        jurisdiction: formData.jurisdiction || null,
        notes: formData.notes || null,
        created_by: user?.id,
      }]);

      if (error) throw error;
      
      toast.success('Tax record added successfully');
      setDialogOpen(false);
      setFormData({
        tax_type: 'sales_tax_collected',
        amount: '',
        tax_period_start: new Date().toISOString().split('T')[0],
        tax_period_end: new Date().toISOString().split('T')[0],
        jurisdiction: '',
        notes: '',
      });
      fetchTaxRecords();
    } catch (error) {
      console.error('Error adding tax record:', error);
      toast.error('Failed to add tax record');
    }
  };

  const taxCollected = taxRecords
    .filter(r => r.tax_type === 'sales_tax_collected')
    .reduce((sum, r) => sum + Number(r.amount), 0);
  
  const taxPaid = taxRecords
    .filter(r => r.tax_type === 'sales_tax_paid')
    .reduce((sum, r) => sum + Number(r.amount), 0);
  
  const taxLiability = taxCollected - taxPaid;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const getTaxTypeLabel = (value: string) => {
    return TAX_TYPES.find(t => t.value === value)?.label || value;
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
            <h1 className="text-3xl font-display font-bold gradient-text">Tax Center</h1>
            <p className="text-muted-foreground mt-1">Track taxes collected vs paid and manage liabilities</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="h-4 w-4 mr-2" />
                Add Tax Record
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display">Add Tax Record</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Tax Type</Label>
                  <Select
                    value={formData.tax_type}
                    onValueChange={(value) => setFormData({ ...formData, tax_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Period Start</Label>
                    <Input
                      type="date"
                      value={formData.tax_period_start}
                      onChange={(e) => setFormData({ ...formData, tax_period_start: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Period End</Label>
                    <Input
                      type="date"
                      value={formData.tax_period_end}
                      onChange={(e) => setFormData({ ...formData, tax_period_end: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Jurisdiction (optional)</Label>
                  <Input
                    value={formData.jurisdiction}
                    onChange={(e) => setFormData({ ...formData, jurisdiction: e.target.value })}
                    placeholder="e.g., California, NY"
                  />
                </div>
                <Button type="submit" className="w-full gradient-primary">Add Record</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tax Collected</p>
                  <p className="text-2xl font-bold font-display text-success">{formatCurrency(taxCollected)}</p>
                </div>
                <div className="p-3 rounded-xl bg-success/10">
                  <TrendingUp className="h-5 w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tax Paid</p>
                  <p className="text-2xl font-bold font-display text-destructive">{formatCurrency(taxPaid)}</p>
                </div>
                <div className="p-3 rounded-xl bg-destructive/10">
                  <TrendingDown className="h-5 w-5 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tax Liability</p>
                  <p className={`text-2xl font-bold font-display ${taxLiability >= 0 ? 'text-warning' : 'text-success'}`}>
                    {formatCurrency(Math.abs(taxLiability))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {taxLiability >= 0 ? 'Owed to government' : 'Refund expected'}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-warning/10">
                  <Scale className="h-5 w-5 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Tax Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No tax records yet
                    </TableCell>
                  </TableRow>
                ) : (
                  taxRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          record.tax_type === 'sales_tax_collected' ? 'bg-success/10 text-success' :
                          record.tax_type === 'sales_tax_paid' ? 'bg-destructive/10 text-destructive' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {getTaxTypeLabel(record.tax_type)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {format(new Date(record.tax_period_start), 'MMM d')} - {format(new Date(record.tax_period_end), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{record.jurisdiction || '-'}</TableCell>
                      <TableCell className={`text-right font-medium ${
                        record.tax_type === 'sales_tax_collected' ? 'text-success' : 'text-destructive'
                      }`}>
                        {record.tax_type === 'sales_tax_collected' ? '+' : '-'}{formatCurrency(Number(record.amount))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
