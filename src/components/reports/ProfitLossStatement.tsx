import { useState, useEffect, useCallback } from 'react';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useDataRefetch } from '@/hooks/useDataRefetch';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Download, FileText, Printer, TrendingUp, TrendingDown, Calendar, Info, ToggleLeft } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, startOfQuarter, endOfQuarter, endOfYear } from 'date-fns';

interface PLData {
  // Revenue
  grossSalesByMarketplace: Record<string, number>;
  returns: number;
  netSales: number;
  // COGS
  beginningInventory: number;
  purchases: number;
  endingInventory: number;
  totalCOGS: number;
  grossProfit: number;
  // Operating Expenses
  operatingExpensesByCategory: Record<string, number>;
  totalOperatingExpenses: number;
  operatingProfit: number;
  // Other
  intercompanyCharges: number;
  otherIncome: number;
  netProfitBeforeTax: number;
  incomeTax: number;
  netProfitAfterTax: number;
  // Management costing data
  managementLaborCost: number; // sum of management_labor_cost from sold devices
  payrollExpenses: number; // labor-category expenses to exclude in management view
  repairPartsCost: number;
}

interface ComparisonData {
  current: PLData;
  previous: PLData;
}

const EXPENSE_CATEGORY_ORDER = [
  'shipping', 'marketing', 'software', 'equipment', 'office', 
  'utilities', 'travel', 'professional_services', 'other'
];

interface ProfitLossStatementProps {
  companyView?: 'consolidated' | string;
}

export function ProfitLossStatement({ companyView = 'consolidated' }: ProfitLossStatementProps) {
  const { selectedCompany, companies, isSuperAdmin } = useCompany();
  const [loading, setLoading] = useState(true);
  const viewMode = companyView;
  const [savedFilters, setSavedFilters] = useSavedFilters('pl-statement', {
    periodType: 'monthly' as 'monthly' | 'quarterly' | 'yearly',
    selectedPeriod: format(new Date(), 'yyyy-MM'),
    showComparison: false,
    costingView: 'accounting' as 'accounting' | 'management',
  });
  const periodType = savedFilters.periodType;
  const setPeriodType = (v: 'monthly' | 'quarterly' | 'yearly') => setSavedFilters({ periodType: v });
  const selectedPeriod = savedFilters.selectedPeriod;
  const setSelectedPeriod = (v: string) => setSavedFilters({ selectedPeriod: v });
  const showComparison = savedFilters.showComparison;
  const setShowComparison = (v: boolean) => setSavedFilters({ showComparison: v });
  const costingView = savedFilters.costingView;
  const setCostingView = (v: 'accounting' | 'management') => setSavedFilters({ costingView: v });
  const [data, setData] = useState<ComparisonData | null>(null);

  const queryClient = useQueryClient();

  const fetchPLDataCallback = useCallback(() => {
    fetchPLData();
    queryClient.invalidateQueries({ queryKey: ['report', 'profit-loss'] });
  }, [viewMode, periodType, selectedPeriod, selectedCompany]);

  useEffect(() => {
    fetchPLData();
  }, [viewMode, periodType, selectedPeriod, selectedCompany]);

  // Auto-refresh when financials change (expense/sale/PO deletions)
  useDataRefetch(['financials', 'expenses', 'sales', 'invoices', 'purchase_orders'], fetchPLDataCallback);

  const getPeriodDates = (periodStr: string, type: 'monthly' | 'quarterly' | 'yearly') => {
    const [year, monthOrQuarter] = periodStr.split('-');
    const yearNum = parseInt(year);
    
    if (type === 'yearly') {
      return {
        start: startOfYear(new Date(yearNum, 0)),
        end: endOfYear(new Date(yearNum, 0)),
      };
    } else if (type === 'quarterly') {
      const quarter = parseInt(monthOrQuarter.replace('Q', ''));
      const startMonth = (quarter - 1) * 3;
      return {
        start: startOfQuarter(new Date(yearNum, startMonth)),
        end: endOfQuarter(new Date(yearNum, startMonth)),
      };
    } else {
      const monthNum = parseInt(monthOrQuarter) - 1;
      return {
        start: startOfMonth(new Date(yearNum, monthNum)),
        end: endOfMonth(new Date(yearNum, monthNum)),
      };
    }
  };

  const getPreviousPeriod = () => {
    if (periodType === 'yearly') {
      const [year] = selectedPeriod.split('-');
      return `${parseInt(year) - 1}`;
    } else if (periodType === 'quarterly') {
      const [year, q] = selectedPeriod.split('-');
      const quarter = parseInt(q.replace('Q', ''));
      if (quarter === 1) return `${parseInt(year) - 1}-Q4`;
      return `${year}-Q${quarter - 1}`;
    } else {
      const date = new Date(selectedPeriod + '-01');
      const prev = subMonths(date, 1);
      return format(prev, 'yyyy-MM');
    }
  };

  const fetchPLData = async () => {
    setLoading(true);
    try {
      const { start, end } = getPeriodDates(selectedPeriod, periodType);
      const prevPeriod = getPreviousPeriod();
      const { start: prevStart, end: prevEnd } = getPeriodDates(prevPeriod, periodType);

      const fetchPeriodData = async (startDate: Date, endDate: Date): Promise<PLData> => {
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        // ── Source of truth: journal_entry_lines joined to chart_of_accounts ──
        // Filter journal entries by entry_date within the period
        let jeQuery = supabase
          .from('journal_entries')
          .select('id, company_id')
          .gte('entry_date', startStr)
          .lte('entry_date', endStr);

        if (viewMode !== 'consolidated') {
          jeQuery = jeQuery.eq('company_id', viewMode);
        }

        const { data: journalEntries } = await jeQuery;
        const jeIds = journalEntries?.map(j => j.id) || [];

        // Fetch all lines for those JEs with account info
        let lines: Array<{
          debit_amount: number | null;
          credit_amount: number | null;
          chart_of_accounts: {
            account_code: string;
            account_name: string;
            account_type: string;
            account_subtype: string | null;
          } | null;
        }> = [];

        if (jeIds.length > 0) {
          // Batch in chunks of 200 to avoid query limits
          for (let i = 0; i < jeIds.length; i += 200) {
            const chunk = jeIds.slice(i, i + 200);
            const { data: chunkLines } = await supabase
              .from('journal_entry_lines')
              .select('debit_amount, credit_amount, account_id, chart_of_accounts!inner(account_code, account_name, account_type, account_subtype)')
              .in('journal_entry_id', chunk);
            if (chunkLines) lines = lines.concat(chunkLines as any);
          }
        }

        // ── Aggregate by account type/subtype ──
        const grossSalesByMarketplace: Record<string, number> = {};
        let totalRevenue = 0;
        let totalCOGS = 0;
        const operatingExpensesByCategory: Record<string, number> = {};
        let intercompanyCharges = 0;
        let otherIncome = 0;

        for (const line of lines) {
          const acct = line.chart_of_accounts;
          if (!acct) continue;
          const debit = Number(line.debit_amount || 0);
          const credit = Number(line.credit_amount || 0);

          if (acct.account_type === 'revenue') {
            // Revenue accounts have credit normal balance
            const amount = credit - debit;
            if (acct.account_subtype === 'Tax Revenue') continue; // Exclude tax collected
            if (acct.account_subtype === 'Other Income') {
              if (acct.account_name.includes('Inter-company')) {
                intercompanyCharges += amount;
              } else {
                otherIncome += amount;
              }
              continue;
            }
            // Map to marketplace from account name
            const name = acct.account_name.toLowerCase();
            let mp = 'other';
            if (name.includes('amazon')) mp = 'amazon';
            else if (name.includes('bestbuy') || name.includes('best buy')) mp = 'bestbuy';
            else if (name.includes('shopify')) mp = 'shopify';
            else if (name.includes('direct') || name.includes('invoice')) mp = 'invoices';
            else if (name.includes('temu')) mp = 'temu';
            grossSalesByMarketplace[mp] = (grossSalesByMarketplace[mp] || 0) + amount;
            totalRevenue += amount;
          } else if (acct.account_type === 'expense') {
            // Expense accounts have debit normal balance
            const amount = debit - credit;
            if (acct.account_subtype === 'COGS') {
              totalCOGS += amount;
            } else {
              // Map to opex category from account name/code
              // Use prefix matching so VES (6X00), VES variant (6X01), and TGW variant (6X02) all bucket together
              const code = acct.account_code;
              const prefix3 = code.substring(0, 3); // e.g. "660" covers 6600/6601/6602
              let cat = 'other';
              if (code.startsWith('60') && acct.account_name.toLowerCase().includes('marketplace')) cat = 'marketplace_fees';
              else if (code.startsWith('61')) cat = 'shipping';
              else if (prefix3 === '620') cat = 'utilities';
              else if (prefix3 === '630') cat = 'payroll';
              else if (prefix3 === '640') cat = 'marketing';
              else if (prefix3 === '650') cat = 'office';
              else if (prefix3 === '660') cat = 'professional_services';
              else if (prefix3 === '670') cat = 'insurance';
              else if (prefix3 === '680') cat = 'other'; // bank fees
              else if (prefix3 === '690') cat = 'software';
              else if (prefix3 === '700') cat = 'utilities';
              else if (prefix3 === '710') cat = 'other';
              operatingExpensesByCategory[cat] = (operatingExpensesByCategory[cat] || 0) + amount;
            }
          }
        }

        // Also pull in expenses that may not have JEs yet (fallback)
        let expensesQuery = supabase
          .from('expenses')
          .select('id, amount, gst_hst_amount, pst_amount, category, company_id, is_shared, allocation_ves, allocation_tgw')
          .gte('expense_date', startStr)
          .lte('expense_date', endStr);
        if (viewMode !== 'consolidated') {
          expensesQuery = expensesQuery.or(`company_id.eq.${viewMode},is_shared.eq.true`);
        }
        const { data: expenses } = await expensesQuery;

        // Check which expenses have JEs already
        const expenseIds = expenses?.map(e => e.id) || [];
        let expensesWithJEs = new Set<string>();
        if (expenseIds.length > 0) {
          for (let i = 0; i < expenseIds.length; i += 200) {
            const chunk = expenseIds.slice(i, i + 200);
            const { data: existingJEs } = await supabase
              .from('journal_entries')
              .select('reference_id')
              .in('reference_id', chunk);
            existingJEs?.forEach(je => { if (je.reference_id) expensesWithJEs.add(je.reference_id); });
          }
        }

        // Add expenses without JEs to opex (fallback for unbooked expenses)
        const getEffectiveExpense = (exp: any) => {
          const total = (exp.amount || 0) + (exp.gst_hst_amount || 0) + (exp.pst_amount || 0);
          if (!exp.is_shared) return total;
          if (viewMode !== 'consolidated') {
            const vesCompany = companies.find(c => c.code === 'VES');
            return viewMode === vesCompany?.id
              ? total * ((exp.allocation_ves || 0) / 100)
              : total * ((exp.allocation_tgw || 0) / 100);
          }
          return total;
        };

        expenses?.filter(e => !expensesWithJEs.has(e.id) && e.category !== 'inventory').forEach(e => {
          const cat = e.category;
          const amount = getEffectiveExpense(e);
          operatingExpensesByCategory[cat] = (operatingExpensesByCategory[cat] || 0) + amount;
        });

        // COGS fallback: if no COGS JEs exist, use device purchases
        if (totalCOGS === 0 && jeIds.length === 0) {
          let devicesQuery = supabase
            .from('devices')
            .select('cost_price, purchase_date')
            .gte('purchase_date', startStr)
            .lte('purchase_date', endStr);
          if (viewMode !== 'consolidated') devicesQuery = devicesQuery.eq('company_id', viewMode);
          const { data: devices } = await devicesQuery;
          totalCOGS = devices?.reduce((sum, d) => sum + Number(d.cost_price), 0) || 0;
        }

        const returns = 0; // Returns are already reflected in JEs as revenue reversals
        const netSales = totalRevenue - returns;
        const grossProfit = netSales - totalCOGS;

        // Inventory values (for display only)
        let inventoryQuery = supabase
          .from('devices')
          .select('cost_price, status, purchase_date');
        if (viewMode !== 'consolidated') inventoryQuery = inventoryQuery.eq('company_id', viewMode);
        const { data: allDevices } = await inventoryQuery;
        
        const endingInventory = allDevices?.filter(d => d.status === 'in_stock')
          .reduce((sum, d) => sum + Number(d.cost_price), 0) || 0;
        const periodPurchases = allDevices?.filter(d =>
          d.purchase_date && d.purchase_date >= startStr && d.purchase_date <= endStr
        ) || [];
        const purchases = periodPurchases.reduce((sum, d) => sum + Number(d.cost_price), 0);
        const beginningInventory = endingInventory + purchases;

        const totalOperatingExpenses = Object.values(operatingExpensesByCategory).reduce((sum, v) => sum + v, 0);
        const operatingProfit = grossProfit - totalOperatingExpenses;

        // Management costing data
        let soldDevicesQuery = supabase
          .from('sales')
          .select('devices!inner(management_labor_cost)')
          .gte('sale_date', startDate.toISOString())
          .lte('sale_date', endDate.toISOString())
          .not('device_id', 'is', null);
        if (viewMode !== 'consolidated') soldDevicesQuery = soldDevicesQuery.eq('company_id', viewMode);
        const { data: soldDevicesData } = await soldDevicesQuery;
        const managementLaborCost = soldDevicesData?.reduce((sum: number, s: any) =>
          sum + Number(s.devices?.management_labor_cost || 0), 0) || 0;

        const payrollExpenses = operatingExpensesByCategory['payroll'] || 0;

        let repairsQuery = supabase
          .from('device_repairs')
          .select('total_parts_cost')
          .eq('status', 'completed')
          .gte('completed_at', startDate.toISOString())
          .lte('completed_at', endDate.toISOString());
        if (viewMode !== 'consolidated') repairsQuery = repairsQuery.eq('company_id', viewMode);
        const { data: repairs } = await repairsQuery;
        const repairPartsCost = repairs?.reduce((sum, r) => sum + Number(r.total_parts_cost || 0), 0) || 0;

        const netProfitBeforeTax = operatingProfit + otherIncome - intercompanyCharges;
        const incomeTax = netProfitBeforeTax > 0 ? netProfitBeforeTax * 0.15 : 0;
        const netProfitAfterTax = netProfitBeforeTax - incomeTax;

        return {
          grossSalesByMarketplace,
          returns,
          netSales,
          beginningInventory,
          purchases,
          endingInventory,
          totalCOGS,
          grossProfit,
          operatingExpensesByCategory,
          totalOperatingExpenses,
          operatingProfit,
          intercompanyCharges,
          otherIncome,
          netProfitBeforeTax,
          incomeTax,
          netProfitAfterTax,
          managementLaborCost,
          payrollExpenses,
          repairPartsCost,
        };
      };

      const current = await fetchPeriodData(start, end);
      const previous = await fetchPeriodData(prevStart, prevEnd);

      setData({ current, previous });
    } catch (error) {
      console.error('Error fetching P&L data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const getChange = (current: number, previous: number) => {
    if (previous === 0) return null;
    const change = ((current - previous) / Math.abs(previous)) * 100;
    return change;
  };

  const handleExport = () => {
    if (!data) return;
    
    const lines = [
      'PROFIT & LOSS STATEMENT',
      `Period: ${selectedPeriod}`,
      `Company: ${viewMode === 'consolidated' ? 'Consolidated' : companies.find(c => c.id === viewMode)?.name}`,
      '',
      'REVENUE',
      ...Object.entries(data.current.grossSalesByMarketplace).map(([mp, val]) => 
        `  ${mp.charAt(0).toUpperCase() + mp.slice(1)} Sales,${val.toFixed(2)}`
      ),
      `  Less: Returns,${data.current.returns.toFixed(2)}`,
      `NET SALES,${data.current.netSales.toFixed(2)}`,
      '',
      'COST OF GOODS SOLD',
      `  Purchases,${data.current.purchases.toFixed(2)}`,
      `TOTAL COGS,${data.current.totalCOGS.toFixed(2)}`,
      '',
      `GROSS PROFIT,${data.current.grossProfit.toFixed(2)}`,
      '',
      'OPERATING EXPENSES',
      ...Object.entries(data.current.operatingExpensesByCategory).map(([cat, val]) =>
        `  ${cat.replace(/_/g, ' ')},${val.toFixed(2)}`
      ),
      `TOTAL OPERATING EXPENSES,${data.current.totalOperatingExpenses.toFixed(2)}`,
      '',
      `OPERATING PROFIT (EBITDA),${data.current.operatingProfit.toFixed(2)}`,
      '',
      `NET PROFIT BEFORE TAX,${data.current.netProfitBeforeTax.toFixed(2)}`,
      `  Income Tax (Est. 15%),${data.current.incomeTax.toFixed(2)}`,
      `NET PROFIT AFTER TAX,${data.current.netProfitAfterTax.toFixed(2)}`,
    ];

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PL-${selectedPeriod}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const getPeriodOptions = () => {
    const options = [];
    const now = new Date();
    
    if (periodType === 'monthly') {
      for (let i = 0; i < 12; i++) {
        const date = subMonths(now, i);
        options.push({
          value: format(date, 'yyyy-MM'),
          label: format(date, 'MMMM yyyy'),
        });
      }
    } else if (periodType === 'quarterly') {
      for (let i = 0; i < 8; i++) {
        const date = subMonths(now, i * 3);
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        options.push({
          value: `${date.getFullYear()}-Q${quarter}`,
          label: `Q${quarter} ${date.getFullYear()}`,
        });
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const year = now.getFullYear() - i;
        options.push({
          value: `${year}`,
          label: `${year}`,
        });
      }
    }
    
    return options;
  };

  const LineItem = ({ 
    label, 
    value, 
    prevValue, 
    indent = false, 
    bold = false,
    negative = false,
  }: { 
    label: string; 
    value: number; 
    prevValue?: number; 
    indent?: boolean; 
    bold?: boolean;
    negative?: boolean;
  }) => {
    const change = prevValue !== undefined ? getChange(value, prevValue) : null;
    
    return (
      <div className={`flex items-center justify-between py-2 ${indent ? 'pl-4' : ''} ${bold ? 'font-semibold' : ''}`}>
        <span className={negative ? 'text-muted-foreground' : ''}>{label}</span>
        <div className="flex items-center gap-4">
          {showComparison && prevValue !== undefined && (
            <span className="text-muted-foreground text-sm w-24 text-right">
              {formatCurrency(prevValue)}
            </span>
          )}
          <span className={`w-28 text-right ${negative ? 'text-destructive' : value < 0 ? 'text-destructive' : ''}`}>
            {negative ? '-' : ''}{formatCurrency(Math.abs(value))}
          </span>
          {showComparison && change !== null && (
            <Badge variant={change >= 0 ? 'default' : 'destructive'} className="w-16 justify-center">
              {change >= 0 ? '+' : ''}{change.toFixed(1)}%
            </Badge>
          )}
        </div>
      </div>
    );
  };

  if (loading || !data) {
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
      <div className="flex flex-wrap items-center gap-4">
        <Select value={periodType} onValueChange={(v) => setPeriodType(v as any)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-[180px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {getPeriodOptions().map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={showComparison ? 'default' : 'outline'}
          onClick={() => setShowComparison(!showComparison)}
        >
          Compare
        </Button>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={costingView === 'management' ? 'default' : 'outline'}
                onClick={() => setCostingView(v => v === 'accounting' ? 'management' : 'accounting')}
              >
                <ToggleLeft className="h-4 w-4 mr-2" />
                {costingView === 'accounting' ? 'Accounting View' : 'Management View'}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p><strong>Accounting View:</strong> Standard P&L using actual costs. Device COGS includes purchase price + capitalized repair parts. Labor appears as payroll in Operating Expenses.</p>
              <p className="mt-1"><strong>Management View:</strong> Performance P&L. Device COGS includes purchase price + repair parts + estimated labor per device. Payroll expenses are excluded to avoid double-counting.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

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

      {/* Costing View Explanation */}
      {costingView === 'accounting' && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Accounting View</AlertTitle>
          <AlertDescription>
            Standard P&L using actual costs. Device COGS includes purchase price + capitalized repair parts.
            Labor appears as payroll in Operating Expenses. This is the GAAP-compliant view.
          </AlertDescription>
        </Alert>
      )}
      {costingView === 'management' && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Management View</AlertTitle>
          <AlertDescription>
            Performance P&L. Device COGS includes purchase price + repair parts + estimated labor per device
            ({formatCurrency(data.current.managementLaborCost)}). Payroll expenses ({formatCurrency(data.current.payrollExpenses)}) are excluded to avoid double-counting.
          </AlertDescription>
        </Alert>
      )}

      {/* P&L Statement */}
      <Card className="print:shadow-none">
        <CardHeader className="text-center border-b">
          <CardTitle className="text-2xl flex items-center justify-center gap-2">
            <FileText className="h-6 w-6" />
            Profit & Loss Statement
          </CardTitle>
          <CardDescription>
            {viewMode === 'consolidated' ? 'Consolidated' : companies.find(c => c.id === viewMode)?.name} | {selectedPeriod}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {/* Header Row */}
          {showComparison && (
            <div className="flex justify-end text-sm font-medium text-muted-foreground">
              <span className="w-24 text-right mr-4">Prior Period</span>
              <span className="w-28 text-right">Current</span>
              <span className="w-16 text-center">Change</span>
            </div>
          )}

          {/* Revenue Section */}
          <div>
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              REVENUE
            </h3>
            {Object.entries(data.current.grossSalesByMarketplace).map(([mp, val]) => (
              <LineItem
                key={mp}
                label={`${mp.charAt(0).toUpperCase() + mp.slice(1)} Sales`}
                value={val}
                prevValue={data.previous.grossSalesByMarketplace[mp] || 0}
                indent
              />
            ))}
            {data.current.returns > 0 && (
              <LineItem
                label="Less: Returns & Refunds"
                value={data.current.returns}
                prevValue={data.previous.returns}
                indent
                negative
              />
            )}
            <Separator className="my-2" />
            <LineItem
              label="NET SALES"
              value={data.current.netSales}
              prevValue={data.previous.netSales}
              bold
            />
          </div>

          {/* COGS Section */}
          <div>
            <h3 className="font-semibold text-lg mb-2">COST OF GOODS SOLD</h3>
            <LineItem
              label="Purchases"
              value={data.current.purchases}
              prevValue={data.previous.purchases}
              indent
            />
            {costingView === 'management' && data.current.managementLaborCost > 0 && (
              <LineItem
                label="Management Labor (estimated)"
                value={data.current.managementLaborCost}
                prevValue={data.previous.managementLaborCost}
                indent
              />
            )}
            <Separator className="my-2" />
            <LineItem
              label="TOTAL COGS"
              value={costingView === 'management'
                ? data.current.totalCOGS + data.current.managementLaborCost
                : data.current.totalCOGS}
              prevValue={costingView === 'management'
                ? data.previous.totalCOGS + data.previous.managementLaborCost
                : data.previous.totalCOGS}
              bold
              negative
            />
          </div>

          {/* Gross Profit */}
          <div className="bg-muted/30 p-4 rounded-lg">
            <LineItem
              label="GROSS PROFIT"
              value={costingView === 'management'
                ? data.current.grossProfit - data.current.managementLaborCost
                : data.current.grossProfit}
              prevValue={costingView === 'management'
                ? data.previous.grossProfit - data.previous.managementLaborCost
                : data.previous.grossProfit}
              bold
            />
          </div>

          {/* Operating Expenses */}
          <div>
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-destructive" />
              OPERATING EXPENSES
            </h3>
            {EXPENSE_CATEGORY_ORDER.map(cat => {
              const val = data.current.operatingExpensesByCategory[cat] || 0;
              const prevVal = data.previous.operatingExpensesByCategory[cat] || 0;
              if (val === 0 && prevVal === 0) return null;
              return (
                <LineItem
                  key={cat}
                  label={cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  value={val}
                  prevValue={prevVal}
                  indent
                />
              );
            })}
            {costingView === 'management' && data.current.payrollExpenses > 0 && (
              <LineItem
                label="Less: Payroll (excluded in mgmt view)"
                value={data.current.payrollExpenses}
                prevValue={data.previous.payrollExpenses}
                indent
                negative
              />
            )}
            <Separator className="my-2" />
            <LineItem
              label="TOTAL OPERATING EXPENSES"
              value={costingView === 'management'
                ? data.current.totalOperatingExpenses - data.current.payrollExpenses
                : data.current.totalOperatingExpenses}
              prevValue={costingView === 'management'
                ? data.previous.totalOperatingExpenses - data.previous.payrollExpenses
                : data.previous.totalOperatingExpenses}
              bold
              negative
            />
          </div>

          {/* Operating Profit */}
          <div className="bg-muted/30 p-4 rounded-lg">
            <LineItem
              label="OPERATING PROFIT (EBITDA)"
              value={data.current.operatingProfit}
              prevValue={data.previous.operatingProfit}
              bold
            />
          </div>

          {/* Net Profit */}
          <div>
            <LineItem
              label="NET PROFIT BEFORE TAX"
              value={data.current.netProfitBeforeTax}
              prevValue={data.previous.netProfitBeforeTax}
              bold
            />
            <LineItem
              label="Income Tax (Est. 15%)"
              value={data.current.incomeTax}
              prevValue={data.previous.incomeTax}
              indent
              negative
            />
          </div>

          {/* Final Net Profit */}
          <div className={`p-4 rounded-lg ${data.current.netProfitAfterTax >= 0 ? 'bg-emerald-500/10' : 'bg-destructive/10'}`}>
            <LineItem
              label="NET PROFIT AFTER TAX"
              value={data.current.netProfitAfterTax}
              prevValue={data.previous.netProfitAfterTax}
              bold
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
