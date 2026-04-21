import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { CheckCircle2, XCircle, AlertTriangle, Search, RefreshCw, Download, Play } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useSaleAccounting } from '@/hooks/useSaleAccounting';

interface Props {
  companyView: 'consolidated' | string;
}

interface AuditRow {
  id: string;
  order_number: string;
  marketplace: string;
  sale_date: string;
  company_id: string | null;
  accounting_status: string | null;
  sale_price: number;
  device_id: string | null;
  manual_cost: number | null;
  hasRevenue: boolean;
  hasCOGS: boolean;
  revenueEntryId: string | null;
  cogsEntryId: string | null;
  issues: string[];
}

const PAGE_SIZE = 50;

export function SalesAccountingAudit({ companyView }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const { processSaleAccounting } = useSaleAccounting();

  const loadData = async () => {
    setLoading(true);
    try {
      let salesQ = supabase
        .from('sales')
        .select('id, order_number, marketplace, sale_date, company_id, accounting_status, sale_price, device_id, manual_cost')
        .order('sale_date', { ascending: false })
        .limit(2000);

      if (companyView !== 'consolidated') {
        salesQ = salesQ.eq('company_id', companyView);
      }

      const { data: sales, error: salesErr } = await salesQ;
      if (salesErr) throw salesErr;
      if (!sales || sales.length === 0) {
        setRows([]);
        return;
      }

      const saleIds = sales.map(s => s.id);
      const { data: entries } = await supabase
        .from('journal_entries')
        .select('id, reference_id, description')
        .eq('reference_type', 'sale')
        .in('reference_id', saleIds);

      const revMap = new Map<string, string>();
      const cogsMap = new Map<string, string>();
      entries?.forEach(e => {
        if (!e.reference_id) return;
        if (e.description?.startsWith('COGS')) cogsMap.set(e.reference_id, e.id);
        else revMap.set(e.reference_id, e.id);
      });

      const audit: AuditRow[] = sales.map(s => {
        const hasRevenue = revMap.has(s.id);
        const hasCOGS = cogsMap.has(s.id);
        const issues: string[] = [];
        const expectsCOGS = !!s.device_id || (s.manual_cost && Number(s.manual_cost) > 0);

        if (s.accounting_status === 'voided') {
          // voided sales don't need entries
        } else {
          if (!hasRevenue) issues.push('Missing revenue journal');
          if (expectsCOGS && !hasCOGS) issues.push('Missing COGS journal');
          if (!s.device_id && !s.manual_cost) issues.push('No device or manual cost — COGS unknown');
          if (s.accounting_status === 'fully_processed' && !hasCOGS && expectsCOGS) {
            issues.push('Status=fully_processed but no COGS entry');
          }
          if (s.accounting_status === 'unprocessed' && hasRevenue) {
            issues.push('Has revenue entry but status=unprocessed');
          }
        }

        return {
          id: s.id,
          order_number: s.order_number,
          marketplace: s.marketplace,
          sale_date: s.sale_date,
          company_id: s.company_id,
          accounting_status: s.accounting_status,
          sale_price: Number(s.sale_price || 0),
          device_id: s.device_id,
          manual_cost: s.manual_cost ? Number(s.manual_cost) : null,
          hasRevenue,
          hasCOGS,
          revenueEntryId: revMap.get(s.id) || null,
          cogsEntryId: cogsMap.get(s.id) || null,
          issues,
        };
      });

      setRows(audit);
    } catch (err: any) {
      console.error('Audit load error:', err);
      toast.error('Failed to load audit data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setPage(1);
  }, [companyView]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (search) {
        const q = search.toLowerCase();
        if (!r.order_number.toLowerCase().includes(q) && !r.marketplace.toLowerCase().includes(q)) return false;
      }
      if (statusFilter === 'errors' && r.issues.length === 0) return false;
      if (statusFilter === 'ok' && r.issues.length > 0) return false;
      if (statusFilter === 'missing-revenue' && r.hasRevenue) return false;
      if (statusFilter === 'missing-cogs' && r.hasCOGS) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const ok = rows.filter(r => r.issues.length === 0).length;
    const errors = total - ok;
    const missingRev = rows.filter(r => !r.hasRevenue && r.accounting_status !== 'voided').length;
    const missingCogs = rows.filter(r => !r.hasCOGS && (r.device_id || (r.manual_cost && r.manual_cost > 0)) && r.accounting_status !== 'voided').length;
    return { total, ok, errors, missingRev, missingCogs };
  }, [rows]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleReprocess = async (saleId: string, orderNumber: string) => {
    setReprocessing(saleId);
    try {
      await processSaleAccounting([saleId]);
      toast.success(`Reprocessed ${orderNumber}`);
      await loadData();
    } finally {
      setReprocessing(null);
    }
  };

  const handleExport = () => {
    const headers = ['Order #', 'Marketplace', 'Date', 'Sale Price', 'Status', 'Has Revenue', 'Has COGS', 'Issues'];
    const csv = [
      headers.join(','),
      ...filtered.map(r => [
        r.order_number,
        r.marketplace,
        r.sale_date,
        r.sale_price,
        r.accounting_status || '',
        r.hasRevenue ? 'Yes' : 'No',
        r.hasCOGS ? 'Yes' : 'No',
        `"${r.issues.join('; ')}"`,
      ].join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-accounting-audit-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Sales Accounting Audit
            </CardTitle>
            <CardDescription>
              Verify Revenue & COGS journal entries for every sale. Identify and reprocess missing or inconsistent records.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
          <div className="bg-muted/50 rounded p-2.5 border border-border/50">
            <div className="text-xs text-muted-foreground">Total Sales</div>
            <div className="text-lg font-semibold">{stats.total}</div>
          </div>
          <div className="bg-emerald-500/5 rounded p-2.5 border border-emerald-500/30">
            <div className="text-xs text-muted-foreground">Clean</div>
            <div className="text-lg font-semibold text-emerald-500">{stats.ok}</div>
          </div>
          <div className="bg-destructive/5 rounded p-2.5 border border-destructive/30">
            <div className="text-xs text-muted-foreground">With Issues</div>
            <div className="text-lg font-semibold text-destructive">{stats.errors}</div>
          </div>
          <div className="bg-amber-500/5 rounded p-2.5 border border-amber-500/30">
            <div className="text-xs text-muted-foreground">Missing Revenue</div>
            <div className="text-lg font-semibold text-amber-500">{stats.missingRev}</div>
          </div>
          <div className="bg-amber-500/5 rounded p-2.5 border border-amber-500/30">
            <div className="text-xs text-muted-foreground">Missing COGS</div>
            <div className="text-lg font-semibold text-amber-500">{stats.missingCogs}</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search order # or marketplace…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sales</SelectItem>
              <SelectItem value="errors">With issues</SelectItem>
              <SelectItem value="ok">Clean only</SelectItem>
              <SelectItem value="missing-revenue">Missing revenue</SelectItem>
              <SelectItem value="missing-cogs">Missing COGS</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <TableSkeleton rows={10} columns={8} />
        ) : (
          <>
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Order #</TableHead>
                    <TableHead>Marketplace</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Sale Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Revenue</TableHead>
                    <TableHead className="text-center">COGS</TableHead>
                    <TableHead>Issues</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        No sales match these filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paged.map(r => (
                      <TableRow key={r.id} className={r.issues.length > 0 ? 'bg-destructive/5' : ''}>
                        <TableCell className="font-mono text-xs">{r.order_number}</TableCell>
                        <TableCell className="capitalize text-sm">{r.marketplace}</TableCell>
                        <TableCell className="text-sm">
                          {r.sale_date ? format(new Date(r.sale_date), 'MMM d, yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono">
                          ${r.sale_price.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {(r.accounting_status || 'unprocessed').replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {r.hasRevenue ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 inline" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive inline" />
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.hasCOGS ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 inline" />
                          ) : r.device_id || (r.manual_cost && r.manual_cost > 0) ? (
                            <XCircle className="h-4 w-4 text-destructive inline" />
                          ) : (
                            <span className="text-muted-foreground text-xs">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.issues.length === 0 ? (
                            <span className="text-emerald-500 text-xs">OK</span>
                          ) : (
                            <div className="flex items-start gap-1">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                              <span className="text-xs text-muted-foreground">
                                {r.issues.join('; ')}
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.issues.length > 0 && r.accounting_status !== 'voided' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReprocess(r.id, r.order_number)}
                              disabled={reprocessing === r.id}
                              className="h-7 px-2 text-xs"
                            >
                              <Play className={`h-3 w-3 mr-1 ${reprocessing === r.id ? 'animate-spin' : ''}`} />
                              Fix
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {filtered.length > PAGE_SIZE && (
              <DataTablePagination
                pagination={{
                  page: page - 1,
                  pageSize: PAGE_SIZE,
                  totalCount: filtered.length,
                  totalPages: Math.ceil(filtered.length / PAGE_SIZE),
                }}
                onPageChange={(p) => setPage(p + 1)}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
