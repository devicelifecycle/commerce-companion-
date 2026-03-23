import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
  const [periodType, setPeriodType] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [selectedPeriod, setSelectedPeriod] = useState(format(new Date(), 'yyyy-MM'));
  const [showComparison, setShowComparison] = useState(false);
  const [costingView, setCostingView] = useState<'accounting' | 'management'>('accounting');
  const [data, setData] = useState<ComparisonData | null>(null);

  useEffect(() => {
    fetchPLData();
  }, [viewMode, periodType, selectedPeriod, selectedCompany]);

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
        const companyFilter = viewMode !== 'consolidated'
          ? `company_id.eq.${viewMode}`
          : null;

        // Fetch sales
        let salesQuery = supabase
          .from('sales')
          .select('sale_price, profit, marketplace, company_id')
          .gte('sale_date', startDate.toISOString())
          .lte('sale_date', endDate.toISOString());
        
        if (companyFilter) salesQuery = salesQuery.or(companyFilter);
        const { data: sales } = await salesQuery;

        // Fetch invoices (non-cancelled) for invoice revenue
        let invoicesQuery = supabase
          .from('invoices')
          .select('subtotal, tax_amount, total, status, company_id')
          .gte('issue_date', startDate.toISOString().split('T')[0])
          .lte('issue_date', endDate.toISOString().split('T')[0])
          .neq('status', 'cancelled');
        
        if (companyFilter) invoicesQuery = invoicesQuery.or(companyFilter);
        const { data: invoices } = await invoicesQuery;

        // Fetch expenses
        let expensesQuery = supabase
          .from('expenses')
          .select('amount, gst_hst_amount, pst_amount, category, company_id, is_shared, allocation_ves, allocation_tgw')
          .gte('expense_date', startDate.toISOString().split('T')[0])
          .lte('expense_date', endDate.toISOString().split('T')[0]);
        
        if (companyFilter) expensesQuery = expensesQuery.or(`${companyFilter},is_shared.eq.true`);
        const { data: expenses } = await expensesQuery;

        // Fetch inventory purchases (devices)
        let devicesQuery = supabase
          .from('devices')
          .select('cost_price, status, purchase_date, company_id');
        
        if (companyFilter) devicesQuery = devicesQuery.or(companyFilter);
        const { data: devices } = await devicesQuery;

        // Calculate effective expense
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

        // Sales by marketplace
        const grossSalesByMarketplace: Record<string, number> = {};
        sales?.forEach(s => {
          grossSalesByMarketplace[s.marketplace] = (grossSalesByMarketplace[s.marketplace] || 0) + Number(s.sale_price);
        });

        // Add invoice revenue as a separate line
        const invoiceRevenue = invoices?.reduce((sum, inv) => sum + Number(inv.subtotal || 0), 0) || 0;
        if (invoiceRevenue > 0) {
          grossSalesByMarketplace['invoices'] = invoiceRevenue;
        }

        const grossSales = Object.values(grossSalesByMarketplace).reduce((sum, v) => sum + v, 0);
        const returns = 0; // Would need returns tracking
        const netSales = grossSales - returns;

        // COGS calculation
        const periodPurchases = devices?.filter(d => 
          d.purchase_date && new Date(d.purchase_date) >= startDate && new Date(d.purchase_date) <= endDate
        ) || [];
        const purchases = periodPurchases.reduce((sum, d) => sum + Number(d.cost_price), 0);
        
        // Simple approximation for inventory
        const endingInventory = devices?.filter(d => d.status === 'in_stock')
          .reduce((sum, d) => sum + Number(d.cost_price), 0) || 0;
        const beginningInventory = endingInventory + purchases; // Simplified
        
        const inventoryExpenses = expenses?.filter(e => e.category === 'inventory') || [];
        const cogsFromExpenses = inventoryExpenses.reduce((sum, e) => sum + getEffectiveExpense(e), 0);
        const totalCOGS = purchases + cogsFromExpenses;
        const grossProfit = netSales - totalCOGS;

        // Operating expenses by category
        const operatingExpensesByCategory: Record<string, number> = {};
        expenses?.filter(e => e.category !== 'inventory').forEach(e => {
          const cat = e.category;
          operatingExpensesByCategory[cat] = (operatingExpensesByCategory[cat] || 0) + getEffectiveExpense(e);
        });

        const totalOperatingExpenses = Object.values(operatingExpensesByCategory).reduce((sum, v) => sum + v, 0);
        const operatingProfit = grossProfit - totalOperatingExpenses;

        // Fetch management labor cost from sold devices in the period
        let soldDevicesQuery = supabase
          .from('sales')
          .select('devices!inner(management_labor_cost)')
          .gte('sale_date', startDate.toISOString())
          .lte('sale_date', endDate.toISOString())
          .not('device_id', 'is', null);
        if (companyFilter) soldDevicesQuery = soldDevicesQuery.or(companyFilter);
        const { data: soldDevicesData } = await soldDevicesQuery;

        const managementLaborCost = soldDevicesData?.reduce((sum: number, s: any) => 
          sum + Number(s.devices?.management_labor_cost || 0), 0) || 0;

        // Calculate payroll/labor expenses (categories that represent actual labor payments)
        const payrollCategories = ['payroll', 'salaries'];
        const payrollExpenses = expenses?.filter(e => 
          payrollCategories.includes(e.category)
        ).reduce((sum, e) => sum + getEffectiveExpense(e), 0) || 0;

        // Fetch repair parts cost for reference
        let repairsQuery = supabase
          .from('device_repairs')
          .select('total_parts_cost')
          .eq('status', 'completed')
          .gte('completed_at', startDate.toISOString())
          .lte('completed_at', endDate.toISOString());
        if (companyFilter) repairsQuery = repairsQuery.or(companyFilter);
        const { data: repairs } = await repairsQuery;

        const repairPartsCost = repairs?.reduce((sum, r) => sum + Number(r.total_parts_cost || 0), 0) || 0;

        // Other income/expenses
        const intercompanyCharges = 0;
        const otherIncome = 0;
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
