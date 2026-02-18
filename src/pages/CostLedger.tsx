import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MetricCard } from '@/components/ui/metric-card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DollarSign, Package, Users, FileText, Search, ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

export default function CostLedger() {
  const { selectedCompany, companies } = useCompany();
  const selectedCompanyId = selectedCompany?.id || 'all';
  const [activeTab, setActiveTab] = useState('devices');
  const [searchTerm, setSearchTerm] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

  // Fetch devices with supplier info
  const { data: devices = [], isLoading: devicesLoading } = useQuery({
    queryKey: ['cost-ledger-devices', selectedCompanyId],
    queryFn: async () => {
      let q = supabase
        .from('devices')
        .select('id, brand, model, storage, sku, imei, cost_price, sale_price, status, condition, purchase_date, supplier_invoice_number, import_batch_id, supplier_id, company_id, created_at')
        .order('created_at', { ascending: false });

      if (selectedCompanyId !== 'all') {
        q = q.eq('company_id', selectedCompanyId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ['cost-ledger-suppliers', selectedCompanyId],
    queryFn: async () => {
      let q = supabase.from('suppliers').select('id, name, supplier_code, company_id').order('name');
      if (selectedCompanyId !== 'all') {
        q = q.eq('company_id', selectedCompanyId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch import batches
  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ['cost-ledger-batches', selectedCompanyId],
    queryFn: async () => {
      let q = supabase
        .from('import_batches')
        .select('id, file_name, total_rows, successful_rows, failed_rows, shipping_cost, other_charges, supplier_invoice_number, is_finalized, supplier_id, company_id, created_at')
        .order('created_at', { ascending: false });

      if (selectedCompanyId !== 'all') {
        q = q.eq('company_id', selectedCompanyId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Build supplier lookup
  const supplierMap = useMemo(() => {
    const map: Record<string, { name: string; code: string }> = {};
    suppliers.forEach((s) => {
      map[s.id] = { name: s.name, code: s.supplier_code };
    });
    return map;
  }, [suppliers]);

  // Build company lookup
  const companyMap = useMemo(() => {
    const map: Record<string, string> = {};
    companies.forEach((c) => {
      map[c.id] = c.code;
    });
    return map;
  }, [companies]);

  // KPIs
  const kpis = useMemo(() => {
    const totalCost = devices.reduce((s, d) => s + Number(d.cost_price || 0), 0);
    const avgCost = devices.length > 0 ? totalCost / devices.length : 0;
    const totalShipping = batches.reduce((s, b) => s + Number(b.shipping_cost || 0), 0);
    const totalOther = batches.reduce((s, b) => s + Number(b.other_charges || 0), 0);
    const uniqueSuppliers = new Set(devices.map((d) => d.supplier_id).filter(Boolean)).size;
    return { totalCost, avgCost, totalShipping, totalOther, uniqueSuppliers, totalDevices: devices.length, totalBatches: batches.length };
  }, [devices, batches]);

  // Filtered devices
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      const matchesSearch =
        !searchTerm ||
        `${d.brand} ${d.model} ${d.sku || ''} ${d.imei || ''} ${d.supplier_invoice_number || ''}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
      const matchesSupplier = supplierFilter === 'all' || d.supplier_id === supplierFilter;
      return matchesSearch && matchesSupplier;
    });
  }, [devices, searchTerm, supplierFilter]);

  // Filtered batches
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      const matchesSearch =
        !searchTerm ||
        `${b.file_name} ${b.supplier_invoice_number || ''}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
      const matchesSupplier = supplierFilter === 'all' || b.supplier_id === supplierFilter;
      return matchesSearch && matchesSupplier;
    });
  }, [batches, searchTerm, supplierFilter]);

  // Supplier summary
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
        if (!map[sid].lastImport || b.created_at > map[sid].lastImport!) {
          map[sid].lastImport = b.created_at;
        }
      }
    });
    return Object.entries(map)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.totalCost - a.totalCost);
  }, [devices, batches, supplierMap]);

  // Batch devices lookup
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
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold gradient-text">Cost & Supplier Ledger</h1>
          <p className="text-muted-foreground mt-1">
            Track device costs, supplier history, and import batches for audit compliance
          </p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <MetricCard title="Total Device Cost" value={formatCurrency(kpis.totalCost)} icon={DollarSign} />
          <MetricCard title="Avg Unit Cost" value={formatCurrency(kpis.avgCost)} icon={DollarSign} />
          <MetricCard title="Shipping Costs" value={formatCurrency(kpis.totalShipping)} icon={Package} />
          <MetricCard title="Other Charges" value={formatCurrency(kpis.totalOther)} icon={FileText} />
          <MetricCard title="Total Devices" value={kpis.totalDevices.toLocaleString()} icon={Package} />
          <MetricCard title="Import Batches" value={kpis.totalBatches.toLocaleString()} icon={FileText} />
          <MetricCard title="Unique Suppliers" value={kpis.uniqueSuppliers.toLocaleString()} icon={Users} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search devices, SKU, invoice..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Suppliers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.supplier_code} — {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="devices" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Device Costs</span>
            </TabsTrigger>
            <TabsTrigger value="batches" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Batch History</span>
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Supplier Summary</span>
            </TabsTrigger>
          </TabsList>

          {/* Device Costs Tab */}
          <TabsContent value="devices">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Device Cost Ledger ({filteredDevices.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Device</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Invoice #</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Sale Price</TableHead>
                        <TableHead className="text-right">Margin</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                        </TableRow>
                      ) : filteredDevices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No devices found</TableCell>
                        </TableRow>
                      ) : (
                        filteredDevices.slice(0, 200).map((d) => {
                          const margin = d.sale_price ? Number(d.sale_price) - Number(d.cost_price) : null;
                          const supplier = d.supplier_id ? supplierMap[d.supplier_id] : null;
                          return (
                            <TableRow key={d.id}>
                              <TableCell className="font-medium">
                                {d.brand} {d.model} {d.storage || ''}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">{d.sku || '—'}</TableCell>
                              <TableCell>
                                {supplier ? (
                                  <span className="text-sm">{supplier.code} — {supplier.name}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs font-mono">{d.supplier_invoice_number || '—'}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(Number(d.cost_price))}</TableCell>
                              <TableCell className="text-right">
                                {d.sale_price ? formatCurrency(Number(d.sale_price)) : '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                {margin !== null ? (
                                  <span className={margin >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}>
                                    {formatCurrency(margin)}
                                  </span>
                                ) : '—'}
                              </TableCell>
                              <TableCell>
                                <Badge variant={d.status === 'sold' ? 'default' : d.status === 'in_stock' ? 'secondary' : 'outline'}>
                                  {d.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">{d.company_id ? companyMap[d.company_id] || '—' : '—'}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {d.purchase_date ? format(parseISO(d.purchase_date), 'MMM d, yyyy') : '—'}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
                {filteredDevices.length > 200 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Showing 200 of {filteredDevices.length} devices
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Batch History Tab */}
          <TabsContent value="batches">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Import Batch History ({filteredBatches.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8" />
                        <TableHead>File</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Invoice #</TableHead>
                        <TableHead className="text-right">Devices</TableHead>
                        <TableHead className="text-right">Shipping</TableHead>
                        <TableHead className="text-right">Other</TableHead>
                        <TableHead className="text-right">Total Cost</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Imported</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batchesLoading ? (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                        </TableRow>
                      ) : filteredBatches.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No batches found</TableCell>
                        </TableRow>
                      ) : (
                        filteredBatches.map((b) => {
                          const supplier = b.supplier_id ? supplierMap[b.supplier_id] : null;
                          const bDevices = batchDevices[b.id] || [];
                          const batchTotalCost = bDevices.reduce((s, d) => s + Number(d.cost_price || 0), 0) + Number(b.shipping_cost || 0) + Number(b.other_charges || 0);
                          const isOpen = expandedBatch === b.id;

                          return (
                            <Collapsible key={b.id} open={isOpen} onOpenChange={() => setExpandedBatch(isOpen ? null : b.id)} asChild>
                              <>
                                <CollapsibleTrigger asChild>
                                  <TableRow className="cursor-pointer hover:bg-muted/50">
                                    <TableCell>
                                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </TableCell>
                                    <TableCell className="font-medium text-sm">{b.file_name}</TableCell>
                                    <TableCell>{supplier ? `${supplier.code} — ${supplier.name}` : '—'}</TableCell>
                                    <TableCell className="font-mono text-xs">{b.supplier_invoice_number || '—'}</TableCell>
                                    <TableCell className="text-right">
                                      <span className="text-[hsl(var(--success))]">{b.successful_rows}</span>
                                      {b.failed_rows > 0 && (
                                        <span className="text-destructive ml-1">/ {b.failed_rows} failed</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right">{formatCurrency(Number(b.shipping_cost || 0))}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(Number(b.other_charges || 0))}</TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(batchTotalCost)}</TableCell>
                                    <TableCell>
                                      <Badge variant={b.is_finalized ? 'default' : 'outline'}>
                                        {b.is_finalized ? 'Finalized' : 'Pending'}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs">{b.company_id ? companyMap[b.company_id] || '—' : '—'}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                      {format(parseISO(b.created_at), 'MMM d, yyyy')}
                                    </TableCell>
                                  </TableRow>
                                </CollapsibleTrigger>
                                <CollapsibleContent asChild>
                                  <>
                                    {bDevices.length > 0 ? bDevices.map((d) => (
                                      <TableRow key={d.id} className="bg-muted/20">
                                        <TableCell />
                                        <TableCell colSpan={2} className="text-sm pl-8">
                                          {d.brand} {d.model} {d.storage || ''}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">{d.sku || '—'}</TableCell>
                                        <TableCell className="text-right">{d.imei || '—'}</TableCell>
                                        <TableCell />
                                        <TableCell />
                                        <TableCell className="text-right">{formatCurrency(Number(d.cost_price))}</TableCell>
                                        <TableCell>
                                          <Badge variant="outline" className="text-xs">{d.condition}</Badge>
                                        </TableCell>
                                        <TableCell />
                                        <TableCell />
                                      </TableRow>
                                    )) : (
                                      <TableRow className="bg-muted/20">
                                        <TableCell colSpan={11} className="text-center text-xs text-muted-foreground py-3">
                                          No devices linked to this batch
                                        </TableCell>
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
          </TabsContent>

          {/* Supplier Summary Tab */}
          <TabsContent value="suppliers">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Supplier Cost Summary ({supplierSummary.length})</CardTitle>
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
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No supplier data</TableCell>
                      </TableRow>
                    ) : (
                      supplierSummary.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono font-medium">{s.code}</TableCell>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-right">{s.deviceCount}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(s.totalCost)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(s.deviceCount > 0 ? s.totalCost / s.deviceCount : 0)}</TableCell>
                          <TableCell className="text-right">{s.batchCount}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {s.lastImport ? format(parseISO(s.lastImport), 'MMM d, yyyy') : '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
