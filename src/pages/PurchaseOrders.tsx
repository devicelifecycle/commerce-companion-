import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PermissionGuard } from '@/components/layout/PermissionGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, Download, Plus, ClipboardList, Filter, X, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PurchaseOrdersGuide } from '@/components/guides/PurchaseOrdersGuide';
import { CreatePurchaseOrderDialog } from '@/components/procurement/CreatePurchaseOrderDialog';
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
  notes: string | null;
  expected_delivery_date: string | null;
  payment_method: string | null;
}

export default function PurchaseOrders() {
  const { selectedCompany, hasPermission, isSuperAdmin } = useCompany();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

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
    completed: orders.filter(o => o.status === 'completed' || o.status === 'received').length,
    totalValue: orders.reduce((sum, o) => sum + o.total_amount, 0),
    unpaid: orders.filter(o => o.payment_status === 'unpaid').reduce((sum, o) => sum + o.total_amount, 0),
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

  const clearFilters = () => {
    setStatusFilter('all');
    setPaymentFilter('all');
    setSearch('');
  };

  const exportCsv = () => {
    const rows = selectedItems.length > 0 ? selectedItems : filtered;
    const csv = [
      ['PO #', 'Supplier', 'Date', 'Status', 'Payment', 'Subtotal', 'GST/HST', 'PST/QST', 'Total'].join(','),
      ...rows.map(o => [o.po_number, o.supplier_name, o.po_date, o.status, o.payment_status, o.subtotal, o.gst_hst_amount, o.pst_qst_amount, o.total_amount].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'purchase-orders.csv'; a.click();
  };

  const deletePO = async (id: string) => {
    try {
      // Delete PO items first
      await supabase.from('purchase_order_items').delete().eq('purchase_order_id', id);
      // Delete related AP if any
      // Delete the PO
      const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
      if (error) throw error;
      toast.success('Purchase order deleted');
      loadOrders();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete PO');
    }
  };

  const deleteSelectedPOs = async () => {
    for (const id of selectedIds) {
      await deletePO(id);
    }
    clear();
  };

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const statusColor = (s: string) => {
    switch (s) {
      case 'completed': case 'received': return 'default';
      case 'pending': return 'secondary';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <PermissionGuard permission="inventory_view" title="Purchase Orders">
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Purchase Orders</h1>
            <p className="text-sm text-muted-foreground">Track and manage supplier purchase orders</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-1" /> Create PO
              </Button>
            )}
          </div>
        </div>

        <PurchaseOrdersGuide />

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard title="Total POs" value={metrics.total} icon={ClipboardList} />
          <MetricCard title="Pending" value={metrics.pending} icon={ClipboardList} iconClassName="bg-warning/10" />
          <MetricCard title="Total Value" value={fmtCurrency(metrics.totalValue)} icon={ClipboardList} iconClassName="bg-success/10" />
          <MetricCard title="Unpaid Balance" value={fmtCurrency(metrics.unpaid)} icon={ClipboardList} iconClassName="bg-destructive/10" />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search PO # or supplier..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Payment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payment</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={isAllSelected} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead>PO #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Expected Delivery</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-10">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No purchase orders found</TableCell></TableRow>
                ) : filtered.map(o => (
                  <TableRow key={o.id}>
                    <TableCell><Checkbox checked={selectedIds.has(o.id)} onCheckedChange={() => toggle(o.id)} /></TableCell>
                    <TableCell className="font-medium">{o.po_number}</TableCell>
                    <TableCell>{o.supplier_name}</TableCell>
                    <TableCell>{format(new Date(o.po_date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{o.expected_delivery_date ? format(new Date(o.expected_delivery_date), 'MMM d, yyyy') : '—'}</TableCell>
                    <TableCell><Badge variant={statusColor(o.status)} className="capitalize">{o.status}</Badge></TableCell>
                    <TableCell><Badge variant={o.payment_status === 'paid' ? 'default' : 'secondary'} className="capitalize">{o.payment_status}</Badge></TableCell>
                    <TableCell className="text-right font-mono">{fmtCurrency(o.total_amount)}</TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete PO {o.po_number}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete this purchase order and its line items. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deletePO(o.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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

        <CreatePurchaseOrderDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onSuccess={loadOrders}
        />
      </div>
    </DashboardLayout>
    </PermissionGuard>
  );
}
