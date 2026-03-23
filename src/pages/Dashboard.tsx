import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SystemAlertsBanner } from '@/components/alerts/SystemAlertsBanner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PermissionGuard } from '@/components/layout/PermissionGuard';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MarketplaceBadge } from '@/components/ui/status-badge';
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Percent, ShoppingCart, Package,
  Wallet, Activity, ArrowUpRight, ArrowDownRight, RefreshCw, Building2,
  Download, BarChart3, Store, Clock, Target, Receipt
} from 'lucide-react';
import {
  format, subMonths, startOfMonth, startOfYear, startOfQuarter, subHours,
  differenceInDays, differenceInMinutes
} from 'date-fns';

const MARKETPLACE_COLORS: Record<string, string> = {
  shopify: '#6EE7B7', amazon: '#FB923C', bestbuy: '#3B82F6', other: '#94A3B8',
};
const COLORS = [
  'hsl(var(--primary))', 'hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)',
  'hsl(280, 65%, 60%)', 'hsl(25, 95%, 53%)', 'hsl(340, 82%, 52%)',
];

interface RecentActivity {
  id: string;
  type: 'sale' | 'purchase' | 'expense';
  description: string;
  amount?: number;
  timestamp: Date;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedCompany, companies, isSuperAdmin, assignments } = useCompany();
  const queryClient = useQueryClient();
  const isAdmin = isSuperAdmin || assignments.some(a => a.role === 'admin');
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('6');
  const [feeMetrics, setFeeMetrics] = useState<{ marketplace: string; revenue: number; fees: number; feeRate: number; shipping: number; revenueAfterFees: number; orders: number }[]>([]);
  const [companyView, setCompanyView] = useState<'consolidated' | string>('consolidated');
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);

  // Profitability metrics
  const [metrics, setMetrics] = useState({
    totalRevenue: 0, totalCOGS: 0, grossProfit: 0, grossMargin: 0,
    totalExpenses: 0, netProfit: 0, netMargin: 0,
    totalOrders: 0, avgOrderValue: 0, avgProfitPerUnit: 0,
    inventoryValue: 0, inventoryCount: 0, inventoryTurnover: 0,
    avgDaysToSell: 0, outstandingAP: 0, outstandingAR: 0,
    cashPosition: 0,
    mtdRevenue: 0, mtdProfit: 0, qtdRevenue: 0, ytdRevenue: 0,
    expenseToRevenueRatio: 0, returnOnInventory: 0,
  });
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [marketplaceData, setMarketplaceData] = useState<any[]>([]);
  const [expenseData, setExpenseData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);

  useEffect(() => { fetchAll(); }, [dateRange, companyView, selectedCompany]);

  const getCompanyFilter = () => {
    if (companyView !== 'consolidated') return companyView;
    return selectedCompany?.id || null;
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const now = new Date();
      let startDate: Date;
      const months = parseInt(dateRange);
      if (dateRange === 'mtd') {
        startDate = startOfMonth(now);
      } else if (dateRange === 'qtd') {
        startDate = startOfQuarter(now);
      } else if (dateRange === 'ytd') {
        startDate = startOfYear(now);
      } else if (!isNaN(months)) {
        startDate = startOfMonth(subMonths(now, months - 1));
      } else {
        startDate = startOfMonth(subMonths(now, 5));
      }
      const mtdStart = startOfMonth(now);
      const qtdStart = startOfQuarter(now);
      const ytdStart = startOfYear(now);
      const last24h = subHours(now, 24);
      const companyFilter = getCompanyFilter();

      // Sales — explicit limit to avoid the 1000-row default cap
      let salesQ = supabase.from('sales')
        .select('id, sale_price, profit, marketplace, sale_date, marketplace_fees, shipping_cost, company_id, devices(brand, model, category, cost_price, created_at)')
        .gte('sale_date', startDate.toISOString())
        .limit(5000);
      if (companyFilter) salesQ = salesQ.eq('company_id', companyFilter);
      const { data: sales } = await salesQ;

      // Expenses
      let expQ = supabase.from('expenses')
        .select('id, amount, gst_hst_amount, pst_amount, category, expense_date, description, company_id, is_shared, allocation_ves, allocation_tgw')
        .gte('expense_date', startDate.toISOString().split('T')[0])
        .limit(5000);
      if (companyFilter) expQ = expQ.eq('company_id', companyFilter);
      const { data: expenses } = await expQ;

      // Inventory
      let invQ = supabase.from('devices').select('id, cost_price, created_at, brand, model').eq('status', 'in_stock').limit(5000);
      if (companyFilter) invQ = invQ.eq('company_id', companyFilter);
      const { data: inventory } = await invQ;

      // AP / AR
      let apQ = supabase.from('accounts_payable').select('balance_due').eq('status', 'outstanding');
      if (companyFilter) apQ = apQ.eq('company_id', companyFilter);
      const { data: apData } = await apQ;

      let arQ = supabase.from('accounts_receivable').select('balance_due').eq('status', 'outstanding');
      if (companyFilter) arQ = arQ.eq('company_id', companyFilter);
      const { data: arData } = await arQ;

      // Cash
      let bankQ = supabase.from('bank_accounts').select('current_balance').eq('is_active', true);
      if (companyFilter) bankQ = bankQ.eq('company_id', companyFilter);
      const { data: bankData } = await bankQ;

      // Effective expense calc
      const vesCompany = companies.find(c => c.code === 'VES');
      const getEffExp = (e: any) => {
        const total = (e.amount || 0) + (e.gst_hst_amount || 0) + (e.pst_amount || 0);
        if (!e.is_shared || companyView === 'consolidated') return total;
        return companyView === vesCompany?.id
          ? total * ((e.allocation_ves || 0) / 100)
          : total * ((e.allocation_tgw || 0) / 100);
      };

      // Calculations
      const totalRevenue = sales?.reduce((s, r) => s + Number(r.sale_price), 0) || 0;
      const totalCOGS = sales?.reduce((s, r) => {
        const d = r.devices as any;
        return s + Number(d?.cost_price || 0);
      }, 0) || 0;
      const grossProfit = totalRevenue - totalCOGS;
      const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
      const totalExpenses = expenses?.reduce((s, e) => s + getEffExp(e), 0) || 0;
      const totalFees = sales?.reduce((s, r) => s + Number(r.marketplace_fees || 0) + Number(r.shipping_cost || 0), 0) || 0;
      const netProfit = grossProfit - totalExpenses - totalFees;
      const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
      const totalOrders = sales?.length || 0;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      const avgProfitPerUnit = totalOrders > 0 ? netProfit / totalOrders : 0;
      const inventoryValue = inventory?.reduce((s, d) => s + Number(d.cost_price), 0) || 0;
      const inventoryCount = inventory?.length || 0;
      const inventoryTurnover = inventoryValue > 0 ? (totalCOGS / inventoryValue) : 0;
      const outstandingAP = apData?.reduce((s, a) => s + Number(a.balance_due || 0), 0) || 0;
      const outstandingAR = arData?.reduce((s, a) => s + Number(a.balance_due || 0), 0) || 0;
      const cashPosition = bankData?.reduce((s, b) => s + Number(b.current_balance || 0), 0) || 0;

      // Avg days to sell from sold devices
      let totalDays = 0, countSold = 0;
      sales?.forEach(sale => {
        const d = sale.devices as any;
        if (d?.created_at) {
          const days = differenceInDays(new Date(sale.sale_date), new Date(d.created_at));
          if (days >= 0) { totalDays += days; countSold++; }
        }
      });
      const avgDaysToSell = countSold > 0 ? Math.round(totalDays / countSold) : 0;

      // Period
      const mtdRevenue = sales?.filter(s => new Date(s.sale_date) >= mtdStart).reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;
      const mtdProfit = sales?.filter(s => new Date(s.sale_date) >= mtdStart).reduce((sum, s) => sum + Number(s.profit || 0), 0) || 0;
      const qtdRevenue = sales?.filter(s => new Date(s.sale_date) >= qtdStart).reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;
      const ytdRevenue = sales?.filter(s => new Date(s.sale_date) >= ytdStart).reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;

      const expenseToRevenueRatio = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0;
      const returnOnInventory = inventoryValue > 0 ? (netProfit / inventoryValue) * 100 : 0;

      setMetrics({
        totalRevenue, totalCOGS, grossProfit, grossMargin,
        totalExpenses, netProfit, netMargin,
        totalOrders, avgOrderValue, avgProfitPerUnit,
        inventoryValue, inventoryCount, inventoryTurnover,
        avgDaysToSell, outstandingAP, outstandingAR, cashPosition,
        mtdRevenue, mtdProfit, qtdRevenue, ytdRevenue,
        expenseToRevenueRatio, returnOnInventory,
      });

      // Monthly trend — compute buckets dynamically
      const bucketMonths = !isNaN(months) ? months : Math.max(1, Math.ceil(differenceInDays(now, startDate) / 30));
      const monthlyData: Record<string, { revenue: number; profit: number; expenses: number; cogs: number }> = {};
      for (let i = 0; i < bucketMonths; i++) {
        const date = subMonths(now, bucketMonths - 1 - i);
        monthlyData[format(date, 'MMM')] = { revenue: 0, profit: 0, expenses: 0, cogs: 0 };
      }
      sales?.forEach(s => {
        const key = format(new Date(s.sale_date), 'MMM');
        if (monthlyData[key]) {
          monthlyData[key].revenue += Number(s.sale_price);
          monthlyData[key].profit += Number(s.profit || 0);
          const d = s.devices as any;
          monthlyData[key].cogs += Number(d?.cost_price || 0);
        }
      });
      expenses?.forEach(e => {
        const key = format(new Date(e.expense_date), 'MMM');
        if (monthlyData[key]) monthlyData[key].expenses += getEffExp(e);
      });
      setRevenueData(Object.entries(monthlyData).map(([month, d]) => ({
        month, ...d, netProfit: d.profit - d.expenses,
        margin: d.revenue > 0 ? ((d.revenue - d.cogs) / d.revenue * 100) : 0,
      })));

      // Fees & commissions per marketplace
      const feeTotals: Record<string, { marketplace: string; revenue: number; fees: number; shipping: number; orders: number }> = {};
      sales?.forEach(s => {
        const mp = s.marketplace;
        if (!feeTotals[mp]) feeTotals[mp] = { marketplace: mp, revenue: 0, fees: 0, shipping: 0, orders: 0 };
        feeTotals[mp].revenue += Number(s.sale_price);
        feeTotals[mp].fees += Number(s.marketplace_fees || 0);
        feeTotals[mp].shipping += Number(s.shipping_cost || 0);
        feeTotals[mp].orders += 1;
      });
      setFeeMetrics(Object.values(feeTotals).map(m => ({
        ...m,
        feeRate: m.revenue > 0 ? (m.fees / m.revenue) * 100 : 0,
        revenueAfterFees: m.revenue - m.fees - m.shipping,
      })).sort((a, b) => b.fees - a.fees));

      // Marketplace
      const mpTotals: Record<string, { revenue: number; profit: number; orders: number }> = {};
      sales?.forEach(s => {
        if (!mpTotals[s.marketplace]) mpTotals[s.marketplace] = { revenue: 0, profit: 0, orders: 0 };
        mpTotals[s.marketplace].revenue += Number(s.sale_price);
        mpTotals[s.marketplace].profit += Number(s.profit || 0);
        mpTotals[s.marketplace].orders += 1;
      });
      setMarketplaceData(Object.entries(mpTotals).map(([name, data]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: data.revenue,
        profit: data.profit,
        orders: data.orders,
        margin: data.revenue > 0 ? ((data.profit / data.revenue) * 100).toFixed(1) : '0',
        color: MARKETPLACE_COLORS[name] || MARKETPLACE_COLORS.other,
      })));

      // Expense breakdown
      const expTotals: Record<string, number> = {};
      expenses?.forEach(e => {
        expTotals[e.category] = (expTotals[e.category] || 0) + getEffExp(e);
      });
      setExpenseData(Object.entries(expTotals).map(([name, value], i) => ({
        name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value, fill: COLORS[i % COLORS.length],
      })).sort((a, b) => b.value - a.value));

      // Top products by profit
      const productTotals: Record<string, { sold: number; revenue: number; profit: number }> = {};
      sales?.forEach(s => {
        const d = s.devices as any;
        if (d) {
          const key = `${d.brand} ${d.model}`;
          if (!productTotals[key]) productTotals[key] = { sold: 0, revenue: 0, profit: 0 };
          productTotals[key].sold += 1;
          productTotals[key].revenue += Number(s.sale_price);
          productTotals[key].profit += Number(s.profit || 0);
        }
      });
      setTopProducts(
        Object.entries(productTotals)
          .map(([name, data]) => ({ name, ...data, margin: data.revenue > 0 ? ((data.profit / data.revenue) * 100).toFixed(1) : '0' }))
          .sort((a, b) => b.profit - a.profit)
          .slice(0, 8)
      );

      // Recent activity
      const activities: RecentActivity[] = [];
      const recentSalesData = sales?.filter(s => new Date(s.sale_date) >= last24h) || [];
      recentSalesData.forEach(sale => {
        const d = sale.devices as any;
        activities.push({ id: `s-${sale.id}`, type: 'sale', description: d ? `${d.brand} ${d.model}` : `#${sale.id.slice(0, 6)}`, amount: Number(sale.sale_price), timestamp: new Date(sale.sale_date) });
      });
      const recentExp = expenses?.filter(e => new Date(e.expense_date) >= last24h) || [];
      recentExp.forEach(e => {
        activities.push({ id: `e-${e.id}`, type: 'expense', description: e.description, amount: Number(e.amount), timestamp: new Date(e.expense_date) });
      });
      setRecentActivity(activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 10));

    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(v);
  const fmtPct = (v: number) => `${v >= 0 ? '' : ''}${v.toFixed(1)}%`;
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'sale': return <ShoppingCart className="h-3 w-3 text-success" />;
      case 'purchase': return <Package className="h-3 w-3 text-info" />;
      case 'expense': return <DollarSign className="h-3 w-3 text-warning" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-lg" />)}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-lg" />)}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-3 animate-fade-in">
        <SystemAlertsBanner />
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-display font-bold gradient-text">Dashboard</h1>
            <p className="text-[11px] text-muted-foreground">Performance metrics & analytics · {format(new Date(), 'EEEE, MMM d, yyyy')}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {companies.length > 1 && (
              <ToggleGroup type="single" value={companyView} onValueChange={(v) => { if (v) setCompanyView(v); }} className="bg-muted rounded-lg p-0.5">
                <ToggleGroupItem value="consolidated" className="text-[10px] px-2 py-1 h-7 data-[state=on]:bg-primary/15 data-[state=on]:text-primary data-[state=on]:shadow-sm">All</ToggleGroupItem>
                {companies.map(c => (
                  <ToggleGroupItem key={c.id} value={c.id} className="text-[10px] px-2 py-1 h-7 data-[state=on]:bg-primary/15 data-[state=on]:text-primary data-[state=on]:shadow-sm">{c.code}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[110px] h-7 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mtd">Month to Date</SelectItem>
                <SelectItem value="qtd">Quarter to Date</SelectItem>
                <SelectItem value="ytd">Year to Date</SelectItem>
                <SelectItem value="1">30 days</SelectItem>
                <SelectItem value="3">3 months</SelectItem>
                <SelectItem value="6">6 months</SelectItem>
                <SelectItem value="12">12 months</SelectItem>
                <SelectItem value="24">24 months</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-success/10 border border-success/30">
              <Activity className="h-3 w-3 text-success animate-pulse" />
              <span className="text-[10px] font-medium text-success">Live</span>
            </div>
          </div>
        </div>

        <Tabs defaultValue="profitability" className="space-y-3">
          <TabsList className="h-8">
            <TabsTrigger value="profitability" className="text-xs gap-1.5 h-7"><BarChart3 className="h-3.5 w-3.5" />Profitability</TabsTrigger>
          </TabsList>

          <TabsContent value="profitability" className="space-y-3">
            {/* Row 1: Core profitability ratios */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {[
                { icon: Percent, label: 'Gross Margin', value: fmtPct(metrics.grossMargin), sub: fmt(metrics.grossProfit), color: metrics.grossMargin >= 20 ? 'text-success' : 'text-warning', ic: 'text-primary', href: '/financials' },
                { icon: Percent, label: 'Net Margin', value: fmtPct(metrics.netMargin), sub: fmt(metrics.netProfit), color: metrics.netMargin >= 10 ? 'text-success' : metrics.netMargin >= 0 ? 'text-warning' : 'text-destructive', ic: 'text-secondary', href: '/financials' },
                { icon: RefreshCw, label: 'Inv Turnover', value: `${metrics.inventoryTurnover.toFixed(1)}x`, sub: `${metrics.avgDaysToSell}d avg`, color: '', ic: 'text-info', href: '/inventory' },
                { icon: Target, label: 'ROI on Inv', value: fmtPct(metrics.returnOnInventory), sub: fmt(metrics.inventoryValue), color: metrics.returnOnInventory > 0 ? 'text-success' : 'text-destructive', ic: 'text-accent', href: '/inventory' },
                { icon: TrendingDown, label: 'Exp/Rev Ratio', value: fmtPct(metrics.expenseToRevenueRatio), sub: fmt(metrics.totalExpenses), color: metrics.expenseToRevenueRatio < 15 ? 'text-success' : 'text-warning', ic: 'text-warning', href: '/expenses' },
                { icon: DollarSign, label: 'Profit/Unit', value: fmt(metrics.avgProfitPerUnit), sub: `${metrics.totalOrders} sold`, color: metrics.avgProfitPerUnit > 0 ? 'text-success' : 'text-destructive', ic: 'text-success', href: '/orders' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-card border border-border/60 rounded-lg p-2.5 hover:border-primary/40 transition-colors cursor-pointer" onClick={() => navigate(kpi.href)}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <kpi.icon className={`h-3 w-3 ${kpi.ic}`} />
                    <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider truncate">{kpi.label}</span>
                  </div>
                  <p className={`text-lg font-bold font-display leading-tight ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{kpi.sub}</p>
                </div>
              ))}
            </div>

            {/* Row 2: Financial snapshot tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
              {[
                { label: 'Revenue', value: fmt(metrics.totalRevenue), icon: TrendingUp, ic: 'text-primary', href: '/financials' },
                { label: 'COGS', value: fmt(metrics.totalCOGS), icon: Package, ic: 'text-secondary', href: '/financials' },
                { label: 'Expenses', value: fmt(metrics.totalExpenses), icon: Wallet, ic: 'text-warning', href: '/expenses' },
                { label: 'Net Profit', value: fmt(metrics.netProfit), icon: DollarSign, ic: metrics.netProfit >= 0 ? 'text-success' : 'text-destructive', href: '/financials' },
                { label: 'Cash', value: fmt(metrics.cashPosition), icon: Wallet, ic: 'text-primary', href: '/financials' },
                { label: 'Inv Value', value: fmt(metrics.inventoryValue), icon: Package, ic: 'text-secondary', href: '/inventory' },
                { label: 'AR Owed', value: fmt(metrics.outstandingAR), icon: ArrowUpRight, ic: 'text-success', href: '/financials' },
                { label: 'AP Owed', value: fmt(metrics.outstandingAP), icon: ArrowDownRight, ic: 'text-destructive', href: '/financials' },
              ].map(tile => (
                <div key={tile.label} className="bg-card border border-border/60 rounded-lg p-2.5 cursor-pointer hover:border-primary/40 transition-colors" onClick={() => navigate(tile.href)}>
                  <div className="flex items-center gap-1 mb-1">
                    <tile.icon className={`h-3 w-3 ${tile.ic}`} />
                    <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">{tile.label}</span>
                  </div>
                  <p className="text-sm font-bold font-display tabular-nums">{tile.value}</p>
                </div>
              ))}
            </div>

            {/* Row 3: Period comparison */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Month to Date', value: fmt(metrics.mtdRevenue), sub: `Profit: ${fmt(metrics.mtdProfit)}` },
                { label: 'Quarter to Date', value: fmt(metrics.qtdRevenue), sub: `Avg: ${fmt(metrics.avgOrderValue)}/order` },
                { label: 'Year to Date', value: fmt(metrics.ytdRevenue), sub: `${metrics.totalOrders} orders` },
              ].map(p => (
                <div key={p.label} className="bg-card border border-border/60 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{p.label}</p>
                  <p className="text-xl font-bold font-display">{p.value}</p>
                  <p className="text-[10px] text-muted-foreground">{p.sub}</p>
                </div>
              ))}
            </div>

            {/* Row 4: Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {/* Revenue & Profit Trend */}
              <div className="lg:col-span-2 bg-card border border-border/60 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revenue & Profit Trend</span>
                </div>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="cRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="cProf" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }} formatter={(v: number) => fmt(v)} />
                      <Legend wrapperStyle={{ fontSize: '10px' }} />
                      <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={1.5} fillOpacity={1} fill="url(#cRev)" name="Revenue" />
                      <Area type="monotone" dataKey="netProfit" stroke="hsl(var(--success))" strokeWidth={1.5} fillOpacity={1} fill="url(#cProf)" name="Net Profit" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Marketplace breakdown */}
              <div className="bg-card border border-border/60 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Store className="h-3.5 w-3.5 text-info" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">By Channel</span>
                </div>
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={marketplaceData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value">
                        {marketplaceData.map(e => <Cell key={e.name} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: '11px', backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1 mt-1">
                  {marketplaceData.map(mp => (
                    <div key={mp.name} className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: mp.color }} />
                        <span>{mp.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{mp.orders} orders</span>
                        <span className="font-medium">{mp.margin}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 4b: Fees & Commissions by Marketplace */}
            {feeMetrics.length > 0 && (
              <div className="bg-card border border-border/60 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fees & Commissions by Channel</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-3">
                  {(() => {
                    const totalFees = feeMetrics.reduce((s, m) => s + m.fees, 0);
                    const totalShipping = feeMetrics.reduce((s, m) => s + m.shipping, 0);
                    const totalRev = feeMetrics.reduce((s, m) => s + m.revenue, 0);
                    const totalAfter = feeMetrics.reduce((s, m) => s + m.revenueAfterFees, 0);
                    const totalOrders = feeMetrics.reduce((s, m) => s + m.orders, 0);
                    return [
                      { label: 'Total Fees', value: fmt(totalFees), color: 'text-destructive' },
                      { label: 'Total Shipping', value: fmt(totalShipping), color: 'text-warning' },
                      { label: 'Avg Fee Rate', value: fmtPct(totalRev > 0 ? (totalFees / totalRev) * 100 : 0), color: 'text-destructive' },
                      { label: 'Revenue After Fees', value: fmt(totalAfter), color: 'text-success' },
                      { label: 'Avg Fee/Order', value: fmt(totalOrders > 0 ? totalFees / totalOrders : 0), color: 'text-muted-foreground' },
                    ].map(t => (
                      <div key={t.label} className="p-2 rounded-md bg-muted/30 border border-border/30">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">{t.label}</p>
                        <p className={`text-sm font-bold font-display tabular-nums ${t.color}`}>{t.value}</p>
                      </div>
                    ));
                  })()}
                </div>
                <div className="space-y-1.5">
                  {feeMetrics.map(m => {
                    const barWidth = feeMetrics[0]?.fees > 0 ? (m.fees / feeMetrics[0].fees) * 100 : 0;
                    return (
                      <div key={m.marketplace} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: MARKETPLACE_COLORS[m.marketplace] || MARKETPLACE_COLORS.other }} />
                            <span className="font-medium capitalize">{m.marketplace}</span>
                            <span className="text-muted-foreground">{m.orders} orders</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-destructive font-medium tabular-nums">{fmt(m.fees)}</span>
                            <Badge variant={m.feeRate > 15 ? 'destructive' : 'secondary'} className="text-[9px] px-1 py-0 h-4">
                              {m.feeRate.toFixed(1)}%
                            </Badge>
                            <span className="text-success text-[10px] tabular-nums">{fmt(m.revenueAfterFees)} net</span>
                          </div>
                        </div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-destructive/60 transition-all" style={{ width: `${barWidth}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Row 5: Top products + Expenses + Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {/* Top products by profit */}
              <div className="bg-card border border-border/60 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-3.5 w-3.5 text-success" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Products (Profit)</span>
                </div>
                {topProducts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">No data</p>
                ) : (
                  <div className="space-y-1.5">
                    {topProducts.map((p, i) => (
                      <div key={p.name} className="flex items-center justify-between text-[11px] py-1 border-b border-border/20 last:border-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] text-muted-foreground w-4">{i + 1}.</span>
                          <span className="font-medium truncate">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-muted-foreground">{p.sold} sold</span>
                          <span className="text-success font-medium tabular-nums">{fmt(p.profit)}</span>
                          <span className="text-[10px] text-muted-foreground">{p.margin}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Expense breakdown */}
              <div className="bg-card border border-border/60 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="h-3.5 w-3.5 text-warning" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expenses Breakdown</span>
                </div>
                {expenseData.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">No expenses</p>
                ) : (
                  <div className="space-y-1.5">
                    {expenseData.slice(0, 8).map((e, i) => {
                      const pct = metrics.totalExpenses > 0 ? (e.value / metrics.totalExpenses * 100) : 0;
                      return (
                        <div key={e.name} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="truncate">{e.name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-medium tabular-nums">{fmt(e.value)}</span>
                              <span className="text-[10px] text-muted-foreground w-8 text-right">{pct.toFixed(0)}%</span>
                            </div>
                          </div>
                          <div className="h-1 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: e.fill }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Activity Feed */}
              <div className="bg-card border border-border/60 rounded-lg">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
                  <Activity className="h-3.5 w-3.5 text-success animate-pulse" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</span>
                </div>
                {recentActivity.length === 0 ? (
                  <p className="text-center py-6 text-xs text-muted-foreground">No recent activity</p>
                ) : (
                  <ScrollArea className="h-[240px]">
                    <div className="divide-y divide-border/30">
                      {recentActivity.map(a => (
                        <div key={a.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-2 min-w-0">
                            {getActivityIcon(a.type)}
                            <span className="text-[11px] font-medium truncate">{a.description}</span>
                            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 shrink-0">{a.type}</Badge>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {a.amount && (
                              <span className={`text-[11px] font-medium tabular-nums ${a.type === 'sale' ? 'text-success' : 'text-warning'}`}>
                                {a.type === 'sale' ? '+' : '-'}{fmt(a.amount)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          </TabsContent>


        </Tabs>
      </div>
    </DashboardLayout>
  );
}
