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
      <div className="space-y-8 animate-fade-in">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Welcome back! Here's your business overview.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-success/10 border border-success/30">
              <Activity className="h-4 w-4 text-success animate-pulse" />
              <span className="text-sm font-medium text-success">Live</span>
            </div>
          </div>
        </div>

        {/* Section 1: Alerts & Activity */}
        <section className="section-container">
          <div className="section-header">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <AlertCircle className="section-icon" />
            </div>
            <div>
              <h2 className="section-title">Alerts & Activity</h2>
              <p className="text-sm text-muted-foreground">Important notifications and recent actions</p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-1">
              <AlertsPanel />
            </div>
            <div className="lg:col-span-2">
              <QuickStats />
            </div>
          </div>
        </section>

        {/* Section 2: Analytics & Performance */}
        <section className="section-container">
          <div className="section-header">
            <div className="h-10 w-10 rounded-xl bg-secondary/15 flex items-center justify-center">
              <Activity className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <h2 className="section-title">Analytics & Performance</h2>
              <p className="text-sm text-muted-foreground">Revenue trends and financial insights</p>
            </div>
          </div>
          <ExecutiveDashboard />
        </section>

        {/* Section 3: Recent Sales */}
        <section className="section-container">
          <div className="section-header">
            <div className="h-10 w-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="section-title">Recent Sales</h2>
              <p className="text-sm text-muted-foreground">Latest transactions and orders</p>
            </div>
          </div>
          
          {recentSales.length === 0 ? (
            <div className="subsection flex flex-col items-center justify-center py-10 text-center">
              <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <ShoppingCart className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground">No sales recorded yet</p>
              <p className="text-sm text-muted-foreground mt-1">Sales will appear here once you start selling</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              {recentSales.map((sale) => (
                <div
                  key={sale.id}
                  className="interactive-card flex items-center justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {sale.device ? `${sale.device.brand} ${sale.device.model}` : 'Unknown Device'}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-muted-foreground font-mono">
                        #{sale.order_number}
                      </span>
                      <MarketplaceBadge marketplace={sale.marketplace} />
                    </div>
                  </div>
                  <div className="text-right ml-3">
                    <p className="font-semibold text-primary">{formatCurrency(Number(sale.sale_price))}</p>
                    <p className={`text-sm font-medium ${Number(sale.profit) > 0 ? 'text-success' : 'text-destructive'}`}>
                      {Number(sale.profit) > 0 ? '+' : ''}{formatCurrency(Number(sale.profit))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
