import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { format, subDays } from 'date-fns';
import { formatStatus } from '@/lib/utils';
import {
  BookOpen, Search, Download, Eye, Clock, User, History,
  ArrowRight, Monitor, Globe,
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

interface AccountingAuditTrailProps {
  companyView: 'consolidated' | string;
}

const ACTIONS = ['All', 'INSERT', 'UPDATE', 'DELETE'];

export function AccountingAuditTrail({ companyView }: AccountingAuditTrailProps) {
  const { isSuperAdmin, companies } = useCompany();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Journal entries for the detail view
  const [journals, setJournals] = useState<any[]>([]);

  useEffect(() => {
    const fetchProfiles = async () => {
      const { data } = await supabase.from('profiles').select('user_id, full_name, email');
      if (data) {
        const map: Record<string, ProfileInfo> = {};
        data.forEach(p => { map[p.user_id] = p; });
        setProfiles(map);
      }
    };
    fetchProfiles();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch accounting-related audit logs
        let query = supabase
          .from('audit_logs')
          .select('*')
          .gte('created_at', `${startDate}T00:00:00`)
          .lte('created_at', `${endDate}T23:59:59`)
          .order('created_at', { ascending: false })
          .limit(500);

        if (companyView !== 'consolidated') {
          query = query.eq('company_id', companyView);
        }

        const { data } = await query;

        // Filter to accounting-related entries
        const accountingData = (data || []).filter(l =>
          l.module === 'Accounting' ||
          l.table_name === 'journal_entries' ||
          l.table_name === 'journal_entry_lines' ||
          l.table_name === 'accounts_payable' ||
          l.table_name === 'accounts_receivable' ||
          l.table_name === 'chart_of_accounts'
        );

        let filtered = accountingData;
        if (actionFilter !== 'All') {
          filtered = filtered.filter(d => d.action === actionFilter);
        }
        if (searchTerm) {
          const s = searchTerm.toLowerCase();
          filtered = filtered.filter(d =>
            d.table_name.toLowerCase().includes(s) ||
            (d.notes && d.notes.toLowerCase().includes(s))
          );
        }

        setLogs(filtered);

        // Fetch recent journal entries
        let jeQ = supabase
          .from('journal_entries')
          .select('id, entry_number, description, entry_date, reference_type, reference_id, total_debit, total_credit, status, is_auto_generated, company_id')
          .order('entry_date', { ascending: false })
          .limit(100);
        if (companyView !== 'consolidated') {
          jeQ = jeQ.eq('company_id', companyView);
        }
        const { data: jeData } = await jeQ;
        setJournals(jeData || []);
      } catch (err) {
        console.error('Error fetching accounting audit trail:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [companyView, actionFilter, startDate, endDate, searchTerm]);

  const getUserName = (userId: string | null) => {
    if (!userId) return 'System';
    return profiles[userId]?.full_name || profiles[userId]?.email || userId.slice(0, 8);
  };

  const companyName = (id: string | null) => {
    if (!id) return '—';
    return companies.find(c => c.id === id)?.code || '—';
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const getActionBadgeClass = (action: string) => {
    switch (action.toUpperCase()) {
      case 'INSERT': case 'CREATE': return 'bg-emerald-500 hover:bg-emerald-600';
      case 'UPDATE': return 'bg-amber-500 hover:bg-amber-600';
      case 'DELETE': return 'bg-destructive hover:bg-destructive/90';
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
      </div>
    );
  };

  const handleExport = () => {
    const headers = ['Timestamp', 'User', 'Action', 'Table', 'Record ID', 'Notes', 'Company'];
    const rows = logs.map(log => [
      log.created_at, getUserName(log.user_id), log.action,
      log.table_name, log.record_id || '', log.notes || '', companyName(log.company_id),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounting-audit-trail-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="lg:col-span-2 space-y-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search table, notes…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8" />
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

      {/* Accounting Audit Log */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-5 w-5" />Accounting Audit Trail</CardTitle>
              <CardDescription>Journal entries, AP/AR changes, and chart of accounts modifications ({logs.length} events)</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" />Export</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No accounting events in this period</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[170px]">Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead className="w-[90px]">Action</TableHead>
                    <TableHead>Table</TableHead>
                    <TableHead>Details / Notes</TableHead>
                    <TableHead className="w-[80px]">Company</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm font-mono">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {getUserName(log.user_id)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-white text-[10px] ${getActionBadgeClass(log.action)}`}>{log.action}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.table_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">{log.notes || (log.record_id ? `Record: ${log.record_id.slice(0, 8)}…` : '—')}</TableCell>
                      <TableCell className="text-xs">{companyName(log.company_id)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedLog(log); setDetailOpen(true); }}>
                          <Eye className="h-4 w-4" />
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

      {/* Recent Journal Entries */}
      {journals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Journal Entries</CardTitle>
            <CardDescription>All posted and draft journal entries with source references</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border rounded-lg overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Entry #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Auto?</TableHead>
                    <TableHead>Company</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journals.slice(0, 100).map(je => (
                    <TableRow key={je.id}>
                      <TableCell className="font-mono text-xs font-medium">{je.entry_number}</TableCell>
                      <TableCell className="text-xs">{format(new Date(je.entry_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{je.description}</TableCell>
                      <TableCell>
                        {je.reference_type ? (
                          <Badge variant="outline" className="text-[10px] capitalize">{je.reference_type.replace('_', ' ')}</Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(je.total_debit || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(je.total_credit || 0)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{formatStatus(je.status)}</Badge></TableCell>
                      <TableCell className="text-xs">{je.is_auto_generated ? '✓ Auto' : 'Manual'}</TableCell>
                      <TableCell className="text-xs">{companyName(je.company_id)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" />Event Detail</DialogTitle>
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
                    <Label className="text-xs text-muted-foreground">Table</Label>
                    <p className="font-mono text-sm">{selectedLog.table_name}</p>
                  </div>
                </div>

                <Separator />

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
    </div>
  );
}
