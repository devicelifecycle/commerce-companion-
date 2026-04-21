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
  CheckCircle2, AlertTriangle, Clock, RefreshCw, Send, Link2, ScrollText, Eye,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OrderDetailDialog } from '@/components/sales/OrderDetailDialog';
import { emitRefetch } from '@/hooks/useDataRefetch';

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
  { value: 'pending_review', label: 'Pending Review', icon: Clock, tone: 'text-amber-500' },
  { value: 'needs_review', label: 'Needs Action', icon: AlertTriangle, tone: 'text-red-500' },
] as const;

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
  const [viewingSale, setViewingSale] = useState<any | null>(null);

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
    pending_review: sales.filter(s => s.accounting_status === 'pending_review').length,
    needs_review: sales.filter(s => s.accounting_status === 'needs_review').length,
  }), [sales]);

  useEffect(() => {
    onCountsChange?.(counts.ready_to_post + counts.pending_review + counts.needs_review);
  }, [counts, onCountsChange]);

  const visibleSales = useMemo(
    () => sales.filter(s => s.accounting_status === activeTab),
    [sales, activeTab]
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
          reason: s.review_reason || (s.accounting_status === 'ready_to_post' ? 'All 4 gates passed (price, province, cost basis, fees)' : '—'),
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

  const openSale = async (saleRow: SuspenseSale) => {
    // OrderDetailDialog expects the richer Sale shape — fetch full record
    const { data } = await supabase.from('sales').select('*, devices(*)').eq('id', saleRow.id).single();
    if (data) setViewingSale(data);
  };

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Imported orders sit here until 4 gates pass and you click <strong>Post</strong>. Nothing affects
          the P&amp;L, dashboard, or financial reports until posted.
        </p>
        <div className="flex gap-2">
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <CardHeader>
          <CardTitle className="text-base">
            {STATUS_TABS.find(t => t.value === activeTab)?.label} ({visibleSales.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : visibleSales.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No orders in this state.
            </div>
          ) : (
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

      {viewingSale && (
        <OrderDetailDialog
          open={!!viewingSale}
          onOpenChange={() => setViewingSale(null)}
          sale={viewingSale}
          hasReturn={false}
          onInitiateReturn={() => {}}
          onSaleUpdated={() => { loadSales(); emitRefetch('sales'); }}
        />
      )}
    </div>
  );
}
