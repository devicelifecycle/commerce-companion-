import { useState, useMemo } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DollarSign, Package, Users, FileText, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const fmt = (v: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

interface CostLedgerPanelProps {
  companyView: string;
}

export function CostLedgerPanel({ companyView }: CostLedgerPanelProps) {
  const { companies } = useCompany();
  const selectedCompanyId = companyView === 'consolidated' ? 'all' : companyView;
  const [subTab, setSubTab] = useState('devices');
  const [searchTerm, setSearchTerm] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

  const { data: devices = [], isLoading: devicesLoading } = useQuery({
    queryKey: ['cost-ledger-devices', selectedCompanyId],
    queryFn: async () => {
      let q = supabase
        .from('devices')
        .select('id, brand, model, storage, sku, imei, cost_price, sale_price, status, condition, purchase_date, supplier_invoice_number, import_batch_id, supplier_id, company_id, created_at')
        .order('created_at', { ascending: false });
      if (selectedCompanyId !== 'all') q = q.eq('company_id', selectedCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['cost-ledger-suppliers', selectedCompanyId],
    queryFn: async () => {
      let q = supabase.from('suppliers').select('id, name, supplier_code, company_id').order('name');
      if (selectedCompanyId !== 'all') q = q.eq('company_id', selectedCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ['cost-ledger-batches', selectedCompanyId],
    queryFn: async () => {
      let q = supabase
        .from('import_batches')
        .select('id, file_name, total_rows, successful_rows, failed_rows, shipping_cost, other_charges, supplier_invoice_number, is_finalized, supplier_id, company_id, created_at, lot_number')
        .order('created_at', { ascending: false });
      if (selectedCompanyId !== 'all') q = q.eq('company_id', selectedCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const supplierMap = useMemo(() => {
    const map: Record<string, { name: string; code: string }> = {};
    suppliers.forEach((s) => { map[s.id] = { name: s.name, code: s.supplier_code }; });
    return map;
  }, [suppliers]);

  const companyMap = useMemo(() => {
    const map: Record<string, string> = {};
    companies.forEach((c) => { map[c.id] = c.code; });
    return map;
  }, [companies]);

  const kpis = useMemo(() => {
    const totalCost = devices.reduce((s, d) => s + Number(d.cost_price || 0), 0);
    const avgCost = devices.length > 0 ? totalCost / devices.length : 0;
    const totalShipping = batches.reduce((s, b) => s + Number(b.shipping_cost || 0), 0);
    const totalOther = batches.reduce((s, b) => s + Number(b.other_charges || 0), 0);
    const soldDevices = devices.filter(d => d.status === 'sold');
    const totalRevenue = soldDevices.reduce((s, d) => s + Number(d.sale_price || 0), 0);
    const totalSoldCost = soldDevices.reduce((s, d) => s + Number(d.cost_price || 0), 0);
    const totalMargin = totalRevenue - totalSoldCost;
    const marginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
    return { totalCost, avgCost, totalShipping, totalOther, totalDevices: devices.length, totalBatches: batches.length, totalMargin, marginPct };
  }, [devices, batches]);

  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      const matchesSearch = !searchTerm || `${d.brand} ${d.model} ${d.sku || ''} ${d.imei || ''} ${d.supplier_invoice_number || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSupplier = supplierFilter === 'all' || d.supplier_id === supplierFilter;
      return matchesSearch && matchesSupplier;
    });
  }, [devices, searchTerm, supplierFilter]);

  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      const matchesSearch = !searchTerm || `${b.file_name} ${b.supplier_invoice_number || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSupplier = supplierFilter === 'all' || b.supplier_id === supplierFilter;
      return matchesSearch && matchesSupplier;
    });
  }, [batches, searchTerm, supplierFilter]);

  const supplierSummary = useMemo(() => {
    const map: Record<string, { name: string; code: string; deviceCount: number; totalCost: number; batchCount: number; lastImport: string | null }> = {};
    devices.forEach((d) => {
      const sid = d.supplier_id || 'unknown';
      if (!map[sid]) {
        const info = supplierMap[sid];
        map[sid] = { name: info?.name || 'Unknown', code: info?.code || '—', deviceCount: 0, totalCost: 0, batchCount: 0, lastImport: null };
      }
      map[sid].deviceCount++;
      map[sid].totalCost += Number(d.cost_price || 0);
    });
    batches.forEach((b) => {
      const sid = b.supplier_id || 'unknown';
      if (map[sid]) {
        map[sid].batchCount++;
        if (!map[sid].lastImport || b.created_at > map[sid].lastImport!) map[sid].lastImport = b.created_at;
      }
    });
    return Object.entries(map).map(([id, data]) => ({ id, ...data })).sort((a, b) => b.totalCost - a.totalCost);
  }, [devices, batches, supplierMap]);

  const batchDevices = useMemo(() => {
    const map: Record<string, typeof devices> = {};
    devices.forEach((d) => {
      if (d.import_batch_id) {
        if (!map[d.import_batch_id]) map[d.import_batch_id] = [];
        map[d.import_batch_id].push(d);
      }
    });
    return map;
  }, [devices]);

  const isLoading = devicesLoading || batchesLoading;

  return (
    <div className="space-y-4">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase font-semibold tracking-wider">Total Cost</span>
          </div>
          <p className="text-lg font-bold">{fmt(kpis.totalCost)}</p>
          <p className="text-[10px] text-muted-foreground">{kpis.totalDevices} devices</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase font-semibold tracking-wider">Avg Unit Cost</span>
          </div>
          <p className="text-lg font-bold">{fmt(kpis.avgCost)}</p>
          <p className="text-[10px] text-muted-foreground">{kpis.totalBatches} batches</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Package className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase font-semibold tracking-wider">Logistics</span>
          </div>
          <p className="text-lg font-bold">{fmt(kpis.totalShipping + kpis.totalOther)}</p>
          <p className="text-[10px] text-muted-foreground">Ship {fmt(kpis.totalShipping)} + Other {fmt(kpis.totalOther)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase font-semibold tracking-wider">Sold Margin</span>
          </div>
          <p className={`text-lg font-bold ${kpis.totalMargin >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
            {fmt(kpis.totalMargin)}
          </p>
          <p className="text-[10px] text-muted-foreground">{kpis.marginPct.toFixed(1)}% margin</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search devices, SKU, invoice..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-8 text-xs" />
        </div>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="All Suppliers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.supplier_code} — {s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup type="single" value={subTab} onValueChange={(v) => { if (v) setSubTab(v); }} className="bg-muted/50 rounded-lg p-0.5 border border-border/50">
          <ToggleGroupItem value="devices" className="text-xs px-3 py-1.5 gap-1.5 data-[state=on]:bg-primary/15 data-[state=on]:text-primary data-[state=on]:shadow-sm">
            <Package className="h-3 w-3" /> Devices
          </ToggleGroupItem>
          <ToggleGroupItem value="batches" className="text-xs px-3 py-1.5 gap-1.5 data-[state=on]:bg-primary/15 data-[state=on]:text-primary data-[state=on]:shadow-sm">
            <FileText className="h-3 w-3" /> Batches
          </ToggleGroupItem>
          <ToggleGroupItem value="suppliers" className="text-xs px-3 py-1.5 gap-1.5 data-[state=on]:bg-primary/15 data-[state=on]:text-primary data-[state=on]:shadow-sm">
            <Users className="h-3 w-3" /> Suppliers
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Device Costs */}
      {subTab === 'devices' && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Device Cost Ledger ({filteredDevices.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Sale</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Co.</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : filteredDevices.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No devices found</TableCell></TableRow>
                  ) : (
                    filteredDevices.slice(0, 200).map((d) => {
                      const margin = d.sale_price ? Number(d.sale_price) - Number(d.cost_price) : null;
                      const supplier = d.supplier_id ? supplierMap[d.supplier_id] : null;
                      return (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium text-xs">{d.brand} {d.model} {d.storage || ''}</TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">{d.sku || '—'}</TableCell>
                          <TableCell className="text-xs">{supplier ? `${supplier.code}` : '—'}</TableCell>
                          <TableCell className="text-xs font-mono">{d.supplier_invoice_number || '—'}</TableCell>
                          <TableCell className="text-right text-xs font-medium">{fmt(Number(d.cost_price))}</TableCell>
                          <TableCell className="text-right text-xs">{d.sale_price ? fmt(Number(d.sale_price)) : '—'}</TableCell>
                          <TableCell className="text-right text-xs">
                            {margin !== null ? (
                              <span className={margin >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}>{fmt(margin)}</span>
                            ) : '—'}
                          </TableCell>
                          <TableCell><Badge variant={d.status === 'sold' ? 'default' : 'secondary'} className="text-[10px]">{d.status}</Badge></TableCell>
                          <TableCell className="text-xs">{d.company_id ? companyMap[d.company_id] || '—' : '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.purchase_date ? format(parseISO(d.purchase_date), 'MMM d') : '—'}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            {filteredDevices.length > 200 && (
              <p className="text-xs text-muted-foreground text-center py-2">Showing 200 of {filteredDevices.length}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Batch History */}
      {subTab === 'batches' && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Import Batches ({filteredBatches.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>LOT</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Devices</TableHead>
                    <TableHead className="text-right">Ship + Other</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchesLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : filteredBatches.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No batches found</TableCell></TableRow>
                  ) : (
                    filteredBatches.map((b) => {
                      const supplier = b.supplier_id ? supplierMap[b.supplier_id] : null;
                      const bDevs = batchDevices[b.id] || [];
                      const batchTotal = bDevs.reduce((s, d) => s + Number(d.cost_price || 0), 0) + Number(b.shipping_cost || 0) + Number(b.other_charges || 0);
                      const isOpen = expandedBatch === b.id;
                      return (
                        <Collapsible key={b.id} open={isOpen} onOpenChange={() => setExpandedBatch(isOpen ? null : b.id)} asChild>
                          <>
                            <CollapsibleTrigger asChild>
                              <TableRow className="cursor-pointer hover:bg-muted/50">
                                <TableCell>{isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</TableCell>
                                <TableCell className="font-mono text-xs font-semibold text-primary">{(b as any).lot_number || '—'}</TableCell>
                                <TableCell className="text-xs">{b.file_name}</TableCell>
                                <TableCell className="text-xs">{supplier ? supplier.code : '—'}</TableCell>
                                <TableCell className="text-right text-xs">
                                  <span className="text-[hsl(var(--success))]">{b.successful_rows}</span>
                                  {b.failed_rows > 0 && <span className="text-destructive ml-1">/{b.failed_rows}</span>}
                                </TableCell>
                                <TableCell className="text-right text-xs">{fmt(Number(b.shipping_cost || 0) + Number(b.other_charges || 0))}</TableCell>
                                <TableCell className="text-right text-xs font-medium">{fmt(batchTotal)}</TableCell>
                                <TableCell><Badge variant={b.is_finalized ? 'default' : 'outline'} className="text-[10px]">{b.is_finalized ? 'Final' : 'Pending'}</Badge></TableCell>
                                <TableCell className="text-xs text-muted-foreground">{format(parseISO(b.created_at), 'MMM d')}</TableCell>
                              </TableRow>
                            </CollapsibleTrigger>
                            <CollapsibleContent asChild>
                              <>
                                {bDevs.length > 0 ? bDevs.map((d) => (
                                  <TableRow key={d.id} className="bg-muted/20">
                                    <TableCell />
                                    <TableCell colSpan={2} className="text-xs pl-8">{d.brand} {d.model} {d.storage || ''}</TableCell>
                                    <TableCell className="text-xs font-mono">{d.sku || '—'}</TableCell>
                                    <TableCell className="text-right text-xs">{d.imei || '—'}</TableCell>
                                    <TableCell />
                                    <TableCell className="text-right text-xs">{fmt(Number(d.cost_price))}</TableCell>
                                    <TableCell><Badge variant="outline" className="text-[10px]">{d.condition}</Badge></TableCell>
                                    <TableCell />
                                  </TableRow>
                                )) : (
                                  <TableRow className="bg-muted/20">
                                    <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-2">No devices linked</TableCell>
                                  </TableRow>
                                )}
                              </>
                            </CollapsibleContent>
                          </>
                        </Collapsible>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Supplier Summary */}
      {subTab === 'suppliers' && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Supplier Cost Summary ({supplierSummary.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Devices</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-right">Avg Cost</TableHead>
                  <TableHead className="text-right">Batches</TableHead>
                  <TableHead>Last Import</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierSummary.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No supplier data</TableCell></TableRow>
                ) : (
                  supplierSummary.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono font-medium text-xs">{s.code}</TableCell>
                      <TableCell className="font-medium text-xs">{s.name}</TableCell>
                      <TableCell className="text-right text-xs">{s.deviceCount}</TableCell>
                      <TableCell className="text-right text-xs font-medium">{fmt(s.totalCost)}</TableCell>
                      <TableCell className="text-right text-xs">{fmt(s.deviceCount > 0 ? s.totalCost / s.deviceCount : 0)}</TableCell>
                      <TableCell className="text-right text-xs">{s.batchCount}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.lastImport ? format(parseISO(s.lastImport), 'MMM d, yyyy') : '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
