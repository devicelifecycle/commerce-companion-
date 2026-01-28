import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MetricCard } from '@/components/ui/metric-card';
import { StatusBadge, MarketplaceBadge } from '@/components/ui/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Smartphone, DollarSign, TrendingUp, Package, ShoppingCart, AlertCircle } from 'lucide-react';

interface DashboardStats {
  totalDevices: number;
  inStockDevices: number;
  totalInventoryValue: number;
  totalSales: number;
  totalRevenue: number;
  totalProfit: number;
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

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalDevices: 0,
    inStockDevices: 0,
    totalInventoryValue: 0,
    totalSales: 0,
    totalRevenue: 0,
    totalProfit: 0,
  });
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
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
        .select('sale_price, profit');

      if (salesError) throw salesError;

      const totalSales = sales?.length || 0;
      const totalRevenue = sales?.reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;
      const totalProfit = sales?.reduce((sum, s) => sum + Number(s.profit || 0), 0) || 0;

      setStats({
        totalDevices,
        inStockDevices,
        totalInventoryValue,
        totalSales,
        totalRevenue,
        totalProfit,
      });

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
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded-lg" />
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
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's your inventory overview.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Devices"
            value={stats.totalDevices}
            icon={Smartphone}
          />
          <MetricCard
            title="In Stock"
            value={stats.inStockDevices}
            change={`${Math.round((stats.inStockDevices / Math.max(stats.totalDevices, 1)) * 100)}% of inventory`}
            changeType="neutral"
            icon={Package}
          />
          <MetricCard
            title="Inventory Value"
            value={formatCurrency(stats.totalInventoryValue)}
            icon={DollarSign}
          />
          <MetricCard
            title="Total Profit"
            value={formatCurrency(stats.totalProfit)}
            change={`From ${stats.totalSales} sales`}
            changeType={stats.totalProfit > 0 ? 'positive' : 'neutral'}
            icon={TrendingUp}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Recent Sales
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentSales.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <AlertCircle className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No sales recorded yet</p>
                  <p className="text-sm text-muted-foreground">Sales will appear here once you start selling devices</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentSales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div>
                        <p className="font-medium">
                          {sale.device ? `${sale.device.brand} ${sale.device.model}` : 'Unknown Device'}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm text-muted-foreground">
                            #{sale.order_number}
                          </span>
                          <MarketplaceBadge marketplace={sale.marketplace} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(Number(sale.sale_price))}</p>
                        <p className={`text-sm ${Number(sale.profit) > 0 ? 'text-success' : 'text-destructive'}`}>
                          {Number(sale.profit) > 0 ? '+' : ''}{formatCurrency(Number(sale.profit))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Quick Stats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">Total Revenue</span>
                  <span className="font-semibold">{formatCurrency(stats.totalRevenue)}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">Average Sale Price</span>
                  <span className="font-semibold">
                    {formatCurrency(stats.totalSales > 0 ? stats.totalRevenue / stats.totalSales : 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">Profit Margin</span>
                  <span className="font-semibold">
                    {stats.totalRevenue > 0 
                      ? `${Math.round((stats.totalProfit / stats.totalRevenue) * 100)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">Average Cost</span>
                  <span className="font-semibold">
                    {formatCurrency(stats.inStockDevices > 0 ? stats.totalInventoryValue / stats.inStockDevices : 0)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
