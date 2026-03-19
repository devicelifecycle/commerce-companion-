import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Download, TrendingUp, DollarSign, Percent, ShoppingCart, Calendar } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, startOfQuarter, startOfYear } from 'date-fns';

interface MarketplaceMetrics {
  marketplace: string;
  revenue: number;
  cogs: number;
  fees: number;
  shipping: number;
  grossProfit: number;
  grossMargin: number;
  orderCount: number;
  avgOrderValue: number;
}

interface MarketplaceAccountingProps {
  companyView?: 'consolidated' | string;
}

export function MarketplaceAccounting({ companyView = 'consolidated' }: MarketplaceAccountingProps) {
  const { companies } = useCompany();
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(format(new Date(), 'yyyy-MM'));
  const [metrics, setMetrics] = useState<MarketplaceMetrics[]>([]);

  useEffect(() => {
    fetchData();
  }, [companyView, selectedPeriod]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [year, month] = selectedPeriod.split('-');
      const start = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
      const end = endOfMonth(start);

      // Fetch sales with device cost
      let salesQuery = supabase
        .from('sales')
        .select('marketplace, sale_price, shipping_cost, marketplace_fees, profit, device_id, company_id')
        .gte('sale_date', start.toISOString())
        .lte('sale_date', end.toISOString())
        .limit(5000);

      if (companyView !== 'consolidated') {
        salesQuery = salesQuery.eq('company_id', companyView);
      }

      const { data: sales } = await salesQuery;

      // Fetch device costs for COGS
      const deviceIds = sales?.filter(s => s.device_id).map(s => s.device_id!) || [];
      let deviceCosts: Record<string, number> = {};
      if (deviceIds.length > 0) {
        const { data: devices } = await supabase
          .from('devices')
          .select('id, cost_price')
          .in('id', deviceIds);
        devices?.forEach(d => { deviceCosts[d.id] = Number(d.cost_price); });
      }

      // Aggregate by marketplace
      const marketplaceMap: Record<string, MarketplaceMetrics> = {};
      
      sales?.forEach(sale => {
        const mp = sale.marketplace;
        if (!marketplaceMap[mp]) {
          marketplaceMap[mp] = {
            marketplace: mp,
            revenue: 0, cogs: 0, fees: 0, shipping: 0,
            grossProfit: 0, grossMargin: 0, orderCount: 0, avgOrderValue: 0,
          };
        }
        const m = marketplaceMap[mp];
        const salePrice = Number(sale.sale_price);
        const fees = Number(sale.marketplace_fees || 0);
        const shipping = Number(sale.shipping_cost || 0);
        const cost = sale.device_id ? (deviceCosts[sale.device_id] || 0) : 0;

        m.revenue += salePrice;
        m.cogs += cost;
        m.fees += fees;
        m.shipping += shipping;
        m.orderCount += 1;
      });

      // Calculate derived metrics
      const result = Object.values(marketplaceMap).map(m => {
        m.grossProfit = m.revenue - m.cogs - m.fees - m.shipping;
        m.grossMargin = m.revenue > 0 ? (m.grossProfit / m.revenue) * 100 : 0;
        m.avgOrderValue = m.orderCount > 0 ? m.revenue / m.orderCount : 0;
        return m;
      });

      // Sort by revenue desc
      result.sort((a, b) => b.revenue - a.revenue);
      setMetrics(result);
    } catch (error) {
      console.error('Error fetching marketplace accounting data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  const marketplaceLabels: Record<string, string> = {
    amazon: 'Amazon',
    bestbuy: 'Best Buy',
    shopify: 'Shopify',
    manual: 'Manual',
  };

  const totals = metrics.reduce(
    (acc, m) => ({
      revenue: acc.revenue + m.revenue,
      cogs: acc.cogs + m.cogs,
      fees: acc.fees + m.fees,
      shipping: acc.shipping + m.shipping,
      grossProfit: acc.grossProfit + m.grossProfit,
      orderCount: acc.orderCount + m.orderCount,
    }),
    { revenue: 0, cogs: 0, fees: 0, shipping: 0, grossProfit: 0, orderCount: 0 }
  );
  const totalMargin = totals.revenue > 0 ? (totals.grossProfit / totals.revenue) * 100 : 0;

  const chartData = metrics.map(m => ({
    name: marketplaceLabels[m.marketplace] || m.marketplace,
    Revenue: m.revenue,
    COGS: m.cogs,
    Fees: m.fees,
    Shipping: m.shipping,
    'Gross Profit': m.grossProfit,
  }));

  const periodOptions = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return { value: format(date, 'yyyy-MM'), label: format(date, 'MMMM yyyy') };
  });

  const handleExport = () => {
    const header = 'Marketplace,Revenue,COGS,Fees,Shipping,Gross Profit,Margin %,Orders,Avg Order';
    const rows = metrics.map(m =>
      `${marketplaceLabels[m.marketplace] || m.marketplace},${m.revenue.toFixed(2)},${m.cogs.toFixed(2)},${m.fees.toFixed(2)},${m.shipping.toFixed(2)},${m.grossProfit.toFixed(2)},${m.grossMargin.toFixed(1)}%,${m.orderCount},${m.avgOrderValue.toFixed(2)}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marketplace-accounting-${selectedPeriod}.csv`;
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
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-[200px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" /> Total Revenue
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totals.revenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" /> Gross Profit
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totals.grossProfit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Percent className="h-4 w-4" /> Gross Margin
            </div>
            <p className="text-2xl font-bold">{totalMargin.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <ShoppingCart className="h-4 w-4" /> Total Orders
            </div>
            <p className="text-2xl font-bold">{totals.orderCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue & Costs by Channel</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} className="text-xs" />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="COGS" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Fees" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Shipping" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-Marketplace P&L</CardTitle>
          <CardDescription>Detailed breakdown of revenue, costs, and margins by sales channel</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead className="text-right">Shipping</TableHead>
                <TableHead className="text-right">Gross Profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Avg Order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map(m => (
                <TableRow key={m.marketplace}>
                  <TableCell className="font-medium">
                    {marketplaceLabels[m.marketplace] || m.marketplace}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(m.revenue)}</TableCell>
                  <TableCell className="text-right text-destructive">{formatCurrency(m.cogs)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatCurrency(m.fees)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatCurrency(m.shipping)}</TableCell>
                  <TableCell className="text-right font-medium">
                    <span className={m.grossProfit >= 0 ? 'text-emerald-600' : 'text-destructive'}>
                      {formatCurrency(m.grossProfit)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={m.grossMargin >= 20 ? 'default' : m.grossMargin >= 10 ? 'secondary' : 'destructive'}>
                      {m.grossMargin.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{m.orderCount}</TableCell>
                  <TableCell className="text-right">{formatCurrency(m.avgOrderValue)}</TableCell>
                </TableRow>
              ))}
              {metrics.length > 1 && (
                <TableRow className="font-bold border-t-2">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.revenue)}</TableCell>
                  <TableCell className="text-right text-destructive">{formatCurrency(totals.cogs)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatCurrency(totals.fees)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatCurrency(totals.shipping)}</TableCell>
                  <TableCell className="text-right">
                    <span className={totals.grossProfit >= 0 ? 'text-emerald-600' : 'text-destructive'}>
                      {formatCurrency(totals.grossProfit)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={totalMargin >= 20 ? 'default' : 'secondary'}>
                      {totalMargin.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{totals.orderCount}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals.orderCount > 0 ? totals.revenue / totals.orderCount : 0)}
                  </TableCell>
                </TableRow>
              )}
              {metrics.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No sales data for this period
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
