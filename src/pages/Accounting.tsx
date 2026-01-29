import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, Percent, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface AccountingStats {
  totalRevenue: number;
  totalCOGS: number;
  totalExpenses: number;
  grossProfit: number;
  netProfit: number;
  profitMargin: number;
}

interface MonthlyData {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export default function Accounting() {
  const [stats, setStats] = useState<AccountingStats>({
    totalRevenue: 0,
    totalCOGS: 0,
    totalExpenses: 0,
    grossProfit: 0,
    netProfit: 0,
    profitMargin: 0,
  });
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAccountingData();
  }, []);

  const fetchAccountingData = async () => {
    try {
      // Fetch sales data
      const { data: sales } = await supabase
        .from('sales')
        .select('sale_price, profit, sale_date');

      // Fetch expenses data
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount, expense_date');

      // Fetch device costs (COGS)
      const { data: soldDevices } = await supabase
        .from('devices')
        .select('cost_price')
        .eq('status', 'sold');

      const totalRevenue = sales?.reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;
      const totalCOGS = soldDevices?.reduce((sum, d) => sum + Number(d.cost_price), 0) || 0;
      const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
      const grossProfit = totalRevenue - totalCOGS;
      const netProfit = grossProfit - totalExpenses;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      setStats({
        totalRevenue,
        totalCOGS,
        totalExpenses,
        grossProfit,
        netProfit,
        profitMargin,
      });

      // Generate monthly data for the chart
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const currentYear = new Date().getFullYear();
      
      const monthlyStats = months.map((month, index) => {
        const monthSales = sales?.filter(s => {
          const date = new Date(s.sale_date);
          return date.getMonth() === index && date.getFullYear() === currentYear;
        }) || [];
        
        const monthExpenses = expenses?.filter(e => {
          const date = new Date(e.expense_date);
          return date.getMonth() === index && date.getFullYear() === currentYear;
        }) || [];

        const revenue = monthSales.reduce((sum, s) => sum + Number(s.sale_price), 0);
        const exp = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

        return {
          month,
          revenue,
          expenses: exp,
          profit: revenue - exp,
        };
      });

      setMonthlyData(monthlyStats);
    } catch (error) {
      console.error('Error fetching accounting data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);
  };

  const COLORS = ['hsl(220, 100%, 60%)', 'hsl(175, 80%, 45%)', 'hsl(270, 60%, 50%)', 'hsl(0, 85%, 60%)'];

  const pieData = [
    { name: 'Revenue', value: stats.totalRevenue },
    { name: 'COGS', value: stats.totalCOGS },
    { name: 'Expenses', value: stats.totalExpenses },
  ].filter(d => d.value > 0);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-muted rounded w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-36 bg-muted rounded-xl" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold gradient-text">Accounting Overview</h1>
          <p className="text-muted-foreground mt-1">Profit & Loss analysis and financial insights</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold font-display">{formatCurrency(stats.totalRevenue)}</p>
                  <div className="flex items-center gap-1 mt-1 text-success text-sm">
                    <ArrowUpRight className="h-3 w-3" />
                    <span>All time</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl gradient-primary">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Gross Profit</p>
                  <p className="text-2xl font-bold font-display">{formatCurrency(stats.grossProfit)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Revenue - COGS</p>
                </div>
                <div className="p-3 rounded-xl bg-success/20">
                  <DollarSign className="h-5 w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Net Profit</p>
                  <p className={`text-2xl font-bold font-display ${stats.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(stats.netProfit)}
                  </p>
                  <div className={`flex items-center gap-1 mt-1 text-sm ${stats.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {stats.netProfit >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    <span>After expenses</span>
                  </div>
                </div>
                <div className={`p-3 rounded-xl ${stats.netProfit >= 0 ? 'gradient-accent' : 'bg-destructive/20'}`}>
                  {stats.netProfit >= 0 ? 
                    <TrendingUp className="h-5 w-5 text-white" /> : 
                    <TrendingDown className="h-5 w-5 text-destructive" />
                  }
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Profit Margin</p>
                  <p className={`text-2xl font-bold font-display ${stats.profitMargin >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {stats.profitMargin.toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Net / Revenue</p>
                </div>
                <div className="p-3 rounded-xl bg-secondary/20">
                  <Percent className="h-5 w-5 text-secondary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 border-border/50">
            <CardHeader>
              <CardTitle className="font-display">Monthly Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(220, 100%, 60%)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(220, 100%, 60%)" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(155, 75%, 45%)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(155, 75%, 45%)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 15%, 18%)" />
                    <XAxis dataKey="month" stroke="hsl(240, 10%, 55%)" />
                    <YAxis stroke="hsl(240, 10%, 55%)" tickFormatter={(val) => `$${val/1000}k`} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(240, 15%, 9%)', 
                        border: '1px solid hsl(240, 15%, 18%)',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(220, 100%, 60%)" fillOpacity={1} fill="url(#colorRevenue)" />
                    <Area type="monotone" dataKey="profit" stroke="hsl(155, 75%, 45%)" fillOpacity={1} fill="url(#colorProfit)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span className="text-sm text-muted-foreground">Revenue</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-success" />
                  <span className="text-sm text-muted-foreground">Profit</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-display">P&L Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">Revenue</span>
                  <span className="font-semibold text-success">+{formatCurrency(stats.totalRevenue)}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">Cost of Goods Sold</span>
                  <span className="font-semibold text-destructive">-{formatCurrency(stats.totalCOGS)}</span>
                </div>
                <div className="border-t border-border pt-2">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-success/10">
                    <span className="font-medium">Gross Profit</span>
                    <span className="font-bold text-success">{formatCurrency(stats.grossProfit)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">Operating Expenses</span>
                  <span className="font-semibold text-destructive">-{formatCurrency(stats.totalExpenses)}</span>
                </div>
                <div className="border-t border-border pt-2">
                  <div className={`flex justify-between items-center p-3 rounded-lg ${stats.netProfit >= 0 ? 'bg-success/10' : 'bg-destructive/10'}`}>
                    <span className="font-medium">Net Profit</span>
                    <span className={`font-bold ${stats.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(stats.netProfit)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
