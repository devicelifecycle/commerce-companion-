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
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Download, Package, TrendingUp, Clock, AlertTriangle, Layers } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

const COLORS = ['hsl(var(--primary))', 'hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)', 'hsl(280, 65%, 60%)', 'hsl(25, 95%, 53%)', 'hsl(340, 82%, 52%)'];

interface Device {
  id: string;
  brand: string;
  model: string;
  category: string | null;
  storage: string | null;
  color: string | null;
  condition: string;
  cost_price: number;
  sale_price: number | null;
  status: string;
  created_at: string;
  company_id: string | null;
}

interface InventoryReportsProps {
  companyView?: 'consolidated' | string;
}

export function InventoryReports({ companyView = 'consolidated' }: InventoryReportsProps) {
  const { selectedCompany, companies, isSuperAdmin } = useCompany();
  const [loading, setLoading] = useState(true);
  const [viewType, setViewType] = useState<'valuation' | 'category' | 'brand' | 'aging' | 'turnover'>('valuation');
  const [devices, setDevices] = useState<Device[]>([]);
  const [salesData, setSalesData] = useState<{ device_id: string; sale_date: string }[]>([]);

  useEffect(() => {
    fetchData();
  }, [companyView]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = supabase.from('devices').select('*').limit(5000);
      
      if (companyView !== 'consolidated') {
        query = query.eq('company_id', companyView);
      }

      const { data: devicesData } = await query;
      setDevices((devicesData || []) as Device[]);

      // Fetch sales for turnover calculation
      const { data: salesDataResult } = await supabase
        .from('sales')
        .select('device_id, sale_date');
      setSalesData(salesDataResult || []);

    } catch (error) {
      console.error('Error fetching inventory data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  // Calculations
  const inStockDevices = devices.filter(d => d.status === 'in_stock');
  const soldDevices = devices.filter(d => d.status === 'sold');
  const totalInventoryValue = inStockDevices.reduce((sum, d) => sum + Number(d.cost_price), 0);
  const totalSoldValue = soldDevices.reduce((sum, d) => sum + Number(d.sale_price || 0), 0);

  // By Category
  const byCategory = inStockDevices.reduce((acc, d) => {
    const cat = d.category || 'Other';
    if (!acc[cat]) acc[cat] = { count: 0, value: 0 };
    acc[cat].count += 1;
    acc[cat].value += Number(d.cost_price);
    return acc;
  }, {} as Record<string, { count: number; value: number }>);

  // By Brand
  const byBrand = inStockDevices.reduce((acc, d) => {
    if (!acc[d.brand]) acc[d.brand] = { count: 0, value: 0 };
    acc[d.brand].count += 1;
    acc[d.brand].value += Number(d.cost_price);
    return acc;
  }, {} as Record<string, { count: number; value: number }>);

  // Aging analysis
  const now = new Date();
  const agingBuckets = {
    '0-30 days': { count: 0, value: 0 },
    '31-60 days': { count: 0, value: 0 },
    '61-90 days': { count: 0, value: 0 },
    '91-180 days': { count: 0, value: 0 },
    '180+ days': { count: 0, value: 0 },
  };

  inStockDevices.forEach(d => {
    const age = differenceInDays(now, new Date(d.created_at));
    let bucket: keyof typeof agingBuckets;
    if (age <= 30) bucket = '0-30 days';
    else if (age <= 60) bucket = '31-60 days';
    else if (age <= 90) bucket = '61-90 days';
    else if (age <= 180) bucket = '91-180 days';
    else bucket = '180+ days';
    
    agingBuckets[bucket].count += 1;
    agingBuckets[bucket].value += Number(d.cost_price);
  });

  // Turnover calculation
  const calculateTurnover = () => {
    const avgInventory = totalInventoryValue / 2; // Simplified
    const cogs = soldDevices.reduce((sum, d) => sum + Number(d.cost_price), 0);
    return avgInventory > 0 ? cogs / avgInventory : 0;
  };

  // Average days to sell
  const calculateAvgDaysToSell = () => {
    const soldWithDates = soldDevices.filter(d => {
      const sale = salesData.find(s => s.device_id === d.id);
      return sale && d.created_at;
    });
    
    if (soldWithDates.length === 0) return 0;
    
    const totalDays = soldWithDates.reduce((sum, d) => {
      const sale = salesData.find(s => s.device_id === d.id);
      if (sale) {
        return sum + differenceInDays(new Date(sale.sale_date), new Date(d.created_at));
      }
      return sum;
    }, 0);
    
    return totalDays / soldWithDates.length;
  };

  const turnoverRate = calculateTurnover();
  const avgDaysToSell = calculateAvgDaysToSell();

  const handleExport = () => {
    const headers = ['Brand', 'Model', 'Category', 'Storage', 'Condition', 'Cost', 'Status', 'Days in Stock'];
    const rows = devices.map(d => [
      d.brand,
      d.model,
      d.category || '-',
      d.storage || '-',
      d.condition,
      d.cost_price,
      d.status,
      differenceInDays(now, new Date(d.created_at)),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <Select value={viewType} onValueChange={(v) => setViewType(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="valuation">Valuation Report</SelectItem>
            <SelectItem value="category">By Category</SelectItem>
            <SelectItem value="brand">By Brand</SelectItem>
            <SelectItem value="aging">Stock Aging</SelectItem>
            <SelectItem value="turnover">Turnover Analysis</SelectItem>
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
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-xl font-bold">{formatCurrency(totalInventoryValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Layers className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Units in Stock</p>
                <p className="text-xl font-bold">{inStockDevices.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Turnover Rate</p>
                <p className="text-xl font-bold">{turnoverRate.toFixed(2)}x</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Days to Sell</p>
                <p className="text-xl font-bold">{avgDaysToSell.toFixed(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content based on view type */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {viewType === 'valuation' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Inventory Value by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={Object.entries(byCategory).map(([name, data], i) => ({
                          name,
                          value: data.value,
                          fill: COLORS[i % COLORS.length],
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {Object.entries(byCategory).map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
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
                <CardTitle>Valuation Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">Avg Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(byCategory)
                      .sort((a, b) => b[1].value - a[1].value)
                      .map(([cat, data]) => (
                        <TableRow key={cat}>
                          <TableCell className="font-medium">{cat}</TableCell>
                          <TableCell className="text-right">{data.count}</TableCell>
                          <TableCell className="text-right">{formatCurrency(data.value)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(data.value / data.count)}</TableCell>
                        </TableRow>
                      ))}
                    <TableRow className="font-bold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{inStockDevices.length}</TableCell>
                      <TableCell className="text-right">{formatCurrency(totalInventoryValue)}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(inStockDevices.length > 0 ? totalInventoryValue / inStockDevices.length : 0)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {viewType === 'brand' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Inventory by Brand</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={Object.entries(byBrand)
                        .sort((a, b) => b[1].value - a[1].value)
                        .slice(0, 10)
                        .map(([name, data], i) => ({ name, ...data, fill: COLORS[i % COLORS.length] }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number, name: string) =>
                        name === 'value' ? formatCurrency(value) : value
                      } />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {Object.entries(byBrand).slice(0, 10).map((_, i) => (
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
                <CardTitle>Brand Details</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(byBrand)
                      .sort((a, b) => b[1].value - a[1].value)
                      .slice(0, 15)
                      .map(([brand, data]) => (
                        <TableRow key={brand}>
                          <TableCell className="font-medium">{brand}</TableCell>
                          <TableCell className="text-right">{data.count}</TableCell>
                          <TableCell className="text-right">{formatCurrency(data.value)}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {viewType === 'aging' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Stock Aging Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={Object.entries(agingBuckets).map(([name, data], i) => ({
                      name,
                      ...data,
                      fill: i < 2 ? 'hsl(142, 71%, 45%)' : i < 4 ? 'hsl(45, 93%, 47%)' : 'hsl(0, 84%, 60%)',
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" name="Units" radius={[4, 4, 0, 0]}>
                        {Object.entries(agingBuckets).map(([_, data], i) => (
                          <Cell key={i} fill={i < 2 ? 'hsl(142, 71%, 45%)' : i < 4 ? 'hsl(45, 93%, 47%)' : 'hsl(0, 84%, 60%)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Aging Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(agingBuckets).map(([bucket, data], i) => {
                    const percentage = inStockDevices.length > 0 
                      ? (data.count / inStockDevices.length) * 100 
                      : 0;
                    const color = i < 2 ? 'bg-emerald-500' : i < 4 ? 'bg-amber-500' : 'bg-destructive';
                    
                    return (
                      <div key={bucket}>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium">{bucket}</span>
                          <div className="flex gap-4">
                            <span className="text-sm">{data.count} units</span>
                            <span className="text-sm font-medium">{formatCurrency(data.value)}</span>
                          </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full`} style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {viewType === 'turnover' && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Inventory Turnover Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-6 rounded-lg bg-muted/30">
                  <p className="text-4xl font-bold">{turnoverRate.toFixed(2)}x</p>
                  <p className="text-sm text-muted-foreground mt-2">Inventory Turnover Rate</p>
                  <p className="text-xs text-muted-foreground mt-1">COGS ÷ Avg Inventory</p>
                </div>
                <div className="text-center p-6 rounded-lg bg-muted/30">
                  <p className="text-4xl font-bold">{avgDaysToSell.toFixed(0)}</p>
                  <p className="text-sm text-muted-foreground mt-2">Days to Sell (Avg)</p>
                  <p className="text-xs text-muted-foreground mt-1">Time from purchase to sale</p>
                </div>
                <div className="text-center p-6 rounded-lg bg-muted/30">
                  <p className="text-4xl font-bold">{soldDevices.length}</p>
                  <p className="text-sm text-muted-foreground mt-2">Units Sold</p>
                  <p className="text-xs text-muted-foreground mt-1">Total devices sold</p>
                </div>
              </div>

              <div className="mt-6">
                <h4 className="font-semibold mb-4">Slow-Moving Inventory (90+ days)</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Days in Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inStockDevices
                      .filter(d => differenceInDays(now, new Date(d.created_at)) > 90)
                      .sort((a, b) => 
                        differenceInDays(now, new Date(b.created_at)) - differenceInDays(now, new Date(a.created_at))
                      )
                      .slice(0, 10)
                      .map(d => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.brand} {d.model}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{d.condition}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(d.cost_price)}</TableCell>
                          <TableCell className="text-right text-destructive">
                            {differenceInDays(now, new Date(d.created_at))} days
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {viewType === 'category' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Units by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={Object.entries(byCategory).map(([name, data], i) => ({ name, ...data, fill: COLORS[i % COLORS.length] }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" name="Units" radius={[4, 4, 0, 0]}>
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
                <CardTitle>Category Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(byCategory)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([cat, data], i) => {
                      const percentage = inStockDevices.length > 0 
                        ? (data.count / inStockDevices.length) * 100 
                        : 0;
                      return (
                        <div key={cat} className="flex items-center gap-4">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="flex-1">{cat}</span>
                          <span>{data.count} units</span>
                          <Badge variant="outline">{percentage.toFixed(1)}%</Badge>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
