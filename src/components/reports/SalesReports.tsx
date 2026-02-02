import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Download, TrendingUp, MapPin, Package, ShoppingCart, RefreshCw } from 'lucide-react';
import { format, subMonths, startOfMonth, subDays } from 'date-fns';

const COLORS = ['hsl(var(--primary))', 'hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)', 'hsl(280, 65%, 60%)', 'hsl(25, 95%, 53%)', 'hsl(340, 82%, 52%)'];
const MARKETPLACE_COLORS: Record<string, string> = {
  shopify: '#6EE7B7',
  amazon: '#FB923C',
  bestbuy: '#3B82F6',
  other: '#94A3B8',
};

interface SalesData {
  id: string;
  sale_price: number;
  profit: number;
  marketplace: string;
  sale_date: string;
  shipping_address: string | null;
  device?: { brand: string; model: string; category: string | null };
}

export function SalesReports() {
  const { selectedCompany, isSuperAdmin } = useCompany();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('6');
  const [viewType, setViewType] = useState<'marketplace' | 'category' | 'product' | 'province' | 'time'>('marketplace');
  const [sales, setSales] = useState<SalesData[]>([]);

  useEffect(() => {
    fetchSales();
  }, [dateRange, selectedCompany]);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const months = parseInt(dateRange);
      const startDate = startOfMonth(subMonths(new Date(), months - 1));

      let query = supabase
        .from('sales')
        .select('id, sale_price, profit, marketplace, sale_date, shipping_address, devices(brand, model, category)')
        .gte('sale_date', startDate.toISOString());

      if (selectedCompany && !isSuperAdmin) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      setSales((data || []).map(s => ({
        ...s,
        device: s.devices as any,
      })));
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  // Data aggregations
  const byMarketplace = sales.reduce((acc, s) => {
    acc[s.marketplace] = (acc[s.marketplace] || 0) + Number(s.sale_price);
    return acc;
  }, {} as Record<string, number>);

  const byCategory = sales.reduce((acc, s) => {
    const cat = s.device?.category || 'Other';
    acc[cat] = (acc[cat] || 0) + Number(s.sale_price);
    return acc;
  }, {} as Record<string, number>);

  const byProduct = sales.reduce((acc, s) => {
    if (s.device) {
      const key = `${s.device.brand} ${s.device.model}`;
      if (!acc[key]) acc[key] = { revenue: 0, units: 0, profit: 0 };
      acc[key].revenue += Number(s.sale_price);
      acc[key].units += 1;
      acc[key].profit += Number(s.profit || 0);
    }
    return acc;
  }, {} as Record<string, { revenue: number; units: number; profit: number }>);

  const byProvince = sales.reduce((acc, s) => {
    // Extract province from shipping address
    const address = s.shipping_address || '';
    const provinceMatch = address.match(/\b(ON|BC|AB|QC|MB|SK|NS|NB|NL|PE|YT|NT|NU)\b/i);
    const province = provinceMatch ? provinceMatch[1].toUpperCase() : 'Unknown';
    acc[province] = (acc[province] || 0) + Number(s.sale_price);
    return acc;
  }, {} as Record<string, number>);

  const byTime = (() => {
    const months = parseInt(dateRange);
    const data: Record<string, { revenue: number; orders: number }> = {};
    for (let i = 0; i < months; i++) {
      const date = subMonths(new Date(), months - 1 - i);
      data[format(date, 'MMM yyyy')] = { revenue: 0, orders: 0 };
    }
    sales.forEach(s => {
      const key = format(new Date(s.sale_date), 'MMM yyyy');
      if (data[key]) {
        data[key].revenue += Number(s.sale_price);
        data[key].orders += 1;
      }
    });
    return data;
  })();

  // Calculate return rate (simplified - would need actual returns tracking)
  const returnRate = 0; // Placeholder

  const handleExport = () => {
    const headers = ['Date', 'Marketplace', 'Product', 'Category', 'Province', 'Sale Price', 'Profit'];
    const rows = sales.map(s => [
      s.sale_date,
      s.marketplace,
      s.device ? `${s.device.brand} ${s.device.model}` : '-',
      s.device?.category || '-',
      s.shipping_address?.match(/\b(ON|BC|AB|QC|MB|SK|NS|NB|NL|PE|YT|NT|NU)\b/i)?.[1] || '-',
      s.sale_price,
      s.profit || 0,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.sale_price), 0);
  const totalOrders = sales.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map(i => (
          <Card key={i} className="animate-pulse"><CardContent className="h-64" /></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Last 3 months</SelectItem>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
          </SelectContent>
        </Select>

        <Select value={viewType} onValueChange={(v) => setViewType(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="marketplace">By Marketplace</SelectItem>
            <SelectItem value="category">By Category</SelectItem>
            <SelectItem value="product">By Product</SelectItem>
            <SelectItem value="province">By Province</SelectItem>
            <SelectItem value="time">By Time Period</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={handleExport} className="ml-auto">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-xl font-bold">{formatCurrency(totalRevenue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <ShoppingCart className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-xl font-bold">{totalOrders.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Package className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Order Value</p>
                <p className="text-xl font-bold">{formatCurrency(avgOrderValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <RefreshCw className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Return Rate</p>
                <p className="text-xl font-bold">{returnRate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart based on view type */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {viewType === 'marketplace' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Revenue by Marketplace</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={Object.entries(byMarketplace).map(([name, value]) => ({
                          name: name.charAt(0).toUpperCase() + name.slice(1),
                          value,
                          color: MARKETPLACE_COLORS[name] || MARKETPLACE_COLORS.other,
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {Object.entries(byMarketplace).map(([name], index) => (
                          <Cell key={name} fill={MARKETPLACE_COLORS[name] || MARKETPLACE_COLORS.other} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Marketplace Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(byMarketplace)
                    .sort((a, b) => b[1] - a[1])
                    .map(([mp, value]) => {
                      const percentage = totalRevenue > 0 ? (value / totalRevenue) * 100 : 0;
                      return (
                        <div key={mp} className="flex items-center gap-4">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: MARKETPLACE_COLORS[mp] || MARKETPLACE_COLORS.other }}
                          />
                          <span className="flex-1 capitalize">{mp}</span>
                          <span className="font-medium">{formatCurrency(value)}</span>
                          <Badge variant="outline">{percentage.toFixed(1)}%</Badge>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {viewType === 'category' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Sales by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={Object.entries(byCategory).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {Object.entries(byCategory).map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Category Details</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(byCategory)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, value]) => (
                        <TableRow key={cat}>
                          <TableCell className="font-medium">{cat}</TableCell>
                          <TableCell className="text-right">{formatCurrency(value)}</TableCell>
                          <TableCell className="text-right">
                            {totalRevenue > 0 ? ((value / totalRevenue) * 100).toFixed(1) : 0}%
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {viewType === 'product' && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Sales by Product</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units Sold</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Avg Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(byProduct)
                    .sort((a, b) => b[1].revenue - a[1].revenue)
                    .slice(0, 20)
                    .map(([product, data]) => (
                      <TableRow key={product}>
                        <TableCell className="font-medium">{product}</TableCell>
                        <TableCell className="text-right">{data.units}</TableCell>
                        <TableCell className="text-right">{formatCurrency(data.revenue)}</TableCell>
                        <TableCell className="text-right text-emerald-600">{formatCurrency(data.profit)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(data.revenue / data.units)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {viewType === 'province' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Sales by Province
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={Object.entries(byProvince)
                        .sort((a, b) => b[1] - a[1])
                        .map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }))}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" width={60} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {Object.entries(byProvince).map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Province Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(byProvince)
                    .sort((a, b) => b[1] - a[1])
                    .map(([province, value], i) => {
                      const percentage = totalRevenue > 0 ? (value / totalRevenue) * 100 : 0;
                      return (
                        <div key={province} className="flex items-center gap-4">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: COLORS[i % COLORS.length] }}
                          />
                          <span className="flex-1 font-medium">{province}</span>
                          <span>{formatCurrency(value)}</span>
                          <Badge variant="outline">{percentage.toFixed(1)}%</Badge>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {viewType === 'time' && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Sales Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={Object.entries(byTime).map(([month, data]) => ({ month, ...data }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip formatter={(value: number, name: string) => 
                      name === 'revenue' ? formatCurrency(value) : value
                    } />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} name="Revenue" />
                    <Line yAxisId="right" type="monotone" dataKey="orders" stroke="hsl(142, 71%, 45%)" strokeWidth={2} name="Orders" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
