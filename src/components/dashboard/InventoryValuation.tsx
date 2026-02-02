import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Clock, AlertTriangle } from 'lucide-react';
import { differenceInDays } from 'date-fns';

interface AgingBucket {
  label: string;
  count: number;
  value: number;
  color: string;
}

export function InventoryValuation() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [totalValue, setTotalValue] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [agingBuckets, setAgingBuckets] = useState<AgingBucket[]>([]);
  const [avgDaysInStock, setAvgDaysInStock] = useState(0);

  useEffect(() => {
    fetchInventoryData();
  }, [selectedCompany]);

  const fetchInventoryData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('devices')
        .select('id, cost_price, created_at')
        .eq('status', 'in_stock');

      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data: devices } = await query;

      if (!devices || devices.length === 0) {
        setTotalValue(0);
        setTotalCount(0);
        setAgingBuckets([]);
        setAvgDaysInStock(0);
        setLoading(false);
        return;
      }

      const now = new Date();
      const buckets: Record<string, { count: number; value: number }> = {
        '0-30': { count: 0, value: 0 },
        '31-60': { count: 0, value: 0 },
        '61-90': { count: 0, value: 0 },
        '90+': { count: 0, value: 0 },
      };

      let totalDays = 0;

      devices.forEach(device => {
        const days = differenceInDays(now, new Date(device.created_at));
        const cost = Number(device.cost_price) || 0;
        totalDays += days;

        if (days <= 30) {
          buckets['0-30'].count++;
          buckets['0-30'].value += cost;
        } else if (days <= 60) {
          buckets['31-60'].count++;
          buckets['31-60'].value += cost;
        } else if (days <= 90) {
          buckets['61-90'].count++;
          buckets['61-90'].value += cost;
        } else {
          buckets['90+'].count++;
          buckets['90+'].value += cost;
        }
      });

      setTotalValue(devices.reduce((sum, d) => sum + Number(d.cost_price), 0));
      setTotalCount(devices.length);
      setAvgDaysInStock(Math.round(totalDays / devices.length));
      setAgingBuckets([
        { label: '0-30 days', ...buckets['0-30'], color: 'hsl(var(--success))' },
        { label: '31-60 days', ...buckets['31-60'], color: 'hsl(var(--info))' },
        { label: '61-90 days', ...buckets['61-90'], color: 'hsl(var(--warning))' },
        { label: '90+ days', ...buckets['90+'], color: 'hsl(var(--destructive))' },
      ]);
    } catch (error) {
      console.error('Error fetching inventory data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="h-36" />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="h-8 w-8 rounded-lg bg-secondary/15 flex items-center justify-center">
            <Package className="h-4 w-4 text-secondary" />
          </div>
          Inventory Valuation (FIFO)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total Value */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/10 border border-secondary/20">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Total Value</p>
            <p className="text-2xl font-bold font-display text-secondary">
              {formatCurrency(totalValue)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-1">Units</p>
            <p className="text-2xl font-bold font-display">{totalCount}</p>
          </div>
        </div>

        {/* Average Days */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/40">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">Avg. Days in Stock:</span>
          <span className={`font-semibold ${avgDaysInStock > 45 ? 'text-warning' : 'text-success'}`}>
            {avgDaysInStock} days
          </span>
        </div>

        {/* Aging Breakdown */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Aging Breakdown</p>
          <div className="h-3 rounded-full overflow-hidden flex bg-muted/50">
            {agingBuckets.map((bucket, i) => {
              const width = totalCount > 0 ? (bucket.count / totalCount) * 100 : 0;
              return (
                <div
                  key={bucket.label}
                  style={{ width: `${width}%`, backgroundColor: bucket.color }}
                  className="transition-all duration-500"
                  title={`${bucket.label}: ${bucket.count} units`}
                />
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {agingBuckets.map((bucket) => (
              <div key={bucket.label} className="flex items-center gap-2 text-xs">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: bucket.color }}
                />
                <span className="text-muted-foreground">{bucket.label}:</span>
                <span className="font-medium">{bucket.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Warning for slow movers */}
        {agingBuckets[3]?.count > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            <span className="text-destructive">
              {agingBuckets[3].count} item{agingBuckets[3].count > 1 ? 's' : ''} over 90 days ({formatCurrency(agingBuckets[3].value)})
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
