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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { format, subDays } from 'date-fns';
import { formatStatus } from '@/lib/utils';
import {
  FileText, Search, AlertCircle, Download, ChevronLeft, ChevronRight,
  Eye, History, Shield, Monitor, Globe, Clock, User, Database,
  Link2, Activity, BookOpen, LogIn, Layers, ArrowRight,
  PackageSearch,
} from 'lucide-react';
import { UnaccountedMarketplaceData } from '@/components/audit/UnaccountedMarketplaceData';

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
  const [activeTab, setActiveTab] = useState('relationships');
  const pageSize = 50;

  // Relationship data
  const [relSales, setRelSales] = useState<any[]>([]);
  const [relJournals, setRelJournals] = useState<any[]>([]);
  const [relAP, setRelAP] = useState<any[]>([]);
  const [relAR, setRelAR] = useState<any[]>([]);
  const [relLoading, setRelLoading] = useState(true);

  const canViewAudit = hasPermission('audit_logs', 'view');

  // Fetch profiles once
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

  // Fetch audit logs
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

        if (moduleFilter !== 'All') {
          query = query.eq('module', moduleFilter);
        }

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

  // Fetch relationship data
  useEffect(() => {
    if ((!canViewAudit && !isSuperAdmin) || activeTab !== 'relationships') return;
    const fetchRelationships = async () => {
      setRelLoading(true);
      try {
        const companyFilter = selectedCompany?.id;

        // Sales with devices and accounting
        let salesQ = supabase
          .from('sales')
          .select('id, order_number, marketplace, sale_price, sale_date, device_id, company_id, accounting_status, customer_name, shipping_cost, marketplace_fees, tax_amount')
          .order('sale_date', { ascending: false })
          .limit(200);
        if (companyFilter) salesQ = salesQ.eq('company_id', companyFilter);
        const { data: salesData } = await salesQ;

        // Journal entries
        let jeQ = supabase
          .from('journal_entries')
          .select('id, entry_number, description, entry_date, reference_type, reference_id, total_debit, total_credit, status, is_auto_generated, company_id')
          .order('entry_date', { ascending: false })
          .limit(300);
        if (companyFilter) jeQ = jeQ.eq('company_id', companyFilter);
        const { data: jeData } = await jeQ;

        // AP
        let apQ = supabase
          .from('accounts_payable')
          .select('id, vendor_name, original_amount, balance_due, status, bill_date, description, company_id')
          .order('bill_date', { ascending: false })
          .limit(200);
        if (companyFilter) apQ = apQ.eq('company_id', companyFilter);
        const { data: apData } = await apQ;

        // AR
        let arQ = supabase
          .from('accounts_receivable')
          .select('id, customer_name, original_amount, balance_due, status, source_type, source_reference, marketplace, company_id')
          .order('created_at', { ascending: false })
          .limit(200);
        if (companyFilter) arQ = arQ.eq('company_id', companyFilter);
        const { data: arData } = await arQ;

        setRelSales(salesData || []);
        setRelJournals(jeData || []);
        setRelAP(apData || []);
        setRelAR(arData || []);
      } catch (err) {
        console.error('Error fetching relationships:', err);
      } finally {
        setRelLoading(false);
      }
    };
    fetchRelationships();
  }, [activeTab, selectedCompany, canViewAudit, isSuperAdmin]);

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

  // Stats
  const stats = useMemo(() => {
    const sessions = logs.filter(l => l.action === 'LOGIN' || l.action === 'LOGOUT');
    const creates = logs.filter(l => l.action === 'INSERT');
    const updates = logs.filter(l => l.action === 'UPDATE');
    const deletes = logs.filter(l => l.action === 'DELETE');
    const accounting = logs.filter(l => l.module === 'Accounting');
    const uniqueUsers = new Set(logs.map(l => l.user_id).filter(Boolean));
    return { sessions: sessions.length, creates: creates.length, updates: updates.length, deletes: deletes.length, accounting: accounting.length, uniqueUsers: uniqueUsers.size };
  }, [logs]);

  // Session logs (login/logout)
  const sessionLogs = useMemo(() => logs.filter(l => l.action === 'LOGIN' || l.action === 'LOGOUT'), [logs]);

  // Data change logs
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
    const headers = ['Timestamp', 'User', 'Action', 'Module', 'Table', 'Record ID', 'Status', 'Notes', 'IP Address'];
    const rows = logs.map(log => [
      log.created_at, getUserName(log.user_id), log.action, log.module || '',
      log.table_name, log.record_id || '', log.status || 'success', log.notes || '', log.ip_address || '',
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

  // ======= Shared Log Table =======
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
              {showModule && (
                <TableCell>{log.module ? <Badge variant="outline" className="text-[10px]">{log.module}</Badge> : '—'}</TableCell>
              )}
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
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">Audit Trail</h1>
            <p className="text-muted-foreground">Complete traceability for every action, relationship, and transaction</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1"><Shield className="h-3 w-3" />{isSuperAdmin ? 'Super Admin' : 'Company Admin'}</Badge>
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" />Export All</Button>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card><CardContent className="pt-4 pb-3"><div className="flex items-center gap-2"><Database className="h-4 w-4 text-muted-foreground" /><div><p className="text-[11px] text-muted-foreground">Total Events</p><p className="text-xl font-bold">{totalCount.toLocaleString()}</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3"><div className="flex items-center gap-2"><User className="h-4 w-4 text-blue-500" /><div><p className="text-[11px] text-muted-foreground">Active Users</p><p className="text-xl font-bold">{stats.uniqueUsers}</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-emerald-500" /><div><p className="text-[11px] text-muted-foreground">Creates</p><p className="text-xl font-bold text-emerald-500">{stats.creates}</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3"><div className="flex items-center gap-2"><History className="h-4 w-4 text-amber-500" /><div><p className="text-[11px] text-muted-foreground">Updates</p><p className="text-xl font-bold text-amber-500">{stats.updates}</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3"><div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-destructive" /><div><p className="text-[11px] text-muted-foreground">Deletes</p><p className="text-xl font-bold text-destructive">{stats.deletes}</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3"><div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /><div><p className="text-[11px] text-muted-foreground">Accounting</p><p className="text-xl font-bold text-primary">{stats.accounting}</p></div></div></CardContent></Card>
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="relationships" className="flex items-center gap-1.5 text-xs">
              <Link2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Relationships</span>
            </TabsTrigger>
            <TabsTrigger value="sessions" className="flex items-center gap-1.5 text-xs">
              <LogIn className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">User Sessions</span>
            </TabsTrigger>
            <TabsTrigger value="changes" className="flex items-center gap-1.5 text-xs">
              <Activity className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Data Changes</span>
            </TabsTrigger>
            <TabsTrigger value="all" className="flex items-center gap-1.5 text-xs">
              <Layers className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">All Events</span>
            </TabsTrigger>
          </TabsList>

          {/* ========== TAB 1: RELATIONSHIPS ========== */}
          <TabsContent value="relationships">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="h-5 w-5" />
                    Entity Relationship Map
                  </CardTitle>
                  <CardDescription>
                    Shows how sales, devices, journal entries, AP, and AR records are connected
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {relLoading ? (
                    <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
                  ) : (
                    <div className="space-y-6">
                      {/* Sales → Device + Accounting chain */}
                      <div>
                        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                          <Badge variant="outline">Sales</Badge>
                          <ArrowRight className="h-3 w-3" />
                          <Badge variant="outline">Devices</Badge>
                          <ArrowRight className="h-3 w-3" />
                          <Badge variant="outline">Journal Entries</Badge>
                          <ArrowRight className="h-3 w-3" />
                          <Badge variant="outline">AR</Badge>
                        </h3>
                        <div className="border rounded-lg overflow-auto max-h-[400px]">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead>Order #</TableHead>
                                <TableHead>Marketplace</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead className="text-right">Sale Price</TableHead>
                                <TableHead>Device Linked?</TableHead>
                                <TableHead>Accounting</TableHead>
                                <TableHead>Journal Entries</TableHead>
                                <TableHead>AR Record</TableHead>
                                <TableHead>Company</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {relSales.slice(0, 100).map(sale => {
                                const linkedJEs = relJournals.filter(j => j.reference_id === sale.id);
                                const linkedAR = relAR.filter(a => a.source_reference === sale.order_number || a.source_reference === sale.id);
                                const hasDevice = !!sale.device_id;
                                const accStatus = sale.accounting_status || 'unprocessed';

                                return (
                                  <TableRow key={sale.id}>
                                    <TableCell className="font-mono text-sm font-medium">{sale.order_number}</TableCell>
                                    <TableCell><Badge variant="outline" className="text-[10px] capitalize">{sale.marketplace}</Badge></TableCell>
                                    <TableCell className="text-sm">{sale.customer_name || '—'}</TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(sale.sale_price)}</TableCell>
                                    <TableCell>
                                      <Badge variant={hasDevice ? 'default' : 'destructive'} className="text-[10px]">
                                        {hasDevice ? '✓ Linked' : '✗ Missing'}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant={accStatus === 'fully_processed' ? 'default' : accStatus === 'revenue_only' ? 'secondary' : 'destructive'} className="text-[10px]">
                                        {formatStatus(accStatus)}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      {linkedJEs.length > 0 ? (
                                        <span className="text-xs text-emerald-600 font-medium">{linkedJEs.length} entries</span>
                                      ) : (
                                        <span className="text-xs text-destructive">None</span>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {linkedAR.length > 0 ? (
                                        <Badge variant="outline" className="text-[10px]">{formatStatus(linkedAR[0].status)}</Badge>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs">{companyName(sale.company_id)}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        {relSales.length > 100 && <p className="text-xs text-muted-foreground mt-2">Showing 100 of {relSales.length}</p>}
                      </div>

                      <Separator />

                      {/* AP → Journal Entries */}
                      <div>
                        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                          <Badge variant="outline">Accounts Payable</Badge>
                          <ArrowRight className="h-3 w-3" />
                          <Badge variant="outline">Journal Entries</Badge>
                        </h3>
                        <div className="border rounded-lg overflow-auto max-h-[300px]">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead>Vendor</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Journal Entries</TableHead>
                                <TableHead>Company</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {relAP.slice(0, 50).map(ap => {
                                const linkedJEs = relJournals.filter(j => j.reference_id === ap.id);
                                return (
                                  <TableRow key={ap.id}>
                                    <TableCell className="font-medium text-sm">{ap.vendor_name}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(ap.original_amount)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(ap.balance_due || 0)}</TableCell>
                                    <TableCell><Badge variant="outline" className="text-[10px]">{formatStatus(ap.status)}</Badge></TableCell>
                                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{ap.description || '—'}</TableCell>
                                    <TableCell>
                                      {linkedJEs.length > 0 ? (
                                        <span className="text-xs text-emerald-600 font-medium">{linkedJEs.length} entries</span>
                                      ) : (
                                        <span className="text-xs text-amber-500">No entries</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs">{companyName(ap.company_id)}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      <Separator />

                      {/* Journal Entries summary */}
                      <div>
                        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                          <Badge variant="outline">Journal Entries</Badge>
                          — Source Breakdown
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {['sale', 'purchase', 'expense', 'return', 'invoice', 'tax_payment', 'manual'].map(refType => {
                            const count = relJournals.filter(j => j.reference_type === refType).length;
                            if (count === 0) return null;
                            return (
                              <Card key={refType}>
                                <CardContent className="pt-3 pb-3">
                                  <p className="text-xs text-muted-foreground capitalize">{refType.replace('_', ' ')}</p>
                                  <p className="text-lg font-bold">{count}</p>
                                </CardContent>
                              </Card>
                            );
                          })}
                          <Card>
                            <CardContent className="pt-3 pb-3">
                              <p className="text-xs text-muted-foreground">Auto-Generated</p>
                              <p className="text-lg font-bold">{relJournals.filter(j => j.is_auto_generated).length}</p>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="pt-3 pb-3">
                              <p className="text-xs text-muted-foreground">Manual</p>
                              <p className="text-lg font-bold">{relJournals.filter(j => !j.is_auto_generated).length}</p>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ========== TAB 2: USER SESSIONS ========== */}
          <TabsContent value="sessions">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><LogIn className="h-5 w-5" />User Session History</CardTitle>
                <CardDescription>Login/logout events and user activity summary</CardDescription>
              </CardHeader>
              <CardContent>
                {sessionLogs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <LogIn className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No session events recorded in this period</p>
                    <p className="text-xs mt-1">Login/logout events will appear here once tracked</p>
                  </div>
                ) : (
                  <LogTable data={sessionLogs} showModule={false} />
                )}

                {/* User activity breakdown */}
                {Object.keys(profiles).length > 0 && (
                  <div className="mt-6">
                    <h4 className="font-semibold text-sm mb-3">User Activity Summary (in period)</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>User</TableHead>
                            <TableHead className="text-right">Total Actions</TableHead>
                            <TableHead className="text-right">Creates</TableHead>
                            <TableHead className="text-right">Updates</TableHead>
                            <TableHead className="text-right">Deletes</TableHead>
                            <TableHead className="text-right">Exports</TableHead>
                            <TableHead className="text-right">Imports</TableHead>
                            <TableHead>Last Active</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(
                            logs.reduce<Record<string, AuditLog[]>>((acc, log) => {
                              const uid = log.user_id || 'system';
                              if (!acc[uid]) acc[uid] = [];
                              acc[uid].push(log);
                              return acc;
                            }, {})
                          ).sort((a, b) => b[1].length - a[1].length).map(([userId, userLogs]) => (
                            <TableRow key={userId}>
                              <TableCell className="font-medium">{getUserName(userId === 'system' ? null : userId)}</TableCell>
                              <TableCell className="text-right font-bold">{userLogs.length}</TableCell>
                              <TableCell className="text-right text-emerald-600">{userLogs.filter(l => l.action === 'INSERT').length || '—'}</TableCell>
                              <TableCell className="text-right text-amber-600">{userLogs.filter(l => l.action === 'UPDATE').length || '—'}</TableCell>
                              <TableCell className="text-right text-destructive">{userLogs.filter(l => l.action === 'DELETE').length || '—'}</TableCell>
                              <TableCell className="text-right">{userLogs.filter(l => l.action === 'EXPORT').length || '—'}</TableCell>
                              <TableCell className="text-right">{userLogs.filter(l => l.action === 'IMPORT').length || '—'}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {format(new Date(userLogs[0].created_at), 'MMM d, HH:mm')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== TAB 3: DATA CHANGES ========== */}
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


          {/* ========== TAB 5: ALL EVENTS ========== */}
          <TabsContent value="all">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Layers className="h-5 w-5" />Complete Event Log</CardTitle>
                  <CardDescription>Showing {logs.length} of {totalCount} events</CardDescription>
                </div>
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

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2"><User className="h-4 w-4" />Session Information</h4>
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Label className="text-muted-foreground w-24">User ID:</Label>
                      <span className="font-mono text-xs">{selectedLog.user_id || 'System'}</span>
                    </div>
                    {selectedLog.ip_address && (
                      <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-muted-foreground" /><span className="font-mono text-xs">{selectedLog.ip_address}</span></div>
                    )}
                    {selectedLog.user_agent && (
                      <div className="flex items-center gap-2"><Monitor className="h-4 w-4 text-muted-foreground" /><span className="text-xs truncate max-w-[400px]">{selectedLog.user_agent}</span></div>
                    )}
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
    </DashboardLayout>
  );
}
