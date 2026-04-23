import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, TrendingUp, Percent, Receipt, BarChart3, Download, Store } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, PieChart, Pie, Cell,
} from 'recharts';
import {
  getChannelKey, getChannelLabel, getChannelColor, compareChannels,
  CHANNEL_DISPLAY_ORDER,
} from '@/lib/marketplaceAccounts';

interface MarketplaceFeeAnalyticsProps {
  companyView?: 'consolidated' | string;
}

interface SaleRecord {
  id: string;
  order_number: string;
  marketplace: string;
  marketplace_account: string | null;
  sale_price: number;
  shipping_cost: number;
  marketplace_fees: number;
  tax_amount: number;
  profit: number | null;
  sale_date: string;
  company_id: string;
  is_marketplace_remitted: boolean | null;
}

// Channels surfaced in the trend / pie / breakdown widgets. Best Buy is split
// into its TGW and VES sub-accounts; everything else is the bare marketplace.
const TRACKED_CHANNELS = ['amazon', 'shopify', 'bestbuy_tgw', 'bestbuy_ves'] as const;

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--destructive))', 'hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)'];

export function MarketplaceFeeAnalytics({ companyView = 'consolidated' }: MarketplaceFeeAnalyticsProps) {
  const { companies } = useCompany();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('90');

  useEffect(() => {
    fetchSales();
  }, [companyView, period]);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(period));

      let query = supabase
        .from('sales')
        .select('id, order_number, marketplace, marketplace_account, sale_price, shipping_cost, marketplace_fees, tax_amount, profit, sale_date, company_id, is_marketplace_remitted')
        .gte('sale_date', startDate.toISOString())
        .order('sale_date', { ascending: false })
        .limit(5000);

      if (companyView !== 'consolidated') {
        query = query.eq('company_id', companyView);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSales((data || []) as SaleRecord[]);
    } catch (err) {
      console.error('Error fetching sales for fee analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const analytics = useMemo(() => {
    // Per-marketplace aggregation
    const byMarketplace: Record<string, {
      marketplace: string;
      revenue: number;
      fees: number;
      feeRate: number;
      orders: number;
      avgFee: number;
      taxRemitted: number;
      taxOwed: number;
    }> = {};

    // Monthly trend
    const monthlyMap: Record<string, Record<string, { fees: number; revenue: number; orders: number }>> = {};

    sales.forEach(s => {
      const mp = getChannelKey(s.marketplace, s.marketplace_account as any);
      if (!byMarketplace[mp]) {
        byMarketplace[mp] = { marketplace: mp, revenue: 0, fees: 0, feeRate: 0, orders: 0, avgFee: 0, taxRemitted: 0, taxOwed: 0 };
      }
      const m = byMarketplace[mp];
      m.revenue += s.sale_price;
      m.fees += s.marketplace_fees || 0;
      m.orders += 1;

      if (s.is_marketplace_remitted) {
        m.taxRemitted += s.tax_amount || 0;
      } else {
        m.taxOwed += s.tax_amount || 0;
      }

      // Monthly
      const month = new Date(s.sale_date).toISOString().slice(0, 7);
      if (!monthlyMap[month]) monthlyMap[month] = {};
      if (!monthlyMap[month][mp]) monthlyMap[month][mp] = { fees: 0, revenue: 0, orders: 0 };
      monthlyMap[month][mp].fees += s.marketplace_fees || 0;
      monthlyMap[month][mp].revenue += s.sale_price;
      monthlyMap[month][mp].orders += 1;
    });

    // Calculate rates
    Object.values(byMarketplace).forEach(m => {
      m.feeRate = m.revenue > 0 ? (m.fees / m.revenue) * 100 : 0;
      m.avgFee = m.orders > 0 ? m.fees / m.orders : 0;
    });

    const marketplaceList = Object.values(byMarketplace).sort((a, b) => {
      const c = compareChannels(a.marketplace, b.marketplace);
      return c !== 0 ? c : b.fees - a.fees;
    });

    // Build monthly trend data — series per known channel.
    const months = Object.keys(monthlyMap).sort();
    const trendData = months.map(month => {
      const row: any = { month };
      TRACKED_CHANNELS.forEach(ch => {
        row[`${ch}_fees`] = monthlyMap[month]?.[ch]?.fees || 0;
        row[`${ch}_rate`] = (monthlyMap[month]?.[ch]?.revenue ?? 0) > 0
          ? ((monthlyMap[month][ch].fees / monthlyMap[month][ch].revenue) * 100)
          : 0;
      });
      return row;
    });

    // Totals
    const totalFees = marketplaceList.reduce((s, m) => s + m.fees, 0);
    const totalRevenue = marketplaceList.reduce((s, m) => s + m.revenue, 0);
    const totalOrders = marketplaceList.reduce((s, m) => s + m.orders, 0);
    const overallFeeRate = totalRevenue > 0 ? (totalFees / totalRevenue) * 100 : 0;

    // Pie data
    const pieData = marketplaceList.map(m => ({
      name: getChannelLabel(m.marketplace),
      value: m.fees,
    })).filter(d => d.value > 0);

    // Top fee orders
    const topFeeOrders = [...sales]
      .sort((a, b) => (b.marketplace_fees || 0) - (a.marketplace_fees || 0))
      .slice(0, 15);

    return { marketplaceList, trendData, totalFees, totalRevenue, totalOrders, overallFeeRate, pieData, topFeeOrders };
  }, [sales]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(v);

  const formatMonth = (m: string) => {
    const [y, mo] = m.split('-');
    return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-CA', { month: 'short', year: '2-digit' });
  };

  const handleExport = () => {
    const header = 'Marketplace,Revenue,Total Fees,Fee Rate %,Orders,Avg Fee/Order,Tax Remitted by MP,Tax You Owe';
    const rows = analytics.marketplaceList.map(m =>
      `${getChannelLabel(m.marketplace)},${m.revenue.toFixed(2)},${m.fees.toFixed(2)},${m.feeRate.toFixed(1)},${m.orders},${m.avgFee.toFixed(2)},${m.taxRemitted.toFixed(2)},${m.taxOwed.toFixed(2)}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marketplace-fee-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Store className="h-5 w-5" /> Commission & Fee Analytics
          </h3>
          <p className="text-sm text-muted-foreground">{analytics.totalOrders} orders across all channels</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 6 months</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard title="Total Fees Paid" value={formatCurrency(analytics.totalFees)} icon={Receipt} changeType="negative" />
        <MetricCard title="Overall Fee Rate" value={`${analytics.overallFeeRate.toFixed(1)}%`} icon={Percent} />
        <MetricCard title="Avg Fee/Order" value={formatCurrency(analytics.totalOrders > 0 ? analytics.totalFees / analytics.totalOrders : 0)} icon={DollarSign} />
        <MetricCard title="Revenue After Fees" value={formatCurrency(analytics.totalRevenue - analytics.totalFees)} icon={TrendingUp} changeType="positive" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pie: fee distribution by marketplace */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Fee Distribution by Channel</CardTitle>
            <CardDescription>Where your fees are going</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.pieData.length > 0 ? (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" nameKey="name">
                      {analytics.pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No fee data</p>
            )}
          </CardContent>
        </Card>

        {/* Fee rate trend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Fee Rate Trend by Channel</CardTitle>
            <CardDescription>Monthly effective commission rates</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.trendData.length > 0 ? (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="month" tickFormatter={formatMonth} className="text-xs" />
                    <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} className="text-xs" />
                    <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} labelFormatter={formatMonth} />
                    <Legend />
                    {Object.entries(MARKETPLACE_LABELS).map(([key, label]) => (
                      <Line key={key} type="monotone" dataKey={`${key}_rate`} name={`${label} %`} stroke={MARKETPLACE_COLORS[key] || 'hsl(var(--muted-foreground))'} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No trend data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fees by channel bar chart */}
      {analytics.trendData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Monthly Fees by Channel</CardTitle>
            <CardDescription>Absolute fee amounts over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="month" tickFormatter={formatMonth} className="text-xs" />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} className="text-xs" />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={formatMonth} />
                  <Legend />
                  {Object.entries(MARKETPLACE_LABELS).map(([key, label]) => (
                    <Bar key={key} dataKey={`${key}_fees`} name={label} fill={MARKETPLACE_COLORS[key] || 'hsl(var(--muted-foreground))'} stackId="fees" radius={[2, 2, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fee breakdown explanation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">What's Included in "Marketplace Fees"</CardTitle>
          <CardDescription>Each channel bundles different costs into the fees we track</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: MARKETPLACE_COLORS.amazon }} />
                <span className="font-semibold text-sm">Amazon</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 pl-5 list-disc">
                <li><span className="text-foreground font-medium">Referral fee</span> — ~15% of sale price (category-dependent)</li>
                <li><span className="text-foreground font-medium">FBA fulfillment</span> — per-unit pick, pack & ship (included in settlement)</li>
                <li><span className="text-foreground font-medium">Monthly storage</span> — per cu-ft warehouse fee (included in settlement)</li>
                <li><span className="text-foreground font-medium">Closing / variable fees</span> — applies to media categories</li>
              </ul>
              <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border/50">
                Source: Estimated at 15% until settlement report is synced, then actual deducted amount is used.
              </p>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: MARKETPLACE_COLORS.shopify }} />
                <span className="font-semibold text-sm">Shopify</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 pl-5 list-disc">
                <li><span className="text-foreground font-medium">Payment processing</span> — 2.9% + $0.30 per transaction (Shopify Payments)</li>
                <li><span className="text-foreground font-medium">Currency conversion</span> — 1.5% if cross-border (when applicable)</li>
                <li><span className="text-foreground font-medium">Third-party fees</span> — 0.5–2% if using external gateway</li>
              </ul>
              <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border/50">
                Source: Actual fee from balance transactions (total charged − net payout). Falls back to 2.9% + $0.30 estimate.
              </p>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: MARKETPLACE_COLORS.bestbuy }} />
                <span className="font-semibold text-sm">Best Buy (Mirakl)</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 pl-5 list-disc">
                <li><span className="text-foreground font-medium">Commission fee</span> — percentage of sale (category-dependent)</li>
                <li><span className="text-foreground font-medium">Commission tax</span> — GST/HST charged on the commission itself</li>
              </ul>
              <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border/50">
                Source: Actual commission + commission tax from Mirakl API. Commission tax is an ITC-eligible business expense.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-marketplace detail table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Channel Fee Comparison</CardTitle>
          <CardDescription>Revenue, fees, and tax remittance by marketplace</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Total Fees</TableHead>
                <TableHead className="text-right">Fee Rate</TableHead>
                <TableHead className="text-right">Avg Fee/Order</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Tax Remitted by MP</TableHead>
                <TableHead className="text-right">Tax You Owe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.marketplaceList.map(m => (
                <TableRow key={m.marketplace}>
                  <TableCell className="font-medium">{MARKETPLACE_LABELS[m.marketplace] || m.marketplace}</TableCell>
                  <TableCell className="text-right">{formatCurrency(m.revenue)}</TableCell>
                  <TableCell className="text-right text-destructive font-medium">{formatCurrency(m.fees)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={m.feeRate > 15 ? 'destructive' : m.feeRate > 5 ? 'secondary' : 'default'} className="text-[10px]">
                      {m.feeRate.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(m.avgFee)}</TableCell>
                  <TableCell className="text-right">{m.orders}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatCurrency(m.taxRemitted)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(m.taxOwed)}</TableCell>
                </TableRow>
              ))}
              {analytics.marketplaceList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No sales data for this period
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Top fee orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Highest Fee Orders</CardTitle>
          <CardDescription>Top 15 orders by marketplace fees paid</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Sale Price</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                  <TableHead className="text-right">Fee %</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.topFeeOrders.map(order => {
                  const feePercent = order.sale_price > 0
                    ? ((order.marketplace_fees || 0) / order.sale_price * 100).toFixed(1)
                    : '0.0';
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs">{order.order_number}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {MARKETPLACE_LABELS[order.marketplace] || order.marketplace}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{new Date(order.sale_date).toLocaleDateString('en-CA')}</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.sale_price)}</TableCell>
                      <TableCell className="text-right text-destructive font-medium">{formatCurrency(order.marketplace_fees || 0)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={parseFloat(feePercent) > 20 ? 'destructive' : 'secondary'} className="text-[10px]">
                          {feePercent}%
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-medium ${(order.profit || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {formatCurrency(order.profit || 0)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {analytics.topFeeOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No orders found
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
