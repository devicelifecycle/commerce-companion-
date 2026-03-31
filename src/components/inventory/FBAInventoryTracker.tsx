import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MetricCard } from '@/components/ui/metric-card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Package, Search, AlertTriangle, TrendingDown, Boxes, BarChart3, Send,
  CheckCircle2, Truck, ArrowRight, MoreHorizontal, XCircle, Undo2, DollarSign,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';

type FulfillmentChannel = 'local' | 'fba' | 'in_transit_fba';

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
  fulfillment_channel: string | null;
  company_id: string | null;
}

export function FBAInventoryTracker() {
  const { companies } = useCompany();
  const { logEvent } = useAuditLog();
  const [devices, setDevices] = useState<FBADevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [selectedTransitIds, setSelectedTransitIds] = useState<Set<string>>(new Set());
  const [selectedFbaIds, setSelectedFbaIds] = useState<Set<string>>(new Set());
  const [confirmingArrival, setConfirmingArrival] = useState(false);

  // Claim dialog state
  const [claimDialog, setClaimDialog] = useState<{
    type: 'lost' | 'damaged';
    deviceIds: string[];
  } | null>(null);
  const [claimAmount, setClaimAmount] = useState('');
  const [claimNotes, setClaimNotes] = useState('');
  const [claimProcessing, setClaimProcessing] = useState(false);

  // Return to local confirmation
  const [returnToLocalIds, setReturnToLocalIds] = useState<string[]>([]);

  const { selectedCompany } = useCompany();

  useEffect(() => {
    fetchFBAInventory();
  }, [selectedCompany, channelFilter]);

  const fetchFBAInventory = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('devices')
        .select('id, brand, model, storage, color, condition, cost_price, sku, category, purchase_date, created_at, fulfillment_channel, company_id')
        .eq('status', 'in_stock')
        .order('brand', { ascending: true });

      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

      if (channelFilter !== 'all') {
        query = query.eq('fulfillment_channel', channelFilter);
      } else {
        query = query.in('fulfillment_channel', ['fba', 'in_transit_fba']);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDevices((data || []) as FBADevice[]);
    } catch (err) {
      console.error('Error fetching FBA inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAtFBA = async (deviceIds: string[]) => {
    if (deviceIds.length === 0) return;
    setConfirmingArrival(true);
    try {
      const { error } = await supabase
        .from('devices')
        .update({ fulfillment_channel: 'fba' })
        .in('id', deviceIds);
      if (error) throw error;
      logEvent({ action: 'UPDATE' as any, tableName: 'devices', module: 'FBA', notes: `Confirmed ${deviceIds.length} device(s) arrived at FBA` });
      toast.success(`${deviceIds.length} device(s) confirmed at FBA warehouse`);
      setSelectedTransitIds(new Set());
      fetchFBAInventory();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setConfirmingArrival(false);
    }
  };

  const handleReturnToLocal = async (deviceIds: string[]) => {
    try {
      const { error } = await supabase
        .from('devices')
        .update({ fulfillment_channel: 'local' })
        .in('id', deviceIds);
      if (error) throw error;
      logEvent({ action: 'UPDATE' as any, tableName: 'devices', module: 'FBA', notes: `Returned ${deviceIds.length} device(s) from FBA to local` });
      toast.success(`${deviceIds.length} device(s) returned to local warehouse`);
      setSelectedFbaIds(new Set());
      setSelectedTransitIds(new Set());
      setReturnToLocalIds([]);
      fetchFBAInventory();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    }
  };

  const handleClaimSubmit = async () => {
    if (!claimDialog) return;
    setClaimProcessing(true);
    try {
      const amount = claimAmount ? parseFloat(claimAmount) : null;
      const { deviceIds, type } = claimDialog;

      // Mark devices as sold (Amazon reimbursement)
      const { error } = await supabase
        .from('devices')
        .update({
          status: 'sold',
          fulfillment_channel: 'fba',
          sale_price: amount ? amount / deviceIds.length : null,
          notes: `Amazon ${type} claim. ${claimNotes}`.trim(),
        })
        .in('id', deviceIds);
      if (error) throw error;

      // Create sale records for each device
      for (const deviceId of deviceIds) {
        const device = devices.find(d => d.id === deviceId);
        if (!device) continue;
        await supabase.from('sales').insert({
          device_id: deviceId,
          company_id: device.company_id,
          marketplace: 'amazon',
          sale_price: amount ? amount / deviceIds.length : device.cost_price,
          sale_date: new Date().toISOString().split('T')[0],
          order_number: `AMZN-${type.toUpperCase()}-${Date.now()}`,
          notes: `Amazon ${type} reimbursement claim`,
          status: 'completed',
        });
      }

      logEvent({
        action: 'UPDATE' as any,
        tableName: 'devices',
        module: 'FBA',
        notes: `Amazon ${type} claim for ${deviceIds.length} device(s). Reimbursement: ${amount ? `$${amount}` : 'TBD'}`,
      });

      toast.success(`${type === 'lost' ? 'Lost' : 'Damaged'} claim recorded for ${deviceIds.length} device(s)`);
      setClaimDialog(null);
      setClaimAmount('');
      setClaimNotes('');
      setSelectedFbaIds(new Set());
      setSelectedTransitIds(new Set());
      fetchFBAInventory();
    } catch (err: any) {
      toast.error(err.message || 'Failed to process claim');
    } finally {
      setClaimProcessing(false);
    }
  };

  const metrics = useMemo(() => {
    const totalUnits = devices.length;
    const totalValue = devices.reduce((sum, d) => sum + d.cost_price, 0);

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
    const lowStockProducts = productGroups.filter(p => p.units <= 2);

    const byBrand: Record<string, number> = {};
    devices.forEach(d => {
      byBrand[d.brand] = (byBrand[d.brand] || 0) + 1;
    });
    const brandChartData = Object.entries(byBrand)
      .map(([name, units]) => ({ name, units }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 8);

    const now = new Date();
    const agingUnits = devices.filter(d => {
      const date = new Date(d.purchase_date || d.created_at);
      return (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24) > 90;
    }).length;

    const inTransitDevices = devices.filter(d => d.fulfillment_channel === 'in_transit_fba');
    const atFbaDevices = devices.filter(d => d.fulfillment_channel === 'fba');

    return { totalUnits, totalValue, productGroups, lowStockProducts, brandChartData, agingUnits, inTransitDevices, atFbaDevices };
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

  const inTransitCount = metrics.inTransitDevices.length;
  const atFbaCount = metrics.atFbaDevices.length;

  const toggleTransitSelection = (id: string) => {
    setSelectedTransitIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllTransit = () => {
    if (selectedTransitIds.size === inTransitCount) setSelectedTransitIds(new Set());
    else setSelectedTransitIds(new Set(metrics.inTransitDevices.map(d => d.id)));
  };

  const toggleFbaSelection = (id: string) => {
    setSelectedFbaIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllFba = () => {
    if (selectedFbaIds.size === atFbaCount) setSelectedFbaIds(new Set());
    else setSelectedFbaIds(new Set(metrics.atFbaDevices.map(d => d.id)));
  };

  const daysSince = (dateStr: string) => {
    const d = new Date(dateStr);
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-6">
      {/* Channel filter */}
      <div className="flex items-center gap-3">
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fba">At FBA Warehouse</SelectItem>
            <SelectItem value="in_transit_fba">In Transit to FBA</SelectItem>
            <SelectItem value="all">All FBA-Related</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard title="At FBA Warehouse" value={atFbaCount} icon={Boxes} />
        <MetricCard title="In Transit to FBA" value={inTransitCount} icon={Truck}
          change={inTransitCount > 0 ? 'Awaiting confirmation' : 'None pending'}
          changeType={inTransitCount > 0 ? 'neutral' : 'positive'}
        />
        <MetricCard title="FBA Inventory Value" value={formatCurrency(metrics.totalValue)} icon={Package}
          change="At cost" changeType="neutral"
        />
        <MetricCard title="Low Stock SKUs" value={metrics.lowStockProducts.length} icon={AlertTriangle}
          change={metrics.lowStockProducts.length > 0 ? '≤2 units remaining' : 'All stocked'}
          changeType={metrics.lowStockProducts.length > 0 ? 'negative' : 'positive'}
        />
        <MetricCard title="Aging Units (90+ days)" value={metrics.agingUnits} icon={TrendingDown}
          change={metrics.agingUnits > 0 ? 'Consider removal or price drop' : 'Healthy'}
          changeType={metrics.agingUnits > 0 ? 'negative' : 'positive'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Brand distribution chart */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4" /> FBA Stock by Brand
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
                <Input placeholder="Search products..." value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 h-8 text-sm"
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

      {/* In-Transit Shipments Panel */}
      {inTransitCount > 0 && (
        <Card className="border-blue-500/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Truck className="h-4 w-4 text-blue-600" />
                  In Transit to FBA
                  <Badge variant="secondary" className="text-[10px]">{inTransitCount} devices</Badge>
                </CardTitle>
                <CardDescription>
                  Devices shipped to Amazon — confirm arrival or report issues
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {selectedTransitIds.size > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        Actions ({selectedTransitIds.size})
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleConfirmAtFBA(Array.from(selectedTransitIds))}>
                        <CheckCircle2 className="h-4 w-4 mr-2" /> Confirm Arrived
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setReturnToLocalIds(Array.from(selectedTransitIds))}>
                        <Undo2 className="h-4 w-4 mr-2" /> Return to Local
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setClaimDialog({ type: 'lost', deviceIds: Array.from(selectedTransitIds) })}>
                        <XCircle className="h-4 w-4 mr-2 text-destructive" /> Lost by Amazon
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setClaimDialog({ type: 'damaged', deviceIds: Array.from(selectedTransitIds) })}>
                        <AlertTriangle className="h-4 w-4 mr-2 text-destructive" /> Damaged by Amazon
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button size="sm" disabled={selectedTransitIds.size === 0 || confirmingArrival}
                  onClick={() => handleConfirmAtFBA(Array.from(selectedTransitIds))}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  {confirmingArrival ? 'Confirming...' : `Confirm Arrived (${selectedTransitIds.size})`}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[320px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={selectedTransitIds.size === inTransitCount && inTransitCount > 0} onCheckedChange={toggleAllTransit} />
                    </TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-center">Days in Transit</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.inTransitDevices.map(d => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Checkbox checked={selectedTransitIds.has(d.id)} onCheckedChange={() => toggleTransitSelection(d.id)} />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{d.brand} {d.model}</p>
                          <p className="text-xs text-muted-foreground">{[d.storage, d.color].filter(Boolean).join(' · ')}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{d.sku || '—'}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(d.cost_price)}</TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm font-medium ${daysSince(d.created_at) > 14 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {daysSince(d.created_at)}d
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleConfirmAtFBA([d.id])}>
                              <CheckCircle2 className="h-4 w-4 mr-2" /> Confirm Arrived
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setReturnToLocalIds([d.id])}>
                              <Undo2 className="h-4 w-4 mr-2" /> Return to Local
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setClaimDialog({ type: 'lost', deviceIds: [d.id] })}>
                              <XCircle className="h-4 w-4 mr-2 text-destructive" /> Lost by Amazon
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setClaimDialog({ type: 'damaged', deviceIds: [d.id] })}>
                              <AlertTriangle className="h-4 w-4 mr-2 text-destructive" /> Damaged by Amazon
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* At FBA Warehouse — individual device list with actions */}
      {atFbaCount > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Boxes className="h-4 w-4" />
                  At FBA Warehouse
                  <Badge variant="secondary" className="text-[10px]">{atFbaCount} devices</Badge>
                </CardTitle>
                <CardDescription>Individual devices stored at Amazon fulfillment centers</CardDescription>
              </div>
              {selectedFbaIds.size > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      Actions ({selectedFbaIds.size})
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setReturnToLocalIds(Array.from(selectedFbaIds))}>
                      <Undo2 className="h-4 w-4 mr-2" /> Return to Local Warehouse
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setClaimDialog({ type: 'lost', deviceIds: Array.from(selectedFbaIds) })}>
                      <XCircle className="h-4 w-4 mr-2 text-destructive" /> Lost by Amazon
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setClaimDialog({ type: 'damaged', deviceIds: Array.from(selectedFbaIds) })}>
                      <AlertTriangle className="h-4 w-4 mr-2 text-destructive" /> Damaged by Amazon
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={selectedFbaIds.size === atFbaCount && atFbaCount > 0} onCheckedChange={toggleAllFba} />
                    </TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-center">Days at FBA</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.atFbaDevices.map(d => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Checkbox checked={selectedFbaIds.has(d.id)} onCheckedChange={() => toggleFbaSelection(d.id)} />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{d.brand} {d.model}</p>
                          <p className="text-xs text-muted-foreground">{[d.storage, d.color].filter(Boolean).join(' · ')}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{d.sku || '—'}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(d.cost_price)}</TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm font-medium ${daysSince(d.purchase_date || d.created_at) > 90 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {daysSince(d.purchase_date || d.created_at)}d
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setReturnToLocalIds([d.id])}>
                              <Undo2 className="h-4 w-4 mr-2" /> Return to Local
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setClaimDialog({ type: 'lost', deviceIds: [d.id] })}>
                              <XCircle className="h-4 w-4 mr-2 text-destructive" /> Lost by Amazon
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setClaimDialog({ type: 'damaged', deviceIds: [d.id] })}>
                              <AlertTriangle className="h-4 w-4 mr-2 text-destructive" /> Damaged by Amazon
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Low stock alert list */}
      {metrics.lowStockProducts.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-amber-600">
              <AlertTriangle className="h-4 w-4" /> FBA Restock Alerts
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

      {/* Lost / Damaged Claim Dialog */}
      <Dialog open={!!claimDialog} onOpenChange={(open) => !open && setClaimDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {claimDialog?.type === 'lost' ? (
                <><XCircle className="h-5 w-5 text-destructive" /> Report Lost by Amazon</>
              ) : (
                <><AlertTriangle className="h-5 w-5 text-destructive" /> Report Damaged by Amazon</>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {claimDialog?.deviceIds.length} device(s) will be marked as {claimDialog?.type} and removed from FBA inventory.
              If Amazon reimburses you, enter the amount below.
            </p>
            <div className="space-y-2">
              <Label>Reimbursement Amount ($)</Label>
              <Input
                type="number" step="0.01" placeholder="Leave blank if pending"
                value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Total reimbursement for all selected devices. Leave blank if claim is pending.</p>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Case ID, reference number, details..."
                value={claimNotes} onChange={(e) => setClaimNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClaimDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleClaimSubmit} disabled={claimProcessing}>
              {claimProcessing ? 'Processing...' : `Submit ${claimDialog?.type === 'lost' ? 'Lost' : 'Damaged'} Claim`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return to Local Confirmation */}
      <AlertDialog open={returnToLocalIds.length > 0} onOpenChange={(open) => !open && setReturnToLocalIds([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return to Local Warehouse</AlertDialogTitle>
            <AlertDialogDescription>
              {returnToLocalIds.length} device(s) will be moved back to local warehouse inventory. This is used when devices are recalled from Amazon or shipments are returned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleReturnToLocal(returnToLocalIds)}>
              Confirm Return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
