import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { MetricCard } from '@/components/ui/metric-card';
import { 
  Receipt, DollarSign, Calendar, TrendingUp, 
  AlertCircle, CheckCircle, Clock 
} from 'lucide-react';
import { format, endOfQuarter, startOfQuarter, addMonths, differenceInDays } from 'date-fns';

interface TaxSummary {
  totalCollected: number;
  gstHstCollected: number;
  qstCollected: number;
  pstCollected: number;
  totalITC: number;
  netPayable: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  filingDueDate: Date;
}

export function TaxDashboard() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<TaxSummary | null>(null);

  useEffect(() => {
    fetchTaxSummary();
  }, [selectedCompany]);

  const fetchTaxSummary = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const periodStart = startOfQuarter(now);
      const periodEnd = endOfQuarter(now);
      const filingDue = addMonths(periodEnd, 1);

      // Fetch sales with tax
      let salesQuery = supabase
        .from('sales')
        .select('tax_amount, sale_price')
        .gte('sale_date', periodStart.toISOString())
        .lte('sale_date', periodEnd.toISOString());

      if (selectedCompany) {
        salesQuery = salesQuery.eq('company_id', selectedCompany.id);
      }

      const { data: salesData } = await salesQuery;

      // Fetch expenses for ITC
      let expenseQuery = supabase
        .from('expenses')
        .select('gst_hst_amount, pst_amount')
        .gte('expense_date', periodStart.toISOString())
        .lte('expense_date', periodEnd.toISOString());

      if (selectedCompany) {
        expenseQuery = expenseQuery.eq('company_id', selectedCompany.id);
      }

      const { data: expenseData } = await expenseQuery;

      // Calculate totals
      const taxCollected = (salesData || []).reduce((sum, s) => sum + Number(s.tax_amount || 0), 0);
      const itcTotal = (expenseData || []).reduce((sum, e) => 
        sum + Number(e.gst_hst_amount || 0) + Number(e.pst_amount || 0), 0
      );

      setSummary({
        totalCollected: taxCollected,
        gstHstCollected: taxCollected, // Simplified - would need detailed breakdown
        qstCollected: 0,
        pstCollected: 0,
        totalITC: itcTotal,
        netPayable: taxCollected - itcTotal,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        filingDueDate: filingDue,
      });
    } catch (error) {
      console.error('Error fetching tax summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="py-6">
              <div className="h-20 animate-pulse bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const daysUntilDue = summary ? differenceInDays(summary.filingDueDate, new Date()) : 0;
  const progressToDeadline = summary ? 
    Math.min(100, ((90 - daysUntilDue) / 90) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Net Tax Payable"
          value={formatCurrency(summary?.netPayable || 0)}
          icon={DollarSign}
          changeType={summary && summary.netPayable > 0 ? 'negative' : 'positive'}
          change={summary && summary.netPayable > 0 ? 'Amount owing' : 'Refund expected'}
        />
        <MetricCard
          title="Tax Collected (QTD)"
          value={formatCurrency(summary?.totalCollected || 0)}
          icon={TrendingUp}
          changeType="neutral"
          change="GST/HST/PST/QST"
        />
        <MetricCard
          title="Input Tax Credits"
          value={formatCurrency(summary?.totalITC || 0)}
          icon={Receipt}
          changeType="positive"
          change="Claimable ITCs"
        />
        <MetricCard
          title="Days Until Filing"
          value={daysUntilDue}
          icon={Calendar}
          changeType={daysUntilDue < 14 ? 'negative' : 'neutral'}
          change={summary ? format(summary.filingDueDate, 'MMM d, yyyy') : ''}
        />
      </div>

      {/* Current Period Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Current Filing Period
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Period</span>
              <span className="font-medium">
                {summary ? `${format(summary.currentPeriodStart, 'MMM d')} - ${format(summary.currentPeriodEnd, 'MMM d, yyyy')}` : '-'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Filing Deadline</span>
              <span className="font-medium">
                {summary ? format(summary.filingDueDate, 'MMM d, yyyy') : '-'}
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress to deadline</span>
                <span>{Math.round(progressToDeadline)}%</span>
              </div>
              <Progress value={progressToDeadline} className="h-2" />
            </div>
            <div className="pt-2">
              <Badge variant={daysUntilDue < 14 ? 'destructive' : daysUntilDue < 30 ? 'secondary' : 'outline'}>
                {daysUntilDue < 0 ? 'OVERDUE' : daysUntilDue < 14 ? 'DUE SOON' : 'ON TRACK'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Tax Breakdown (QTD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span>GST/HST Collected</span>
                <span className="font-semibold">{formatCurrency(summary?.gstHstCollected || 0)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span>QST Collected (Quebec)</span>
                <span className="font-semibold">{formatCurrency(summary?.qstCollected || 0)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span>PST Collected</span>
                <span className="font-semibold">{formatCurrency(summary?.pstCollected || 0)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b text-emerald-500">
                <span>Less: Input Tax Credits</span>
                <span className="font-semibold">({formatCurrency(summary?.totalITC || 0)})</span>
              </div>
              <div className="flex justify-between items-center py-2 text-lg font-bold">
                <span>Net Tax Payable</span>
                <span className={summary && summary.netPayable < 0 ? 'text-emerald-500' : 'text-destructive'}>
                  {formatCurrency(summary?.netPayable || 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reminders */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Filing Reminders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              {daysUntilDue > 30 ? (
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-500" />
              )}
              <div>
                <p className="font-medium">GST/HST Return</p>
                <p className="text-sm text-muted-foreground">
                  Due {summary ? format(summary.filingDueDate, 'MMMM d, yyyy') : '-'}
                </p>
              </div>
              <Badge className="ml-auto" variant={daysUntilDue > 30 ? 'outline' : 'secondary'}>
                {daysUntilDue} days
              </Badge>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="font-medium">QST Return (if applicable)</p>
                <p className="text-sm text-muted-foreground">Quebec sales tax filing</p>
              </div>
              <Badge className="ml-auto" variant="outline">
                N/A
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
