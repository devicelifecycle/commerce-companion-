import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { format, subMonths, startOfMonth } from 'date-fns';

interface MonthlyData {
  month: string;
  revenue: number;
  profit: number;
  margin: number;
}

export function RevenueChart() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MonthlyData[]>([]);

  useEffect(() => {
    fetchData();
  }, [selectedCompany]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const startDate = startOfMonth(subMonths(now, 11));

      let query = supabase
        .from('sales')
        .select('sale_price, profit, sale_date')
        .gte('sale_date', startDate.toISOString());

      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data: sales } = await query;

      // Initialize 12 months
      const monthlyData: Record<string, { revenue: number; profit: number }> = {};
      for (let i = 0; i < 12; i++) {
        const date = subMonths(now, 11 - i);
        monthlyData[format(date, 'MMM')] = { revenue: 0, profit: 0 };
      }

      // Aggregate sales
      sales?.forEach(sale => {
        const key = format(new Date(sale.sale_date), 'MMM');
        if (monthlyData[key]) {
          monthlyData[key].revenue += Number(sale.sale_price);
          monthlyData[key].profit += Number(sale.profit || 0);
        }
      });

      // Convert to array
      const result: MonthlyData[] = Object.entries(monthlyData).map(([month, d]) => ({
        month,
        revenue: d.revenue,
        profit: d.profit,
        margin: d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0,
      }));

      setData(result);
    } catch (error) {
      console.error('Error fetching revenue data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  const formatYAxis = (value: number) => `$${(value / 1000).toFixed(0)}k`;

  if (loading) {
    return (
      <Card className="animate-pulse lg:col-span-2">
        <CardContent className="h-[350px]" />
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2 chart-container">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          12-Month Revenue & Profit Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis 
                dataKey="month" 
                axisLine={false}
                tickLine={false}
                className="text-xs fill-muted-foreground"
              />
              <YAxis 
                tickFormatter={formatYAxis}
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
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name === 'revenue' ? 'Revenue' : 'Profit'
                ]}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
                name="Revenue"
              />
              <Area
                type="monotone"
                dataKey="profit"
                stroke="hsl(var(--success))"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorProfit)"
                name="Profit"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
