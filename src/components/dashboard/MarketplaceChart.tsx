import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Store } from 'lucide-react';
import { subMonths, startOfMonth } from 'date-fns';

interface MarketplaceData {
  name: string;
  value: number;
  count: number;
  color: string;
}

const MARKETPLACE_COLORS: Record<string, string> = {
  shopify: 'hsl(var(--shopify))',
  amazon: 'hsl(var(--amazon))',
  bestbuy: 'hsl(var(--bestbuy))',
  other: 'hsl(var(--muted-foreground))',
};

export function MarketplaceChart() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MarketplaceData[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);

  useEffect(() => {
    fetchData();
  }, [selectedCompany]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const startDate = startOfMonth(subMonths(new Date(), 2)); // Last 3 months

      let query = supabase
        .from('sales')
        .select('marketplace, sale_price')
        .gte('sale_date', startDate.toISOString());

      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data: sales } = await query;

      const totals: Record<string, { value: number; count: number }> = {};
      let total = 0;

      sales?.forEach(sale => {
        const mp = sale.marketplace || 'other';
        if (!totals[mp]) totals[mp] = { value: 0, count: 0 };
        totals[mp].value += Number(sale.sale_price);
        totals[mp].count++;
        total += Number(sale.sale_price);
      });

      const result: MarketplaceData[] = Object.entries(totals)
        .map(([name, d]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          value: d.value,
          count: d.count,
          color: MARKETPLACE_COLORS[name] || MARKETPLACE_COLORS.other,
        }))
        .sort((a, b) => b.value - a.value);

      setData(result);
      setTotalRevenue(total);
    } catch (error) {
      console.error('Error fetching marketplace data:', error);
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
          <div className="h-8 w-8 rounded-lg bg-info/15 flex items-center justify-center">
            <Store className="h-4 w-4 text-info" />
          </div>
          Revenue by Marketplace
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[240px] flex items-center justify-center text-muted-foreground">
            No sales data available
          </div>
        ) : (
          <>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {data.map((entry, index) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-2">
              {data.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span>{item.name}</span>
                    <span className="text-xs text-muted-foreground">({item.count} orders)</span>
                  </div>
                  <span className="font-medium">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
