import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Download, Printer, TrendingUp, TrendingDown, DollarSign, ToggleLeft, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from 'date-fns';

interface PLData {
  revenue: {
    amazon: number;
    bestbuy: number;
    shopify: number;
    intercompany: number;
    invoiceSales: number;
    otherRevenue: number;
    total: number;
  };
  taxCollected: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  expenses: {
    marketplaceFees: number;
    shippingCosts: number;
    rent: number;
    salaries: number;
    marketing: number;
    office: number;
    professional: number;
    insurance: number;
    bankFees: number;
    software: number;
    telecom: number;
    other: number;
    total: number;
  };
  netProfit: number;
  netMargin: number;
  taxPaid: number;
  netTaxPayable: number;
  // Management costing
  managementLaborCost: number;
  payrollExpenses: number;
}

interface Props {
  companyView?: string;
}

export function ProfitLossReport({ companyView }: Props) {
  const { selectedCompany, companies } = useCompany();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [plData, setPLData] = useState<PLData | null>(null);
  const [costingView, setCostingView] = useState<'accounting' | 'management'>('accounting');

  // Resolve effective company from companyView prop or context
  const effectiveCompany = (() => {
    if (companyView && companyView !== 'consolidated') {
      return companies.find(c => c.id === companyView) || null;
    }
    if (companyView === 'consolidated') return null;
    return selectedCompany;
  })();

  useEffect(() => {
    fetchPLData();
  }, [effectiveCompany?.id, startDate, endDate]);

  useEffect(() => {
    const now = new Date();
    if (period === 'month') {
      setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
    } else if (period === 'quarter') {
      setStartDate(format(startOfMonth(subMonths(now, 2)), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
    } else {
      setStartDate(format(startOfYear(now), 'yyyy-MM-dd'));
      setEndDate(format(endOfYear(now), 'yyyy-MM-dd'));
    }
  }, [period]);

  const fetchPLData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('journal_entry_lines')
        .select(`
          debit_amount,
          credit_amount,
          journal_entries!inner(entry_date, company_id, status),
          chart_of_accounts!inner(account_code, account_name, account_type)
        `)
        .gte('journal_entries.entry_date', startDate)
        .lte('journal_entries.entry_date', endDate)
        .eq('journal_entries.status', 'posted');

      if (effectiveCompany) {
        query = query.eq('journal_entries.company_id', effectiveCompany.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const pl: PLData = {
        revenue: { amazon: 0, bestbuy: 0, shopify: 0, intercompany: 0, invoiceSales: 0, otherRevenue: 0, total: 0 },
        taxCollected: 0,
        cogs: 0,
        grossProfit: 0,
        grossMargin: 0,
        expenses: {
          marketplaceFees: 0, shippingCosts: 0, rent: 0, salaries: 0,
          marketing: 0, office: 0, professional: 0, insurance: 0,
          bankFees: 0, software: 0, telecom: 0, other: 0, total: 0,
        },
        netProfit: 0, netMargin: 0, taxPaid: 0, netTaxPayable: 0,
        managementLaborCost: 0, payrollExpenses: 0,
      };

      // Track which codes we've explicitly handled
      const handledRevenueCodes = new Set(['4000', '4100', '4101', '4300', '4400', '4401', '4200', '4201']);
      const handledExpenseCodes = new Set([
        '5000', '5001',
        '6000', '6001', '6100', '6101', '6200', '6300', '6400',
        '6500', '6600', '6700', '6800', '6900', '7000', '7100',
      ]);

      (data || []).forEach((line: any) => {
        const code = line.chart_of_accounts.account_code;
        const credit = Number(line.credit_amount || 0);
        const debit = Number(line.debit_amount || 0);

        // Revenue accounts (credit increases)
        if (code === '4000') pl.revenue.amazon += credit - debit;
        else if (code === '4100') pl.revenue.bestbuy += credit - debit;
        else if (code === '4101') pl.revenue.shopify += credit - debit;
        else if (code === '4300') pl.revenue.intercompany += credit - debit;
        else if (code === '4400' || code === '4401') pl.revenue.invoiceSales += credit - debit;
        else if (code.startsWith('42')) pl.taxCollected += credit - debit;

        // Catch-all: any 4xxx revenue not explicitly handled
        else if (code.startsWith('4') && !handledRevenueCodes.has(code)) {
          pl.revenue.otherRevenue += credit - debit;
        }

        // COGS (debit increases)
        else if (code.startsWith('50')) pl.cogs += debit - credit;

        // Expenses (debit increases)
        else if (code === '6000' || code === '6001') pl.expenses.marketplaceFees += debit - credit;
        else if (code === '6100' || code === '6101') pl.expenses.shippingCosts += debit - credit;
        else if (code === '6200') pl.expenses.rent += debit - credit;
        else if (code === '6300') pl.expenses.salaries += debit - credit;
        else if (code === '6400') pl.expenses.marketing += debit - credit;
        else if (code === '6500') pl.expenses.office += debit - credit;
        else if (code === '6600') pl.expenses.professional += debit - credit;
        else if (code === '6700') pl.expenses.insurance += debit - credit;
        else if (code === '6800') pl.expenses.bankFees += debit - credit;
        else if (code === '6900') pl.expenses.software += debit - credit;
        else if (code === '7000') pl.expenses.telecom += debit - credit;
        else if (code === '7100') pl.expenses.other += debit - credit;

        // Catch-all: any 6xxx/7xxx expense not explicitly handled
        else if ((code.startsWith('6') || code.startsWith('7')) && !handledExpenseCodes.has(code)) {
          pl.expenses.other += debit - credit;
        }

        // Tax paid (ITC)
        else if (code.startsWith('80') || code.startsWith('81')) pl.taxPaid += debit - credit;
      });

      // Calculate totals
      pl.revenue.total = pl.revenue.amazon + pl.revenue.bestbuy + pl.revenue.shopify
        + pl.revenue.intercompany + pl.revenue.invoiceSales + pl.revenue.otherRevenue;
      pl.grossProfit = pl.revenue.total - pl.cogs;
      pl.grossMargin = pl.revenue.total > 0 ? (pl.grossProfit / pl.revenue.total) * 100 : 0;

      pl.expenses.total = Object.values(pl.expenses).reduce((a, b) => a + b, 0) - pl.expenses.total;

      pl.netProfit = pl.grossProfit - pl.expenses.total;
      pl.netMargin = pl.revenue.total > 0 ? (pl.netProfit / pl.revenue.total) * 100 : 0;
      pl.netTaxPayable = pl.taxCollected - pl.taxPaid;

      setPLData(pl);
    } catch (error) {
      console.error('Error fetching P&L data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  const companyLabel = effectiveCompany?.name || 'All Companies';

  const handleExport = () => {
    if (!plData) return;

    const lines = [
      `Profit & Loss Statement`,
      companyLabel,
      `Period: ${format(new Date(startDate), 'MMM d, yyyy')} - ${format(new Date(endDate), 'MMM d, yyyy')}`,
      '',
      'REVENUE',
      `Sales - Amazon,${plData.revenue.amazon.toFixed(2)}`,
      `Sales - BestBuy,${plData.revenue.bestbuy.toFixed(2)}`,
      `Sales - Shopify,${plData.revenue.shopify.toFixed(2)}`,
      `Direct / Invoice Sales,${plData.revenue.invoiceSales.toFixed(2)}`,
      `Inter-company,${plData.revenue.intercompany.toFixed(2)}`,
      ...(plData.revenue.otherRevenue > 0 ? [`Other Revenue,${plData.revenue.otherRevenue.toFixed(2)}`] : []),
      `Total Revenue,${plData.revenue.total.toFixed(2)}`,
      '',
      'COST OF GOODS SOLD',
      `COGS (FIFO),${plData.cogs.toFixed(2)}`,
      '',
      `GROSS PROFIT,${plData.grossProfit.toFixed(2)}`,
      `Gross Margin,${formatPercent(plData.grossMargin)}`,
      '',
      'OPERATING EXPENSES',
      `Marketplace Fees,${plData.expenses.marketplaceFees.toFixed(2)}`,
      `Shipping Costs,${plData.expenses.shippingCosts.toFixed(2)}`,
      `Rent and Utilities,${plData.expenses.rent.toFixed(2)}`,
      `Salaries,${plData.expenses.salaries.toFixed(2)}`,
      `Total Expenses,${plData.expenses.total.toFixed(2)}`,
      '',
      `NET PROFIT,${plData.netProfit.toFixed(2)}`,
      `Net Margin,${formatPercent(plData.netMargin)}`,
    ];

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pl-statement-${startDate}-${endDate}.csv`;
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
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label>Period</Label>
          <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Start Date</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[160px]" />
        </div>
        <div className="space-y-2">
          <Label>End Date</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[160px]" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />Print
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(plData?.revenue.total || 0)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Gross Profit</p>
                <p className="text-2xl font-bold">{formatCurrency(plData?.grossProfit || 0)}</p>
                <Badge variant="outline" className="mt-1">
                  {formatPercent(plData?.grossMargin || 0)} margin
                </Badge>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expenses</p>
                <p className="text-2xl font-bold text-destructive">
                  {formatCurrency(plData?.expenses.total || 0)}
                </p>
              </div>
              <TrendingDown className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>
        <Card className={plData && plData.netProfit >= 0 ? 'border-emerald-500/50' : 'border-destructive/50'}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Net Profit</p>
                <p className={`text-2xl font-bold ${plData && plData.netProfit >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                  {formatCurrency(plData?.netProfit || 0)}
                </p>
                <Badge variant="outline" className="mt-1">
                  {formatPercent(plData?.netMargin || 0)} margin
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Statement */}
      <Card className="print:shadow-none">
        <CardHeader className="text-center border-b">
          <CardTitle className="text-2xl">Profit & Loss Statement</CardTitle>
          <CardDescription>
            {companyLabel} | {format(new Date(startDate), 'MMM d, yyyy')} - {format(new Date(endDate), 'MMM d, yyyy')}
          </CardDescription>
          <Badge variant="outline">Accrual Basis</Badge>
        </CardHeader>
        <CardContent className="pt-6">
          {plData ? (
            <div className="space-y-6">
              {/* Revenue Section */}
              <div>
                <h3 className="font-semibold text-lg text-emerald-500 mb-3">REVENUE</h3>
                <div className="space-y-2 ml-4">
                  <div className="flex justify-between">
                    <span>Sales - Amazon</span>
                    <span>{formatCurrency(plData.revenue.amazon)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sales - BestBuy</span>
                    <span>{formatCurrency(plData.revenue.bestbuy)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sales - Shopify</span>
                    <span>{formatCurrency(plData.revenue.shopify)}</span>
                  </div>
                  {plData.revenue.invoiceSales !== 0 && (
                    <div className="flex justify-between">
                      <span>Direct / Invoice Sales</span>
                      <span>{formatCurrency(plData.revenue.invoiceSales)}</span>
                    </div>
                  )}
                  {plData.revenue.intercompany > 0 && (
                    <div className="flex justify-between">
                      <span>Inter-company Revenue</span>
                      <span>{formatCurrency(plData.revenue.intercompany)}</span>
                    </div>
                  )}
                  {plData.revenue.otherRevenue !== 0 && (
                    <div className="flex justify-between">
                      <span>Other Revenue</span>
                      <span>{formatCurrency(plData.revenue.otherRevenue)}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between font-bold mt-2 pt-2 border-t">
                  <span>Total Revenue</span>
                  <span>{formatCurrency(plData.revenue.total)}</span>
                </div>
              </div>

              <Separator />

              {/* COGS Section */}
              <div>
                <h3 className="font-semibold text-lg text-blue-500 mb-3">COST OF GOODS SOLD</h3>
                <div className="flex justify-between ml-4">
                  <span>COGS (FIFO Calculation)</span>
                  <span className="text-destructive">({formatCurrency(plData.cogs)})</span>
                </div>
              </div>

              <div className="border border-primary/30 bg-primary/10 p-4 rounded-lg">
                <div className="flex justify-between font-bold text-lg text-foreground">
                  <span>GROSS PROFIT</span>
                  <span>{formatCurrency(plData.grossProfit)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Gross Margin</span>
                  <span>{formatPercent(plData.grossMargin)}</span>
                </div>
              </div>

              <Separator />

              {/* Operating Expenses */}
              <div>
                <h3 className="font-semibold text-lg text-destructive mb-3">OPERATING EXPENSES</h3>
                <div className="space-y-2 ml-4">
                  {plData.expenses.marketplaceFees > 0 && (
                    <div className="flex justify-between">
                      <span>Marketplace Fees</span>
                      <span>{formatCurrency(plData.expenses.marketplaceFees)}</span>
                    </div>
                  )}
                  {plData.expenses.shippingCosts > 0 && (
                    <div className="flex justify-between">
                      <span>Shipping Costs</span>
                      <span>{formatCurrency(plData.expenses.shippingCosts)}</span>
                    </div>
                  )}
                  {plData.expenses.rent > 0 && (
                    <div className="flex justify-between">
                      <span>Rent and Utilities</span>
                      <span>{formatCurrency(plData.expenses.rent)}</span>
                    </div>
                  )}
                  {plData.expenses.salaries > 0 && (
                    <div className="flex justify-between">
                      <span>Salaries and Wages</span>
                      <span>{formatCurrency(plData.expenses.salaries)}</span>
                    </div>
                  )}
                  {plData.expenses.marketing > 0 && (
                    <div className="flex justify-between">
                      <span>Marketing</span>
                      <span>{formatCurrency(plData.expenses.marketing)}</span>
                    </div>
                  )}
                  {plData.expenses.software > 0 && (
                    <div className="flex justify-between">
                      <span>Software & Subscriptions</span>
                      <span>{formatCurrency(plData.expenses.software)}</span>
                    </div>
                  )}
                  {plData.expenses.office > 0 && (
                    <div className="flex justify-between">
                      <span>Office and Supplies</span>
                      <span>{formatCurrency(plData.expenses.office)}</span>
                    </div>
                  )}
                  {plData.expenses.professional > 0 && (
                    <div className="flex justify-between">
                      <span>Professional Fees</span>
                      <span>{formatCurrency(plData.expenses.professional)}</span>
                    </div>
                  )}
                  {plData.expenses.insurance > 0 && (
                    <div className="flex justify-between">
                      <span>Insurance</span>
                      <span>{formatCurrency(plData.expenses.insurance)}</span>
                    </div>
                  )}
                  {plData.expenses.bankFees > 0 && (
                    <div className="flex justify-between">
                      <span>Bank Fees</span>
                      <span>{formatCurrency(plData.expenses.bankFees)}</span>
                    </div>
                  )}
                  {plData.expenses.telecom > 0 && (
                    <div className="flex justify-between">
                      <span>Telecommunications</span>
                      <span>{formatCurrency(plData.expenses.telecom)}</span>
                    </div>
                  )}
                  {plData.expenses.other > 0 && (
                    <div className="flex justify-between">
                      <span>Other Expenses</span>
                      <span>{formatCurrency(plData.expenses.other)}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between font-bold mt-2 pt-2 border-t">
                  <span>Total Operating Expenses</span>
                  <span className="text-destructive">({formatCurrency(plData.expenses.total)})</span>
                </div>
              </div>

              <div className={`p-4 rounded-lg border ${plData.netProfit >= 0 ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-destructive/40 bg-destructive/10'}`}>
                <div className="flex justify-between font-bold text-xl text-foreground">
                  <span>NET PROFIT</span>
                  <span className={plData.netProfit >= 0 ? 'text-emerald-500' : 'text-destructive'}>
                    {formatCurrency(plData.netProfit)}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Net Margin</span>
                  <span>{formatPercent(plData.netMargin)}</span>
                </div>
              </div>

              <Separator />

              {/* Tax Notes */}
              <div className="bg-muted/50 p-4 rounded-lg text-sm">
                <h4 className="font-semibold mb-2">Tax Notes (Memo)</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-muted-foreground">Tax Collected</p>
                    <p className="font-medium">{formatCurrency(plData.taxCollected)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tax Paid (ITC)</p>
                    <p className="font-medium">{formatCurrency(plData.taxPaid)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Net Tax Payable</p>
                    <p className="font-medium">{formatCurrency(plData.netTaxPayable)}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2 italic">
                  * Tax does not affect profit calculation. Tax is remitted separately to CRA.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground">
              No data available for the selected period
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
