import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Package, Clock, AlertTriangle } from 'lucide-react';
import { differenceInDays } from 'date-fns';

interface AgingBucket { label: string; count: number; value: number; color: string; }

export function InventoryValuation() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [totalValue, setTotalValue] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [agingBuckets, setAgingBuckets] = useState<AgingBucket[]>([]);
  const [avgDaysInStock, setAvgDaysInStock] = useState(0);

  useEffect(() => { fetchInventoryData(); }, [selectedCompany]);

  const fetchInventoryData = async () => {
    setLoading(true);
    try {
      let query = supabase.from('devices').select('id, cost_price, created_at').eq('status', 'in_stock');
      if (selectedCompany) query = query.eq('company_id', selectedCompany.id);
      const { data: devices } = await query;

      if (!devices || devices.length === 0) {
        setTotalValue(0); setTotalCount(0); setAgingBuckets([]); setAvgDaysInStock(0); setLoading(false); return;
      }

      const now = new Date();
      const buckets: Record<string, { count: number; value: number }> = {
        '0-30': { count: 0, value: 0 }, '31-60': { count: 0, value: 0 },
        '61-90': { count: 0, value: 0 }, '90+': { count: 0, value: 0 },
      };
      let totalDays = 0;

      devices.forEach(device => {
        const days = differenceInDays(now, new Date(device.created_at));
        const cost = Number(device.cost_price) || 0;
        totalDays += days;
        if (days <= 30) { buckets['0-30'].count++; buckets['0-30'].value += cost; }
        else if (days <= 60) { buckets['31-60'].count++; buckets['31-60'].value += cost; }
        else if (days <= 90) { buckets['61-90'].count++; buckets['61-90'].value += cost; }
        else { buckets['90+'].count++; buckets['90+'].value += cost; }
      });

      setTotalValue(devices.reduce((sum, d) => sum + Number(d.cost_price), 0));
      setTotalCount(devices.length);
      setAvgDaysInStock(Math.round(totalDays / devices.length));
      setAgingBuckets([
        { label: '0-30d', ...buckets['0-30'], color: 'hsl(var(--success))' },
        { label: '31-60d', ...buckets['31-60'], color: 'hsl(var(--info))' },
        { label: '61-90d', ...buckets['61-90'], color: 'hsl(var(--warning))' },
        { label: '90+d', ...buckets['90+'], color: 'hsl(var(--destructive))' },
      ]);
    } catch (error) { console.error('Error:', error); } finally { setLoading(false); }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  if (loading) return <div className="bg-card border border-border/60 rounded-lg h-36 animate-pulse" />;

  return (
    <div className="bg-card border border-border/60 rounded-lg p-3 h-full">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-6 w-6 rounded-md bg-secondary/15 flex items-center justify-center">
          <Package className="h-3 w-3 text-secondary" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inventory (FIFO)</span>
      </div>

      <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/10 border border-secondary/20 mb-2">
        <div>
          <p className="text-[10px] text-muted-foreground">Value</p>
          <p className="text-xl font-bold font-display text-secondary">{formatCurrency(totalValue)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Units</p>
          <p className="text-xl font-bold font-display">{totalCount}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border/40 mb-2">
        <Clock className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px]">Avg Stock Age:</span>
        <span className={`text-xs font-semibold ${avgDaysInStock > 45 ? 'text-warning' : 'text-success'}`}>{avgDaysInStock}d</span>
      </div>

      {/* Aging bar */}
      <div className="h-2 rounded-full overflow-hidden flex bg-muted/50 mb-1.5">
        {agingBuckets.map((bucket) => {
          const width = totalCount > 0 ? (bucket.count / totalCount) * 100 : 0;
          return <div key={bucket.label} style={{ width: `${width}%`, backgroundColor: bucket.color }} className="transition-all duration-500" />;
        })}
      </div>
      <div className="grid grid-cols-4 gap-1">
        {agingBuckets.map((bucket) => (
          <div key={bucket.label} className="flex items-center gap-1 text-[9px]">
            <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: bucket.color }} />
            <span className="text-muted-foreground">{bucket.label}</span>
            <span className="font-medium">{bucket.count}</span>
          </div>
        ))}
      </div>

      {agingBuckets[3]?.count > 0 && (
        <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-destructive/10 border border-destructive/20 text-[10px] mt-2">
          <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
          <span className="text-destructive">{agingBuckets[3].count} items 90+d ({formatCurrency(agingBuckets[3].value)})</span>
        </div>
      )}
    </div>
  );
}
