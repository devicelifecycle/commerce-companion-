import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { format, subDays, formatDistanceToNow } from 'date-fns';
import { Search, Download, Eye, Clock, User, History, Activity } from 'lucide-react';

interface AuditLog {
  id: string;
  user_id: string | null;
  company_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: any;
  new_data: any;
  created_at: string;
  module: string | null;
  status: string | null;
  notes: string | null;
}

interface ProfileInfo {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface ActivityLogProps {
  /** Filter to a specific module (e.g. "Inventory"). Omit for all. */
  module?: string;
  /** Filter to specific table names. Overrides module if provided. */
  tableNames?: string[];
  /** Compact footer-style layout */
  compact?: boolean;
  /** Default number of days to look back */
  defaultDays?: number;
  /** Max rows to display (compact mode) */
  limit?: number;
  /** Show filters UI */
  showFilters?: boolean;
  /** Show title card header */
  showHeader?: boolean;
  /** Title override */
  title?: string;
  /** Optional company filter override; defaults to current company context */
  companyId?: string;
}

const ACTIONS = ['All', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'IMPORT', 'LOGIN', 'LOGOUT', 'VIEW'];

export function ActivityLog({
  module,
  tableNames,
  compact = false,
  defaultDays = 30,
  limit,
  showFilters = true,
  showHeader = true,
  title,
  companyId,
}: ActivityLogProps) {
  const { selectedCompany, isSuperAdmin } = useCompany();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), defaultDays), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const effectiveCompanyId = companyId ?? selectedCompany?.id;

  useEffect(() => {
    supabase.from('profiles').select('user_id, full_name, email').then(({ data }) => {
      if (data) {
        const map: Record<string, ProfileInfo> = {};
        data.forEach(p => { map[p.user_id] = p; });
        setProfiles(map);
      }
    });
  }, []);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('audit_logs')
          .select('*')
          .gte('created_at', `${startDate}T00:00:00`)
          .lte('created_at', `${endDate}T23:59:59`)
          .order('created_at', { ascending: false })
          .limit(compact ? (limit ?? 15) : 500);

        if (effectiveCompanyId && !isSuperAdmin) {
          query = query.eq('company_id', effectiveCompanyId);
        } else if (effectiveCompanyId) {
          query = query.eq('company_id', effectiveCompanyId);
        }

        if (module) query = query.eq('module', module);
        if (tableNames?.length) query = query.in('table_name', tableNames);
        if (actionFilter !== 'All') query = query.eq('action', actionFilter);

        const { data, error } = await query;
        if (error) throw error;

        let filtered = data || [];
        if (searchTerm) {
          const s = searchTerm.toLowerCase();
          filtered = filtered.filter(d =>
            d.table_name.toLowerCase().includes(s) ||
            (d.notes && d.notes.toLowerCase().includes(s)) ||
            (d.module && d.module.toLowerCase().includes(s))
          );
        }
        setLogs(filtered);
      } catch (err) {
        console.error('Error loading activity log:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [effectiveCompanyId, module, tableNames?.join(','), actionFilter, startDate, endDate, searchTerm, compact, limit, isSuperAdmin]);

  const userName = (uid: string | null) => {
    if (!uid) return 'System';
    return profiles[uid]?.full_name || profiles[uid]?.email || `${uid.slice(0, 8)}…`;
  };

  const actionClass = (a: string) => {
    switch (a.toUpperCase()) {
      case 'CREATE': case 'INSERT': return 'bg-emerald-500 hover:bg-emerald-600';
      case 'UPDATE': return 'bg-amber-500 hover:bg-amber-600';
      case 'DELETE': return 'bg-destructive hover:bg-destructive/90';
      case 'EXPORT': case 'DOWNLOAD': return 'bg-blue-500 hover:bg-blue-600';
      case 'IMPORT': case 'UPLOAD': return 'bg-purple-500 hover:bg-purple-600';
      case 'LOGIN': return 'bg-cyan-500 hover:bg-cyan-600';
      case 'LOGOUT': return 'bg-slate-500 hover:bg-slate-600';
      default: return 'bg-muted-foreground';
    }
  };

  const renderDiff = (oldData: any, newData: any) => {
    if (!oldData && !newData) return <span className="text-muted-foreground">No data captured</span>;
    const changes: { field: string; old: any; new: any }[] = [];
    const keys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
    keys.forEach(k => {
      const o = oldData?.[k], n = newData?.[k];
      if (JSON.stringify(o) !== JSON.stringify(n)) changes.push({ field: k, old: o, new: n });
    });
    if (!changes.length) return <span className="text-muted-foreground">No field changes</span>;
    return (
      <div className="space-y-2">
        {changes.slice(0, 20).map((c, i) => (
          <div key={i} className="text-sm">
            <span className="font-medium text-muted-foreground">{c.field}:</span>
            <div className="ml-4 grid grid-cols-2 gap-2 mt-1">
              <div className="bg-destructive/10 p-1.5 rounded text-xs font-mono">
                <span className="text-destructive">−</span> {JSON.stringify(c.old)?.slice(0, 100) || 'null'}
              </div>
              <div className="bg-emerald-500/10 p-1.5 rounded text-xs font-mono">
                <span className="text-emerald-500">+</span> {JSON.stringify(c.new)?.slice(0, 100) || 'null'}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const handleExport = () => {
    const headers = ['Timestamp', 'User', 'Action', 'Module', 'Table', 'Record ID', 'Notes'];
    const rows = logs.map(l => [
      l.created_at, userName(l.user_id), l.action, l.module || '',
      l.table_name, l.record_id || '', (l.notes || '').replace(/"/g, '""'),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const content = (
    <>
      {showFilters && !compact && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="lg:col-span-2 space-y-1">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search table, notes, module…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Action</Label>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        {showHeader && (
          <CardHeader className={compact ? 'pb-3' : ''}>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  {title ?? (module ? `${module} Activity` : 'Activity Log')}
                </CardTitle>
                <CardDescription>
                  {compact ? `Last ${limit ?? 15} actions` : `${logs.length} events recorded`}
                </CardDescription>
              </div>
              {!compact && (
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-1" />Export
                </Button>
              )}
            </div>
          </CardHeader>
        )}
        <CardContent className={compact ? 'p-0' : ''}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No activity recorded
            </div>
          ) : (
            <div className={compact ? '' : 'border rounded-lg overflow-hidden'}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[140px]">When</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead className="w-[90px]">Action</TableHead>
                    {!compact && <TableHead>Module</TableHead>}
                    <TableHead>Details</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {compact
                            ? formatDistanceToNow(new Date(log.created_at), { addSuffix: true })
                            : format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {userName(log.user_id)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-white text-[10px] ${actionClass(log.action)}`}>{log.action}</Badge>
                      </TableCell>
                      {!compact && <TableCell className="text-xs">{log.module || '—'}</TableCell>}
                      <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                        {log.notes || `${log.table_name}${log.record_id ? ` · ${log.record_id.slice(0, 8)}…` : ''}`}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedLog(log); setDetailOpen(true); }}>
                          <Eye className="h-3.5 w-3.5" />
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

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />Activity Detail
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Timestamp</Label>
                    <p className="font-mono text-sm">{format(new Date(selectedLog.created_at), 'yyyy-MM-dd HH:mm:ss')}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Action</Label>
                    <Badge className={`text-white ${actionClass(selectedLog.action)}`}>{selectedLog.action}</Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">User</Label>
                    <p className="text-sm font-medium">{userName(selectedLog.user_id)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Module / Table</Label>
                    <p className="font-mono text-sm">{selectedLog.module || '—'} / {selectedLog.table_name}</p>
                  </div>
                </div>
                <Separator />
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2"><History className="h-4 w-4" />Changes</h4>
                  {renderDiff(selectedLog.old_data, selectedLog.new_data)}
                </div>
                {selectedLog.notes && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="font-semibold">Notes</h4>
                      <p className="text-sm text-muted-foreground">{selectedLog.notes}</p>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );

  return <div className="space-y-4">{content}</div>;
}
