import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { MetricCard } from '@/components/ui/metric-card';
import {
  Package, Search, AlertTriangle, TrendingDown, Boxes, BarChart3,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface FBADevice {
  id: string;
  brand: string;
  model: string;
  storage: string | null;
  color: string | null;
  condition: string;
  cost_price: number;
  sku: string | null;
  category: string;
  purchase_date: string | null;
  created_at: string;
}

export function FBAInventoryTracker() {
  const { companies } = useCompany();
  const [devices, setDevices] = useState<FBADevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // VES company = Amazon FBA
  const vesCompany = companies.find(c => c.code === 'VES');

  useEffect(() => {
    if (vesCompany) fetchFBAInventory();
  }, [vesCompany]);

  const fetchFBAInventory = async () => {
    if (!vesCompany) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('id, brand, model, storage, color, condition, cost_price, sku, category, purchase_date, created_at')
        .eq('company_id', vesCompany.id)
        .eq('status', 'in_stock')
        .order('brand', { ascending: true });

      if (error) throw error;
      setDevices((data || []) as FBADevice[]);
    } catch (err) {
      console.error('Error fetching FBA inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  const metrics = useMemo(() => {
    const totalUnits = devices.length;
    const totalValue = devices.reduce((sum, d) => sum + d.cost_price, 0);
    const avgCost = totalUnits > 0 ? totalValue / totalUnits : 0;

    // Group by brand+model for aggregated view
    const grouped: Record<string, { brand: string; model: string; storage: string | null; units: number; value: number }> = {};
    devices.forEach(d => {
      const key = `${d.brand}-${d.model}-${d.storage || ''}`;
      if (!grouped[key]) {
        grouped[key] = { brand: d.brand, model: d.model, storage: d.storage, units: 0, value: 0 };
      }
      grouped[key].units += 1;
      grouped[key].value += d.cost_price;
    });

    const productGroups = Object.values(grouped).sort((a, b) => b.units - a.units);

    // Low stock products (1-2 units)
    const lowStockProducts = productGroups.filter(p => p.units <= 2);

    // By brand chart data
    const byBrand: Record<string, number> = {};
    devices.forEach(d => {
      byBrand[d.brand] = (byBrand[d.brand] || 0) + 1;
    });
    const brandChartData = Object.entries(byBrand)
      .map(([name, units]) => ({ name, units }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 8);

    // Aging: devices at FBA > 90 days
    const now = new Date();
    const agingUnits = devices.filter(d => {
      const date = new Date(d.purchase_date || d.created_at);
      return (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24) > 90;
    }).length;

    return { totalUnits, totalValue, avgCost, productGroups, lowStockProducts, brandChartData, agingUnits };
  }, [devices]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return metrics.productGroups;
    const term = searchTerm.toLowerCase();
    return metrics.productGroups.filter(
      p => p.brand.toLowerCase().includes(term) || p.model.toLowerCase().includes(term)
    );
  }, [metrics.productGroups, searchTerm]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="FBA Units in Stock"
          value={metrics.totalUnits}
          icon={Boxes}
        />
        <MetricCard
          title="FBA Inventory Value"
          value={formatCurrency(metrics.totalValue)}
          icon={Package}
          change="At cost"
          changeType="neutral"
        />
        <MetricCard
          title="Low Stock SKUs"
          value={metrics.lowStockProducts.length}
          icon={AlertTriangle}
          change={metrics.lowStockProducts.length > 0 ? '≤2 units remaining' : 'All stocked'}
          changeType={metrics.lowStockProducts.length > 0 ? 'negative' : 'positive'}
        />
        <MetricCard
          title="Aging Units (90+ days)"
          value={metrics.agingUnits}
          icon={TrendingDown}
          change={metrics.agingUnits > 0 ? 'Consider removal or price drop' : 'Healthy'}
          changeType={metrics.agingUnits > 0 ? 'negative' : 'positive'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Brand distribution chart */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4" />
              FBA Stock by Brand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.brandChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={80} className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="units" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Product-level table */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">FBA Product Inventory</CardTitle>
                <CardDescription>Units aggregated by product at Amazon warehouses</CardDescription>
              </div>
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-8 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[340px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-center">Units</TableHead>
                    <TableHead className="text-right">Total Value</TableHead>
                    <TableHead className="text-right">Avg Cost</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{p.brand} {p.model}</p>
                          {p.storage && <p className="text-xs text-muted-foreground">{p.storage}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-semibold">{p.units}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(p.value)}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(p.value / p.units)}</TableCell>
                      <TableCell>
                        {p.units <= 2 ? (
                          <Badge variant="destructive" className="text-[10px]">Low Stock</Badge>
                        ) : p.units <= 5 ? (
                  <Badge variant="outline" className="text-amber-600 border-amber-500 text-[10px]">Moderate</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Stocked</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No FBA inventory found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low stock alert list */}
      {metrics.lowStockProducts.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              FBA Restock Alerts
            </CardTitle>
            <CardDescription>Products with 2 or fewer units at Amazon warehouses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {metrics.lowStockProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-amber-500/20 bg-amber-50/5">
                  <div>
                    <p className="font-medium text-sm">{p.brand} {p.model}</p>
                    {p.storage && <p className="text-xs text-muted-foreground">{p.storage}</p>}
                  </div>
                  <Badge variant="destructive" className="text-xs">{p.units} left</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
