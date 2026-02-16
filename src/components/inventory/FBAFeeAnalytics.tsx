import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, Percent, Receipt, BarChart3 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

interface AmazonSale {
  id: string;
  order_number: string;
  sale_price: number;
  shipping_cost: number;
  marketplace_fees: number;
  tax_amount: number;
  profit: number | null;
  sale_date: string;
  customer_name: string | null;
  device_id: string | null;
  notes: string | null;
}

const FEE_COLORS = ['hsl(var(--primary))', 'hsl(var(--destructive))', 'hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)'];

export function FBAFeeAnalytics() {
  const { companies } = useCompany();
  const [sales, setSales] = useState<AmazonSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');

  const vesCompany = companies.find(c => c.code === 'VES');

  useEffect(() => {
    if (vesCompany) fetchSales();
  }, [vesCompany, period]);

  const fetchSales = async () => {
    if (!vesCompany) return;
    setLoading(true);
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(period));

      const { data, error } = await supabase
        .from('sales')
        .select('id, order_number, sale_price, shipping_cost, marketplace_fees, tax_amount, profit, sale_date, customer_name, device_id, notes')
        .eq('company_id', vesCompany.id)
        .eq('marketplace', 'amazon')
        .gte('sale_date', startDate.toISOString())
        .order('sale_date', { ascending: false });

      if (error) throw error;
      setSales((data || []) as AmazonSale[]);
    } catch (err) {
      console.error('Error fetching Amazon sales:', err);
    } finally {
      setLoading(false);
    }
  };

  const metrics = useMemo(() => {
    const totalRevenue = sales.reduce((s, o) => s + o.sale_price, 0);
    const totalFees = sales.reduce((s, o) => s + (o.marketplace_fees || 0), 0);
    const totalShipping = sales.reduce((s, o) => s + (o.shipping_cost || 0), 0);
    const totalTax = sales.reduce((s, o) => s + (o.tax_amount || 0), 0);
    const totalProfit = sales.reduce((s, o) => s + (o.profit || 0), 0);
    const avgFeeRate = totalRevenue > 0 ? (totalFees / totalRevenue) * 100 : 0;
    const avgFeePerOrder = sales.length > 0 ? totalFees / sales.length : 0;

    // Estimated fee breakdown (Amazon typical):
    // Referral fee ~15%, FBA fulfillment ~$5-8 per unit, monthly storage ~$0.75/cu ft
    // We approximate from the marketplace_fees field
    const estimatedReferral = totalFees * 0.7; // ~70% of fees are referral
    const estimatedFulfillment = totalFees * 0.25; // ~25% fulfillment
    const estimatedStorage = totalFees * 0.05; // ~5% storage

    const feeBreakdown = [
      { name: 'Referral Fees', value: estimatedReferral },
      { name: 'Fulfillment Fees', value: estimatedFulfillment },
      { name: 'Storage Fees', value: estimatedStorage },
    ].filter(f => f.value > 0);

    // Monthly trend
    const monthlyData: Record<string, { month: string; revenue: number; fees: number; profit: number; orders: number }> = {};
    sales.forEach(s => {
      const month = new Date(s.sale_date).toISOString().slice(0, 7);
      if (!monthlyData[month]) {
        monthlyData[month] = { month, revenue: 0, fees: 0, profit: 0, orders: 0 };
      }
      monthlyData[month].revenue += s.sale_price;
      monthlyData[month].fees += s.marketplace_fees || 0;
      monthlyData[month].profit += s.profit || 0;
      monthlyData[month].orders += 1;
    });
    const trendData = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));

    // Per-order table (top 20)
    const topOrders = [...sales].sort((a, b) => (b.marketplace_fees || 0) - (a.marketplace_fees || 0)).slice(0, 20);

    return {
      totalRevenue, totalFees, totalShipping, totalTax, totalProfit,
      avgFeeRate, avgFeePerOrder, feeBreakdown, trendData, topOrders,
      orderCount: sales.length,
    };
  }, [sales]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const formatMonthLabel = (month: string) => {
    const [y, m] = month.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1);
    return date.toLocaleDateString('en-CA', { month: 'short', year: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Amazon FBA Fee Analytics</h3>
          <p className="text-sm text-muted-foreground">
            {metrics.orderCount} orders in selected period
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 6 months</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(metrics.totalRevenue)}
          icon={DollarSign}
        />
        <MetricCard
          title="Amazon Fees"
          value={formatCurrency(metrics.totalFees)}
          icon={Receipt}
          change={`${metrics.avgFeeRate.toFixed(1)}% of revenue`}
          changeType="negative"
        />
        <MetricCard
          title="Avg Fee/Order"
          value={formatCurrency(metrics.avgFeePerOrder)}
          icon={Percent}
        />
        <MetricCard
          title="Net Profit"
          value={formatCurrency(metrics.totalProfit)}
          icon={TrendingUp}
          changeType={metrics.totalProfit >= 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          title="Profit Margin"
          value={`${metrics.totalRevenue > 0 ? ((metrics.totalProfit / metrics.totalRevenue) * 100).toFixed(1) : 0}%`}
          icon={BarChart3}
          changeType={metrics.totalProfit >= 0 ? 'positive' : 'negative'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fee breakdown pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Fee Breakdown (Estimated)</CardTitle>
            <CardDescription>Referral, fulfillment & storage split</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.feeBreakdown.length > 0 ? (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metrics.feeBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="name"
                    >
                      {metrics.feeBreakdown.map((_, i) => (
                        <Cell key={i} fill={FEE_COLORS[i % FEE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No fee data available</p>
            )}
          </CardContent>
        </Card>

        {/* Monthly trend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Revenue vs Fees Trend</CardTitle>
            <CardDescription>Monthly comparison</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.trendData.length > 0 ? (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tickFormatter={formatMonthLabel} className="text-xs" />
                    <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} className="text-xs" />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={formatMonthLabel} />
                    <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="fees" name="Amazon Fees" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No trend data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-order fee table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Highest Fee Orders</CardTitle>
          <CardDescription>Top 20 orders by Amazon fees paid</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Sale Price</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                  <TableHead className="text-right">Fee %</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.topOrders.map(order => {
                  const feePercent = order.sale_price > 0
                    ? ((order.marketplace_fees || 0) / order.sale_price * 100).toFixed(1)
                    : '0.0';
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs">{order.order_number}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(order.sale_date).toLocaleDateString('en-CA')}
                      </TableCell>
                      <TableCell className="text-sm truncate max-w-[140px]">
                        {order.customer_name || '-'}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(order.sale_price)}</TableCell>
                      <TableCell className="text-right text-destructive font-medium">
                        {formatCurrency(order.marketplace_fees || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={parseFloat(feePercent) > 20 ? 'destructive' : 'secondary'} className="text-[10px]">
                          {feePercent}%
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-medium ${(order.profit || 0) >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                        {formatCurrency(order.profit || 0)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {metrics.topOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No Amazon orders found in this period
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
