import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Activity, AlertTriangle, CheckCircle2, XCircle, RefreshCw,
  Wifi, WifiOff, Clock, ShieldCheck, Search, TrendingDown,
  Package, Receipt, MapPin, Hash, Loader2,
} from 'lucide-react';

interface SyncLog {
  id: string;
  marketplace: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_imported: number;
  records_skipped: number;
  records_errored: number;
  error_message: string | null;
  sync_type: string;
  metadata: any;
  created_at: string;
}

interface ValidationIssue {
  id: string;
  issue_type: string;
  severity: string;
  marketplace: string | null;
  company_id: string | null;
  record_id: string | null;
  record_type: string | null;
  description: string;
  details: any;
  status: string;
  created_at: string;
}

const ISSUE_TYPE_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  missing_tax: { icon: Receipt, label: 'Missing Tax', color: 'text-[hsl(var(--warning))]' },
  unlinked_inventory: { icon: Package, label: 'Unlinked Device', color: 'text-destructive' },
  fee_anomaly: { icon: TrendingDown, label: 'Fee Anomaly', color: 'text-[hsl(var(--warning))]' },
  zero_sale: { icon: AlertTriangle, label: 'Zero Sale', color: 'text-destructive' },
  order_gap: { icon: Hash, label: 'Order Gap', color: 'text-[hsl(var(--info))]' },
  missing_province: { icon: MapPin, label: 'Missing Province', color: 'text-[hsl(var(--warning))]' },
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-destructive/20 text-destructive border-destructive/40',
  warning: 'bg-[hsl(var(--warning)/.15)] text-[hsl(var(--warning))] border-[hsl(var(--warning)/.4)]',
  info: 'bg-[hsl(var(--info)/.15)] text-[hsl(var(--info))] border-[hsl(var(--info)/.4)]',
};

const MARKETPLACE_CLASS: Record<string, string> = {
  shopify: 'marketplace-shopify',
  amazon: 'marketplace-amazon',
  bestbuy: 'marketplace-bestbuy',
};

export default function IntegrationHealth() {
  const [activeTab, setActiveTab] = useState('status');
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const { selectedCompany } = useCompany();

  useEffect(() => {
    fetchData();
  }, [selectedCompany]);

  async function fetchData() {
    setLoading(true);
    const [syncRes, issuesRes] = await Promise.all([
      supabase
        .from('sync_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(200),
      supabase
        .from('data_validation_issues')
        .select('*')
        .in('status', ['open', 'acknowledged'])
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    if (syncRes.data) setSyncLogs(syncRes.data);
    if (issuesRes.data) setIssues(issuesRes.data);
    setLoading(false);
  }

  async function runValidation() {
    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke('run-data-validation');
      if (error) throw error;
      toast.success(`Validation complete: ${data.issues_found} issues found`);
      await fetchData();
    } catch (err: any) {
      toast.error('Validation failed: ' + err.message);
    } finally {
      setValidating(false);
    }
  }

  async function acknowledgeIssue(issueId: string) {
    await supabase
      .from('data_validation_issues')
      .update({ status: 'acknowledged' })
      .eq('id', issueId);
    setIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, status: 'acknowledged' } : i)));
  }

  async function resolveIssue(issueId: string) {
    await supabase
      .from('data_validation_issues')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', issueId);
    setIssues((prev) => prev.filter((i) => i.id !== issueId));
    toast.success('Issue marked as resolved');
  }

  // Derive sync status per marketplace
  const latestSync: Record<string, SyncLog | null> = { shopify: null, amazon: null, bestbuy: null };
  for (const log of syncLogs) {
    if (!latestSync[log.marketplace]) {
      latestSync[log.marketplace] = log;
    }
  }

  const openIssueCount = issues.filter((i) => i.status === 'open').length;
  const criticalCount = issues.filter((i) => i.severity === 'critical' && i.status === 'open').length;

  const marketplaceLabels: Record<string, string> = {
    shopify: 'Shopify',
    amazon: 'Amazon',
    bestbuy: 'Best Buy',
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">Integration Health</h1>
            <p className="text-muted-foreground mt-1">
              Monitor marketplace sync status, data integrity, and validation issues
            </p>
          </div>
          <Button
            onClick={runValidation}
            disabled={validating}
            className="gap-2"
          >
            {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Run Validation
          </Button>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['shopify', 'amazon', 'bestbuy'] as const).map((mp) => {
            const log = latestSync[mp];
            const isHealthy = log?.status === 'success';
            const isFailing = log?.status === 'failure';

            return (
              <Card key={mp} className={`relative overflow-hidden ${isFailing ? 'border-destructive/50' : isHealthy ? 'border-[hsl(var(--success)/.3)]' : 'border-border'}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={`status-badge ${MARKETPLACE_CLASS[mp]} text-[10px]`}>
                        {marketplaceLabels[mp]}
                      </Badge>
                    </div>
                    {isHealthy ? (
                      <Wifi className="h-4 w-4 text-[hsl(var(--success))]" />
                    ) : isFailing ? (
                      <WifiOff className="h-4 w-4 text-destructive" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {log ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        {isHealthy ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        )}
                        <span className="text-xs font-medium capitalize">{log.status}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Last sync: {formatDistanceToNow(new Date(log.completed_at || log.started_at), { addSuffix: true })}
                      </p>
                      <div className="flex gap-3 text-[10px]">
                        <span className="text-[hsl(var(--success))]">+{log.records_imported} imported</span>
                        <span className="text-muted-foreground">{log.records_skipped} skipped</span>
                        {log.records_errored > 0 && (
                          <span className="text-destructive">{log.records_errored} errors</span>
                        )}
                      </div>
                      {log.error_message && (
                        <p className="text-[10px] text-destructive/80 truncate" title={log.error_message}>
                          {log.error_message.substring(0, 80)}...
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No sync data yet</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Alert Banner */}
        {criticalCount > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">
                {criticalCount} critical issue{criticalCount > 1 ? 's' : ''} require attention
              </p>
              <p className="text-xs text-destructive/70">
                Unlinked devices and zero-value sales may affect financial reporting accuracy
              </p>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="status" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Sync History</span>
            </TabsTrigger>
            <TabsTrigger value="issues" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">Issues</span>
              {openIssueCount > 0 && (
                <Badge variant="destructive" className="h-5 min-w-5 text-[10px] px-1.5">
                  {openIssueCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="summary" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Summary</span>
            </TabsTrigger>
          </TabsList>

          {/* Sync History */}
          <TabsContent value="status">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-display">Sync History</CardTitle>
                  <Button variant="ghost" size="sm" onClick={fetchData} className="gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : syncLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No sync logs yet. Sync data will appear here after the next scheduled import.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Marketplace</th>
                          <th>Status</th>
                          <th>Time</th>
                          <th>Imported</th>
                          <th>Skipped</th>
                          <th>Errors</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syncLogs.slice(0, 50).map((log) => (
                          <tr key={log.id}>
                            <td>
                              <Badge className={`status-badge ${MARKETPLACE_CLASS[log.marketplace]} text-[10px]`}>
                                {marketplaceLabels[log.marketplace] || log.marketplace}
                              </Badge>
                            </td>
                            <td>
                              <div className="flex items-center gap-1.5">
                                {log.status === 'success' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                                ) : log.status === 'failure' ? (
                                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                                ) : (
                                  <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))]" />
                                )}
                                <span className="capitalize">{log.status}</span>
                              </div>
                            </td>
                            <td className="text-muted-foreground">
                              {log.completed_at
                                ? format(new Date(log.completed_at), 'MMM d, HH:mm')
                                : '-'}
                            </td>
                            <td className="text-[hsl(var(--success))] font-medium">{log.records_imported}</td>
                            <td className="text-muted-foreground">{log.records_skipped}</td>
                            <td className={log.records_errored > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                              {log.records_errored}
                            </td>
                            <td>
                              <span className="text-[10px] text-muted-foreground capitalize">{log.sync_type}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Validation Issues */}
          <TabsContent value="issues">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-display">
                    Data Validation Issues ({issues.length})
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={runValidation} disabled={validating} className="gap-1.5">
                    {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    Re-scan
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : issues.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <CheckCircle2 className="h-8 w-8 text-[hsl(var(--success))]" />
                    <p className="text-sm font-medium text-[hsl(var(--success))]">All clear!</p>
                    <p className="text-xs text-muted-foreground">No open validation issues found.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {issues.map((issue) => {
                      const config = ISSUE_TYPE_CONFIG[issue.issue_type] || {
                        icon: AlertTriangle,
                        label: issue.issue_type,
                        color: 'text-muted-foreground',
                      };
                      const Icon = config.icon;

                      return (
                        <div
                          key={issue.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border ${
                            issue.status === 'acknowledged'
                              ? 'bg-muted/20 border-border/40'
                              : issue.severity === 'critical'
                              ? 'bg-destructive/5 border-destructive/30'
                              : 'bg-card border-border/60'
                          }`}
                        >
                          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 ${SEVERITY_BADGE[issue.severity] || ''}`}
                              >
                                {issue.severity}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">{config.label}</span>
                              {issue.marketplace && (
                                <Badge className={`status-badge ${MARKETPLACE_CLASS[issue.marketplace]} text-[10px] py-0`}>
                                  {marketplaceLabels[issue.marketplace] || issue.marketplace}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs mt-1">{issue.description}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Detected {formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })}
                            </p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {issue.status === 'open' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => acknowledgeIssue(issue.id)}
                                className="h-7 text-[10px] px-2"
                              >
                                Acknowledge
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => resolveIssue(issue.id)}
                              className="h-7 text-[10px] px-2 text-[hsl(var(--success))]"
                            >
                              Resolve
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Summary */}
          <TabsContent value="summary">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Sync Summary */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-display">Sync Summary (Last 24h)</CardTitle>
                </CardHeader>
                <CardContent>
                  {(['shopify', 'amazon', 'bestbuy'] as const).map((mp) => {
                    const recentLogs = syncLogs.filter(
                      (l) => l.marketplace === mp && new Date(l.started_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
                    );
                    const successCount = recentLogs.filter((l) => l.status === 'success').length;
                    const failCount = recentLogs.filter((l) => l.status === 'failure').length;
                    const totalImported = recentLogs.reduce((s, l) => s + l.records_imported, 0);

                    return (
                      <div key={mp} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                        <div className="flex items-center gap-2">
                          <Badge className={`status-badge ${MARKETPLACE_CLASS[mp]} text-[10px]`}>
                            {marketplaceLabels[mp]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-muted-foreground">{recentLogs.length} syncs</span>
                          <span className="text-[hsl(var(--success))]">{successCount} ✓</span>
                          {failCount > 0 && <span className="text-destructive">{failCount} ✗</span>}
                          <span className="font-medium">+{totalImported} orders</span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Issue Breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-display">Issue Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.entries(ISSUE_TYPE_CONFIG).map(([type, config]) => {
                    const count = issues.filter((i) => i.issue_type === type).length;
                    const Icon = config.icon;
                    return (
                      <div key={type} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                          <span className="text-xs">{config.label}</span>
                        </div>
                        <Badge variant={count > 0 ? 'destructive' : 'secondary'} className="text-[10px]">
                          {count}
                        </Badge>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
