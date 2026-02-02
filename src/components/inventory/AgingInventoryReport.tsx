import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Clock, AlertTriangle, Download } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';

interface Device {
  id: string;
  brand: string;
  model: string;
  imei: string | null;
  storage: string | null;
  cost_price: number;
  purchase_date: string | null;
  created_at: string;
  company_id: string;
  condition: string;
}

type AgingFilter = '30' | '60' | '90' | '180' | 'all';

export function AgingInventoryReport() {
  const { selectedCompany, isSuperAdmin, companies } = useCompany();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [agingFilter, setAgingFilter] = useState<AgingFilter>('30');

  useEffect(() => {
    fetchDevices();
  }, [selectedCompany]);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('devices')
        .select('id, brand, model, imei, storage, cost_price, purchase_date, created_at, company_id, condition')
        .eq('status', 'in_stock')
        .order('purchase_date', { ascending: true, nullsFirst: false });

      if (selectedCompany && !isSuperAdmin) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDevices((data || []) as Device[]);
    } catch (error) {
      console.error('Error fetching devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const agingDevices = useMemo(() => {
    const now = new Date();
    const filterDays = agingFilter === 'all' ? 0 : parseInt(agingFilter);

    return devices
      .map(d => {
        const purchaseDate = d.purchase_date || d.created_at;
        const daysInStock = differenceInDays(now, new Date(purchaseDate));
        return { ...d, daysInStock };
      })
      .filter(d => agingFilter === 'all' || d.daysInStock >= filterDays)
      .sort((a, b) => b.daysInStock - a.daysInStock);
  }, [devices, agingFilter]);

  const summary = useMemo(() => {
    const totalValue = agingDevices.reduce((sum, d) => sum + (d.cost_price || 0), 0);
    const avgDays = agingDevices.length > 0
      ? Math.round(agingDevices.reduce((sum, d) => sum + d.daysInStock, 0) / agingDevices.length)
      : 0;
    
    const brackets = {
      '30-60': agingDevices.filter(d => d.daysInStock >= 30 && d.daysInStock < 60).length,
      '60-90': agingDevices.filter(d => d.daysInStock >= 60 && d.daysInStock < 90).length,
      '90-180': agingDevices.filter(d => d.daysInStock >= 90 && d.daysInStock < 180).length,
      '180+': agingDevices.filter(d => d.daysInStock >= 180).length,
    };

    return { totalValue, avgDays, brackets, count: agingDevices.length };
  }, [agingDevices]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const getAgingBadge = (days: number) => {
    if (days >= 180) return <Badge variant="destructive">Critical</Badge>;
    if (days >= 90) return <Badge className="bg-orange-500">High</Badge>;
    if (days >= 60) return <Badge className="bg-amber-500">Medium</Badge>;
    return <Badge variant="secondary">Low</Badge>;
  };

  const handleExport = () => {
    const headers = ['Brand', 'Model', 'IMEI/Serial', 'Storage', 'Condition', 'Cost', 'Days in Stock', 'Purchase Date', 'Company'];
    const rows = agingDevices.map(d => {
      const company = companies.find(c => c.id === d.company_id);
      return [
        d.brand,
        d.model,
        d.imei || '-',
        d.storage || '-',
        d.condition,
        d.cost_price.toFixed(2),
        d.daysInStock.toString(),
        d.purchase_date ? format(new Date(d.purchase_date), 'yyyy-MM-dd') : '-',
        company?.code || '-',
      ];
    });

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aging-inventory-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{summary.count}</div>
            <p className="text-sm text-muted-foreground">Aging Items</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{formatCurrency(summary.totalValue)}</div>
            <p className="text-sm text-muted-foreground">Total Value at Risk</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{summary.avgDays} days</div>
            <p className="text-sm text-muted-foreground">Avg. Age</p>
          </CardContent>
        </Card>
        <Card className="border-red-500/30">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{summary.brackets['180+']}</div>
            <p className="text-sm text-muted-foreground">Critical (&gt;180 days)</p>
          </CardContent>
        </Card>
      </div>

      {/* Age Brackets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Age Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
              <Badge variant="secondary">30-60 days</Badge>
              <span className="font-medium">{summary.brackets['30-60']}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
              <Badge className="bg-amber-500">60-90 days</Badge>
              <span className="font-medium">{summary.brackets['60-90']}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
              <Badge className="bg-orange-500">90-180 days</Badge>
              <span className="font-medium">{summary.brackets['90-180']}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
              <Badge variant="destructive">180+ days</Badge>
              <span className="font-medium">{summary.brackets['180+']}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Aging Items Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Aging Inventory
              </CardTitle>
              <CardDescription>Items in stock longer than threshold</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={agingFilter} onValueChange={(v) => setAgingFilter(v as AgingFilter)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30+ days</SelectItem>
                  <SelectItem value="60">60+ days</SelectItem>
                  <SelectItem value="90">90+ days</SelectItem>
                  <SelectItem value="180">180+ days</SelectItem>
                  <SelectItem value="all">All items</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {agingDevices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No aging inventory found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>IMEI/Serial</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Days in Stock</TableHead>
                    <TableHead>Risk Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agingDevices.slice(0, 50).map((device) => (
                    <TableRow key={device.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{device.brand} {device.model}</p>
                          {device.storage && (
                            <p className="text-sm text-muted-foreground">{device.storage}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {device.imei || '-'}
                      </TableCell>
                      <TableCell className="capitalize">{device.condition}</TableCell>
                      <TableCell className="text-right">{formatCurrency(device.cost_price)}</TableCell>
                      <TableCell className="text-right font-medium">{device.daysInStock}</TableCell>
                      <TableCell>{getAgingBadge(device.daysInStock)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {agingDevices.length > 50 && (
                <p className="text-sm text-muted-foreground text-center mt-4">
                  Showing 50 of {agingDevices.length} items. Export for full list.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
