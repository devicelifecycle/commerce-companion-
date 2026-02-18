import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { QuickStats } from '@/components/dashboard/QuickStats';
import { CashPosition } from '@/components/dashboard/CashPosition';
import { InventoryValuation } from '@/components/dashboard/InventoryValuation';
import { GoalProgress } from '@/components/dashboard/GoalProgress';
import { ProfitabilityKPIs } from '@/components/dashboard/ProfitabilityKPIs';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { MarketplaceChart } from '@/components/dashboard/MarketplaceChart';
import { TopProductsChart } from '@/components/dashboard/TopProductsChart';
import { InventoryDashboard } from '@/components/inventory/InventoryDashboard';
import { AgingInventoryReport } from '@/components/inventory/AgingInventoryReport';
import { MarketplaceBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { 
  Activity, ShoppingCart, Download, CalendarIcon, LayoutDashboard, Clock, Package
} from 'lucide-react';
import { format, subDays, subMonths, startOfMonth, startOfYear } from 'date-fns';
import { DateRange } from 'react-day-picker';

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
  const { selectedCompany, loading: companyLoading, isSuperAdmin, assignments } = useCompany();
  const isAdmin = isSuperAdmin || assignments.some(a => a.role === 'admin');
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState('30days');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

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
        .limit(8);

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

  const handlePresetChange = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    switch (preset) {
      case '7days': setDateRange({ from: subDays(now, 7), to: now }); break;
      case '30days': setDateRange({ from: subDays(now, 30), to: now }); break;
      case '90days': setDateRange({ from: subDays(now, 90), to: now }); break;
      case 'mtd': setDateRange({ from: startOfMonth(now), to: now }); break;
      case 'ytd': setDateRange({ from: startOfYear(now), to: now }); break;
    }
  };

  const handleExportCSV = () => {
    const headers = ['Device', 'Order #', 'Channel', 'Revenue', 'Profit'];
    const rows = recentSales.map(s => [
      s.device ? `${s.device.brand} ${s.device.model}` : 'Unknown',
      s.order_number,
      s.marketplace,
      Number(s.sale_price).toFixed(2),
      Number(s.profit).toFixed(2),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in">
        {/* Header - compact */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold gradient-text">Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Business overview — {format(new Date(), 'EEEE, MMM d, yyyy')}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Select value={datePreset} onValueChange={handlePresetChange}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
                <SelectItem value="90days">Last 90 Days</SelectItem>
                <SelectItem value="mtd">Month to Date</SelectItem>
                <SelectItem value="ytd">Year to Date</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <CalendarIcon className="h-3 w-3" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>{format(dateRange.from, 'MMM d')} – {format(dateRange.to, 'MMM d')}</>
                    ) : format(dateRange.from, 'MMM d')
                  ) : 'Pick dates'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleExportCSV}>
              <Download className="h-3 w-3" />
              Export
            </Button>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 border border-success/30">
              <Activity className="h-3 w-3 text-success animate-pulse" />
              <span className="text-xs font-medium text-success">Live</span>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Overview
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="inventory" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Inventory Summary
                </TabsTrigger>
                <TabsTrigger value="aging" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Aging Report
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Profitability KPIs - Admin only */}
            {isAdmin && <ProfitabilityKPIs />}

            {/* Row: Alerts + Quick Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-4">
                <AlertsPanel />
              </div>
              <div className="lg:col-span-8">
                <QuickStats />
              </div>
            </div>

            {/* Financial Overview - Admin only */}
            {isAdmin && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <CashPosition />
                <InventoryValuation />
                <GoalProgress />
              </div>
            )}

            {/* Analytics - Admin only */}
            {isAdmin && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <RevenueChart />
                <MarketplaceChart />
                <TopProductsChart />
              </div>
            )}

            {/* Recent Sales */}
            <section className="section-container">
              <div className="section-header">
                <ShoppingCart className="h-4 w-4 text-accent" />
                <h2 className="section-title">Recent Sales</h2>
              </div>
              
              {recentSales.length === 0 ? (
                <div className="flex items-center justify-center py-6 text-center">
                  <div className="flex flex-col items-center">
                    <ShoppingCart className="h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No sales recorded yet</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Device</th>
                        <th>Order #</th>
                        <th>Channel</th>
                        <th className="text-right">Revenue</th>
                        <th className="text-right">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSales.map((sale) => (
                        <tr key={sale.id}>
                          <td className="font-medium">
                            {sale.device ? `${sale.device.brand} ${sale.device.model}` : 'Unknown'}
                          </td>
                          <td className="font-mono text-muted-foreground">#{sale.order_number}</td>
                          <td><MarketplaceBadge marketplace={sale.marketplace} /></td>
                          <td className="text-right font-medium text-primary">{formatCurrency(Number(sale.sale_price))}</td>
                          <td className={`text-right font-medium ${Number(sale.profit) > 0 ? 'text-success' : 'text-destructive'}`}>
                            {Number(sale.profit) > 0 ? '+' : ''}{formatCurrency(Number(sale.profit))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="inventory">
              <InventoryDashboard />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="aging">
              <AgingInventoryReport />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
