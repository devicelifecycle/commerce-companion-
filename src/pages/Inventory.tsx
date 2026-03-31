import { useState, useCallback, useMemo } from 'react';
import { useDataRefetch } from '@/hooks/useDataRefetch';
import { SupplierReturnDialog } from '@/components/inventory/SupplierReturnDialog';
import { InventoryWriteOffDialog } from '@/components/inventory/InventoryWriteOffDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { InventoryTransferDialog } from '@/components/inventory/InventoryTransferDialog';
import { InventoryLabelDialog } from '@/components/inventory/InventoryLabelDialog';
import { useInventoryQuery } from '@/hooks/useInventoryQuery';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { TableSkeleton } from '@/components/ui/table-skeleton';


import { FBAInventoryTracker } from '@/components/inventory/FBAInventoryTracker';
import { ProductsManagement } from '@/components/inventory/ProductsManagement';
import { RepairPartsManagement } from '@/components/inventory/RepairPartsManagement';
import { DeviceRepairDialog } from '@/components/inventory/DeviceRepairDialog';
import { RefurbishmentQueue } from '@/components/refurbishment/RefurbishmentQueue';
import { RefurbishmentDetail } from '@/components/refurbishment/RefurbishmentDetail';
import { IMEIQuickLookup } from '@/components/inventory/IMEIQuickLookup';
import { BulkPricingCalculator } from '@/components/inventory/BulkPricingCalculator';
import { TransferPricingRules } from '@/components/inventory/TransferPricingRules';

import { DeviceProcurementDialog } from '@/components/inventory/DeviceProcurementDialog';
import { DeviceTimelineDialog } from '@/components/inventory/DeviceTimelineDialog';
import { DeviceFilters } from '@/components/inventory/DeviceFilters';
import { DeviceTable } from '@/components/inventory/DeviceTable';
import { DeviceEditDialog } from '@/components/inventory/DeviceEditDialog';
import { useTableSelection } from '@/hooks/useTableSelection';
import { BatchActionBar, exportToCsv } from '@/components/ui/batch-action-bar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Upload, ArrowRightLeft, Smartphone, Boxes, List, Package,
  Download, Send, Trash2, Wrench, RotateCcw, XCircle, Calculator, Settings,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';

type DeviceStatus = 'in_stock' | 'reserved' | 'sold' | 'returned' | 'hold_for_refurbishment';

export default function Inventory() {
  const { user } = useAuth();
  const { selectedCompany, isSuperAdmin, hasPermission, companies } = useCompany();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { logEvent } = useAuditLog();

  // Support ?tab= URL param for deep linking (e.g. /inventory?tab=refurbishment)
  const defaultTab = searchParams.get('tab') || 'list';
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Refurbishment state
  const [selectedRefurbDeviceId, setSelectedRefurbDeviceId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');

  // Debounced search for server-side query
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    // Simple debounce via timeout
    const t = setTimeout(() => setDebouncedSearch(value), 300);
    return () => clearTimeout(t);
  }, []);

  const canManage = hasPermission('inventory_manage', 'edit') || isSuperAdmin;
  const canView = hasPermission('inventory_view', 'view') || isSuperAdmin;

  // Use the centralized query hook with pagination + server-side search
  const {
    devices, isLoading, refetch, pagination, setPage, setPageSize,
  } = useInventoryQuery({
    statusFilter,
    categoryFilter,
    channelFilter,
    searchTerm: debouncedSearch,
  });

  useDataRefetch('inventory', refetch);

  // Refurbishment queries
  const { data: pendingRefurb = [], isLoading: refurbLoading, refetch: refetchRefurb } = useQuery({
    queryKey: ['refurbishment-pending', selectedCompany?.id],
    enabled: activeTab === 'refurbishment',
    queryFn: async () => {
      let query = supabase
        .from('devices')
        .select('*, suppliers(name)')
        .eq('status', 'hold_for_refurbishment')
        .in('refurbishment_status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false });
      if (selectedCompany) query = query.eq('company_id', selectedCompany.id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: completedRefurb = [], isLoading: completedRefurbLoading, refetch: refetchCompletedRefurb } = useQuery({
    queryKey: ['refurbishment-completed', selectedCompany?.id],
    enabled: activeTab === 'refurbishment',
    queryFn: async () => {
      let query = supabase
        .from('devices')
        .select('*, suppliers(name)')
        .eq('refurbishment_status', 'completed')
        .order('refurbishment_completed_at', { ascending: false })
        .limit(50);
      if (selectedCompany) query = query.eq('company_id', selectedCompany.id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const refetchAllRefurb = () => { refetchRefurb(); refetchCompletedRefurb(); };
  const pendingRefurbCount = pendingRefurb.length;


  const [editDevice, setEditDevice] = useState<any>(null);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferDevice, setTransferDevice] = useState<any>(null);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [labelDevice, setLabelDevice] = useState<any>(null);
  const [procurementDevice, setProcurementDevice] = useState<{ id: string; label: string } | null>(null);
  const [timelineDevice, setTimelineDevice] = useState<any>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [repairDevice, setRepairDevice] = useState<any>(null);
  const [bulkRmaOpen, setBulkRmaOpen] = useState(false);
  const [bulkRmaItems, setBulkRmaItems] = useState<any[]>([]);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [writeOffDevices, setWriteOffDevices] = useState<any[]>([]);

  const selection = useTableSelection(devices);

  // Bulk actions
  const handleBulkDelete = async () => {
    try {
      const ids = Array.from(selection.selectedIds);
      const { error } = await supabase.from('devices').delete().in('id', ids);
      if (error) throw error;
      for (const id of ids) {
        logEvent({ action: 'DELETE', tableName: 'devices', recordId: id, module: 'Inventory', notes: `Device deleted` });
      }
      toast.success(`${selection.count} device(s) deleted`);
      selection.clear();
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete devices');
    }
  };

  const handleBulkStatusChange = async (status: DeviceStatus) => {
    try {
      const { error } = await supabase.from('devices').update({ status }).in('id', Array.from(selection.selectedIds));
      if (error) throw error;
      toast.success(`${selection.count} device(s) updated to ${status.replace('_', ' ')}`);
      selection.clear();
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update devices');
    }
  };

  const handleBulkSendToFBA = async () => {
    const inStockIds = selection.selectedItems
      .filter((d: any) => d.status === 'in_stock' && d.fulfillment_channel !== 'fba' && d.fulfillment_channel !== 'in_transit_fba')
      .map((d: any) => d.id);
    if (inStockIds.length === 0) {
      toast.error('No eligible in-stock devices selected');
      return;
    }
    try {
      const { error } = await supabase.from('devices').update({ fulfillment_channel: 'in_transit_fba' }).in('id', inStockIds);
      if (error) throw error;
      logEvent({ action: 'UPDATE' as any, tableName: 'devices', module: 'Inventory', notes: `Bulk sent ${inStockIds.length} device(s) to FBA` });
      toast.success(`${inStockIds.length} device(s) marked as in transit to FBA`);
      selection.clear();
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Failed to send to FBA');
    }
  };

  const handleExportDevices = () => {
    const items = selection.count > 0 ? selection.selectedItems : devices;
    const headers = ['Brand', 'Model', 'IMEI', 'SKU', 'Category', 'Condition', 'Status', 'Cost', 'Sale Price', 'Storage', 'Color', 'Supplier'];
    const rows = items.map((d: any) => [
      d.brand, d.model, d.imei || '', d.sku || '', d.category, d.condition, d.status,
      d.cost_price, d.sale_price || '', d.storage || '', d.color || '', d.suppliers?.name || '',
    ]);
    exportToCsv(headers, rows, `inventory-${new Date().toISOString().split('T')[0]}.csv`);
    toast.success(`${items.length} device(s) exported`);
  };

  const handleBulkCreateRMA = () => {
    const items = selection.selectedItems.map((d: any) => ({
      id: d.id,
      type: 'device' as const,
      name: `${d.brand} ${d.model}${d.imei ? ` (${d.imei})` : ''}`,
      cost: d.cost_price,
      supplierId: d.supplier_id || null,
    }));
    setBulkRmaItems(items);
    setBulkRmaOpen(true);
  };

  const handleBulkWriteOff = () => {
    const items = selection.selectedItems.filter((d: any) => d.status !== 'sold').map((d: any) => ({
      id: d.id,
      brand: d.brand,
      model: d.model,
      imei: d.imei,
      cost_price: d.cost_price,
      company_id: d.company_id,
    }));
    if (items.length === 0) { toast.error('No eligible devices selected (sold devices cannot be written off)'); return; }
    setWriteOffDevices(items);
    setWriteOffOpen(true);
  };

  if (!canView) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">You don't have permission to view inventory.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold">Inventory</h1>
              <p className="text-muted-foreground">
                {selectedCompany ? `${selectedCompany.name} inventory` : 'Consolidated view across all companies'}
              </p>
            </div>
            
          </div>

          <div className="flex gap-2">
            {canManage && (
              <>
                <Button variant="outline" onClick={() => navigate('/import')}>
                  <Upload className="h-4 w-4 mr-2" />
                  Bulk Import
                </Button>
                {isSuperAdmin && (
                  <Button variant="outline" onClick={() => setShowTransferDialog(true)}>
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Transfer
                  </Button>
                )}
              </>
            )}
          </div>
        </div>



        {/* IMEI Quick Lookup */}
        <IMEIQuickLookup onSelectDevice={(device) => setTimelineDevice(device)} />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="list" className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" /> Devices
            </TabsTrigger>
            <TabsTrigger value="refurbishment" className="flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Refurbishment
              {pendingRefurbCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{pendingRefurbCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Boxes className="h-4 w-4" /> Products
            </TabsTrigger>
            <TabsTrigger value="fba" className="flex items-center gap-2">
              <List className="h-4 w-4" /> FBA Management
            </TabsTrigger>
            <TabsTrigger value="repairs" className="flex items-center gap-2">
              <Package className="h-4 w-4" /> Repair Parts
            </TabsTrigger>
            <TabsTrigger value="pricing" className="flex items-center gap-2">
              <Calculator className="h-4 w-4" /> Pricing
            </TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="transfer-rules" className="flex items-center gap-2">
                <Settings className="h-4 w-4" /> Transfer Rules
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="list">
            <Card>
              <CardHeader>
                <DeviceFilters
                  searchTerm={searchTerm}
                  onSearchChange={handleSearchChange}
                  statusFilter={statusFilter}
                  onStatusChange={setStatusFilter}
                  categoryFilter={categoryFilter}
                  onCategoryChange={setCategoryFilter}
                  channelFilter={channelFilter}
                  onChannelChange={setChannelFilter}
                  onExport={handleExportDevices}
                />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <TableSkeleton columns={8} rows={10} />
                ) : (
                  <DeviceTable
                    devices={devices}
                    companies={companies}
                    selectedCompany={selectedCompany}
                    canManage={canManage}
                    isSuperAdmin={isSuperAdmin}
                    selection={selection}
                    onEdit={setEditDevice}
                    onLabel={(d) => { setLabelDevice(d); setShowLabelDialog(true); }}
                    onProcurement={(d) => setProcurementDevice(d)}
                    onTimeline={setTimelineDevice}
                    onTransfer={(d) => { setTransferDevice(d); setShowTransferDialog(true); }}
                    onRepair={setRepairDevice}
                    onRefresh={refetch}
                  />
                )}
                <DataTablePagination
                  pagination={pagination}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="refurbishment">
            {selectedRefurbDeviceId ? (
              <RefurbishmentDetail
                deviceId={selectedRefurbDeviceId}
                onBack={() => { setSelectedRefurbDeviceId(null); refetchAllRefurb(); }}
                canManage={canManage}
              />
            ) : (
              <div className="space-y-4">
                <Tabs defaultValue="queue">
                  <TabsList>
                    <TabsTrigger value="queue">Queue ({pendingRefurbCount})</TabsTrigger>
                    <TabsTrigger value="completed">Completed</TabsTrigger>
                  </TabsList>
                  <TabsContent value="queue">
                    <RefurbishmentQueue
                      devices={pendingRefurb}
                      isLoading={refurbLoading}
                      onSelect={setSelectedRefurbDeviceId}
                      canManage={canManage}
                    />
                  </TabsContent>
                  <TabsContent value="completed">
                    <RefurbishmentQueue
                      devices={completedRefurb}
                      isLoading={completedRefurbLoading}
                      onSelect={setSelectedRefurbDeviceId}
                      canManage={canManage}
                      isCompletedView
                    />
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </TabsContent>

          <TabsContent value="products">
            <ProductsManagement canManage={canManage} />
          </TabsContent>

          <TabsContent value="fba">
            <FBAInventoryTracker />
          </TabsContent>

          <TabsContent value="repairs">
            <RepairPartsManagement canManage={canManage} />
          </TabsContent>

          <TabsContent value="pricing">
            <BulkPricingCalculator canManage={canManage} />
          </TabsContent>

          {isSuperAdmin && (
            <TabsContent value="transfer-rules">
              <TransferPricingRules />
            </TabsContent>
          )}
        </Tabs>

        

        {/* Edit Dialog */}
        <DeviceEditDialog
          open={!!editDevice}
          onOpenChange={(open) => !open && setEditDevice(null)}
          device={editDevice}
          onSuccess={refetch}
        />

        {/* Transfer Dialog */}
        <InventoryTransferDialog
          open={showTransferDialog}
          onOpenChange={setShowTransferDialog}
          onSuccess={refetch}
          preselectedDevice={transferDevice}
        />

        {/* Label Dialog */}
        <InventoryLabelDialog
          open={showLabelDialog}
          onOpenChange={setShowLabelDialog}
          device={labelDevice}
        />

        {/* Procurement Dialog */}
        <DeviceProcurementDialog
          open={!!procurementDevice}
          onOpenChange={(open) => !open && setProcurementDevice(null)}
          deviceId={procurementDevice?.id || ''}
          deviceLabel={procurementDevice?.label || ''}
        />

        {/* Device Timeline */}
        <DeviceTimelineDialog
          open={!!timelineDevice}
          onOpenChange={(open) => !open && setTimelineDevice(null)}
          device={timelineDevice}
        />

        {/* Repair Dialog */}
        <DeviceRepairDialog
          open={!!repairDevice}
          onOpenChange={(open) => !open && setRepairDevice(null)}
          device={repairDevice}
          onSuccess={refetch}
        />

        {/* Batch Action Bar */}
        <BatchActionBar
          count={selection.count}
          onClear={selection.clear}
          actions={[
            { label: 'Export', icon: <Download className="h-4 w-4 mr-1" />, onClick: handleExportDevices },
            ...(canManage ? [
              { label: 'Create RMA', icon: <RotateCcw className="h-4 w-4 mr-1" />, onClick: handleBulkCreateRMA },
              { label: 'Send to FBA', icon: <Send className="h-4 w-4 mr-1" />, onClick: handleBulkSendToFBA },
              { label: 'Write Off', icon: <XCircle className="h-4 w-4 mr-1" />, onClick: handleBulkWriteOff, variant: 'destructive' as const },
              { label: 'Delete', icon: <Trash2 className="h-4 w-4 mr-1" />, onClick: () => setBulkDeleteConfirm(true), variant: 'destructive' as const },
            ] : []),
          ]}
          statusActions={canManage ? {
            onStatusChange: handleBulkStatusChange,
            options: [
              { value: 'in_stock', label: 'In Stock' },
              { value: 'reserved', label: 'Reserved' },
              { value: 'hold_for_refurbishment', label: 'Hold for Refurb' },
              { value: 'sold', label: 'Sold' },
              { value: 'returned', label: 'Returned' },
            ],
          } : undefined}
        />

        {/* Bulk delete confirmation */}
        <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selection.count} Device(s)</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the selected devices. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { handleBulkDelete(); setBulkDeleteConfirm(false); }}
              >
                Delete All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk RMA Dialog */}
        <SupplierReturnDialog
          open={bulkRmaOpen}
          onOpenChange={setBulkRmaOpen}
          preselectedItems={bulkRmaItems}
          onSuccess={() => { selection.clear(); refetch(); }}
        />

        {/* Write-Off Dialog */}
        <InventoryWriteOffDialog
          open={writeOffOpen}
          onOpenChange={setWriteOffOpen}
          devices={writeOffDevices}
          onSuccess={() => { selection.clear(); refetch(); }}
        />
      </div>
    </DashboardLayout>
  );
}
