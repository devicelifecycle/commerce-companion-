import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, DollarSign, Package, Percent, MapPin } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';
import { format, subDays, subMonths, startOfDay, startOfWeek, startOfMonth, startOfYear, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval } from 'date-fns';
import {
  getChannelKey,
  getChannelLabel,
  getChannelColor,
  compareChannels,
  parseMarketplaceFilter,
  MARKETPLACE_FILTER_OPTIONS,
} from '@/lib/marketplaceAccounts';

type DateRange = 'today' | '7days' | '30days' | '90days' | 'year' | 'all';
type GroupBy = 'daily' | 'weekly' | 'monthly';

interface Sale {
  id: string;
  sale_price: number;
  marketplace_fees: number;
  shipping_cost: number;
  tax_amount: number;
  profit: number | null;
  sale_date: string;
  marketplace: string;
  marketplace_account: string | null;
  notes: string | null;
  company_id: string;
}

interface SalesMetrics {
  totalSales: number;
  totalRevenue: number;
  totalFees: number;
  totalProfit: number;
  avgOrderValue: number;
  profitMargin: number;
}

interface ChartData {
  date: string;
  revenue: number;
  profit: number;
  orders: number;
}

interface MarketplaceData {
  name: string;
  value: number;
  count: number;
}

interface ProvinceData {
  province: string;
  revenue: number;
  count: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(142, 71%, 45%)', 'hsl(221, 83%, 53%)'];

export function SalesDashboard() {
  const { selectedCompany, isSuperAdmin } = useCompany();
  const [sales, setSales] = useState<Sale[]>([]);
  const [previousSales, setPreviousSales] = useState<Sale[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>('30days');
  const [groupBy, setGroupBy] = useState<GroupBy>('daily');
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSales();
  }, [selectedCompany, dateRange, marketplaceFilter]);

  // Realtime subscription for live sales updates
  useEffect(() => {
    const channel = supabase
      .channel('sales-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales',
        },
        (payload) => {
          console.log('Realtime sale event:', payload.eventType);
          // Refetch to get properly filtered data
          fetchSales();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedCompany, dateRange]);

  const getDateRange = (range: DateRange): { start: Date; end: Date; previousStart: Date; previousEnd: Date } => {
    const now = new Date();
    const end = now;
    let start: Date;
    let previousStart: Date;
    let previousEnd: Date;

    switch (range) {
      case 'today':
        start = startOfDay(now);
        previousEnd = subDays(start, 1);
        previousStart = startOfDay(previousEnd);
        break;
      case '7days':
        start = subDays(now, 7);
        previousEnd = subDays(start, 1);
        previousStart = subDays(previousEnd, 7);
        break;
      case '30days':
        start = subDays(now, 30);
        previousEnd = subDays(start, 1);
        previousStart = subDays(previousEnd, 30);
        break;
      case '90days':
        start = subDays(now, 90);
        previousEnd = subDays(start, 1);
        previousStart = subDays(previousEnd, 90);
        break;
      case 'year':
        start = startOfYear(now);
        previousEnd = subDays(start, 1);
        previousStart = startOfYear(subDays(start, 1));
        break;
      default:
        start = new Date(2020, 0, 1);
        previousStart = start;
        previousEnd = start;
    }

    return { start, end, previousStart, previousEnd };
  };

  const fetchSales = async () => {
    setLoading(true);
    try {
      const { start, end, previousStart, previousEnd } = getDateRange(dateRange);

      let query = supabase
        .from('sales')
        .select('*')
        .gte('sale_date', start.toISOString())
        .lte('sale_date', end.toISOString())
        .order('sale_date', { ascending: true });

      if (selectedCompany && !isSuperAdmin) {
        query = query.eq('company_id', selectedCompany.id);
      }

      if (marketplaceFilter !== 'all') {
        const parsed = parseMarketplaceFilter(marketplaceFilter);
        query = query.eq('marketplace', parsed.marketplace as any);
        if (parsed.account) query = query.eq('marketplace_account', parsed.account);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSales((data || []) as Sale[]);

      // Fetch previous period for comparison
      if (dateRange !== 'all') {
        let prevQuery = supabase
          .from('sales')
          .select('*')
          .gte('sale_date', previousStart.toISOString())
          .lte('sale_date', previousEnd.toISOString());

        if (selectedCompany && !isSuperAdmin) {
          prevQuery = prevQuery.eq('company_id', selectedCompany.id);
        }

        if (marketplaceFilter !== 'all') {
          const parsed = parseMarketplaceFilter(marketplaceFilter);
          prevQuery = prevQuery.eq('marketplace', parsed.marketplace as any);
          if (parsed.account) prevQuery = prevQuery.eq('marketplace_account', parsed.account);
        }

        const { data: prevData } = await prevQuery;
        setPreviousSales((prevData || []) as Sale[]);
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const metrics = useMemo((): SalesMetrics => {
    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, s) => sum + (s.sale_price || 0), 0);
    const totalFees = sales.reduce((sum, s) => sum + (s.marketplace_fees || 0), 0);
    const totalProfit = sales.reduce((sum, s) => sum + (s.profit || 0), 0);
    const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return { totalSales, totalRevenue, totalFees, totalProfit, avgOrderValue, profitMargin };
  }, [sales]);

  const previousMetrics = useMemo((): SalesMetrics => {
    const totalSales = previousSales.length;
    const totalRevenue = previousSales.reduce((sum, s) => sum + (s.sale_price || 0), 0);
    const totalFees = previousSales.reduce((sum, s) => sum + (s.marketplace_fees || 0), 0);
    const totalProfit = previousSales.reduce((sum, s) => sum + (s.profit || 0), 0);
    const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return { totalSales, totalRevenue, totalFees, totalProfit, avgOrderValue, profitMargin };
  }, [previousSales]);

  const chartData = useMemo((): ChartData[] => {
    if (sales.length === 0) return [];

    const { start, end } = getDateRange(dateRange);
    let intervals: Date[];
    let formatStr: string;

    if (groupBy === 'daily') {
      intervals = eachDayOfInterval({ start, end });
      formatStr = 'MMM d';
    } else if (groupBy === 'weekly') {
      intervals = eachWeekOfInterval({ start, end });
      formatStr = 'MMM d';
    } else {
      intervals = eachMonthOfInterval({ start, end });
      formatStr = 'MMM yyyy';
    }

    return intervals.map(date => {
      const periodSales = sales.filter(s => {
        const saleDate = new Date(s.sale_date);
        if (groupBy === 'daily') {
          return format(saleDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
        } else if (groupBy === 'weekly') {
          return startOfWeek(saleDate).getTime() === startOfWeek(date).getTime();
        } else {
          return startOfMonth(saleDate).getTime() === startOfMonth(date).getTime();
        }
      });

      return {
        date: format(date, formatStr),
        revenue: periodSales.reduce((sum, s) => sum + (s.sale_price || 0), 0),
        profit: periodSales.reduce((sum, s) => sum + (s.profit || 0), 0),
        orders: periodSales.length,
      };
    });
  }, [sales, dateRange, groupBy]);

  const marketplaceData = useMemo((): (MarketplaceData & { channel: string })[] => {
    const byChannel: Record<string, { value: number; count: number }> = {};

    sales.forEach(sale => {
      const ck = getChannelKey(sale.marketplace, sale.marketplace_account as any);
      if (!byChannel[ck]) {
        byChannel[ck] = { value: 0, count: 0 };
      }
      byChannel[ck].value += sale.sale_price || 0;
      byChannel[ck].count += 1;
    });

    return Object.entries(byChannel)
      .sort(([a], [b]) => compareChannels(a, b))
      .map(([channel, data]) => ({
        channel,
        name: getChannelLabel(channel),
        value: data.value,
        count: data.count,
      }));
  }, [sales]);

  const provinceData = useMemo((): ProvinceData[] => {
    const byProvince: Record<string, { revenue: number; count: number }> = {};
    
    sales.forEach(sale => {
      // Extract province from notes (format: "Province: XX")
      const match = sale.notes?.match(/Province: (\w+)/);
      const province = match?.[1] || 'Unknown';
      
      if (!byProvince[province]) {
        byProvince[province] = { revenue: 0, count: 0 };
      }
      byProvince[province].revenue += sale.sale_price || 0;
      byProvince[province].count += 1;
    });

    return Object.entries(byProvince)
      .map(([province, data]) => ({ province, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [sales]);

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const getChangePercent = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const MetricCard = ({ 
    title, 
    value, 
    previousValue, 
    format: formatFn = formatCurrency,
    icon: Icon 
  }: { 
    title: string; 
    value: number; 
    previousValue: number; 
    format?: (v: number) => string;
    icon: any;
  }) => {
    const change = getChangePercent(value, previousValue);
    const isPositive = change >= 0;

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatFn(value)}</div>
          {dateRange !== 'all' && (
            <div className={`flex items-center text-xs mt-1 ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
              {isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              {Math.abs(change).toFixed(1)}% vs previous period
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-24" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex gap-4">
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7days">Last 7 Days</SelectItem>
            <SelectItem value="30days">Last 30 Days</SelectItem>
            <SelectItem value="90days">Last 90 Days</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>

        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>

        <Select value={marketplaceFilter} onValueChange={setMarketplaceFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All marketplaces" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Marketplaces</SelectItem>
            {MARKETPLACE_FILTER_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Revenue"
          value={metrics.totalRevenue}
          previousValue={previousMetrics.totalRevenue}
          icon={DollarSign}
        />
        <MetricCard
          title="Net Profit"
          value={metrics.totalProfit}
          previousValue={previousMetrics.totalProfit}
          icon={TrendingUp}
        />
        <MetricCard
          title="Units Sold"
          value={metrics.totalSales}
          previousValue={previousMetrics.totalSales}
          format={(v) => v.toString()}
          icon={Package}
        />
        <MetricCard
          title="Profit Margin"
          value={metrics.profitMargin}
          previousValue={previousMetrics.profitMargin}
          format={(v) => `${v.toFixed(1)}%`}
          icon={Percent}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue & Profit Over Time</CardTitle>
            <CardDescription>Track your sales performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary))" 
                    fillOpacity={0.2}
                    name="Revenue"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="profit" 
                    stroke="hsl(142, 71%, 45%)" 
                    fill="hsl(142, 71%, 45%)" 
                    fillOpacity={0.2}
                    name="Profit"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Marketplace Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Sales by Marketplace</CardTitle>
            <CardDescription>Revenue distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={marketplaceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {marketplaceData.map((entry) => (
                      <Cell key={entry.channel} fill={getChannelColor(entry.channel)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Province Sales */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Sales by Province/Region
          </CardTitle>
          <CardDescription>Geographic distribution of sales</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={provinceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="province" width={80} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
