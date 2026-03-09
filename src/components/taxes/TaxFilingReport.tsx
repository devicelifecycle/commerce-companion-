import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createTaxPaymentJournalEntry } from '@/lib/accounting/journalAutomation';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import { Download, FileText, Printer, DollarSign, CheckCircle, Clock } from 'lucide-react';
import { format, startOfQuarter, endOfQuarter, addMonths, subQuarters } from 'date-fns';

interface FilingPeriod {
  id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  filing_due_date: string;
  gst_hst_collected: number;
  qst_collected: number;
  pst_collected: number;
  itc_claimed: number;
  net_tax_payable: number;
  status: string;
  filed_date: string | null;
  payment_date: string | null;
  payment_amount: number | null;
}

interface FilingData {
  grossSales: number;
  taxCollected: number;
  adjustments: number;
  netTaxCollected: number;
  itcTotal: number;
  netTaxPayable: number;
}

export function TaxFilingReport() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [filingPeriods, setFilingPeriods] = useState<FilingPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('current');
  const [periodStart, setPeriodStart] = useState(format(startOfQuarter(new Date()), 'yyyy-MM-dd'));
  const [periodEnd, setPeriodEnd] = useState(format(endOfQuarter(new Date()), 'yyyy-MM-dd'));
  const [filingData, setFilingData] = useState<FilingData | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentData, setPaymentData] = useState({
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    confirmation_number: '',
  });

  useEffect(() => {
    fetchFilingPeriods();
  }, [selectedCompany]);

  useEffect(() => {
    updatePeriodDates();
  }, [selectedPeriod]);

  useEffect(() => {
    calculateFilingData();
  }, [selectedCompany, periodStart, periodEnd]);

  const fetchFilingPeriods = async () => {
    let query = supabase
      .from('tax_filing_periods')
      .select('*')
      .order('period_start', { ascending: false });

    if (selectedCompany) {
      query = query.eq('company_id', selectedCompany.id);
    }

    const { data } = await query;
    setFilingPeriods((data || []) as FilingPeriod[]);
  };

  const updatePeriodDates = () => {
    const now = new Date();
    switch (selectedPeriod) {
      case 'current':
        setPeriodStart(format(startOfQuarter(now), 'yyyy-MM-dd'));
        setPeriodEnd(format(endOfQuarter(now), 'yyyy-MM-dd'));
        break;
      case 'previous':
        const prevQ = subQuarters(now, 1);
        setPeriodStart(format(startOfQuarter(prevQ), 'yyyy-MM-dd'));
        setPeriodEnd(format(endOfQuarter(prevQ), 'yyyy-MM-dd'));
        break;
    }
  };

  const calculateFilingData = async () => {
    setLoading(true);
    try {
      // Fetch sales for the period
      let salesQuery = supabase
        .from('sales')
        .select('sale_price, tax_amount')
        .gte('sale_date', periodStart)
        .lte('sale_date', periodEnd);

      if (selectedCompany) {
        salesQuery = salesQuery.eq('company_id', selectedCompany.id);
      }

      const { data: salesData } = await salesQuery;

      // Fetch expenses for ITCs
      let expenseQuery = supabase
        .from('expenses')
        .select('gst_hst_amount, pst_amount')
        .gte('expense_date', periodStart)
        .lte('expense_date', periodEnd);

      if (selectedCompany) {
        expenseQuery = expenseQuery.eq('company_id', selectedCompany.id);
      }

      const { data: expenseData } = await expenseQuery;

      const grossSales = (salesData || []).reduce((sum, s) => sum + Number(s.sale_price || 0), 0);
      const taxCollected = (salesData || []).reduce((sum, s) => sum + Number(s.tax_amount || 0), 0);
      const itcTotal = (expenseData || []).reduce((sum, e) => 
        sum + Number(e.gst_hst_amount || 0) + Number(e.pst_amount || 0), 0
      );

      setFilingData({
        grossSales,
        taxCollected,
        adjustments: 0,
        netTaxCollected: taxCollected,
        itcTotal,
        netTaxPayable: taxCollected - itcTotal,
      });
    } catch (error) {
      console.error('Error calculating filing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePeriod = async () => {
    if (!filingData) return;

    try {
      const { error } = await supabase
        .from('tax_filing_periods')
        .insert({
          company_id: selectedCompany?.id,
          period_type: 'quarterly',
          period_start: periodStart,
          period_end: periodEnd,
          filing_due_date: format(addMonths(new Date(periodEnd), 1), 'yyyy-MM-dd'),
          gst_hst_collected: filingData.taxCollected,
          itc_claimed: filingData.itcTotal,
          net_tax_payable: filingData.netTaxPayable,
          status: 'open',
        });

      if (error) throw error;
      toast.success('Filing period created');
      fetchFilingPeriods();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create period');
    }
  };

  const handleMarkFiled = async (periodId: string) => {
    try {
      const { error } = await supabase
        .from('tax_filing_periods')
        .update({
          status: 'filed',
          filed_date: format(new Date(), 'yyyy-MM-dd'),
        })
        .eq('id', periodId);

      if (error) throw error;
      toast.success('Marked as filed');
      fetchFilingPeriods();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update');
    }
  };

  const handleRecordPayment = async (periodId: string) => {
    try {
      const period = filingPeriods.find(p => p.id === periodId);
      
      const { error } = await supabase
        .from('tax_filing_periods')
        .update({
          status: 'paid',
          payment_date: paymentData.payment_date,
          payment_amount: parseFloat(paymentData.amount),
          payment_reference: paymentData.confirmation_number,
        })
        .eq('id', periodId);

      if (error) throw error;

      // Also create remittance record
      await supabase
        .from('tax_remittances')
        .insert({
          company_id: selectedCompany?.id,
          filing_period_id: periodId,
          tax_type: 'gst_hst',
          payment_date: paymentData.payment_date,
          amount: parseFloat(paymentData.amount),
          confirmation_number: paymentData.confirmation_number,
        });

      // Create journal entry: Dr. GST/HST Payable / Cr. Cash
      if (selectedCompany?.id) {
        try {
          const isVES = selectedCompany.code === 'VES';
          await createTaxPaymentJournalEntry({
            companyId: selectedCompany.id,
            paymentDate: paymentData.payment_date,
            amount: parseFloat(paymentData.amount),
            referenceNumber: paymentData.confirmation_number || `TAX-${periodId.slice(0, 8)}`,
            isVES,
          });
        } catch (jeError) {
          console.error('Tax payment journal entry failed:', jeError);
          toast.error('Payment recorded but journal entry failed — check Chart of Accounts.');
        }
      }

      toast.success('Payment recorded with journal entry');
      setPaymentDialogOpen(false);
      fetchFilingPeriods();
    } catch (error: any) {
      toast.error(error.message || 'Failed to record payment');
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const handlePrint = () => window.print();

  const handleExport = () => {
    if (!filingData) return;

    const lines = [
      `GST/HST Return - ${selectedCompany?.name || 'All Companies'}`,
      `Period: ${periodStart} to ${periodEnd}`,
      '',
      'Line 101: Gross Sales and Other Revenue,' + filingData.grossSales.toFixed(2),
      'Line 103: GST/HST Collected,' + filingData.taxCollected.toFixed(2),
      'Line 104: Adjustments,' + filingData.adjustments.toFixed(2),
      'Line 105: Total GST/HST and Adjustments,' + filingData.netTaxCollected.toFixed(2),
      'Line 106: Input Tax Credits,' + filingData.itcTotal.toFixed(2),
      'Line 108: Installment Payments,0.00',
      'Line 109: Net Tax (Line 105 minus Line 106),' + filingData.netTaxPayable.toFixed(2),
    ];

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gst-hst-return-${periodStart}-to-${periodEnd}.csv`;
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
      {/* Period Selection */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label>Period:</Label>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current Quarter</SelectItem>
              <SelectItem value="previous">Previous Quarter</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {selectedPeriod === 'custom' && (
          <>
            <Input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-[150px]"
            />
            <span>to</span>
            <Input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-[150px]"
            />
          </>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* GST/HST Return Format */}
      <Card className="print:shadow-none">
        <CardHeader className="text-center border-b">
          <CardTitle className="text-2xl flex items-center justify-center gap-2">
            <FileText className="h-6 w-6" />
            GST/HST Return
          </CardTitle>
          <CardDescription>
            {selectedCompany?.name || 'All Companies'} | {format(new Date(periodStart), 'MMM d')} - {format(new Date(periodEnd), 'MMM d, yyyy')}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {filingData && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div className="grid grid-cols-[1fr,auto] gap-4 items-center p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium">Line 101 - Gross Sales and Other Revenue</p>
                  <p className="text-sm text-muted-foreground">Total revenue before tax</p>
                </div>
                <p className="text-right font-mono text-lg">{formatCurrency(filingData.grossSales)}</p>
              </div>

              <div className="grid grid-cols-[1fr,auto] gap-4 items-center p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium">Line 103 - GST/HST Collected or Collectible</p>
                  <p className="text-sm text-muted-foreground">Tax collected on sales</p>
                </div>
                <p className="text-right font-mono text-lg">{formatCurrency(filingData.taxCollected)}</p>
              </div>

              <div className="grid grid-cols-[1fr,auto] gap-4 items-center p-3 rounded-lg">
                <div>
                  <p className="font-medium">Line 104 - Adjustments</p>
                  <p className="text-sm text-muted-foreground">Tax adjustments (if any)</p>
                </div>
                <p className="text-right font-mono text-lg">{formatCurrency(filingData.adjustments)}</p>
              </div>

              <Separator />

              <div className="grid grid-cols-[1fr,auto] gap-4 items-center p-3 bg-primary/10 rounded-lg">
                <div>
                  <p className="font-semibold">Line 105 - Total GST/HST and Adjustments</p>
                  <p className="text-sm text-muted-foreground">Line 103 + Line 104</p>
                </div>
                <p className="text-right font-mono text-lg font-bold">{formatCurrency(filingData.netTaxCollected)}</p>
              </div>

              <div className="grid grid-cols-[1fr,auto] gap-4 items-center p-3 bg-emerald-500/10 rounded-lg">
                <div>
                  <p className="font-medium">Line 106 - Input Tax Credits (ITCs)</p>
                  <p className="text-sm text-muted-foreground">Tax paid on eligible business purchases</p>
                </div>
                <p className="text-right font-mono text-lg text-emerald-600">({formatCurrency(filingData.itcTotal)})</p>
              </div>

              <div className="grid grid-cols-[1fr,auto] gap-4 items-center p-3 rounded-lg">
                <div>
                  <p className="font-medium">Line 108 - Installment Payments</p>
                  <p className="text-sm text-muted-foreground">Payments already made</p>
                </div>
                <p className="text-right font-mono text-lg">{formatCurrency(0)}</p>
              </div>

              <Separator />

              <div className={`grid grid-cols-[1fr,auto] gap-4 items-center p-4 rounded-lg ${filingData.netTaxPayable >= 0 ? 'bg-destructive/10' : 'bg-emerald-500/10'}`}>
                <div>
                  <p className="font-bold text-lg">Line 109 - Net Tax</p>
                  <p className="text-sm text-muted-foreground">
                    {filingData.netTaxPayable >= 0 ? 'Amount owing to CRA' : 'Refund claimed'}
                  </p>
                </div>
                <p className={`text-right font-mono text-2xl font-bold ${filingData.netTaxPayable >= 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                  {formatCurrency(Math.abs(filingData.netTaxPayable))}
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button onClick={handleCreatePeriod}>
                  Save Filing Period
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filing History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Filing History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filingPeriods.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No filing periods recorded yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Tax Collected</TableHead>
                  <TableHead className="text-right">ITCs</TableHead>
                  <TableHead className="text-right">Net Payable</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[150px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filingPeriods.map(period => (
                  <TableRow key={period.id}>
                    <TableCell>
                      {format(new Date(period.period_start), 'MMM d')} - {format(new Date(period.period_end), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>{format(new Date(period.filing_due_date), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="text-right">{formatCurrency(period.gst_hst_collected)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(period.itc_claimed)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(period.net_tax_payable)}</TableCell>
                    <TableCell>
                      <Badge 
                        className={
                          period.status === 'paid' ? 'bg-emerald-500' :
                          period.status === 'filed' ? 'bg-blue-500' : 'bg-amber-500'
                        }
                      >
                        {period.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {period.status === 'open' && (
                          <Button size="sm" variant="outline" onClick={() => handleMarkFiled(period.id)}>
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Filed
                          </Button>
                        )}
                        {period.status === 'filed' && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => {
                              setPaymentData({
                                ...paymentData,
                                amount: period.net_tax_payable.toString(),
                              });
                              setPaymentDialogOpen(true);
                            }}
                          >
                            <DollarSign className="h-4 w-4 mr-1" />
                            Pay
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Tax Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Payment Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={paymentData.amount}
                onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={paymentData.payment_date}
                onChange={(e) => setPaymentData({ ...paymentData, payment_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Confirmation Number</Label>
              <Input
                value={paymentData.confirmation_number}
                onChange={(e) => setPaymentData({ ...paymentData, confirmation_number: e.target.value })}
                placeholder="CRA confirmation #"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              const openPeriod = filingPeriods.find(p => p.status === 'filed');
              if (openPeriod) handleRecordPayment(openPeriod.id);
            }}>
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
