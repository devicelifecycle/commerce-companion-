import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Smartphone } from 'lucide-react';
import { subMonths, startOfMonth } from 'date-fns';

interface ProductData {
  name: string;
  revenue: number;
  count: number;
}

export function TopProductsChart() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProductData[]>([]);

  useEffect(() => {
    fetchData();
  }, [selectedCompany]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const startDate = startOfMonth(subMonths(new Date(), 2)); // Last 3 months

      let query = supabase
        .from('sales')
        .select('sale_price, devices(brand, model)')
        .gte('sale_date', startDate.toISOString());

      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

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

      const result: ProductData[] = Object.entries(productTotals)
        .map(([name, d]) => ({
          name: name.length > 20 ? name.slice(0, 18) + '...' : name,
          revenue: d.revenue,
          count: d.count,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8);

      setData(result);
    } catch (error) {
      console.error('Error fetching top products:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="h-[300px]" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="h-8 w-8 rounded-lg bg-accent/15 flex items-center justify-center">
            <Smartphone className="h-4 w-4 text-accent" />
          </div>
          Top Products by Revenue
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[240px] flex items-center justify-center text-muted-foreground">
            No sales data available
          </div>
        ) : (
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 10, right: 10 }}>
                <XAxis
                  type="number"
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  axisLine={false}
                  tickLine={false}
                  className="text-xs fill-muted-foreground"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  axisLine={false}
                  tickLine={false}
                  className="text-xs fill-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {data.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={`hsl(var(--primary) / ${1 - index * 0.1})`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
