import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge, MarketplaceBadge } from '@/components/ui/status-badge';
import { 
  Smartphone, 
  DollarSign, 
  TrendingUp, 
  Package, 
  ShoppingCart, 
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Wallet,
  Activity
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays } from 'date-fns';

interface DashboardStats {
  totalDevices: number;
  inStockDevices: number;
  totalInventoryValue: number;
  totalSales: number;
  totalRevenue: number;
  totalProfit: number;
  totalExpenses: number;
}

interface RecentSale {
  id: string;
  order_number: string;
  marketplace: 'shopify' | 'amazon' | 'bestbuy' | 'other';
  sale_price: number;
  profit: number;
  sale_date: string;
  device?: {
    model: string;
    brand: string;
  };
}

interface ChartData {
  date: string;
  revenue: number;
  profit: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalDevices: 0,
    inStockDevices: 0,
    totalInventoryValue: 0,
    totalSales: 0,
    totalRevenue: 0,
    totalProfit: 0,
    totalExpenses: 0,
  });
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch device stats
      const { data: devices, error: devicesError } = await supabase
        .from('devices')
        .select('status, cost_price');

      if (devicesError) throw devicesError;

      const totalDevices = devices?.length || 0;
      const inStockDevices = devices?.filter(d => d.status === 'in_stock').length || 0;
      const totalInventoryValue = devices
        ?.filter(d => d.status === 'in_stock')
        .reduce((sum, d) => sum + Number(d.cost_price), 0) || 0;

      // Fetch sales stats
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('sale_price, profit, sale_date');

      if (salesError) throw salesError;

      const totalSales = sales?.length || 0;
      const totalRevenue = sales?.reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;
      const totalProfit = sales?.reduce((sum, s) => sum + Number(s.profit || 0), 0) || 0;

      // Fetch expenses
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount');

      const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

      setStats({
        totalDevices,
        inStockDevices,
        totalInventoryValue,
        totalSales,
        totalRevenue,
        totalProfit,
        totalExpenses,
      });

      // Generate chart data for last 7 days
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(new Date(), 6 - i);
        const dateStr = format(date, 'yyyy-MM-dd');
        const daySales = sales?.filter(s => 
          format(new Date(s.sale_date), 'yyyy-MM-dd') === dateStr
        ) || [];
        
        return {
          date: format(date, 'EEE'),
          revenue: daySales.reduce((sum, s) => sum + Number(s.sale_price), 0),
          profit: daySales.reduce((sum, s) => sum + Number(s.profit || 0), 0),
        };
      });
      setChartData(last7Days);

      // Fetch recent sales
      const { data: recentSalesData, error: recentSalesError } = await supabase
        .from('sales')
        .select(`
          id,
          order_number,
          marketplace,
          sale_price,
          profit,
          sale_date,
          devices (
            model,
            brand
          )
        `)
        .order('sale_date', { ascending: false })
        .limit(5);

      if (recentSalesError) throw recentSalesError;

      setRecentSales((recentSalesData || []).map(sale => ({
        ...sale,
        device: sale.devices as unknown as { model: string; brand: string } | undefined,
      })));
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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

  const netProfit = stats.totalProfit - stats.totalExpenses;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Welcome back! Here's your business overview.</p>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/50 border border-border">
            <Activity className="h-4 w-4 text-success animate-pulse" />
            <span className="text-sm text-muted-foreground">Live</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="metric-card group">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold font-display mt-1">{formatCurrency(stats.totalRevenue)}</p>
                  <div className="flex items-center gap-1 mt-2 text-success text-sm">
                    <ArrowUpRight className="h-3 w-3" />
                    <span>+{stats.totalSales} sales</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl gradient-primary group-hover:scale-110 transition-transform">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="metric-card group">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Net Profit</p>
                  <p className={`text-2xl font-bold font-display mt-1 ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(netProfit)}
                  </p>
                  <div className={`flex items-center gap-1 mt-2 text-sm ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {netProfit >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    <span>After expenses</span>
                  </div>
                </div>
                <div className={`p-3 rounded-xl group-hover:scale-110 transition-transform ${netProfit >= 0 ? 'gradient-accent' : 'bg-destructive/20'}`}>
                  <DollarSign className={`h-5 w-5 ${netProfit >= 0 ? 'text-white' : 'text-destructive'}`} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="metric-card group">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">In Stock</p>
                  <p className="text-2xl font-bold font-display mt-1">{stats.inStockDevices}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {Math.round((stats.inStockDevices / Math.max(stats.totalDevices, 1)) * 100)}% of {stats.totalDevices} devices
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-secondary/20 group-hover:scale-110 transition-transform">
                  <Package className="h-5 w-5 text-secondary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="metric-card group">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Inventory Value</p>
                  <p className="text-2xl font-bold font-display mt-1">{formatCurrency(stats.totalInventoryValue)}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Current stock value
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-warning/20 group-hover:scale-110 transition-transform">
                  <Wallet className="h-5 w-5 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 border-border/50">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Revenue Trend (Last 7 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(220, 100%, 60%)" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="hsl(220, 100%, 60%)" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(175, 80%, 45%)" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="hsl(175, 80%, 45%)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 15%, 18%)" />
                    <XAxis dataKey="date" stroke="hsl(240, 10%, 55%)" />
                    <YAxis stroke="hsl(240, 10%, 55%)" tickFormatter={(val) => `$${val}`} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(240, 15%, 9%)', 
                        border: '1px solid hsl(240, 15%, 18%)',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(220, 100%, 60%)" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                    <Area type="monotone" dataKey="profit" stroke="hsl(175, 80%, 45%)" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span className="text-sm text-muted-foreground">Revenue</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-accent" />
                  <span className="text-sm text-muted-foreground">Profit</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                Recent Sales
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentSales.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <AlertCircle className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No sales recorded yet</p>
                  <p className="text-sm text-muted-foreground">Sales will appear here once you start selling</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentSales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {sale.device ? `${sale.device.brand} ${sale.device.model}` : 'Unknown Device'}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            #{sale.order_number}
                          </span>
                          <MarketplaceBadge marketplace={sale.marketplace} />
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <p className="font-semibold">{formatCurrency(Number(sale.sale_price))}</p>
                        <p className={`text-xs ${Number(sale.profit) > 0 ? 'text-success' : 'text-destructive'}`}>
                          {Number(sale.profit) > 0 ? '+' : ''}{formatCurrency(Number(sale.profit))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="interactive-card">
            <CardContent className="pt-6 text-center">
              <div className="w-12 h-12 rounded-xl gradient-primary mx-auto mb-4 flex items-center justify-center">
                <Smartphone className="h-6 w-6 text-white" />
              </div>
              <h3 className="font-display font-semibold">Inventory</h3>
              <p className="text-sm text-muted-foreground mt-1">Manage your device stock</p>
            </CardContent>
          </Card>
          <Card className="interactive-card">
            <CardContent className="pt-6 text-center">
              <div className="w-12 h-12 rounded-xl gradient-accent mx-auto mb-4 flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <h3 className="font-display font-semibold">Reports</h3>
              <p className="text-sm text-muted-foreground mt-1">View detailed analytics</p>
            </CardContent>
          </Card>
          <Card className="interactive-card">
            <CardContent className="pt-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-secondary mx-auto mb-4 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
              <h3 className="font-display font-semibold">Accounting</h3>
              <p className="text-sm text-muted-foreground mt-1">Track P&L and expenses</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
