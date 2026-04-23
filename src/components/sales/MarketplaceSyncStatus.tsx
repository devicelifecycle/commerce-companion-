import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ShoppingBag, Store, Package, RefreshCw, CheckCircle2, AlertTriangle, XCircle, CalendarRange, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type Marketplace = 'shopify' | 'amazon' | 'bestbuy';

interface SyncRow {
  marketplace: Marketplace | string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_imported: number;
  records_skipped: number;
  records_errored: number;
  metadata: Record<string, any> | null;
}

const MARKETPLACES: { key: Marketplace; label: string; icon: React.ComponentType<any> }[] = [
  { key: 'shopify', label: 'Shopify', icon: ShoppingBag },
  { key: 'amazon', label: 'Amazon', icon: Package },
  { key: 'bestbuy', label: 'Best Buy', icon: Store },
];

function formatRange(since?: string, until?: string): string {
  if (!since) return 'Range unknown';
  const fmt = (s: string) => new Date(s).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  if (!until) return `Since ${fmt(since)}`;
  return `${fmt(since)} → ${fmt(until)}`;
}

interface Props {
  /** Hide the outer Card chrome — render the grid only. */
  compact?: boolean;
}

export function MarketplaceSyncStatus({ compact = false }: Props) {
  const [rows, setRows] = useState<Record<string, SyncRow | null>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Fetch the latest successful or partial sync per marketplace.
    const { data } = await supabase
      .from('sync_logs')
      .select('marketplace, status, started_at, completed_at, records_imported, records_skipped, records_errored, metadata')
      .in('status', ['success', 'partial'])
      .order('started_at', { ascending: false })
      .limit(60);

    const latest: Record<string, SyncRow | null> = {};
    for (const mp of MARKETPLACES) latest[mp.key] = null;
    for (const r of (data as SyncRow[] | null) || []) {
      const key = r.marketplace as string;
      if (latest[key] === null) latest[key] = r;
    }
    setRows(latest);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, [load]);

  const grid = (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {MARKETPLACES.map(({ key, label, icon: Icon }) => {
        const row = rows[key];
        const since = row?.metadata?.since as string | undefined;
        const until = row?.metadata?.until as string | undefined;
        const statusIcon = row?.status === 'success'
          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          : row?.status === 'partial'
          ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />;

        return (
          <div key={key} className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{label}</span>
              </div>
              {row && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1">
                  {statusIcon}
                  {row.status}
                </Badge>
              )}
            </div>

            {loading ? (
              <Skeleton className="h-12 w-full" />
            ) : !row ? (
              <p className="text-xs text-muted-foreground italic">Never synced</p>
            ) : (
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span title={new Date(row.started_at).toLocaleString()}>
                    {formatDistanceToNow(new Date(row.started_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CalendarRange className="h-3 w-3" />
                  <span>{formatRange(since, until)}</span>
                </div>
                <div className="text-muted-foreground">
                  <span className="text-foreground font-medium">{row.records_imported}</span> imported
                  {' · '}
                  <span>{row.records_skipped} skipped</span>
                  {row.records_errored > 0 && (
                    <>{' · '}<span className="text-destructive">{row.records_errored} errors</span></>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (compact) return grid;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold">Marketplace Sync Status</CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>{grid}</CardContent>
    </Card>
  );
}
