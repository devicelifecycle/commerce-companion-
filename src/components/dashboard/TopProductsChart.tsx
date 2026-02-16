import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Smartphone } from 'lucide-react';
import { subMonths, startOfMonth } from 'date-fns';

interface ProductData { name: string; revenue: number; count: number; }

export function TopProductsChart() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProductData[]>([]);

  useEffect(() => { fetchData(); }, [selectedCompany]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const startDate = startOfMonth(subMonths(new Date(), 2));
      let query = supabase.from('sales').select('sale_price, devices(brand, model)').gte('sale_date', startDate.toISOString());
      if (selectedCompany) query = query.eq('company_id', selectedCompany.id);
      const { data: sales } = await query;

      const productTotals: Record<string, { revenue: number; count: number }> = {};
      sales?.forEach(sale => {
        const device = sale.devices as any;
        if (device) {
          const key = `${device.brand} ${device.model}`;
          if (!productTotals[key]) productTotals[key] = { revenue: 0, count: 0 };
          productTotals[key].revenue += Number(sale.sale_price);
          productTotals[key].count++;
        }
      });

      setData(Object.entries(productTotals).map(([name, d]) => ({
        name: name.length > 18 ? name.slice(0, 16) + '…' : name, ...d,
      })).sort((a, b) => b.revenue - a.revenue).slice(0, 8));
    } catch (error) { console.error('Error:', error); } finally { setLoading(false); }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  if (loading) return <div className="bg-card border border-border/60 rounded-lg h-[260px] animate-pulse" />;

  return (
    <div className="bg-card border border-border/60 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-6 w-6 rounded-md bg-accent/15 flex items-center justify-center">
          <Smartphone className="h-3 w-3 text-accent" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Products</span>
      </div>
      {data.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">No data</div>
      ) : (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 5, right: 5 }}>
              <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{ fontSize: 9 }} className="fill-muted-foreground" />
              <YAxis type="category" dataKey="name" width={90} axisLine={false} tickLine={false} tick={{ fontSize: 9 }} className="fill-muted-foreground" />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }} formatter={(value: number) => formatCurrency(value)} />
              <Bar dataKey="revenue" radius={[0, 3, 3, 0]}>
                {data.map((_, index) => <Cell key={index} fill={`hsl(var(--primary) / ${1 - index * 0.1})`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
