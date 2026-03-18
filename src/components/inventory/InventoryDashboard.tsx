import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, DollarSign, TrendingUp, Clock, AlertTriangle, BarChart3, Boxes } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { differenceInDays } from 'date-fns';

interface Device {
  id: string;
  brand: string;
  model: string;
  category: string;
  cost_price: number;
  status: string;
  condition: string;
  company_id: string;
  purchase_date: string | null;
  created_at: string;
}

interface Sale {
  id: string;
  sale_date: string;
  device_id: string;
  company_id: string;
}

interface ProductSummary {
  totalProducts: number;
  totalUnits: number;
  totalValue: number;
  lowStock: number;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: any;
  trend?: { value: number; label: string };
  alert?: boolean;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(142, 71%, 45%)', 'hsl(221, 83%, 53%)', 'hsl(280, 65%, 60%)'];

function MetricCard({ title, value, description, icon: Icon, trend, alert }: MetricCardProps) {
  return (
    <Card className={alert ? 'border-amber-500/50' : ''}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${alert ? 'text-amber-500' : 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        {trend && (
          <div className={`flex items-center text-xs mt-1 ${trend.value >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            <TrendingUp className="h-3 w-3 mr-1" />
            {trend.label}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function InventoryDashboard() {
  const { selectedCompany, isSuperAdmin, companies } = useCompany();
  const [devices, setDevices] = useState<Device[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [productSummary, setProductSummary] = useState<ProductSummary>({ totalProducts: 0, totalUnits: 0, totalValue: 0, lowStock: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [selectedCompany]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let devicesQuery = supabase
        .from('devices')
        .select('id, brand, model, category, cost_price, status, condition, company_id, purchase_date, created_at');

      let salesQuery = supabase
        .from('sales')
        .select('id, sale_date, device_id, company_id')
        .not('device_id', 'is', null);

      let productsQuery = supabase
        .from('products')
        .select('id, cost_price, quantity_on_hand, reorder_point, status')
        .eq('status', 'active');

      if (selectedCompany) {
        devicesQuery = devicesQuery.eq('company_id', selectedCompany.id);
        salesQuery = salesQuery.eq('company_id', selectedCompany.id);
        productsQuery = productsQuery.eq('company_id', selectedCompany.id);
      }

      const [devicesRes, salesRes, productsRes] = await Promise.all([devicesQuery, salesQuery, productsQuery]);

      if (devicesRes.error) throw devicesRes.error;
      if (salesRes.error) throw salesRes.error;

      setDevices((devicesRes.data || []) as Device[]);
      setSales((salesRes.data || []) as Sale[]);

      // Calculate product summary
      const prods = productsRes.data || [];
      setProductSummary({
        totalProducts: prods.length,
        totalUnits: prods.reduce((s, p: any) => s + (p.quantity_on_hand || 0), 0),
        totalValue: prods.reduce((s, p: any) => s + (p.cost_price || 0) * (p.quantity_on_hand || 0), 0),
        lowStock: prods.filter((p: any) => p.reorder_point > 0 && p.quantity_on_hand <= p.reorder_point).length,
      });
    } catch (error) {
      console.error('Error fetching inventory data:', error);
    } finally {
      setLoading(false);
    }
  };

  const metrics = useMemo(() => {
    const inStock = devices.filter(d => d.status === 'in_stock');
    const soldDevices = devices.filter(d => d.status === 'sold');
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const monthlySales = sales.filter(s => new Date(s.sale_date) >= thirtyDaysAgo);

    const totalValue = inStock.reduce((sum, d) => sum + (d.cost_price || 0), 0);

    const soldWithDates = soldDevices.filter(d => d.purchase_date);
    let avgDaysToSell = 0;
    if (soldWithDates.length > 0) {
      const totalDays = soldWithDates.reduce((sum, d) => {
        const sale = sales.find(s => s.device_id === d.id);
        if (sale && d.purchase_date) {
          return sum + differenceInDays(new Date(sale.sale_date), new Date(d.purchase_date));
        }
        return sum;
      }, 0);
      avgDaysToSell = Math.round(totalDays / soldWithDates.length);
    }

    const agingItems = inStock.filter(d => {
      const purchaseDate = d.purchase_date || d.created_at;
      return differenceInDays(now, new Date(purchaseDate)) > 30;
    });

    const lowStock = inStock.length < 5;

    const byCategory: Record<string, { count: number; value: number }> = {};
    inStock.forEach(d => {
      const cat = d.category || 'phone';
      if (!byCategory[cat]) byCategory[cat] = { count: 0, value: 0 };
      byCategory[cat].count += 1;
      byCategory[cat].value += d.cost_price || 0;
    });

    const byBrand: Record<string, number> = {};
    inStock.forEach(d => {
      byBrand[d.brand] = (byBrand[d.brand] || 0) + 1;
    });

    const byCompany: Record<string, { count: number; value: number }> = {};
    inStock.forEach(d => {
      const company = companies.find(c => c.id === d.company_id);
      const companyCode = company?.code || 'Unknown';
      if (!byCompany[companyCode]) byCompany[companyCode] = { count: 0, value: 0 };
      byCompany[companyCode].count += 1;
      byCompany[companyCode].value += d.cost_price || 0;
    });

    const turnoverRate = inStock.length > 0 ? (soldDevices.length / inStock.length) * 100 : 0;

    return {
      totalInStock: inStock.length,
      totalValue,
      soldThisMonth: monthlySales.length,
      avgDaysToSell,
      agingItems: agingItems.length,
      lowStock,
      byCategory: Object.entries(byCategory).map(([name, data]) => ({ name, ...data })),
      byBrand: Object.entries(byBrand).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      byCompany: Object.entries(byCompany).map(([name, data]) => ({ name, ...data })),
      turnoverRate,
    };
  }, [devices, sales, companies]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  // Combined totals
  const combinedValue = metrics.totalValue + productSummary.totalValue;
  const combinedUnits = metrics.totalInStock + productSummary.totalUnits;

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="animate-pulse">
            <CardContent className="h-24" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Combined Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Inventory"
          value={combinedUnits}
          description={`${metrics.totalInStock} devices + ${productSummary.totalUnits} product units`}
          icon={Package}
          alert={metrics.lowStock || productSummary.lowStock > 0}
        />
        <MetricCard
          title="Total Value"
          value={formatCurrency(combinedValue)}
          description={`Devices: ${formatCurrency(metrics.totalValue)} · Products: ${formatCurrency(productSummary.totalValue)}`}
          icon={DollarSign}
        />
        <MetricCard
          title="Sold This Month"
          value={metrics.soldThisMonth}
          description="Devices — last 30 days"
          icon={TrendingUp}
        />
        <MetricCard
          title="Avg. Days to Sell"
          value={metrics.avgDaysToSell || '-'}
          description="From purchase to sale"
          icon={Clock}
        />
      </div>

      {/* Products summary card */}
      {productSummary.totalProducts > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3 mb-2">
              <Boxes className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">Products Inventory</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Active SKUs</p>
                <p className="text-lg font-bold">{productSummary.totalProducts}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Units</p>
                <p className="text-lg font-bold">{productSummary.totalUnits.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Inventory Value</p>
                <p className="text-lg font-bold">{formatCurrency(productSummary.totalValue)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Low Stock Alerts</p>
                <p className={`text-lg font-bold ${productSummary.lowStock > 0 ? 'text-amber-600' : ''}`}>
                  {productSummary.lowStock}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alerts */}
      {(metrics.lowStock || metrics.agingItems > 0 || productSummary.lowStock > 0) && (
        <div className="flex flex-wrap gap-2">
          {metrics.lowStock && (
            <Badge variant="outline" className="text-amber-600 border-amber-500">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Low Device Stock
            </Badge>
          )}
          {productSummary.lowStock > 0 && (
            <Badge variant="outline" className="text-amber-600 border-amber-500">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {productSummary.lowStock} product(s) below reorder point
            </Badge>
          )}
          {metrics.agingItems > 0 && (
            <Badge variant="outline" className="text-orange-600 border-orange-500">
              <Clock className="h-3 w-3 mr-1" />
              {metrics.agingItems} aging items (&gt;30 days)
            </Badge>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock by Brand */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Stock by Brand
            </CardTitle>
            <CardDescription>Top 10 brands in inventory</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.byBrand} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={100} className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Value by Company — shown in consolidated view */}
        {!selectedCompany && metrics.byCompany.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Inventory by Company</CardTitle>
              <CardDescription>Stock distribution across companies</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {metrics.byCompany.map((entry, index) => {
                  const fullName = companies.find(c => c.code === entry.name)?.name || entry.name;
                  return (
                    <div key={entry.name} className="p-4 rounded-xl border border-border/60 bg-muted/30 space-y-1">
                      <p className="text-sm font-medium text-muted-foreground">{fullName}</p>
                      <p className="text-2xl font-bold">{entry.count} <span className="text-sm font-normal text-muted-foreground">units</span></p>
                      <p className="text-sm text-muted-foreground">{formatCurrency(entry.value)} at cost</p>
                    </div>
                  );
                })}
              </div>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metrics.byCompany}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={5}
                      dataKey="value"
                      nameKey="name"
                    >
                      {metrics.byCompany.map((entry, index) => (
                        <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stock by Category */}
        <Card className={isSuperAdmin && metrics.byCompany.length > 1 ? '' : 'lg:col-span-1'}>
          <CardHeader>
            <CardTitle>Stock by Category</CardTitle>
            <CardDescription>Device types in inventory</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {metrics.byCategory.map((cat, idx) => (
                <div key={cat.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }} 
                    />
                    <span className="capitalize">{cat.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{cat.count} units</p>
                    <p className="text-sm text-muted-foreground">{formatCurrency(cat.value)}</p>
                  </div>
                </div>
              ))}
              {metrics.byCategory.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No inventory data</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Turnover Rate */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-3xl font-bold">{metrics.turnoverRate.toFixed(1)}%</p>
              <p className="text-sm text-muted-foreground mt-1">Turnover Rate</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-3xl font-bold">{metrics.agingItems}</p>
              <p className="text-sm text-muted-foreground mt-1">Aging Items (&gt;30 days)</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-3xl font-bold">
                {metrics.totalInStock > 0 
                  ? formatCurrency(metrics.totalValue / metrics.totalInStock) 
                  : '-'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Avg. Device Value</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
