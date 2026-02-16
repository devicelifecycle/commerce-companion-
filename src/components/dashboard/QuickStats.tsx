import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Activity, Package, FileText, RotateCcw, Clock, DollarSign,
  ShoppingCart
} from 'lucide-react';
import { format, subHours, differenceInMinutes } from 'date-fns';

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
  const [stats, setStats] = useState({
    pendingPOs: 0,
    returnsToProcess: 0,
    last24hSales: 0,
    last24hRevenue: 0,
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

      let poQuery = supabase.from('purchase_orders').select('id', { count: 'exact' }).in('status', ['pending', 'partial']);
      if (companyFilter) poQuery = poQuery.eq('company_id', companyFilter);
      const { count: pendingPOs } = await poQuery;

      let rmaQuery = supabase.from('return_authorizations').select('id', { count: 'exact' }).in('status', ['pending', 'approved']);
      if (companyFilter) rmaQuery = rmaQuery.eq('company_id', companyFilter);
      const { count: returnsToProcess } = await rmaQuery;

      let salesQuery = supabase.from('sales').select('id, sale_price, order_number, sale_date, devices(brand, model)').gte('sale_date', last24h.toISOString());
      if (companyFilter) salesQuery = salesQuery.eq('company_id', companyFilter);
      const { data: recentSales } = await salesQuery;

      let devQuery = supabase.from('devices').select('id, brand, model, cost_price, created_at').gte('created_at', last24h.toISOString());
      if (companyFilter) devQuery = devQuery.eq('company_id', companyFilter);
      const { data: newDevices } = await devQuery;

      let expQuery = supabase.from('expenses').select('id, amount, description, expense_date').gte('expense_date', last24h.toISOString().split('T')[0]);
      if (companyFilter) expQuery = expQuery.eq('company_id', companyFilter);
      const { data: recentExpenses } = await expQuery;

      setStats({
        pendingPOs: pendingPOs || 0,
        returnsToProcess: returnsToProcess || 0,
        last24hSales: recentSales?.length || 0,
        last24hRevenue: recentSales?.reduce((sum, s) => sum + Number(s.sale_price), 0) || 0,
        newInventory: newDevices?.length || 0,
      });

      const activities: RecentActivity[] = [];
      recentSales?.forEach(sale => {
        const device = sale.devices as any;
        activities.push({ id: `sale-${sale.id}`, type: 'sale', description: device ? `${device.brand} ${device.model}` : `#${sale.order_number}`, amount: Number(sale.sale_price), timestamp: new Date(sale.sale_date) });
      });
      recentExpenses?.forEach(exp => {
        activities.push({ id: `expense-${exp.id}`, type: 'expense', description: exp.description, amount: Number(exp.amount), timestamp: new Date(exp.expense_date) });
      });
      newDevices?.forEach(dev => {
        activities.push({ id: `inventory-${dev.id}`, type: 'purchase', description: `${dev.brand} ${dev.model}`, amount: Number(dev.cost_price), timestamp: new Date(dev.created_at) });
      });

      setRecentActivity(activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 8));
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
      case 'sale': return <ShoppingCart className="h-3 w-3 text-success" />;
      case 'purchase': return <Package className="h-3 w-3 text-info" />;
      case 'expense': return <DollarSign className="h-3 w-3 text-warning" />;
      case 'return': return <RotateCcw className="h-3 w-3 text-destructive" />;
    }
  };

  const formatTimeAgo = (date: Date) => {
    const minutes = differenceInMinutes(new Date(), date);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return format(date, 'MMM d');
  };

  if (loading) {
    return <div className="grid grid-cols-1 gap-3"><div className="h-48 bg-muted rounded-lg animate-pulse" /></div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full">
      {/* Snapshot row */}
      <div className="lg:col-span-4 grid grid-cols-2 gap-2 content-start">
        <div className="bg-card border border-border/60 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending POs</span>
            <FileText className="h-3 w-3 text-muted-foreground" />
          </div>
          <p className="text-xl font-bold">{stats.pendingPOs}</p>
        </div>
        <div className="bg-card border border-border/60 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Returns</span>
            <RotateCcw className="h-3 w-3 text-muted-foreground" />
          </div>
          <p className="text-xl font-bold">{stats.returnsToProcess}</p>
        </div>
        <div className="bg-card border border-border/60 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">24h Sales</span>
            <ShoppingCart className="h-3 w-3 text-success" />
          </div>
          <p className="text-xl font-bold text-success">{stats.last24hSales}</p>
          <p className="text-[10px] text-muted-foreground">{formatCurrency(stats.last24hRevenue)}</p>
        </div>
        <div className="bg-card border border-border/60 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">New Items</span>
            <Package className="h-3 w-3 text-info" />
          </div>
          <p className="text-xl font-bold">{stats.newInventory}</p>
        </div>
      </div>

      {/* Activity feed */}
      <div className="lg:col-span-8 bg-card border border-border/60 rounded-lg">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
          <Activity className="h-3.5 w-3.5 text-success animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity Feed</span>
        </div>
        {recentActivity.length === 0 ? (
          <p className="text-center py-6 text-xs text-muted-foreground">No recent activity</p>
        ) : (
          <ScrollArea className="h-[180px]">
            <div className="divide-y divide-border/30">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    {getActivityIcon(activity.type)}
                    <span className="text-xs font-medium truncate">{activity.description}</span>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0">{activity.type}</Badge>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {activity.amount && (
                      <span className={`text-xs font-medium ${activity.type === 'sale' ? 'text-success' : activity.type === 'expense' ? 'text-warning' : 'text-foreground'}`}>
                        {activity.type === 'sale' ? '+' : activity.type === 'expense' ? '-' : ''}{formatCurrency(activity.amount)}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{formatTimeAgo(activity.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
