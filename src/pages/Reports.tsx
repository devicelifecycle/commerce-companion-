import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { FileText, Download, TrendingUp, DollarSign, Package } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';

interface ReportData {
  salesByMarketplace: { name: string; value: number; color: string }[];
  monthlyRevenue: { month: string; revenue: number; profit: number }[];
  topDevices: { model: string; sold: number; revenue: number }[];
  expensesByCategory: { category: string; amount: number }[];
}

const MARKETPLACE_COLORS: Record<string, string> = {
  shopify: '#6EE7B7',
  amazon: '#FB923C',
  bestbuy: '#3B82F6',
  other: '#94A3B8',
};

export default function Reports() {
  const [reportData, setReportData] = useState<ReportData>({
    salesByMarketplace: [],
    monthlyRevenue: [],
    topDevices: [],
    expensesByCategory: [],
  });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('6');

  useEffect(() => {
    fetchReportData();
  }, [period]);

  const fetchReportData = async () => {
    try {
      const months = parseInt(period);
      const startDate = startOfMonth(subMonths(new Date(), months - 1));

      // Fetch sales with devices
      const { data: sales } = await supabase
        .from('sales')
        .select(`
          marketplace,
          sale_price,
          profit,
          sale_date,
          devices (brand, model)
        `)
        .gte('sale_date', startDate.toISOString());

      // Fetch expenses
      const { data: expenses } = await supabase
        .from('expenses')
        .select('category, amount')
        .gte('expense_date', startDate.toISOString().split('T')[0]);

      // Sales by marketplace
      const marketplaceSales: Record<string, number> = {};
      sales?.forEach(sale => {
        const mp = sale.marketplace;
        marketplaceSales[mp] = (marketplaceSales[mp] || 0) + Number(sale.sale_price);
      });

      const salesByMarketplace = Object.entries(marketplaceSales).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
        color: MARKETPLACE_COLORS[name] || MARKETPLACE_COLORS.other,
      }));

      // Monthly revenue
      const monthlyStats: Record<string, { revenue: number; profit: number }> = {};
      for (let i = 0; i < months; i++) {
        const date = subMonths(new Date(), months - 1 - i);
        const key = format(date, 'MMM yyyy');
        monthlyStats[key] = { revenue: 0, profit: 0 };
      }

      sales?.forEach(sale => {
        const key = format(new Date(sale.sale_date), 'MMM yyyy');
        if (monthlyStats[key]) {
          monthlyStats[key].revenue += Number(sale.sale_price);
          monthlyStats[key].profit += Number(sale.profit || 0);
        }
      });

      const monthlyRevenue = Object.entries(monthlyStats).map(([month, data]) => ({
        month,
        revenue: data.revenue,
        profit: data.profit,
      }));

      // Top devices
      const deviceSales: Record<string, { sold: number; revenue: number }> = {};
      sales?.forEach(sale => {
        const device = sale.devices as { brand: string; model: string } | null;
        if (device) {
          const key = `${device.brand} ${device.model}`;
          if (!deviceSales[key]) {
            deviceSales[key] = { sold: 0, revenue: 0 };
          }
          deviceSales[key].sold += 1;
          deviceSales[key].revenue += Number(sale.sale_price);
        }
      });

      const topDevices = Object.entries(deviceSales)
        .map(([model, data]) => ({ model, ...data }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      // Expenses by category
      const categoryExpenses: Record<string, number> = {};
      expenses?.forEach(expense => {
        const cat = expense.category;
        categoryExpenses[cat] = (categoryExpenses[cat] || 0) + Number(expense.amount);
      });

      const expensesByCategory = Object.entries(categoryExpenses)
        .map(([category, amount]) => ({
          category: category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          amount,
        }))
        .sort((a, b) => b.amount - a.amount);

      setReportData({
        salesByMarketplace,
        monthlyRevenue,
        topDevices,
        expensesByCategory,
      });
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);
  };

  const totalSales = reportData.salesByMarketplace.reduce((sum, s) => sum + s.value, 0);
  const totalProfit = reportData.monthlyRevenue.reduce((sum, m) => sum + m.profit, 0);
  const totalExpenses = reportData.expensesByCategory.reduce((sum, e) => sum + e.amount, 0);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-muted rounded w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">Reports & Analytics</h1>
            <p className="text-muted-foreground mt-1">Business insights and performance metrics</p>
          </div>
          <div className="flex gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Last 3 months</SelectItem>
                <SelectItem value="6">Last 6 months</SelectItem>
                <SelectItem value="12">Last 12 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="metric-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Sales</p>
                  <p className="text-2xl font-bold font-display">{formatCurrency(totalSales)}</p>
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
                  <p className="text-sm text-muted-foreground">Total Profit</p>
                  <p className="text-2xl font-bold font-display text-success">{formatCurrency(totalProfit)}</p>
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
                  <p className="text-sm text-muted-foreground">Total Expenses</p>
                  <p className="text-2xl font-bold font-display text-destructive">{formatCurrency(totalExpenses)}</p>
                </div>
                <div className="p-3 rounded-xl bg-destructive/20">
                  <Package className="h-5 w-5 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-display">Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reportData.monthlyRevenue} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 15%, 18%)" />
                    <XAxis dataKey="month" stroke="hsl(240, 10%, 55%)" fontSize={12} />
                    <YAxis stroke="hsl(240, 10%, 55%)" fontSize={12} tickFormatter={(val) => `$${val/1000}k`} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(240, 15%, 9%)', 
                        border: '1px solid hsl(240, 15%, 18%)',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Bar dataKey="revenue" fill="hsl(220, 100%, 60%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" fill="hsl(155, 75%, 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-display">Sales by Marketplace</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={reportData.salesByMarketplace}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {reportData.salesByMarketplace.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(240, 15%, 9%)', 
                        border: '1px solid hsl(240, 15%, 18%)',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-display">Top Selling Devices</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {reportData.topDevices.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No sales data yet</p>
                ) : (
                  reportData.topDevices.map((device, index) => (
                    <div key={device.model} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-medium">{device.model}</p>
                          <p className="text-xs text-muted-foreground">{device.sold} units sold</p>
                        </div>
                      </div>
                      <span className="font-semibold">{formatCurrency(device.revenue)}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-display">Expenses by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {reportData.expensesByCategory.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No expense data yet</p>
                ) : (
                  reportData.expensesByCategory.slice(0, 5).map((expense) => {
                    const percentage = totalExpenses > 0 ? (expense.amount / totalExpenses) * 100 : 0;
                    return (
                      <div key={expense.category} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{expense.category}</span>
                          <span className="font-medium">{formatCurrency(expense.amount)}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full gradient-primary rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
