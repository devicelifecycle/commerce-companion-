import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2, AlertTriangle, Clock, RefreshCw, Send, Link2, ScrollText, Eye, Info, Search, X,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { PendingOrderDialog } from '@/components/sales/PendingOrderDialog';
import { emitRefetch } from '@/hooks/useDataRefetch';
import { MarketplaceSyncStatus } from '@/components/sales/MarketplaceSyncStatus';

interface SuspenseSale {
  id: string;
  order_number: string;
  marketplace: string;
  sale_price: number;
  sale_date: string;
  device_id: string | null;
  manual_cost: number | null;
  shipping_province: string | null;
  province_inferred: boolean | null;
  marketplace_fees: number | null;
  accounting_status: string;
  review_reason: string | null;
  customer_name: string | null;
  company_id: string;
}

const STATUS_TABS = [
  { value: 'ready_to_post', label: 'Ready to Post', icon: CheckCircle2, tone: 'text-emerald-500' },
  { value: 'needs_review', label: 'Needs Review', icon: AlertTriangle, tone: 'text-amber-500' },
] as const;

// Both pending_review and needs_review map to the unified "Needs Review" bucket.
const REVIEW_STATUSES = ['pending_review', 'needs_review'] as const;

interface Props {
  onCountsChange?: (total: number) => void;
}

export function PendingOrdersTab({ onCountsChange }: Props) {
  const { selectedCompany } = useCompany();
  const selectedCompanyId = selectedCompany?.id || null;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<string>('ready_to_post');
  const [sales, setSales] = useState<SuspenseSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [posting, setPosting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveLog, setResolveLog] = useState<Array<{
    order: string; status: string; reason: string; at: string;
  }>>([]);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [viewingSaleId, setViewingSaleId] = useState<string | null>(null);

  // Filters & pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all');
  const [linkFilter, setLinkFilter] = useState<string>('all'); // all | linked | manual | unlinked
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const loadSales = async () => {
    setLoading(true);
    let q = supabase
      .from('sales')
      .select('id, order_number, marketplace, sale_price, sale_date, device_id, manual_cost, shipping_province, province_inferred, marketplace_fees, accounting_status, review_reason, customer_name, company_id')
      .in('accounting_status', ['ready_to_post', 'pending_review', 'needs_review'])
      .order('sale_date', { ascending: false })
      .limit(500);
    if (selectedCompanyId) q = q.eq('company_id', selectedCompanyId);
    const { data, error } = await q;
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setSales((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSales();
    setSelected(new Set());
  }, [selectedCompanyId]);

  const counts = useMemo(() => ({
    ready_to_post: sales.filter(s => s.accounting_status === 'ready_to_post').length,
    needs_review: sales.filter(s => REVIEW_STATUSES.includes(s.accounting_status as any)).length,
  }), [sales]);

  useEffect(() => {
    onCountsChange?.(counts.ready_to_post + counts.needs_review);
  }, [counts, onCountsChange]);

  // All sales matching the active tab (before search/marketplace filters)
  const tabSales = useMemo(
    () => sales.filter(s =>
      activeTab === 'needs_review'
        ? REVIEW_STATUSES.includes(s.accounting_status as any)
        : s.accounting_status === activeTab
    ),
    [sales, activeTab]
  );

  // Apply search + marketplace + link filters
  const filteredSales = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return tabSales.filter(s => {
      if (marketplaceFilter !== 'all' && s.marketplace !== marketplaceFilter) return false;
      if (linkFilter === 'linked' && !s.device_id) return false;
      if (linkFilter === 'manual' && (s.device_id || !s.manual_cost)) return false;
      if (linkFilter === 'unlinked' && (s.device_id || s.manual_cost)) return false;
      if (!term) return true;
      return (
        s.order_number.toLowerCase().includes(term) ||
        (s.customer_name?.toLowerCase().includes(term) ?? false) ||
        (s.review_reason?.toLowerCase().includes(term) ?? false) ||
        (s.shipping_province?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [tabSales, searchTerm, marketplaceFilter, linkFilter]);

  // Reset page when filters / tab change
  useEffect(() => { setPage(0); }, [searchTerm, marketplaceFilter, linkFilter, activeTab]);

  // Available marketplace options (derived from current data)
  const marketplaceOptions = useMemo(() => {
    const set = new Set<string>();
    sales.forEach(s => s.marketplace && set.add(s.marketplace));
    return Array.from(set).sort();
  }, [sales]);

  // Paginated slice for the table
  const totalCount = filteredSales.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const visibleSales = useMemo(
    () => filteredSales.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [filteredSales, safePage, pageSize]
  );

  const allSelected = visibleSales.length > 0 && visibleSales.every(s => selected.has(s.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) visibleSales.forEach(s => next.delete(s.id));
    else visibleSales.forEach(s => next.add(s.id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const handlePost = async () => {
    if (selected.size === 0) {
      toast({ title: 'Select orders', description: 'Pick orders from "Ready to Post" first.' });
      return;
    }
    setPosting(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-sale-accounting', {
        body: { mode: 'post', sale_ids: Array.from(selected) },
      });
      if (error) throw error;
      toast({
        title: 'Posted to GL',
        description: `${data?.processed ?? 0} orders posted, ${data?.errors ?? 0} errors.`,
      });
      setSelected(new Set());
      await loadSales();
      emitRefetch('sales');
      emitRefetch('financials');
    } catch (e: any) {
      toast({ title: 'Posting failed', description: e.message, variant: 'destructive' });
    }
    setPosting(false);
  };

  const handleAutoResolve = async () => {
    setResolving(true);
    try {
      const before = new Map(sales.map(s => [s.id, { status: s.accounting_status, reason: s.review_reason }]));
      const { data, error } = await supabase.functions.invoke('auto-resolve-sales', { body: {} });
      if (error) throw error;
      toast({
        title: 'Auto-resolve complete',
        description: `Scanned ${data?.scanned ?? 0} • Province fixed: ${data?.province_fixed ?? 0} • Devices linked: ${data?.device_linked ?? 0}`,
      });

      let q = supabase
        .from('sales')
        .select('id, order_number, accounting_status, review_reason')
        .in('accounting_status', ['ready_to_post', 'pending_review', 'needs_review'])
        .order('sale_date', { ascending: false })
        .limit(500);
      if (selectedCompanyId) q = q.eq('company_id', selectedCompanyId);
      const { data: after } = await q;

      const now = new Date().toISOString();
      const log: typeof resolveLog = [];
      (after || []).forEach((s: any) => {
        const prev = before.get(s.id);
        const changed = !prev || prev.status !== s.accounting_status || prev.reason !== s.review_reason;
        if (!changed) return;
        log.push({
          order: s.order_number,
          status: s.accounting_status,
          reason: s.review_reason || (s.accounting_status === 'ready_to_post' ? 'All 6 gates passed (price, province, cost, fees, items, marketplace totals)' : '—'),
          at: now,
        });
      });
      setResolveLog(prev => [...log, ...prev].slice(0, 200));
      setLastRunAt(now);
      await loadSales();
    } catch (e: any) {
      toast({ title: 'Auto-resolve failed', description: e.message, variant: 'destructive' });
    }
    setResolving(false);
  };

  const openSale = (saleRow: SuspenseSale) => setViewingSaleId(saleRow.id);

  return (
    <div className="space-y-6">
      <MarketplaceSyncStatus />
      {/* Action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Imported orders sit here until 6 gates pass and you click <strong>Post</strong>. Nothing affects
          the P&amp;L, dashboard, or financial reports until posted.
        </p>
        <div className="flex gap-2 items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" title="What does Auto-resolve do?">
                <Info className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96" align="end">
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-sm">Auto-resolve checks 6 gates</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Each imported order must pass these before it can be posted to the General Ledger.
                    Auto-resolve scans every pending order and tries to fill in missing pieces automatically.
                  </p>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex gap-2">
                    <span className="font-mono text-primary shrink-0">1.</span>
                    <div>
                      <p className="font-medium">Sale price</p>
                      <p className="text-muted-foreground">Order total &gt; 0 and matches the marketplace payload.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-mono text-primary shrink-0">2.</span>
                    <div>
                      <p className="font-medium">Shipping province</p>
                      <p className="text-muted-foreground">Resolved to a valid Canadian province (for correct GST/HST/PST). Inferred values are flagged with *.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-mono text-primary shrink-0">3.</span>
                    <div>
                      <p className="font-medium">Cost basis</p>
                      <p className="text-muted-foreground">Order is linked to a device/product, OR a manual cost is entered. Without this we can't compute COGS.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-mono text-primary shrink-0">4.</span>
                    <div>
                      <p className="font-medium">Marketplace fees</p>
                      <p className="text-muted-foreground">Fees captured from the marketplace, or zero confirmed (e.g., Shopify before payout sync).</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-mono text-primary shrink-0">5.</span>
                    <div>
                      <p className="font-medium">Line items complete</p>
                      <p className="text-muted-foreground">For multi-line orders, every line item must be linked to a device or product, or have a cost price entered.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-mono text-primary shrink-0">6.</span>
                    <div>
                      <p className="font-medium">Marketplace totals match</p>
                      <p className="text-muted-foreground">For Shopify orders, stored tax and shipping must match what Shopify reported (within 1¢). Drift is flagged so you can reconcile before posting.</p>
                    </div>
                  </div>
                </div>
                <div className="border-t pt-2 text-xs text-muted-foreground">
                  Orders with all 6 gates green move to <span className="font-medium text-foreground">Ready to Post</span>. The rest stay in Pending Review or Needs Action with a reason.
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" onClick={handleAutoResolve} disabled={resolving}>
            <RefreshCw className={`h-4 w-4 mr-2 ${resolving ? 'animate-spin' : ''}`} />
            Auto-resolve
          </Button>
          <Button onClick={handlePost} disabled={posting || selected.size === 0 || activeTab !== 'ready_to_post'}>
            <Send className={`h-4 w-4 mr-2 ${posting ? 'animate-pulse' : ''}`} />
            Complete &amp; Post {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {STATUS_TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <Card
              key={tab.value}
              className={`cursor-pointer transition-colors ${activeTab === tab.value ? 'border-primary' : ''}`}
              onClick={() => setActiveTab(tab.value)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`h-8 w-8 ${tab.tone}`} />
                <div>
                  <p className="text-2xl font-bold">{counts[tab.value]}</p>
                  <p className="text-xs text-muted-foreground">{tab.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">
              {STATUS_TABS.find(t => t.value === activeTab)?.label}
              <span className="text-muted-foreground font-normal ml-2">
                ({totalCount.toLocaleString()})
              </span>
            </CardTitle>
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search order #, customer, reason, province..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9"
              />
              {searchTerm && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={() => setSearchTerm('')}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <Select value={marketplaceFilter} onValueChange={setMarketplaceFilter}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Marketplace" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All marketplaces</SelectItem>
                {marketplaceOptions.map(mp => (
                  <SelectItem key={mp} value={mp}>{mp}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={linkFilter} onValueChange={setLinkFilter}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Link status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All link states</SelectItem>
                <SelectItem value="linked">Linked to device</SelectItem>
                <SelectItem value="manual">Manual cost</SelectItem>
                <SelectItem value="unlinked">Unlinked</SelectItem>
              </SelectContent>
            </Select>

            {(searchTerm || marketplaceFilter !== 'all' || linkFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearchTerm(''); setMarketplaceFilter('all'); setLinkFilter('all'); }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : visibleSales.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {tabSales.length === 0 ? 'No orders in this state.' : 'No orders match your filters.'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                      </TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Marketplace</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Province</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleSales.map(s => (
                      <TableRow
                        key={s.id}
                        className={`cursor-pointer ${selected.has(s.id) ? 'bg-muted/50' : ''}`}
                        onClick={() => openSale(s)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleOne(s.id)} />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{s.order_number}</TableCell>
                        <TableCell className="text-xs">{new Date(s.sale_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{s.marketplace}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${Number(s.sale_price).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {s.shipping_province ? (
                            <Badge variant={s.province_inferred ? 'secondary' : 'outline'} className="text-xs">
                              {s.shipping_province}{s.province_inferred ? ' *' : ''}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {s.device_id ? (
                            <Badge className="text-xs"><Link2 className="h-3 w-3 mr-1" />Linked</Badge>
                          ) : s.manual_cost ? (
                            <Badge variant="secondary" className="text-xs">Manual cost</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">Unlinked</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                          {s.review_reason || (s.accounting_status === 'ready_to_post' ? 'All gates passed' : '—')}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button size="icon" variant="ghost" onClick={() => openSale(s)} title="Open order">
                            <Eye className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <DataTablePagination
                pagination={{
                  page: safePage,
                  pageSize,
                  totalCount,
                  totalPages,
                }}
                onPageChange={setPage}
                onPageSizeChange={(n) => { setPageSize(n); setPage(0); }}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Activity log */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Auto-resolve Activity Log</CardTitle>
            <Badge variant="outline" className="text-xs">{resolveLog.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {lastRunAt && (
              <span className="text-xs text-muted-foreground">
                Last run: {new Date(lastRunAt).toLocaleString()}
              </span>
            )}
            {resolveLog.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setResolveLog([])}>
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {resolveLog.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Click <span className="font-medium">Auto-resolve</span> above to see per-order gate results here.
              Only orders whose status or reason changed are logged.
            </div>
          ) : (
            <ScrollArea className="h-[320px] pr-4">
              <div className="space-y-2">
                {resolveLog.map((entry, idx) => {
                  const isReady = entry.status === 'ready_to_post';
                  const isNeeds = entry.status === 'needs_review';
                  const Icon = isReady ? CheckCircle2 : isNeeds ? AlertTriangle : Clock;
                  const tone = isReady ? 'text-emerald-500' : isNeeds ? 'text-red-500' : 'text-amber-500';
                  return (
                    <div
                      key={`${entry.order}-${idx}`}
                      className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors border border-border/50"
                    >
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${tone}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-medium">{entry.order}</span>
                          <Badge
                            variant={isReady ? 'default' : isNeeds ? 'destructive' : 'secondary'}
                            className="text-[10px]"
                          >
                            {entry.status.replace(/_/g, ' ')}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                            {new Date(entry.at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 break-words">{entry.reason}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <PendingOrderDialog
        open={!!viewingSaleId}
        onOpenChange={(o) => { if (!o) setViewingSaleId(null); }}
        saleId={viewingSaleId}
        onPosted={() => { loadSales(); emitRefetch('sales'); }}
      />
    </div>
  );
}
