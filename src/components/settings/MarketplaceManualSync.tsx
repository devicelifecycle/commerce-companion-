import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { RefreshCw, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface SyncResult {
  success: boolean;
  imported?: number;
  skipped?: number;
  errors?: number;
  error?: string;
  accounts?: Array<{ account: string; company: string; imported: number; skipped: number; errors: number }>;
}

interface Props {
  /** Display name, e.g. "Amazon" */
  label: string;
  /** Edge function name, e.g. "import-amazon-orders" */
  functionName: string;
  /** Sub-text under the title */
  description: string;
  /** Lucide icon component */
  icon: React.ComponentType<{ className?: string }>;
  /** Optional integration detail rows (label → value) */
  details?: Array<{ label: string; value: React.ReactNode }>;
}

const FLOOR_DATE = '2026-01-01T00:00:00Z';

export function MarketplaceManualSync({ label, functionName, description, icon: Icon, details = [] }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const triggerSync = async () => {
    setSyncing(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { startDate: FLOOR_DATE },
      });
      if (error) throw error;

      setLastResult(data as SyncResult);

      if (data?.success) {
        toast.success(`${label} sync complete: ${data.imported ?? 0} imported, ${data.skipped ?? 0} skipped`);
      } else {
        toast.error(data?.error || `${label} sync failed`);
      }
    } catch (err: any) {
      console.error(`${label} sync error:`, err);
      toast.error(err.message || `Failed to sync with ${label}`);
      setLastResult({ success: false, error: err.message });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>{label}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-primary border-primary/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {label} orders sync automatically on a schedule. Manual sync backfills all orders since
            January 1, 2026 (operational baseline).
          </p>

          {/* Sync controls */}
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Manual Sync</p>
              <p className="text-xs text-muted-foreground">Backfill all orders since Jan 1, 2026</p>
            </div>
            <Button onClick={triggerSync} disabled={syncing} variant="outline" size="sm">
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {syncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          </div>

          {/* Result */}
          {lastResult && (
            <div className={`rounded-lg border p-4 ${lastResult.success ? 'bg-accent/50 border-primary/20' : 'bg-destructive/5 border-destructive/20'}`}>
              <div className="flex items-center gap-2 mb-2">
                {lastResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="text-sm font-medium">
                  {lastResult.success ? 'Sync Completed' : 'Sync Failed'}
                </span>
              </div>

              {lastResult.success ? (
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-primary" />
                      <span>{lastResult.imported ?? 0} imported</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span>{lastResult.skipped ?? 0} skipped</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <XCircle className="h-3 w-3 text-destructive" />
                      <span>{lastResult.errors ?? 0} errors</span>
                    </div>
                  </div>

                  {/* Per-account breakdown (Best Buy) */}
                  {lastResult.accounts && lastResult.accounts.length > 0 && (
                    <div className="border-t pt-2 mt-2 space-y-1">
                      {lastResult.accounts.map((a) => (
                        <div key={a.account} className="flex justify-between text-xs text-muted-foreground">
                          <span className="font-mono">{a.company} ({a.account})</span>
                          <span>{a.imported} imported · {a.skipped} skipped · {a.errors} errors</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-destructive">{lastResult.error}</p>
              )}
            </div>
          )}

          {/* Integration details */}
          {details.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3 text-sm">
                {details.map((d, i) => (
                  <div key={i}>
                    {i > 0 && <Separator className="mb-3" />}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{d.label}</span>
                      <span className="font-medium">{d.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
