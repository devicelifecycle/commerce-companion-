import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { OrdersGuide } from '@/components/guides/OrdersGuide';
import { useAuth } from '@/lib/auth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { ActivityLog } from '@/components/audit/ActivityLog';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { EditSaleDialog } from '@/components/sales/EditSaleDialog';
import { OrderDetailDialog } from '@/components/sales/OrderDetailDialog';
import { ReturnFromOrderDialog } from '@/components/sales/ReturnFromOrderDialog';
import { useSalesQuery, SaleRecord } from '@/hooks/useSalesQuery';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { useQuickActionListener } from '@/hooks/useGlobalShortcuts';
import { MarketplaceBadge, FulfillmentBadge, MarketplaceStatusBadge } from '@/components/ui/status-badge';
import { BatchActionBar } from '@/components/ui/batch-action-bar';
import { MetricCard } from '@/components/ui/metric-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub,
  DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Search, Plus, Trash2, Link, Unlink, MoreHorizontal,
  Download, ArrowRightLeft, RefreshCw, AlertCircle, CheckSquare,
  Package, Clock, Truck, PackageCheck, ShoppingCart, RotateCcw, Eye,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { getCompanyDisplayName } from '@/lib/companyNames';

type Marketplace = 'shopify' | 'amazon' | 'bestbuy' | 'other';
type FulfillmentStatus = 'received' | 'pending' | 'shipped' | 'delivered' | 'cancelled';
type CompanyFilter = 'all' | string;

// Use SaleRecord from the hook instead of a local interface
type Sale = SaleRecord;

export default function Sales() {
  const { user } = useAuth();
  const { selectedCompany, companies, isSuperAdmin, hasPermission, loading: permLoading } = useCompany();
  const { logEvent, logExport } = useAuditLog();
  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>('all');
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editingSale, setEditingSale] = useState<{ id: string; deviceId: string | null; orderNumber: string } | null>(null);
  const [importingFrom, setImportingFrom] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewingSale, setViewingSale] = useState<Sale | null>(null);
  const [returningSale, setReturningSale] = useState<Sale | null>(null);

  const canManageSales = hasPermission('sales_manage', 'edit');
  const canViewSales = hasPermission('sales_view', 'view');

  // Quick action: open "Record Sale" dialog via Alt+S
  useQuickActionListener('add-sale', useCallback(() => {
    if (canManageSales) setShowManualSale(true);
  }, [canManageSales]));

  // Resolve company IDs by code
  const vesCompany = companies.find(c => c.code === 'VES');
  const tgwCompany = companies.find(c => c.code === 'TGW');

  // Set default company filter based on user's selected company
  useEffect(() => {
    if (selectedCompany) {
      setCompanyFilter(selectedCompany.id);
    } else if (isSuperAdmin) {
      setCompanyFilter('all');
    }
  }, [selectedCompany, isSuperAdmin]);

  // React Query powered data fetching with pagination & realtime
  const {
    sales: filteredSales,
    allSales: sales,
    returnSaleIds,
    isLoading: loading,
    refetch: fetchSales,
    pagination,
    sort,
    setPage,
    setPageSize,
    toggleSort,
  } = useSalesQuery({ companyFilter, marketplaceFilter, statusFilter, searchTerm });

  // Determine which company code is selected
  const selectedCompanyCode = useMemo(() => {
    if (companyFilter === 'all') return null;
    const comp = companies.find(c => c.id === companyFilter);
    return comp?.code || null;
  }, [companyFilter, companies]);

  // Contextual marketplace options
  const marketplaceOptions = useMemo(() => {
    if (selectedCompanyCode === 'VES') return [{ value: 'amazon', label: 'Amazon' }];
    if (selectedCompanyCode === 'TGW') return [
      { value: 'shopify', label: 'Shopify' },
      { value: 'bestbuy', label: 'Best Buy' },
    ];
    return [
      { value: 'amazon', label: 'Amazon' },
      { value: 'shopify', label: 'Shopify' },
      { value: 'bestbuy', label: 'Best Buy' },
      { value: 'other', label: 'Other' },
    ];
  }, [selectedCompanyCode]);

  // Reset marketplace filter when company changes and current filter is not valid
  useEffect(() => {
    if (marketplaceFilter !== 'all') {
      const valid = marketplaceOptions.some(o => o.value === marketplaceFilter);
      if (!valid) setMarketplaceFilter('all');
    }
  }, [marketplaceOptions, marketplaceFilter]);

  // Metrics from current page data
  const metrics = useMemo(() => {
    const total = pagination.totalCount;
    const received = sales.filter(s => (s.fulfillment_status || 'received') === 'received').length;
    const pending = sales.filter(s => s.fulfillment_status === 'pending').length;
    const shipped = sales.filter(s => s.fulfillment_status === 'shipped').length;
    const delivered = sales.filter(s => s.fulfillment_status === 'delivered').length;
    return { total, received, pending, shipped, delivered };
  }, [sales, pagination.totalCount]);

  const handleDeleteSale = async (id: string) => {
    if (!confirm('Are you sure you want to delete this sale record?')) return;
    try {
      const { error } = await supabase.from('sales').delete().eq('id', id);
      if (error) throw error;
      logEvent({ action: 'DELETE' as any, tableName: 'sales', recordId: id, module: 'Sales', notes: 'Sale record deleted' });
      toast.success('Sale deleted');
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      fetchSales();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete sale');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected sale(s)?`)) return;
    try {
      const { error } = await supabase.from('sales').delete().in('id', Array.from(selectedIds));
      if (error) throw error;
      toast.success(`${selectedIds.size} sale(s) deleted`);
      setSelectedIds(new Set());
      fetchSales();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete sales');
    }
  };

  const handleUnlinkDevice = async (saleId: string, deviceId: string) => {
    try {
      // Revert accounting status so COGS entries can be re-evaluated
      const { error: saleError } = await supabase.from('sales').update({ 
        device_id: null, 
        accounting_status: 'revenue_only' 
      }).eq('id', saleId);
      if (saleError) throw saleError;
      const { error: deviceError } = await supabase.from('devices').update({ status: 'in_stock' as any, sale_price: null }).eq('id', deviceId);
      if (deviceError) throw deviceError;

      // Reverse COGS journal entries for this sale
      const { data: cogsEntries } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('reference_id', saleId)
        .eq('reference_type', 'sale')
        .ilike('description', 'COGS%');

      if (cogsEntries && cogsEntries.length > 0) {
        const entryIds = cogsEntries.map(e => e.id);
        // Delete lines first, then entries (reverse balance updates would be ideal but complex)
        await supabase.from('journal_entry_lines').delete().in('journal_entry_id', entryIds);
        await supabase.from('journal_entries').delete().in('id', entryIds);
      }

      toast.success('Device unlinked — COGS entries reversed');
      fetchSales();
    } catch (error: any) {
      toast.error(error.message || 'Failed to unlink device');
    }
  };

  const handleUpdateStatus = async (saleId: string, status: FulfillmentStatus) => {
    try {
      const { error } = await supabase.from('sales').update({ fulfillment_status: status }).eq('id', saleId);
      if (error) throw error;
      logEvent({ action: 'UPDATE' as any, tableName: 'sales', recordId: saleId, module: 'Sales', notes: `Status changed to ${status}` });
      toast.success(`Status updated to ${status}`);
      fetchSales();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSales.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSales.map(s => s.id)));
    }
  };

  const handleImport = async (source: 'shopify' | 'amazon' | 'bestbuy') => {
    setImportingFrom(source);
    try {
      const { data, error } = await supabase.functions.invoke(`import-${source}-orders`);
      if (error) throw error;
      if (data?.success) {
        toast.success(`Imported ${data.imported} orders from ${source.charAt(0).toUpperCase() + source.slice(1)}`);
        fetchSales();
      } else {
        throw new Error(data?.error || 'Import failed');
      }
    } catch (error: any) {
      toast.error(error.message || `Failed to import from ${source}`);
    } finally {
      setImportingFrom(null);
    }
  };

  const handleExport = () => {
    const headers = ['Order Number', 'Marketplace', 'Date', 'Sale Price', 'Fees', 'Shipping', 'Tax', 'Profit', 'Customer', 'Device', 'IMEI', 'Status'];
    const rows = sales.map(sale => [
      sale.order_number, sale.marketplace,
      new Date(sale.sale_date).toLocaleDateString(),
      sale.sale_price.toFixed(2), sale.marketplace_fees.toFixed(2),
      sale.shipping_cost.toFixed(2), sale.tax_amount.toFixed(2),
      (sale.profit || 0).toFixed(2), sale.customer_name || '',
      sale.devices ? `${sale.devices.brand} ${sale.devices.model}` : '',
      sale.devices?.imei || '', sale.marketplace_status || sale.fulfillment_status || 'received',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logExport('sales', sales.length, 'CSV');
    toast.success('Orders exported to CSV');
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });

  if (permLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!canViewSales && !isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold">Orders</h1>
            <p className="text-muted-foreground">Track and manage your orders</p>
          </div>
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Access Restricted</h3>
                <p className="text-muted-foreground max-w-md">
                  You don't have permission to view sales data.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Orders</h1>
            <p className="text-muted-foreground">Track and manage marketplace orders</p>
          </div>
          <div className="flex gap-2">
            {canManageSales && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <RefreshCw className={`h-4 w-4 mr-2 ${importingFrom ? 'animate-spin' : ''}`} />
                      Import
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleImport('shopify')} disabled={importingFrom !== null}>
                      Import from Shopify (TGW)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleImport('bestbuy')} disabled={importingFrom !== null}>
                      Import from Best Buy (TGW)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleImport('amazon')} disabled={importingFrom !== null}>
                      Import from Amazon (VES)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button variant="outline" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>

                {isSuperAdmin && (
                  <Button variant="outline" onClick={() => setShowIntercompanySale(true)}>
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Intercompany
                  </Button>
                )}

                <Button onClick={() => setShowManualSale(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Record Sale
                </Button>
              </>
            )}
          </div>
        </div>

        <OrdersGuide />
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          {isSuperAdmin && (
            <Button
              variant={companyFilter === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCompanyFilter('all')}
            >
              All Companies
            </Button>
          )}
          {vesCompany && (
            <Button
              variant={companyFilter === vesCompany.id ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCompanyFilter(vesCompany.id)}
            >
              {getCompanyDisplayName('VES')}
            </Button>
          )}
          {tgwCompany && (
            <Button
              variant={companyFilter === tgwCompany.id ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCompanyFilter(tgwCompany.id)}
            >
              {getCompanyDisplayName('TGW')}
            </Button>
          )}
        </div>

        {/* Metrics Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard title="Total Orders" value={metrics.total} icon={ShoppingCart} />
          <MetricCard title="Received" value={metrics.received} icon={Package} iconClassName="bg-info/10" />
          <MetricCard title="Pending" value={metrics.pending} icon={Clock} iconClassName="bg-warning/10" />
          <MetricCard title="Shipped" value={metrics.shipped} icon={Truck} iconClassName="bg-success/10" />
          <MetricCard title="Delivered" value={metrics.delivered} icon={PackageCheck} iconClassName="bg-emerald-500/10" />
        </div>

        {/* Filters & Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search order, customer, IMEI, device..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={marketplaceFilter} onValueChange={setMarketplaceFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Marketplace" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Marketplaces</SelectItem>
                  {marketplaceOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <TableSkeleton columns={8} rows={10} />
            ) : filteredSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No orders found</h3>
                <p className="text-muted-foreground">
                  {searchTerm ? 'Try adjusting your search' : 'Import or record your first order to get started'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {canManageSales && (
                        <TableHead className="w-[40px]">
                          <Checkbox
                            checked={filteredSales.length > 0 && selectedIds.size === filteredSales.length}
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                      )}
                      <TableHead>Order</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Marketplace</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Sale Price</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.map((sale) => (
                      <TableRow 
                        key={sale.id} 
                        data-state={selectedIds.has(sale.id) ? 'selected' : undefined}
                        className="cursor-pointer"
                        onClick={() => setViewingSale(sale)}
                      >
                        {canManageSales && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(sale.id)}
                              onCheckedChange={() => toggleSelect(sale.id)}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-medium">{sale.order_number}</p>
                              {sale.customer_name && (
                                <p className="text-xs text-muted-foreground">{sale.customer_name}</p>
                              )}
                            </div>
                            {returnSaleIds.has(sale.id) && (
                              <Badge variant="outline" className="text-destructive border-destructive/40 text-[10px] px-1.5 py-0">
                                <RotateCcw className="h-2.5 w-2.5 mr-0.5" />
                                Return
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {sale.devices ? (
                            <div>
                              <p className="text-sm">{sale.devices.brand} {sale.devices.model}</p>
                              {sale.devices.imei && (
                                <p className="text-xs text-muted-foreground font-mono">{sale.devices.imei}</p>
                              )}
                            </div>
                          ) : sale.product_title ? (
                            <div>
                              <p className="text-sm truncate max-w-[200px]" title={sale.product_title}>{sale.product_title}</p>
                              {sale.marketplace_sku && (
                                <p className="text-xs text-muted-foreground font-mono">SKU: {sale.marketplace_sku}</p>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs">Not linked</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <MarketplaceBadge marketplace={sale.marketplace} />
                        </TableCell>
                        <TableCell>
                          <MarketplaceStatusBadge 
                            marketplace={sale.marketplace} 
                            marketplaceStatus={sale.marketplace_status} 
                          />
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(sale.sale_date)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(sale.sale_price)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {sale.profit != null ? (
                            <span className={sale.profit >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}>
                              {formatCurrency(sale.profit)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setViewingSale(sale)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              {canManageSales && (
                                <>
                                  {!sale.device_id && (
                                    <DropdownMenuItem
                                      onClick={() => setEditingSale({
                                        id: sale.id,
                                        deviceId: sale.device_id,
                                        orderNumber: sale.order_number
                                      })}
                                    >
                                      <Link className="h-4 w-4 mr-2" />
                                      Link Device
                                    </DropdownMenuItem>
                                  )}
                                  {sale.device_id && (
                                    <DropdownMenuItem
                                      onClick={() => handleUnlinkDevice(sale.id, sale.device_id!)}
                                    >
                                      <Unlink className="h-4 w-4 mr-2" />
                                      Unlink Device
                                    </DropdownMenuItem>
                                  )}
                                  {!returnSaleIds.has(sale.id) && (
                                    <DropdownMenuItem onClick={() => setReturningSale(sale)}>
                                      <RotateCcw className="h-4 w-4 mr-2" />
                                      Initiate Return
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      <Truck className="h-4 w-4 mr-2" />
                                      Update Status
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      {(['received', 'pending', 'shipped', 'delivered', 'cancelled'] as FulfillmentStatus[]).map(s => (
                                        <DropdownMenuItem key={s} onClick={() => handleUpdateStatus(sale.id, s)}>
                                          <FulfillmentBadge status={s} />
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => handleDeleteSale(sale.id)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {!loading && pagination.totalCount > 0 && (
              <DataTablePagination
                pagination={pagination}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            )}
          </CardContent>
        </Card>

        {/* Activity Log */}
        <ActivityLog tableName="sales" title="Orders Activity" limit={10} />
      </div>

      <ManualSaleDialog open={showManualSale} onOpenChange={setShowManualSale} onSuccess={fetchSales} />
      <IntercompanySaleDialog open={showIntercompanySale} onOpenChange={setShowIntercompanySale} onSuccess={fetchSales} />

      {editingSale && (
        <EditSaleDialog
          open={!!editingSale}
          onOpenChange={() => setEditingSale(null)}
          saleId={editingSale.id}
          currentDeviceId={editingSale.deviceId}
          orderNumber={editingSale.orderNumber}
          onSaved={fetchSales}
        />
      )}

      {viewingSale && (
        <OrderDetailDialog
          open={!!viewingSale}
          onOpenChange={() => setViewingSale(null)}
          sale={viewingSale}
          hasReturn={returnSaleIds.has(viewingSale.id)}
          onInitiateReturn={() => setReturningSale(viewingSale)}
        />
      )}

      {returningSale && (
        <ReturnFromOrderDialog
          open={!!returningSale}
          onOpenChange={() => setReturningSale(null)}
          sale={returningSale}
          onSuccess={fetchSales}
        />
      )}

      <BatchActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          { label: 'Export', icon: <Download className="h-4 w-4 mr-1" />, onClick: handleExport },
          ...(canManageSales ? [
            { label: 'Delete', icon: <Trash2 className="h-4 w-4 mr-1" />, onClick: handleBulkDelete, variant: 'destructive' as const },
          ] : []),
        ]}
      />
    </DashboardLayout>
  );
}
