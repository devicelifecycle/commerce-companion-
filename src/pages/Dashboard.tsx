import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ExecutiveDashboard } from '@/components/reports/ExecutiveDashboard';
import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { QuickStats } from '@/components/dashboard/QuickStats';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, MarketplaceBadge } from '@/components/ui/status-badge';
import { ShoppingCart, AlertCircle, Activity } from 'lucide-react';
import { format } from 'date-fns';

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
  const { selectedCompany, loading: companyLoading } = useCompany();
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentSales();
  }, [selectedCompany]);

  const fetchRecentSales = async () => {
    try {
      let query = supabase
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

      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      setRecentSales((data || []).map(sale => ({
        ...sale,
        device: sale.devices as unknown as { model: string; brand: string } | undefined,
      })));
    } catch (error) {
      console.error('Error fetching recent sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (loading || companyLoading) {
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Welcome back! Here's your business overview.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/50 border border-border">
            <Activity className="h-4 w-4 text-emerald-500 animate-pulse" />
            <span className="text-sm text-muted-foreground">Live</span>
          </div>
        </div>

        {/* Alerts Panel & Quick Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <AlertsPanel />
          </div>
          <div className="lg:col-span-2">
            <QuickStats />
          </div>
        </div>

        {/* Executive Dashboard */}
        <ExecutiveDashboard />

        {/* Recent Sales */}
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <h3 className="font-display font-semibold">Recent Sales</h3>
            </div>
            {recentSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertCircle className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No sales recorded yet</p>
                <p className="text-sm text-muted-foreground">Sales will appear here once you start selling</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                {recentSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate text-sm">
                        {sale.device ? `${sale.device.brand} ${sale.device.model}` : 'Unknown Device'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          #{sale.order_number}
                        </span>
                        <MarketplaceBadge marketplace={sale.marketplace} />
                      </div>
                    </div>
                    <div className="text-right ml-2">
                      <p className="font-semibold text-sm">{formatCurrency(Number(sale.sale_price))}</p>
                      <p className={`text-xs ${Number(sale.profit) > 0 ? 'text-emerald-500' : 'text-destructive'}`}>
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
    </DashboardLayout>
  );
}
