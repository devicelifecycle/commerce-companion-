import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Activity, Package, FileText, RotateCcw, Clock, DollarSign,
  ShoppingCart, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { format, subHours, subDays, differenceInMinutes } from 'date-fns';

interface QuickStat {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  link?: string;
}

interface RecentActivity {
  id: string;
  type: 'sale' | 'purchase' | 'expense' | 'return';
  description: string;
  amount?: number;
  timestamp: Date;
}

export function QuickStats() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    pendingPOs: number;
    pendingSettlements: number;
    returnsToProcess: number;
    last24hSales: number;
    last24hRevenue: number;
    last24hExpenses: number;
    newInventory: number;
  }>({
    pendingPOs: 0,
    pendingSettlements: 0,
    returnsToProcess: 0,
    last24hSales: 0,
    last24hRevenue: 0,
    last24hExpenses: 0,
    newInventory: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);

  useEffect(() => {
    fetchStats();
  }, [selectedCompany]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const last24h = subHours(new Date(), 24);
      const companyFilter = selectedCompany?.id;

      // Pending POs
      let poQuery = supabase
        .from('purchase_orders')
        .select('id', { count: 'exact' })
        .in('status', ['pending', 'partial']);
      if (companyFilter) poQuery = poQuery.eq('company_id', companyFilter);
      const { count: pendingPOs } = await poQuery;

      // Pending Returns
      let rmaQuery = supabase
        .from('return_authorizations')
        .select('id', { count: 'exact' })
        .in('status', ['pending', 'approved']);
      if (companyFilter) rmaQuery = rmaQuery.eq('company_id', companyFilter);
      const { count: returnsToProcess } = await rmaQuery;

      // Last 24h sales
      let salesQuery = supabase
        .from('sales')
        .select('id, sale_price, order_number, sale_date, devices(brand, model)')
        .gte('sale_date', last24h.toISOString());
      if (companyFilter) salesQuery = salesQuery.eq('company_id', companyFilter);
      const { data: recentSales } = await salesQuery;

      const last24hSales = recentSales?.length || 0;
      const last24hRevenue = recentSales?.reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;

      // Last 24h expenses
      let expQuery = supabase
        .from('expenses')
        .select('id, amount, description, expense_date')
        .gte('expense_date', last24h.toISOString().split('T')[0]);
      if (companyFilter) expQuery = expQuery.eq('company_id', companyFilter);
      const { data: recentExpenses } = await expQuery;

      const last24hExpenses = recentExpenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

      // New inventory (last 24h)
      let devQuery = supabase
        .from('devices')
        .select('id, brand, model, cost_price, created_at')
        .gte('created_at', last24h.toISOString());
      if (companyFilter) devQuery = devQuery.eq('company_id', companyFilter);
      const { data: newDevices } = await devQuery;

      setStats({
        pendingPOs: pendingPOs || 0,
        pendingSettlements: 0, // Would need marketplace settlement tracking
        returnsToProcess: returnsToProcess || 0,
        last24hSales,
        last24hRevenue,
        last24hExpenses,
        newInventory: newDevices?.length || 0,
      });

      // Build recent activity feed
      const activities: RecentActivity[] = [];

      recentSales?.forEach(sale => {
        const device = sale.devices as any;
        activities.push({
          id: `sale-${sale.id}`,
          type: 'sale',
          description: device ? `${device.brand} ${device.model}` : `Order #${sale.order_number}`,
          amount: Number(sale.sale_price),
          timestamp: new Date(sale.sale_date),
        });
      });

      recentExpenses?.forEach(exp => {
        activities.push({
          id: `expense-${exp.id}`,
          type: 'expense',
          description: exp.description,
          amount: Number(exp.amount),
          timestamp: new Date(exp.expense_date),
        });
      });

      newDevices?.forEach(dev => {
        activities.push({
          id: `inventory-${dev.id}`,
          type: 'purchase',
          description: `${dev.brand} ${dev.model} added`,
          amount: Number(dev.cost_price),
          timestamp: new Date(dev.created_at),
        });
      });

      setRecentActivity(
        activities
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, 10)
      );

    } catch (error) {
      console.error('Error fetching quick stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  const getActivityIcon = (type: RecentActivity['type']) => {
    switch (type) {
      case 'sale': return <ShoppingCart className="h-4 w-4 text-emerald-500" />;
      case 'purchase': return <Package className="h-4 w-4 text-blue-500" />;
      case 'expense': return <DollarSign className="h-4 w-4 text-amber-500" />;
      case 'return': return <RotateCcw className="h-4 w-4 text-red-500" />;
    }
  };

  const formatTimeAgo = (date: Date) => {
    const minutes = differenceInMinutes(new Date(), date);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return format(date, 'MMM d');
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="animate-pulse"><CardContent className="h-40" /></Card>
        <Card className="animate-pulse"><CardContent className="h-40" /></Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Pending Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-5 w-5" />
            Pending Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Purchase Orders</span>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{stats.pendingPOs}</p>
              <p className="text-xs text-muted-foreground">awaiting receipt</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Returns</span>
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{stats.returnsToProcess}</p>
              <p className="text-xs text-muted-foreground">to process</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last 24 Hours */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5" />
            Last 24 Hours
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2">
              <p className="text-2xl font-bold text-emerald-500">{stats.last24hSales}</p>
              <p className="text-xs text-muted-foreground">Units Sold</p>
            </div>
            <div className="text-center p-2">
              <p className="text-2xl font-bold">{formatCurrency(stats.last24hRevenue)}</p>
              <p className="text-xs text-muted-foreground">Revenue</p>
            </div>
            <div className="text-center p-2">
              <p className="text-2xl font-bold">{stats.newInventory}</p>
              <p className="text-xs text-muted-foreground">New Items</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5 text-emerald-500 animate-pulse" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-center py-4 text-muted-foreground">No recent activity</p>
          ) : (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {getActivityIcon(activity.type)}
                      <div>
                        <p className="text-sm font-medium">{activity.description}</p>
                        <p className="text-xs text-muted-foreground capitalize">{activity.type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {activity.amount && (
                        <p className={`text-sm font-medium ${
                          activity.type === 'sale' ? 'text-emerald-500' :
                          activity.type === 'expense' ? 'text-amber-500' : ''
                        }`}>
                          {activity.type === 'sale' ? '+' : activity.type === 'expense' ? '-' : ''}
                          {formatCurrency(activity.amount)}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">{formatTimeAgo(activity.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
