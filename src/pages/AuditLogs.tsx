import { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { format, subDays } from 'date-fns';
import {
  FileText, Search, AlertCircle, Download, ChevronLeft, ChevronRight,
  Eye, History, Shield, Monitor, Globe, Clock, User, Database,
  Activity, Layers,
} from 'lucide-react';

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
  ip_address: string | null;
  user_agent: string | null;
  module?: string;
  status?: string;
  notes?: string;
}

interface ProfileInfo {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

const MODULES = ['All', 'Inventory', 'Sales', 'Expenses', 'Invoices', 'Accounting', 'Taxes', 'Team', 'Suppliers', 'Customers', 'System'];
const ACTIONS = ['All', 'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'IMPORT'];

export default function AuditLogs() {
  const { isSuperAdmin, hasPermission, selectedCompany, companies, loading: permLoading } = useCompany();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [moduleFilter, setModuleFilter] = useState('All');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [activeTab, setActiveTab] = useState('changes');
  const pageSize = 50;

  const canViewAudit = hasPermission('audit_logs', 'view');

  useEffect(() => {
    const fetchProfiles = async () => {
      const { data } = await supabase.from('profiles').select('user_id, full_name, email');
      if (data) {
        const map: Record<string, ProfileInfo> = {};
        data.forEach(p => { map[p.user_id] = p; });
        setProfiles(map);
      }
    };
    if (canViewAudit || isSuperAdmin) fetchProfiles();
  }, [canViewAudit, isSuperAdmin]);

  useEffect(() => {
    if (!canViewAudit && !isSuperAdmin) return;
    const fetchLogs = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('audit_logs')
          .select('*', { count: 'exact' })
          .gte('created_at', `${startDate}T00:00:00`)
          .lte('created_at', `${endDate}T23:59:59`)
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (moduleFilter !== 'All') query = query.eq('module', moduleFilter);

        const { data, error, count } = await query;
        if (error) throw error;

        let filteredData = data || [];
        if (selectedCompany && !isSuperAdmin) {
          filteredData = filteredData.filter(d => d.company_id === selectedCompany.id);
        }
        if (actionFilter !== 'All') {
          filteredData = filteredData.filter(d => d.action === actionFilter);
        }
        if (searchTerm) {
          const s = searchTerm.toLowerCase();
          filteredData = filteredData.filter(d =>
            d.table_name.toLowerCase().includes(s) ||
            (d.record_id && d.record_id.toLowerCase().includes(s)) ||
            (d.notes && d.notes.toLowerCase().includes(s)) ||
            (d.module && d.module.toLowerCase().includes(s))
          );
        }

        setLogs(filteredData);
        setTotalCount(count || 0);
      } catch (error) {
        console.error('Error loading audit logs:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [selectedCompany, isSuperAdmin, actionFilter, moduleFilter, startDate, endDate, searchTerm, page, canViewAudit]);

  const getUserName = (userId: string | null) => {
    if (!userId) return 'System';
    return profiles[userId]?.full_name || profiles[userId]?.email || userId.slice(0, 8);
  };

  const companyName = (id: string | null) => {
    if (!id) return '—';
    return companies.find(c => c.id === id)?.code || '—';
  };

  const stats = useMemo(() => {
    const creates = logs.filter(l => l.action === 'INSERT').length;
    const updates = logs.filter(l => l.action === 'UPDATE').length;
    const deletes = logs.filter(l => l.action === 'DELETE').length;
    const uniqueUsers = new Set(logs.map(l => l.user_id).filter(Boolean)).size;
    return { creates, updates, deletes, uniqueUsers };
  }, [logs]);

  const dataChangeLogs = useMemo(() => logs.filter(l => ['INSERT', 'UPDATE', 'DELETE'].includes(l.action)), [logs]);

  const getActionBadgeClass = (action: string) => {
    switch (action.toUpperCase()) {
      case 'INSERT': case 'CREATE': return 'bg-emerald-500 hover:bg-emerald-600';
      case 'UPDATE': return 'bg-amber-500 hover:bg-amber-600';
      case 'DELETE': return 'bg-destructive hover:bg-destructive/90';
      case 'LOGIN': return 'bg-blue-500 hover:bg-blue-600';
      case 'LOGOUT': return 'bg-slate-500 hover:bg-slate-600';
      case 'EXPORT': return 'bg-purple-500 hover:bg-purple-600';
      case 'IMPORT': return 'bg-cyan-500 hover:bg-cyan-600';
      default: return 'bg-muted-foreground';
    }
  };

  const renderChangeDiff = (oldData: any, newData: any) => {
    if (!oldData && !newData) return <span className="text-muted-foreground">No data</span>;
    const changes: { field: string; old: any; new: any }[] = [];
    const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
    allKeys.forEach(key => {
      const oldVal = oldData?.[key];
      const newVal = newData?.[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ field: key, old: oldVal, new: newVal });
      }
    });
    if (changes.length === 0) return <span className="text-muted-foreground">No changes detected</span>;
    return (
      <div className="space-y-2">
        {changes.slice(0, 15).map((change, i) => (
          <div key={i} className="text-sm">
            <span className="font-medium text-muted-foreground">{change.field}:</span>
            <div className="ml-4 grid grid-cols-2 gap-2">
              <div className="bg-destructive/10 p-1 rounded text-xs">
                <span className="text-destructive">-</span> {JSON.stringify(change.old)?.slice(0, 80) || 'null'}
              </div>
              <div className="bg-emerald-500/10 p-1 rounded text-xs">
                <span className="text-emerald-500">+</span> {JSON.stringify(change.new)?.slice(0, 80) || 'null'}
              </div>
            </div>
          </div>
        ))}
        {changes.length > 15 && <span className="text-xs text-muted-foreground">...and {changes.length - 15} more</span>}
      </div>
    );
  };

  const handleExport = () => {
    const headers = ['Timestamp', 'User', 'Action', 'Module', 'Table', 'Record ID', 'Status', 'Notes'];
    const rows = logs.map(log => [
      log.created_at, getUserName(log.user_id), log.action, log.module || '',
      log.table_name, log.record_id || '', log.status || 'success', log.notes || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  if (permLoading) {
    return <DashboardLayout><div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div></DashboardLayout>;
  }

  if (!canViewAudit && !isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <div><h1 className="text-2xl font-bold">Audit Trail</h1></div>
          <Card><CardContent className="py-12"><div className="flex flex-col items-center justify-center text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Access Restricted</h3>
            <p className="text-muted-foreground">You don't have permission to view audit logs.</p>
          </div></CardContent></Card>
        </div>
      </DashboardLayout>
    );
  }

  const LogTable = ({ data, showModule = true }: { data: AuditLog[]; showModule?: boolean }) => (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[170px]">Timestamp</TableHead>
            <TableHead>User</TableHead>
            <TableHead className="w-[90px]">Action</TableHead>
            {showModule && <TableHead>Module</TableHead>}
            <TableHead>Table</TableHead>
            <TableHead>Details / Notes</TableHead>
            <TableHead className="w-[80px]">Company</TableHead>
            <TableHead className="w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow><TableCell colSpan={showModule ? 8 : 7} className="text-center py-8 text-muted-foreground">No records found</TableCell></TableRow>
          ) : data.map(log => (
            <TableRow key={log.id} className="hover:bg-muted/30">
              <TableCell className="text-sm font-mono">
                <div className="flex items-center gap-1"><Clock className="h-3 w-3 text-muted-foreground" />{format(new Date(log.created_at), 'MMM d, HH:mm:ss')}</div>
              </TableCell>
              <TableCell className="text-sm">
                <div className="flex items-center gap-1"><User className="h-3 w-3 text-muted-foreground" />{getUserName(log.user_id)}</div>
              </TableCell>
              <TableCell><Badge className={`text-white text-[10px] ${getActionBadgeClass(log.action)}`}>{log.action}</Badge></TableCell>
              {showModule && <TableCell>{log.module ? <Badge variant="outline" className="text-[10px]">{log.module}</Badge> : '—'}</TableCell>}
              <TableCell className="font-mono text-xs">{log.table_name}</TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">{log.notes || (log.record_id ? `Record: ${log.record_id.slice(0, 8)}…` : '—')}</TableCell>
              <TableCell className="text-xs">{companyName(log.company_id)}</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedLog(log); setDetailOpen(true); }}><Eye className="h-4 w-4" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">Audit Trail</h1>
            <p className="text-muted-foreground">Data change log and event history</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1"><Shield className="h-3 w-3" />{isSuperAdmin ? 'Super Admin' : 'Company Admin'}</Badge>
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" />Export</Button>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4 pb-3"><div className="flex items-center gap-2"><Database className="h-4 w-4 text-muted-foreground" /><div><p className="text-[11px] text-muted-foreground">Total Events</p><p className="text-xl font-bold">{totalCount.toLocaleString()}</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-emerald-500" /><div><p className="text-[11px] text-muted-foreground">Creates</p><p className="text-xl font-bold text-emerald-500">{stats.creates}</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3"><div className="flex items-center gap-2"><History className="h-4 w-4 text-amber-500" /><div><p className="text-[11px] text-muted-foreground">Updates</p><p className="text-xl font-bold text-amber-500">{stats.updates}</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3"><div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-destructive" /><div><p className="text-[11px] text-muted-foreground">Deletes</p><p className="text-xl font-bold text-destructive">{stats.deletes}</p></div></div></CardContent></Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="lg:col-span-2 space-y-1">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search table, notes, record…" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }} className="pl-8" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Action</Label>
                <Select value={actionFilter} onValueChange={v => { setActionFilter(v); setPage(0); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Module</Label>
                <Select value={moduleFilter} onValueChange={v => { setModuleFilter(v); setPage(0); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(0); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(0); }} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs — just Data Changes + All Events */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="changes" className="flex items-center gap-1.5 text-xs">
              <Activity className="h-3.5 w-3.5" />Data Changes
            </TabsTrigger>
            <TabsTrigger value="all" className="flex items-center gap-1.5 text-xs">
              <Layers className="h-3.5 w-3.5" />All Events
            </TabsTrigger>
          </TabsList>

          <TabsContent value="changes">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Activity className="h-5 w-5" />Data Change Log</CardTitle>
                <CardDescription>Every INSERT, UPDATE, and DELETE across all tables ({dataChangeLogs.length} events)</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
                ) : (
                  <LogTable data={dataChangeLogs} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Layers className="h-5 w-5" />Complete Event Log</CardTitle>
                <CardDescription>Showing {logs.length} of {totalCount} events</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
                ) : (
                  <>
                    <LogTable data={logs} />
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                          <ChevronLeft className="h-4 w-4" /> Previous
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
                          Next <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Event Detail</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-6 pr-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Timestamp</Label>
                    <p className="font-mono text-sm">{format(new Date(selectedLog.created_at), 'yyyy-MM-dd HH:mm:ss')}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Action</Label>
                    <Badge className={`text-white ${getActionBadgeClass(selectedLog.action)}`}>{selectedLog.action}</Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">User</Label>
                    <p className="text-sm font-medium">{getUserName(selectedLog.user_id)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Company</Label>
                    <p className="text-sm">{companyName(selectedLog.company_id)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Table</Label>
                    <p className="font-mono text-sm">{selectedLog.table_name}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Record ID</Label>
                    <p className="font-mono text-xs">{selectedLog.record_id || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Module</Label>
                    <p className="text-sm">{selectedLog.module || 'System'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Badge variant={selectedLog.status === 'failure' ? 'destructive' : 'outline'}>{selectedLog.status || 'success'}</Badge>
                  </div>
                </div>

                <Separator />

                {(selectedLog.ip_address || selectedLog.user_agent) && (
                  <>
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2"><User className="h-4 w-4" />Session Info</h4>
                      <div className="grid grid-cols-1 gap-2 text-sm">
                        {selectedLog.ip_address && (
                          <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-muted-foreground" /><span className="font-mono text-xs">{selectedLog.ip_address}</span></div>
                        )}
                        {selectedLog.user_agent && (
                          <div className="flex items-center gap-2"><Monitor className="h-4 w-4 text-muted-foreground" /><span className="text-xs truncate max-w-[400px]">{selectedLog.user_agent}</span></div>
                        )}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2"><History className="h-4 w-4" />Changes</h4>
                  {renderChangeDiff(selectedLog.old_data, selectedLog.new_data)}
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
    </DashboardLayout>
  );
}
