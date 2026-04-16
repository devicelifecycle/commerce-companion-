import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDataRefetch, emitRefetch } from '@/hooks/useDataRefetch';
import { supabase } from '@/integrations/supabase/client';
import { cleanupBeforePODelete } from '@/lib/accounting/reversalUtils';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuditLog } from '@/hooks/useAuditLog';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PermissionGuard } from '@/components/layout/PermissionGuard';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, Download, Plus, ClipboardList, X, Trash2, PackageCheck, Copy, Eye, Package, Wrench, Receipt, Upload } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

import { CreatePurchaseOrderDialog } from '@/components/procurement/CreatePurchaseOrderDialog';
import { ReceivePODialog } from '@/components/procurement/ReceivePODialog';
import { ImportRepairPartsDialog } from '@/components/procurement/ImportRepairPartsDialog';
import { ActivityFooter } from '@/components/activity/ActivityFooter';
import { PODetailDialog } from '@/components/procurement/PODetailDialog';
import { useTableSelection } from '@/hooks/useTableSelection';
import { BatchActionBar } from '@/components/ui/batch-action-bar';
import { MetricCard } from '@/components/ui/metric-card';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_name: string;
  po_date: string;
  status: string;
  payment_status: string;
  subtotal: number;
  gst_hst_amount: number;
  pst_qst_amount: number;
  total_amount: number;
  paid_amount: number;
  notes: string | null;
  expected_delivery_date: string | null;
  payment_method: string | null;
  company_id: string | null;
  supplier_id: string | null;
  po_type: string;
}

const POTypeBadge = ({ type }: { type: string }) => {
  const config = {
    inventory: { icon: Package, label: 'Inventory', className: 'text-[hsl(var(--info))] bg-[hsl(var(--info)/.1)] border-[hsl(var(--info)/.25)]' },
    repair_parts: { icon: Wrench, label: 'Repair', className: 'text-[hsl(var(--warning))] bg-[hsl(var(--warning)/.1)] border-[hsl(var(--warning)/.25)]' },
    expense: { icon: Receipt, label: 'Expense', className: 'text-[hsl(var(--accent))] bg-[hsl(var(--accent)/.1)] border-[hsl(var(--accent)/.25)]' },
  }[type] || { icon: Package, label: type, className: '' };
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-1 ${config.className}`}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </Badge>
  );
};

export default function PurchaseOrders() {
  const { selectedCompany, hasPermission, isSuperAdmin } = useCompany();
  const { logDelete } = useAuditLog();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [receivePoId, setReceivePoId] = useState<string | null>(null);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [detailPoId, setDetailPoId] = useState<string | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [cloneLoading, setCloneLoading] = useState<string | null>(null);
  const [showImportRepairParts, setShowImportRepairParts] = useState(false);

  const canManage = hasPermission('inventory_manage', 'edit') || isSuperAdmin;

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = !search.trim() ||
        o.po_number.toLowerCase().includes(search.toLowerCase()) ||
        o.supplier_name.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      const matchPayment = paymentFilter === 'all' || o.payment_status === paymentFilter;
      return matchSearch && matchStatus && matchPayment;
    });
  }, [orders, search, statusFilter, paymentFilter]);

  const { selectedIds, toggle, toggleAll, isAllSelected, clear, selectedItems } = useTableSelection(filtered);

  const hasActiveFilters = statusFilter !== 'all' || paymentFilter !== 'all';

  const metrics = useMemo(() => ({
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    totalValue: orders.reduce((sum, o) => sum + o.total_amount, 0),
    unpaid: orders.filter(o => o.payment_status !== 'paid').reduce((sum, o) => sum + o.total_amount - (o.paid_amount || 0), 0),
  }), [orders]);

  useEffect(() => {
    loadOrders();
  }, [selectedCompany?.id]);

  const loadOrders = async () => {
    setLoading(true);
    let query = supabase.from('purchase_orders').select('*').order('po_date', { ascending: false });
    if (selectedCompany?.id) query = query.eq('company_id', selectedCompany.id);
    const { data } = await query;
    if (data) setOrders(data as PurchaseOrder[]);
    setLoading(false);
  };

  useDataRefetch('purchase_orders', loadOrders);

  const clearFilters = () => { setStatusFilter('all'); setPaymentFilter('all'); setSearch(''); };

  const exportCsv = () => {
    const rows = selectedItems.length > 0 ? selectedItems : filtered;
    const csv = [
      ['PO #', 'Supplier', 'Type', 'Date', 'Status', 'Payment', 'Subtotal', 'GST/HST', 'PST/QST', 'Total', 'Paid'].join(','),
      ...rows.map(o => [o.po_number, o.supplier_name, o.po_type, o.po_date, o.status, o.payment_status, o.subtotal, o.gst_hst_amount, o.pst_qst_amount, o.total_amount, o.paid_amount || 0].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'purchase-orders.csv'; a.click();
  };

  const deletePO = async (id: string) => {
    const po = orders.find(o => o.id === id);
    if (!po) return;
    if (!confirm(`Delete PO ${po.po_number}? AP entries, GRNs, RMAs, and journal entries will also be removed.`)) return;
    try {
      const { journalCount, grnCount } = await cleanupBeforePODelete(id, po.po_number, po.company_id || '');
      const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
      if (error) throw error;
      const details = [journalCount > 0 && `${journalCount} JEs`, grnCount > 0 && `${grnCount} GRNs`].filter(Boolean).join(', ');
      logDelete('purchase_orders', id, { po_number: po.po_number, total_amount: po.total_amount }, `PO ${po.po_number} deleted${details ? `. Reversed: ${details}` : ''}`);
      toast.success(`PO deleted${details ? ` — reversed: ${details}` : ''}`);
      loadOrders();
      emitRefetch('financials');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete PO');
    }
  };

  const deleteSelectedPOs = async () => { for (const id of selectedIds) await deletePO(id); clear(); };

  const clonePO = async (po: PurchaseOrder) => {
    setCloneLoading(po.id);
    try {
      const prefix = selectedCompany?.code || 'PO';
      const dateStr = format(new Date(), 'yyyyMMdd');
      const { count } = await supabase.from('purchase_orders').select('id', { count: 'exact', head: true });
      const num = (count || 0) + 1;
      const newPoNumber = `${prefix}-${dateStr}-${String(num).padStart(3, '0')}`;

      const { data: newPo, error: poError } = await supabase.from('purchase_orders').insert({
        po_number: newPoNumber,
        supplier_id: po.supplier_id,
        supplier_name: po.supplier_name,
        po_date: new Date().toISOString().split('T')[0],
        expected_delivery_date: null,
        subtotal: po.subtotal,
        gst_hst_amount: po.gst_hst_amount,
        pst_qst_amount: po.pst_qst_amount,
        total_amount: po.total_amount,
        status: 'pending',
        payment_status: 'unpaid',
        payment_method: po.payment_method,
        notes: `Cloned from ${po.po_number}`,
        company_id: po.company_id,
        po_type: po.po_type,
      }).select('id').single();

      if (poError) throw poError;

      if (newPo) {
        const { data: origItems } = await supabase.from('purchase_order_items').select('*').eq('purchase_order_id', po.id);
        if (origItems && origItems.length > 0) {
          const clonedItems = origItems.map((item: any) => ({
            purchase_order_id: newPo.id,
            description: item.description,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            gst_hst_amount: item.gst_hst_amount,
            pst_qst_amount: item.pst_qst_amount,
            total_cost: item.total_cost,
            item_type: item.item_type || 'inventory',
          }));
          await supabase.from('purchase_order_items').insert(clonedItems);
        }
      }

      toast.success(`Cloned as ${newPoNumber}`);
      loadOrders();
    } catch (error: any) {
      toast.error(error.message || 'Failed to clone PO');
    } finally {
      setCloneLoading(null);
    }
  };

  const openReceive = (poId: string) => { setReceivePoId(poId); setShowReceiveDialog(true); };
  const openDetail = (poId: string) => { setDetailPoId(poId); setShowDetailDialog(true); };

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const statusBadge = (s: string) => {
    const map: Record<string, { variant: any; className: string }> = {
      completed: { variant: 'outline', className: 'bg-[hsl(var(--success)/.1)] text-[hsl(var(--success))] border-[hsl(var(--success)/.3)]' },
      received: { variant: 'outline', className: 'bg-[hsl(var(--success)/.1)] text-[hsl(var(--success))] border-[hsl(var(--success)/.3)]' },
      partially_received: { variant: 'outline', className: 'bg-[hsl(var(--warning)/.1)] text-[hsl(var(--warning))] border-[hsl(var(--warning)/.3)]' },
      pending: { variant: 'outline', className: 'bg-[hsl(var(--info)/.1)] text-[hsl(var(--info))] border-[hsl(var(--info)/.3)]' },
      cancelled: { variant: 'outline', className: 'bg-destructive/10 text-destructive border-destructive/30' },
    };
    const cfg = map[s] || map.pending;
    return <Badge variant={cfg.variant} className={`text-[10px] px-1.5 py-0 capitalize ${cfg.className}`}>{s?.replace('_', ' ')}</Badge>;
  };

  const paymentBadge = (s: string) => {
    const map: Record<string, string> = {
      paid: 'bg-[hsl(var(--success)/.1)] text-[hsl(var(--success))] border-[hsl(var(--success)/.3)]',
      partial: 'bg-[hsl(var(--warning)/.1)] text-[hsl(var(--warning))] border-[hsl(var(--warning)/.3)]',
      unpaid: 'bg-muted/50 text-muted-foreground border-border',
    };
    return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${map[s] || map.unpaid}`}>{s}</Badge>;
  };

  const canReceive = (status: string) => status === 'pending' || status === 'partially_received';

  return (
    <PermissionGuard permission="inventory_view" title="PO & GRN">
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">PO & GRN</h1>
            <p className="text-sm text-muted-foreground">Purchase Orders & Goods Received — manage procurement for inventory, parts & supplies</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export
            </Button>
            {canManage && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowImportRepairParts(true)}>
                  <Upload className="h-3.5 w-3.5 mr-1" /> Import Parts Invoice
                </Button>
                <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Create PO
                </Button>
              </>
            )}
          </div>
        </div>



        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard title="Total POs" value={metrics.total} icon={ClipboardList} />
          <MetricCard title="Pending" value={metrics.pending} icon={ClipboardList} iconClassName="bg-[hsl(var(--info)/.1)]" />
          <MetricCard title="Total Value" value={fmtCurrency(metrics.totalValue)} icon={ClipboardList} iconClassName="bg-[hsl(var(--success)/.1)]" />
          <MetricCard title="Unpaid Balance" value={fmtCurrency(metrics.unpaid)} icon={ClipboardList} iconClassName="bg-destructive/10" />
        </div>

        {/* Filters + Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search PO # or supplier..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partially_received">Partial</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Payment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payment</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[32px] px-2">
                    <Checkbox checked={isAllSelected} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead className="w-[140px]">PO #</TableHead>
                  <TableHead className="w-[160px]">Supplier</TableHead>
                  <TableHead className="w-[70px]">Type</TableHead>
                  <TableHead className="w-[90px]">Date</TableHead>
                  <TableHead className="w-[90px]">Status</TableHead>
                  <TableHead className="w-[70px]">Payment</TableHead>
                  <TableHead className="w-[90px] text-right">Total</TableHead>
                  <TableHead className="w-[90px] text-right">Balance</TableHead>
                  <TableHead className="w-[110px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">No purchase orders found</TableCell></TableRow>
                ) : filtered.map(o => (
                  <TableRow key={o.id} className="cursor-pointer group" onClick={() => openDetail(o.id)}>
                    <TableCell className="px-2" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(o.id)} onCheckedChange={() => toggle(o.id)} />
                    </TableCell>
                    <TableCell className="px-2">
                      <span className="text-xs font-semibold">{o.po_number}</span>
                    </TableCell>
                    <TableCell className="px-2">
                      <span className="text-xs truncate max-w-[140px] block">{o.supplier_name}</span>
                    </TableCell>
                    <TableCell className="px-2">
                      <POTypeBadge type={o.po_type} />
                    </TableCell>
                    <TableCell className="px-2 text-[11px] text-muted-foreground whitespace-nowrap">
                      {format(new Date(o.po_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="px-2">{statusBadge(o.status)}</TableCell>
                    <TableCell className="px-2">{paymentBadge(o.payment_status)}</TableCell>
                    <TableCell className="px-2 text-right text-xs font-mono font-medium tabular-nums">
                      {fmtCurrency(o.total_amount)}
                    </TableCell>
                    <TableCell className="px-2 text-right text-xs font-mono tabular-nums">
                      {o.payment_status === 'paid' ? (
                        <span className="text-[hsl(var(--success))]">Paid</span>
                      ) : (
                        <span className={o.total_amount - (o.paid_amount || 0) > 0 ? 'text-destructive' : ''}>
                          {fmtCurrency(o.total_amount - (o.paid_amount || 0))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-2" onClick={e => e.stopPropagation()}>
                      <TooltipProvider delayDuration={300}>
                        <div className="flex items-center justify-center gap-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(o.id)}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View Details</TooltipContent>
                          </Tooltip>
                          {canManage && canReceive(o.status) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => openReceive(o.id)}>
                                  <PackageCheck className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Receive Items</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => clonePO(o)} disabled={cloneLoading === o.id}>
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Clone PO</TooltipContent>
                          </Tooltip>
                          <AlertDialog>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete PO {o.po_number}?</AlertDialogTitle>
                                <AlertDialogDescription>This will permanently delete this purchase order and its line items.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deletePO(o.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <BatchActionBar count={selectedIds.size} onClear={clear}
          actions={[
            { label: 'Export Selected', icon: <Download className="h-4 w-4" />, onClick: exportCsv },
            { label: 'Delete Selected', icon: <Trash2 className="h-4 w-4" />, onClick: deleteSelectedPOs, variant: 'destructive' as const },
          ]}
        />

        <CreatePurchaseOrderDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} onSuccess={loadOrders} />
        <ReceivePODialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog} onSuccess={loadOrders} poId={receivePoId} />
        <PODetailDialog open={showDetailDialog} onOpenChange={setShowDetailDialog} onUpdate={loadOrders} poId={detailPoId} canManage={canManage} />
        <ImportRepairPartsDialog open={showImportRepairParts} onOpenChange={setShowImportRepairParts} onSuccess={loadOrders} />

        <ActivityFooter module="Procurement" tableNames={['purchase_orders', 'purchase_order_items', 'goods_received_notes', 'grn_items']} />
      </div>
    </DashboardLayout>
    </PermissionGuard>
  );
}
