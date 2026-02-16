import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Store } from 'lucide-react';
import { subMonths, startOfMonth } from 'date-fns';

interface MarketplaceData { name: string; value: number; count: number; color: string; }

const MARKETPLACE_COLORS: Record<string, string> = {
  shopify: 'hsl(var(--shopify))', amazon: 'hsl(var(--amazon))',
  bestbuy: 'hsl(var(--bestbuy))', other: 'hsl(var(--muted-foreground))',
};

export function MarketplaceChart() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MarketplaceData[]>([]);

  useEffect(() => { fetchData(); }, [selectedCompany]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const startDate = startOfMonth(subMonths(new Date(), 2));
      let query = supabase.from('sales').select('marketplace, sale_price').gte('sale_date', startDate.toISOString());
      if (selectedCompany) query = query.eq('company_id', selectedCompany.id);
      const { data: sales } = await query;

      const totals: Record<string, { value: number; count: number }> = {};
      sales?.forEach(sale => {
        const mp = sale.marketplace || 'other';
        if (!totals[mp]) totals[mp] = { value: 0, count: 0 };
        totals[mp].value += Number(sale.sale_price);
        totals[mp].count++;
      });

      setData(Object.entries(totals).map(([name, d]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1), value: d.value, count: d.count,
        color: MARKETPLACE_COLORS[name] || MARKETPLACE_COLORS.other,
      })).sort((a, b) => b.value - a.value));
    } catch (error) { console.error('Error:', error); } finally { setLoading(false); }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  if (loading) return <div className="bg-card border border-border/60 rounded-lg h-[260px] animate-pulse" />;

  return (
    <div className="bg-card border border-border/60 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-6 w-6 rounded-md bg-info/15 flex items-center justify-center">
          <Store className="h-3 w-3 text-info" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">By Marketplace</span>
      </div>
      {data.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">No data</div>
      ) : (
        <>
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                  {data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }} formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1">
            {data.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span>{item.name}</span>
                  <span className="text-[9px] text-muted-foreground">({item.count})</span>
                </div>
                <span className="font-medium">{formatCurrency(item.value)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
