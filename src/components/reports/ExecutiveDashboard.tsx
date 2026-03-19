import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MetricCard } from '@/components/ui/metric-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package,
  Wallet, Activity, ArrowUpRight, ArrowDownRight, Percent, BarChart3
} from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, startOfYear, subDays, startOfQuarter } from 'date-fns';

interface DashboardMetrics {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  totalOrders: number;
  avgOrderValue: number;
  inventoryValue: number;
  mtdRevenue: number;
  qtdRevenue: number;
  ytdRevenue: number;
  prevMtdRevenue: number;
  prevQtdRevenue: number;
  prevYtdRevenue: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)', 'hsl(280, 65%, 60%)', 'hsl(25, 95%, 53%)', 'hsl(340, 82%, 52%)'];
const MARKETPLACE_COLORS: Record<string, string> = {
  shopify: '#6EE7B7',
  amazon: '#FB923C',
  bestbuy: '#3B82F6',
  other: '#94A3B8',
};

interface ExecutiveDashboardProps {
  companyView?: 'consolidated' | string;
}

export function ExecutiveDashboard({ companyView = 'consolidated' }: ExecutiveDashboardProps) {
  const { selectedCompany, companies, isSuperAdmin } = useCompany();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('12'); // months
  const viewMode = companyView;
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalRevenue: 0, totalExpenses: 0, netProfit: 0, profitMargin: 0,
    totalOrders: 0, avgOrderValue: 0, inventoryValue: 0,
    mtdRevenue: 0, qtdRevenue: 0, ytdRevenue: 0,
    prevMtdRevenue: 0, prevQtdRevenue: 0, prevYtdRevenue: 0,
  });
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [marketplaceData, setMarketplaceData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [expenseData, setExpenseData] = useState<any[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const months = parseInt(dateRange);
      const now = new Date();
      const startDate = startOfMonth(subMonths(now, months - 1));
      const mtdStart = startOfMonth(now);
      const qtdStart = startOfQuarter(now);
      const ytdStart = startOfYear(now);
      const prevMtdStart = startOfMonth(subMonths(now, 1));
      const prevMtdEnd = endOfMonth(subMonths(now, 1));

      // Build company filter
      const companyFilter = viewMode !== 'consolidated'
        ? `company_id.eq.${viewMode}`
        : null;

      // Fetch sales
      let salesQuery = supabase
        .from('sales')
        .select('id, sale_price, profit, marketplace, sale_date, company_id, devices(brand, model, category)')
        .gte('sale_date', startDate.toISOString())
        .limit(5000);
      
      if (companyFilter) salesQuery = salesQuery.or(companyFilter);
      const { data: sales } = await salesQuery;

      // Fetch expenses
      let expensesQuery = supabase
        .from('expenses')
        .select('id, amount, gst_hst_amount, pst_amount, category, expense_date, company_id, is_shared, allocation_ves, allocation_tgw')
        .gte('expense_date', startDate.toISOString().split('T')[0])
        .limit(5000);
      
      if (companyFilter) expensesQuery = expensesQuery.or(`${companyFilter},is_shared.eq.true`);
      const { data: expenses } = await expensesQuery;

      // Fetch devices for inventory
      let devicesQuery = supabase
        .from('devices')
        .select('cost_price, status, company_id')
        .eq('status', 'in_stock')
        .limit(5000);
      
      if (companyFilter) devicesQuery = devicesQuery.or(companyFilter);
      const { data: devices } = await devicesQuery;

      // Calculate effective expense for company view
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

      // Calculate metrics
      const totalRevenue = sales?.reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;
      const totalProfit = sales?.reduce((sum, s) => sum + Number(s.profit || 0), 0) || 0;
      const totalExpenses = expenses?.reduce((sum, e) => sum + getEffectiveExpense(e), 0) || 0;
      const netProfit = totalProfit - totalExpenses;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
      const totalOrders = sales?.length || 0;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      const inventoryValue = devices?.reduce((sum, d) => sum + Number(d.cost_price), 0) || 0;

      // Period calculations
      const mtdRevenue = sales?.filter(s => new Date(s.sale_date) >= mtdStart)
        .reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;
      const qtdRevenue = sales?.filter(s => new Date(s.sale_date) >= qtdStart)
        .reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;
      const ytdRevenue = sales?.filter(s => new Date(s.sale_date) >= ytdStart)
        .reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;

      setMetrics({
        totalRevenue, totalExpenses, netProfit, profitMargin,
        totalOrders, avgOrderValue, inventoryValue,
        mtdRevenue, qtdRevenue, ytdRevenue,
        prevMtdRevenue: 0, prevQtdRevenue: 0, prevYtdRevenue: 0,
      });

      // Monthly revenue trend
      const monthlyData: Record<string, { revenue: number; profit: number; expenses: number }> = {};
      for (let i = 0; i < months; i++) {
        const date = subMonths(now, months - 1 - i);
        monthlyData[format(date, 'MMM')] = { revenue: 0, profit: 0, expenses: 0 };
      }

      sales?.forEach(s => {
        const key = format(new Date(s.sale_date), 'MMM');
        if (monthlyData[key]) {
          monthlyData[key].revenue += Number(s.sale_price);
          monthlyData[key].profit += Number(s.profit || 0);
        }
      });

      expenses?.forEach(e => {
        const key = format(new Date(e.expense_date), 'MMM');
        if (monthlyData[key]) {
          monthlyData[key].expenses += getEffectiveExpense(e);
        }
      });

      setRevenueData(Object.entries(monthlyData).map(([month, data]) => ({
        month, ...data, netProfit: data.profit - data.expenses,
      })));

      // Marketplace breakdown
      const marketplaceTotals: Record<string, number> = {};
      sales?.forEach(s => {
        marketplaceTotals[s.marketplace] = (marketplaceTotals[s.marketplace] || 0) + Number(s.sale_price);
      });
      setMarketplaceData(Object.entries(marketplaceTotals).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
        color: MARKETPLACE_COLORS[name] || MARKETPLACE_COLORS.other,
      })));

      // Category breakdown
      const categoryTotals: Record<string, number> = {};
      sales?.forEach(s => {
        const device = s.devices as any;
        const cat = device?.category || 'Other';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(s.sale_price);
      });
      setCategoryData(Object.entries(categoryTotals).map(([name, value], i) => ({
        name, value, fill: COLORS[i % COLORS.length],
      })));

      // Top products
      const productTotals: Record<string, { sold: number; revenue: number }> = {};
      sales?.forEach(s => {
        const device = s.devices as any;
        if (device) {
          const key = `${device.brand} ${device.model}`;
          if (!productTotals[key]) productTotals[key] = { sold: 0, revenue: 0 };
          productTotals[key].sold += 1;
          productTotals[key].revenue += Number(s.sale_price);
        }
      });
      setTopProducts(
        Object.entries(productTotals)
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10)
      );

      // Expense breakdown
      const expenseTotals: Record<string, number> = {};
      expenses?.forEach(e => {
        const cat = e.category;
        expenseTotals[cat] = (expenseTotals[cat] || 0) + getEffectiveExpense(e);
      });
      setExpenseData(Object.entries(expenseTotals).map(([name, value], i) => ({
        name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value,
        fill: COLORS[i % COLORS.length],
      })));

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse"><CardContent className="h-28" /></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Last 3 months</SelectItem>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 ml-auto px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <Activity className="h-4 w-4 text-emerald-500 animate-pulse" />
          <span className="text-sm text-emerald-500 font-medium">Live</span>
        </div>
      </div>

      {/* Period Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Month to Date</p>
            <p className="text-2xl font-bold">{formatCurrency(metrics.mtdRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Quarter to Date</p>
            <p className="text-2xl font-bold">{formatCurrency(metrics.qtdRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Year to Date</p>
            <p className="text-2xl font-bold">{formatCurrency(metrics.ytdRevenue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(metrics.totalRevenue)}
          change={`${metrics.totalOrders} orders`}
          changeType="positive"
          icon={TrendingUp}
        />
        <MetricCard
          title="Net Profit"
          value={formatCurrency(metrics.netProfit)}
          change={`${metrics.profitMargin.toFixed(1)}% margin`}
          changeType={metrics.netProfit >= 0 ? 'positive' : 'negative'}
          icon={DollarSign}
        />
        <MetricCard
          title="Total Expenses"
          value={formatCurrency(metrics.totalExpenses)}
          changeType="negative"
          icon={TrendingDown}
        />
        <MetricCard
          title="Inventory Value"
          value={formatCurrency(metrics.inventoryValue)}
          icon={Package}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard
          title="Total Orders"
          value={metrics.totalOrders.toLocaleString()}
          icon={ShoppingCart}
        />
        <MetricCard
          title="Avg Order Value"
          value={formatCurrency(metrics.avgOrderValue)}
          icon={Wallet}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Revenue & Profit Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorRevenue)" name="Revenue" />
                  <Area type="monotone" dataKey="netProfit" stroke="hsl(142, 71%, 45%)" fillOpacity={1} fill="url(#colorProfit)" name="Net Profit" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Marketplace Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Marketplace</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={marketplaceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {marketplaceData.map((entry, index) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Expense Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseData.slice(0, 6)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    nameKey="name"
                  >
                    {expenseData.slice(0, 6).map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Products by Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          {topProducts.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No sales data yet</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {topProducts.map((product, index) => (
                <div key={product.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.sold} units</p>
                    </div>
                  </div>
                  <span className="font-semibold">{formatCurrency(product.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sales by Category */}
      <Card>
        <CardHeader>
          <CardTitle>Sales by Product Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={100} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {categoryData.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
