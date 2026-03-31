import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wrench, Clock, Package, TrendingUp, ArrowRight, BarChart3 } from 'lucide-react';
import { differenceInDays } from 'date-fns';

interface KPIData {
  avgDaysToSell: number;
  refurbQueueSize: number;
  refurbAvgDays: number;
  refurbCompletedThisMonth: number;
  fbaCount: number;
  localCount: number;
  fbaPercentage: number;
  avgMarginLast30: number;
  inStockCount: number;
  holdCount: number;
}

export function OperationalKPIs() {
  const { selectedCompany } = useCompany();
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKPIs();
  }, [selectedCompany]);

  const fetchKPIs = async () => {
    setLoading(true);
    try {
      const companyId = selectedCompany?.id;

      // In-stock and hold counts
      let stockQ = supabase.from('devices').select('status, fulfillment_channel, created_at, refurbishment_started_at, refurbishment_completed_at, refurbishment_status', { count: 'exact' });
      if (companyId) stockQ = stockQ.eq('company_id', companyId);
      const { data: allDevices } = await stockQ.limit(5000);

      const inStock = allDevices?.filter(d => d.status === 'in_stock') || [];
      const holdRefurb = allDevices?.filter(d => d.status === 'hold_for_refurbishment') || [];
      const fbaDevices = inStock.filter(d => d.fulfillment_channel === 'fba');
      const localDevices = inStock.filter(d => d.fulfillment_channel !== 'fba');

      // Refurb metrics
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const pendingRefurb = allDevices?.filter(d => d.refurbishment_status === 'pending' || d.refurbishment_status === 'in_progress') || [];
      const completedThisMonth = allDevices?.filter(d =>
        d.refurbishment_status === 'completed' && d.refurbishment_completed_at && new Date(d.refurbishment_completed_at) >= monthStart
      ) || [];

      // Avg refurb days
      let totalRefurbDays = 0, refurbCount = 0;
      allDevices?.forEach(d => {
        if (d.refurbishment_started_at && d.refurbishment_completed_at) {
          const days = differenceInDays(new Date(d.refurbishment_completed_at), new Date(d.refurbishment_started_at));
          if (days >= 0) { totalRefurbDays += days; refurbCount++; }
        }
      });

      // Avg days to sell (last 30 days sales)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      let salesQ = supabase
        .from('sales')
        .select('sale_date, sale_price, profit, devices(created_at, cost_price)')
        .gte('sale_date', thirtyDaysAgo.toISOString())
        .limit(1000);
      if (companyId) salesQ = salesQ.eq('company_id', companyId);
      const { data: recentSales } = await salesQ;

      let totalDaysToSell = 0, soldCount = 0, totalMargin = 0;
      recentSales?.forEach(s => {
        const dev = s.devices as any;
        if (dev?.created_at) {
          const days = differenceInDays(new Date(s.sale_date), new Date(dev.created_at));
          if (days >= 0) { totalDaysToSell += days; soldCount++; }
        }
        if (s.sale_price && s.profit != null) {
          totalMargin += (Number(s.profit) / Number(s.sale_price)) * 100;
        }
      });

      setData({
        avgDaysToSell: soldCount > 0 ? Math.round(totalDaysToSell / soldCount) : 0,
        refurbQueueSize: pendingRefurb.length,
        refurbAvgDays: refurbCount > 0 ? Math.round(totalRefurbDays / refurbCount) : 0,
        refurbCompletedThisMonth: completedThisMonth.length,
        fbaCount: fbaDevices.length,
        localCount: localDevices.length,
        fbaPercentage: inStock.length > 0 ? (fbaDevices.length / inStock.length) * 100 : 0,
        avgMarginLast30: soldCount > 0 ? totalMargin / soldCount : 0,
        inStockCount: inStock.length,
        holdCount: holdRefurb.length,
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />)}
      </div>
    );
  }

  const kpis = [
    {
      icon: Clock,
      label: 'Avg Days to Sell',
      value: `${data.avgDaysToSell}d`,
      sub: `${data.inStockCount} in stock`,
      color: data.avgDaysToSell <= 30 ? 'text-success' : data.avgDaysToSell <= 60 ? 'text-warning' : 'text-destructive',
      ic: 'text-info',
    },
    {
      icon: Wrench,
      label: 'Refurb Throughput',
      value: `${data.refurbCompletedThisMonth}/mo`,
      sub: `${data.refurbQueueSize} in queue · ${data.refurbAvgDays}d avg`,
      color: '',
      ic: 'text-warning',
    },
    {
      icon: Package,
      label: 'FBA vs Local',
      value: `${data.fbaPercentage.toFixed(0)}% FBA`,
      sub: `${data.fbaCount} FBA · ${data.localCount} local`,
      color: '',
      ic: 'text-primary',
    },
    {
      icon: TrendingUp,
      label: 'Avg Margin (30d)',
      value: `${data.avgMarginLast30.toFixed(1)}%`,
      sub: `${data.holdCount} pending refurb`,
      color: data.avgMarginLast30 >= 20 ? 'text-success' : data.avgMarginLast30 >= 10 ? 'text-warning' : 'text-destructive',
      ic: 'text-success',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {kpis.map(kpi => (
        <div key={kpi.label} className="bg-card border border-border/60 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <kpi.icon className={`h-3 w-3 ${kpi.ic}`} />
            <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider truncate">{kpi.label}</span>
          </div>
          <p className={`text-lg font-bold font-display leading-tight ${kpi.color}`}>{kpi.value}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{kpi.sub}</p>
        </div>
      ))}
    </div>
  );
}
