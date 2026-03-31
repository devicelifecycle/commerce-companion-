import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Calculator, DollarSign, Percent, Save, Undo2 } from 'lucide-react';

interface DeviceRow {
  id: string;
  brand: string;
  model: string;
  storage: string | null;
  condition: string;
  cosmetic_grade: string | null;
  cost_price: number;
  sale_price: number | null;
  refurbishment_labor_cost: number | null;
  status: string;
  // computed
  totalCost: number;
  suggestedPrice: number;
  margin: number;
}

export function BulkPricingCalculator({ canManage }: { canManage: boolean }) {
  const { selectedCompany } = useCompany();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [marginTarget, setMarginTarget] = useState('25');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterModel, setFilterModel] = useState('all');
  const [filterCondition, setFilterCondition] = useState('all');

  useEffect(() => {
    fetchDevices();
  }, [selectedCompany]);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('devices')
        .select('id, brand, model, storage, condition, cosmetic_grade, cost_price, sale_price, refurbishment_labor_cost, status')
        .eq('status', 'in_stock')
        .order('brand')
        .limit(500);
      if (selectedCompany) q = q.eq('company_id', selectedCompany.id);
      const { data } = await q;

      // Also fetch parts costs
      const ids = data?.map(d => d.id) || [];
      let partsCosts: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: parts } = await supabase
          .from('device_refurbishment_parts')
          .select('device_id, total_cost')
          .in('device_id', ids);
        parts?.forEach(p => {
          partsCosts[p.device_id] = (partsCosts[p.device_id] || 0) + Number(p.total_cost);
        });
      }

      const margin = parseFloat(marginTarget) || 25;
      setDevices((data || []).map(d => {
        const partsCost = partsCosts[d.id] || 0;
        const labor = Number(d.refurbishment_labor_cost || 0);
        const totalCost = Number(d.cost_price);
        const suggestedPrice = totalCost / (1 - margin / 100);
        return {
          ...d,
          cost_price: Number(d.cost_price),
          sale_price: d.sale_price ? Number(d.sale_price) : null,
          refurbishment_labor_cost: d.refurbishment_labor_cost ? Number(d.refurbishment_labor_cost) : null,
          totalCost,
          suggestedPrice: Math.ceil(suggestedPrice),
          margin: d.sale_price ? ((Number(d.sale_price) - totalCost) / Number(d.sale_price)) * 100 : 0,
        };
      }));
    } finally {
      setLoading(false);
    }
  };

  const recalculate = () => {
    const margin = parseFloat(marginTarget) || 25;
    setDevices(prev => prev.map(d => ({
      ...d,
      suggestedPrice: Math.ceil(d.totalCost / (1 - margin / 100)),
    })));
  };

  const handleApplyPrices = async () => {
    const toUpdate = devices.filter(d => selectedIds.has(d.id));
    if (toUpdate.length === 0) { toast.error('No devices selected'); return; }
    setSaving(true);
    try {
      for (const d of toUpdate) {
        await supabase.from('devices').update({ sale_price: d.suggestedPrice }).eq('id', d.id);
      }
      toast.success(`Updated sale prices for ${toUpdate.length} device(s)`);
      setSelectedIds(new Set());
      fetchDevices();
    } catch (e: any) {
      toast.error(e.message || 'Failed to update prices');
    } finally {
      setSaving(false);
    }
  };

  const uniqueModels = [...new Set(devices.map(d => `${d.brand} ${d.model}`))].sort();
  const uniqueConditions = [...new Set(devices.map(d => d.condition))].sort();

  const filtered = devices.filter(d => {
    if (filterModel !== 'all' && `${d.brand} ${d.model}` !== filterModel) return false;
    if (filterCondition !== 'all' && d.condition !== filterCondition) return false;
    return true;
  });

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(d => d.id)));
    }
  };

  const fmt = (v: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading devices...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" /> Bulk Pricing & Margin Calculator
        </CardTitle>
        <CardDescription>
          Set target margin to calculate suggested sale prices based on total cost (purchase + refurb parts). Select devices and apply.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Target Margin %</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max="90"
                value={marginTarget}
                onChange={(e) => setMarginTarget(e.target.value)}
                className="w-20"
              />
              <Button variant="outline" size="sm" onClick={recalculate}>
                <Percent className="h-3.5 w-3.5 mr-1" /> Recalculate
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Filter Model</Label>
            <Select value={filterModel} onValueChange={setFilterModel}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                {uniqueModels.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Filter Condition</Label>
            <Select value={filterCondition} onValueChange={setFilterCondition}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {uniqueConditions.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {canManage && selectedIds.size > 0 && (
            <Button onClick={handleApplyPrices} disabled={saving}>
              <Save className="h-4 w-4 mr-1" /> Apply Prices ({selectedIds.size})
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Current Price</TableHead>
                <TableHead className="text-right">Suggested Price</TableHead>
                <TableHead className="text-right">Current Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(d => (
                <TableRow key={d.id} data-state={selectedIds.has(d.id) ? 'selected' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(d.id)}
                      onCheckedChange={() => {
                        const next = new Set(selectedIds);
                        next.has(d.id) ? next.delete(d.id) : next.add(d.id);
                        setSelectedIds(next);
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{d.brand} {d.model}</span>
                    {d.storage && <span className="text-xs text-muted-foreground ml-1">({d.storage})</span>}
                  </TableCell>
                  <TableCell className="capitalize">{d.condition}</TableCell>
                  <TableCell>{d.cosmetic_grade || '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(d.totalCost)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {d.sale_price ? fmt(d.sale_price) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium text-primary">{fmt(d.suggestedPrice)}</TableCell>
                  <TableCell className="text-right">
                    {d.sale_price ? (
                      <Badge variant={d.margin >= parseFloat(marginTarget) ? 'default' : 'destructive'} className="text-xs">
                        {d.margin.toFixed(1)}%
                      </Badge>
                    ) : <span className="text-muted-foreground text-xs">N/A</span>}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No in-stock devices found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
