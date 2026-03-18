import { useState, useEffect, useCallback, useMemo } from 'react';
import { normalizeBrand, normalizeModel, modelFuzzyKey } from '@/lib/modelNormalization';
import { InventoryGuide } from '@/components/guides/InventoryGuide';
import { supabase } from '@/integrations/supabase/client';
import { useAuditLog } from '@/hooks/useAuditLog';
import { ActivityLog } from '@/components/audit/ActivityLog';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { CompanySelector } from '@/components/layout/CompanySelector';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { InventoryTransferDialog } from '@/components/inventory/InventoryTransferDialog';
import { InventoryLabelDialog } from '@/components/inventory/InventoryLabelDialog';
import { useInventoryQuery } from '@/hooks/useInventoryQuery';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { TableSkeleton } from '@/components/ui/table-skeleton';

import { FBAInventoryTracker } from '@/components/inventory/FBAInventoryTracker';
import { ProductsManagement } from '@/components/inventory/ProductsManagement';
import { FBAFeeAnalytics } from '@/components/inventory/FBAFeeAnalytics';
import { DeviceProcurementDialog } from '@/components/inventory/DeviceProcurementDialog';
import { StatusBadge, ConditionBadge } from '@/components/ui/status-badge';
import { Checkbox } from '@/components/ui/checkbox';
import { BatchActionBar, exportToCsv } from '@/components/ui/batch-action-bar';
import { useTableSelection } from '@/hooks/useTableSelection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Search, Plus, Filter, Smartphone, Trash2, Edit2, MoreHorizontal,
  List, ArrowRightLeft, QrCode, Link, Upload, Boxes,
  FileText, Download, Send, AlertTriangle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type DeviceCondition = 'new' | 'refurbished' | 'used' | 'damaged';
type DeviceStatus = 'in_stock' | 'reserved' | 'sold' | 'returned' | 'hold_for_refurbishment';

interface Device {
  id: string;
  imei: string | null;
  sku: string | null;
  category: string;
  model: string;
  brand: string;
  storage: string | null;
  color: string | null;
  condition: DeviceCondition;
  status: DeviceStatus;
  cost_price: number;
  sale_price: number | null;
  supplier_id: string | null;
  purchase_date: string | null;
  warehouse_location: string | null;
  notes: string | null;
  company_id: string | null;
  created_at: string;
  fulfillment_channel: string | null;
  suppliers?: { name: string } | null;
}

interface Supplier {
  id: string;
  name: string;
}

const CATEGORIES = ['phone', 'laptop', 'tablet', 'accessory', 'smartwatch', 'other'];

export default function Inventory() {
  const { user } = useAuth();
  const { selectedCompany, isSuperAdmin, hasPermission, companies } = useCompany();
  const navigate = useNavigate();
  const { logEvent } = useAuditLog();
  const [devices, setDevices] = useState<Device[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferDevice, setTransferDevice] = useState<Device | null>(null);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [labelDevice, setLabelDevice] = useState<Device | null>(null);
  const [procurementDevice, setProcurementDevice] = useState<{ id: string; label: string } | null>(null);

  const canManage = hasPermission('inventory_manage', 'edit') || isSuperAdmin;
  const canView = hasPermission('inventory_view', 'view') || isSuperAdmin;

  const [formData, setFormData] = useState({
    imei: '',
    sku: '',
    category: 'phone',
    model: '',
    brand: '',
    storage: '',
    color: '',
    condition: 'new' as DeviceCondition,
    status: 'in_stock' as DeviceStatus,
    cost_price: '',
    sale_price: '',
    supplier_id: '',
    purchase_date: new Date().toISOString().split('T')[0],
    warehouse_location: '',
    notes: '',
    payment_method: '' as string,
  });
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  useEffect(() => {
    if (canView) {
      fetchDevices();
      fetchSuppliers();
    }
  }, [statusFilter, categoryFilter, channelFilter, selectedCompany, canView]);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('devices')
        .select(`*, suppliers (name)`)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as DeviceStatus);
      }

      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      if (channelFilter !== 'all') {
        if (channelFilter === 'local') {
          query = query.or('fulfillment_channel.eq.local,fulfillment_channel.is.null');
        } else {
          query = query.eq('fulfillment_channel', channelFilter);
        }
      }

      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDevices((data || []) as Device[]);
    } catch (error) {
      console.error('Error fetching devices:', error);
      toast.error('Failed to fetch devices');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    let query = supabase.from('suppliers').select('id, name').order('name');
    if (selectedCompany) {
      query = query.eq('company_id', selectedCompany.id);
    }
    const { data } = await query;
    setSuppliers(data || []);
  };

  // Check for duplicate models when brand/model changes
  useEffect(() => {
    if (!formData.brand || !formData.model) {
      setDuplicateWarning(null);
      return;
    }
    const normalizedBrand = normalizeBrand(formData.brand);
    const normalizedModel = normalizeModel(formData.model);
    const newKey = modelFuzzyKey(normalizedBrand, normalizedModel);
    
    const match = devices.find(d => {
      const existingKey = modelFuzzyKey(d.brand, d.model);
      return existingKey === newKey;
    });
    
    if (match && (!selectedDevice || match.id !== selectedDevice.id)) {
      setDuplicateWarning(`Similar device exists: "${match.brand} ${match.model}". Did you mean that?`);
    } else {
      setDuplicateWarning(null);
    }
  }, [formData.brand, formData.model, devices, selectedDevice]);

  // handleAddDevice removed — manual device entry moved to Import page

  const handleUpdateDevice = async () => {
    if (!selectedDevice) return;

    try {
      const { error } = await supabase
        .from('devices')
        .update({
          imei: formData.imei || null,
          sku: formData.sku || null,
          category: formData.category,
          model: formData.model,
          brand: formData.brand,
          storage: formData.storage || null,
          color: formData.color || null,
          condition: formData.condition,
          status: formData.status,
          cost_price: parseFloat(formData.cost_price),
          sale_price: formData.sale_price ? parseFloat(formData.sale_price) : null,
          supplier_id: formData.supplier_id || null,
          purchase_date: formData.purchase_date,
          warehouse_location: formData.warehouse_location || null,
          notes: formData.notes || null,
        })
        .eq('id', selectedDevice.id);

      if (error) throw error;

      logEvent({ action: 'UPDATE' as any, tableName: 'devices', recordId: selectedDevice.id, module: 'Inventory', notes: `Updated ${formData.brand} ${formData.model}` });
      toast.success('Device updated');
      setIsEditDialogOpen(false);
      setSelectedDevice(null);
      resetForm();
      fetchDevices();
    } catch (error: any) {
      console.error('Error updating device:', error);
      toast.error(error.message || 'Failed to update device');
    }
  };

  const handleDeleteDevice = async (id: string) => {
    if (!confirm('Are you sure you want to delete this device?')) return;

    try {
      const { error } = await supabase.from('devices').delete().eq('id', id);
      if (error) throw error;
      logEvent({ action: 'DELETE' as any, tableName: 'devices', recordId: id, module: 'Inventory', notes: 'Device deleted' });
      toast.success('Device deleted');
      fetchDevices();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete device');
    }
  };

  const handleQuickStatusChange = async (id: string, newStatus: DeviceStatus) => {
    try {
      const { error } = await supabase
        .from('devices')
        .update({ status: newStatus })
        .eq('id', id);
      if (error) throw error;
      toast.success(`Device marked as ${newStatus.replace('_', ' ')}`);
      fetchDevices();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status');
    }
  };

  const openEditDialog = (device: Device) => {
    setSelectedDevice(device);
    setFormData({
      imei: device.imei || '',
      sku: device.sku || '',
      category: device.category || 'phone',
      model: device.model,
      brand: device.brand,
      storage: device.storage || '',
      color: device.color || '',
      condition: device.condition,
      status: device.status,
      cost_price: device.cost_price.toString(),
      sale_price: device.sale_price?.toString() || '',
      supplier_id: device.supplier_id || '',
      purchase_date: device.purchase_date || new Date().toISOString().split('T')[0],
      warehouse_location: device.warehouse_location || '',
      notes: device.notes || '',
      payment_method: '',
    });
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      imei: '',
      sku: '',
      category: 'phone',
      model: '',
      brand: '',
      storage: '',
      color: '',
      condition: 'new',
      status: 'in_stock',
      cost_price: '',
      sale_price: '',
      supplier_id: '',
      purchase_date: new Date().toISOString().split('T')[0],
      warehouse_location: '',
      notes: '',
      payment_method: '',
    });
    setDuplicateWarning(null);
  };

  const filteredDevices = devices.filter((device) => {
    const matchesSearch =
      device.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.imei?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.color?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const selection = useTableSelection(filteredDevices);

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selection.count} selected device(s)?`)) return;
    try {
      const { error } = await supabase.from('devices').delete().in('id', Array.from(selection.selectedIds));
      if (error) throw error;
      toast.success(`${selection.count} device(s) deleted`);
      selection.clear();
      fetchDevices();
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
      fetchDevices();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update devices');
    }
  };

  const handleBulkSendToFBA = async () => {
    const inStockIds = selection.selectedItems
      .filter(d => d.status === 'in_stock' && d.fulfillment_channel !== 'fba' && d.fulfillment_channel !== 'in_transit_fba')
      .map(d => d.id);
    if (inStockIds.length === 0) {
      toast.error('No eligible in-stock devices selected');
      return;
    }
    try {
      const { error } = await supabase
        .from('devices')
        .update({ fulfillment_channel: 'in_transit_fba' })
        .in('id', inStockIds);
      if (error) throw error;
      logEvent({ action: 'UPDATE' as any, tableName: 'devices', module: 'Inventory', notes: `Bulk sent ${inStockIds.length} device(s) to FBA` });
      toast.success(`${inStockIds.length} device(s) marked as in transit to FBA`);
      selection.clear();
      fetchDevices();
    } catch (error: any) {
      toast.error(error.message || 'Failed to send to FBA');
    }
  };

  const handleExportDevices = () => {
    const items = selection.count > 0 ? selection.selectedItems : filteredDevices;
    const headers = ['Brand', 'Model', 'IMEI', 'SKU', 'Category', 'Condition', 'Status', 'Cost', 'Sale Price', 'Storage', 'Color', 'Supplier'];
    const rows = items.map(d => [
      d.brand, d.model, d.imei || '', d.sku || '', d.category, d.condition, d.status,
      d.cost_price, d.sale_price || '', d.storage || '', d.color || '', d.suppliers?.name || '',
    ]);
    exportToCsv(headers, rows, `inventory-${new Date().toISOString().split('T')[0]}.csv`);
    toast.success(`${items.length} device(s) exported`);
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const DeviceForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
      {/* Duplicate warning */}
      {duplicateWarning && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{duplicateWarning}</span>
        </div>
      )}

      {/* Normalized preview */}
      {formData.brand && formData.model && (
        <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
          Will be saved as: <span className="font-medium text-foreground">{normalizeBrand(formData.brand)} {normalizeModel(formData.model)}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="brand">Brand *</Label>
          <Input
            id="brand"
            value={formData.brand}
            onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
            placeholder="Apple, Samsung..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model">Model *</Label>
          <Input
            id="model"
            value={formData.model}
            onChange={(e) => setFormData({ ...formData, model: e.target.value })}
            placeholder="iPhone 15 Pro"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select
            value={formData.category}
            onValueChange={(value) => setFormData({ ...formData, category: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sku">SKU</Label>
          <Input
            id="sku"
            value={formData.sku}
            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
            placeholder="SKU-12345"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="imei">IMEI / Serial Number</Label>
          <Input
            id="imei"
            value={formData.imei}
            onChange={(e) => setFormData({ ...formData, imei: e.target.value })}
            placeholder="123456789012345"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="storage">Storage</Label>
          <Input
            id="storage"
            value={formData.storage}
            onChange={(e) => setFormData({ ...formData, storage: e.target.value })}
            placeholder="256GB"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="color">Color</Label>
          <Input
            id="color"
            value={formData.color}
            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            placeholder="Space Black"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="condition">Condition</Label>
          <Select
            value={formData.condition}
            onValueChange={(value: DeviceCondition) => setFormData({ ...formData, condition: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="refurbished">Refurbished</SelectItem>
              <SelectItem value="used">Used</SelectItem>
              <SelectItem value="damaged">Damaged</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cost_price">Cost Price *</Label>
          <Input
            id="cost_price"
            type="number"
            value={formData.cost_price}
            onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
            placeholder="500.00"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sale_price">Sale Price</Label>
          <Input
            id="sale_price"
            type="number"
            value={formData.sale_price}
            onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })}
            placeholder="699.00"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="supplier" className="text-amber-600 dark:text-amber-400">Supplier * (required)</Label>
          <Select
            value={formData.supplier_id}
            onValueChange={(value) => setFormData({ ...formData, supplier_id: value })}
          >
            <SelectTrigger className={!formData.supplier_id ? 'border-amber-500' : ''}>
              <SelectValue placeholder="Select supplier" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="payment_method" className="text-amber-600 dark:text-amber-400">Payment Method * (required)</Label>
          <Select
            value={formData.payment_method}
            onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
          >
            <SelectTrigger className={!formData.payment_method ? 'border-amber-500' : ''}>
              <SelectValue placeholder="How was this acquired?" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash (paid immediately)</SelectItem>
              <SelectItem value="credit_card">Credit Card (paid immediately)</SelectItem>
              <SelectItem value="debit_card">Debit Card (paid immediately)</SelectItem>
              <SelectItem value="credit">On Credit (creates AP)</SelectItem>
              <SelectItem value="wire_transfer">Wire Transfer (creates AP)</SelectItem>
              <SelectItem value="e_transfer">E-Transfer (creates AP)</SelectItem>
            </SelectContent>
          </Select>
          {formData.payment_method && !['cash', 'credit_card', 'debit_card'].includes(formData.payment_method) && (
            <p className="text-xs text-muted-foreground">An Accounts Payable record will be auto-created</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value: DeviceStatus) => setFormData({ ...formData, status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in_stock">In Stock</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
              <SelectItem value="sold">Sold</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="purchase_date" className="text-amber-600 dark:text-amber-400">Purchase Date * (required)</Label>
          <Input
            id="purchase_date"
            type="date"
            value={formData.purchase_date}
            onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
            className={!formData.purchase_date ? 'border-amber-500' : ''}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="warehouse_location">Location</Label>
          <Input
            id="warehouse_location"
            value={formData.warehouse_location}
            onChange={(e) => setFormData({ ...formData, warehouse_location: e.target.value })}
            placeholder="Warehouse A, Shelf 1"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Additional notes..."
        />
      </div>

      <DialogFooter>
        <Button 
          onClick={onSubmit} 
          disabled={!formData.brand || !formData.model || !formData.cost_price || !formData.supplier_id || !formData.purchase_date || !formData.payment_method}
        >
          {submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );

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
            <CompanySelector />
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

        <InventoryGuide />

        <Tabs defaultValue="list" className="space-y-4">
          <TabsList>
            <TabsTrigger value="list" className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Devices
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Products
            </TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="fba" className="flex items-center gap-2">
                <List className="h-4 w-4" />
                FBA Management
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="list">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search devices..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-36">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="in_stock">In Stock</SelectItem>
                      <SelectItem value="reserved">Reserved</SelectItem>
                      <SelectItem value="sold">Sold</SelectItem>
                      <SelectItem value="returned">Returned</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={channelFilter} onValueChange={setChannelFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Channel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Channels</SelectItem>
                      <SelectItem value="local">Local Warehouse</SelectItem>
                      <SelectItem value="fba">At FBA</SelectItem>
                      <SelectItem value="in_transit_fba">In Transit to FBA</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={handleExportDevices}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : filteredDevices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Smartphone className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold">No devices found</h3>
                    <p className="text-muted-foreground">
                      {searchTerm ? 'Try adjusting your search' : 'Add your first device to get started'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]">
                            <Checkbox
                              checked={selection.isAllSelected}
                              onCheckedChange={selection.toggleAll}
                              aria-label="Select all"
                            />
                          </TableHead>
                          <TableHead>Device</TableHead>
                          <TableHead>IMEI/SKU</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Condition</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Channel</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          {!selectedCompany && <TableHead>Company</TableHead>}
                          {canManage && <TableHead className="w-[50px]" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDevices.map((device) => {
                          const company = companies.find(c => c.id === device.company_id);
                          return (
                            <TableRow key={device.id} data-state={selection.selectedIds.has(device.id) ? 'selected' : undefined}>
                              <TableCell>
                                <Checkbox
                                  checked={selection.selectedIds.has(device.id)}
                                  onCheckedChange={() => selection.toggle(device.id)}
                                  aria-label={`Select ${device.brand} ${device.model}`}
                                />
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{device.brand} {device.model}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {[device.storage, device.color].filter(Boolean).join(' • ')}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {device.imei || device.sku || '-'}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="capitalize">{device.category}</Badge>
                              </TableCell>
                              <TableCell>
                                <ConditionBadge condition={device.condition} />
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={device.status} />
                              </TableCell>
                              <TableCell>
                                {device.fulfillment_channel === 'fba' ? (
                                  <Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30 text-[10px]">FBA</Badge>
                                ) : device.fulfillment_channel === 'in_transit_fba' ? (
                                  <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-[10px]">In Transit</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px]">Local</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(device.cost_price)}
                              </TableCell>
                              {!selectedCompany && (
                                <TableCell>
                                  <Badge variant="secondary">{company?.code || '-'}</Badge>
                                </TableCell>
                              )}
                              {canManage && (
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => openEditDialog(device)}>
                                        <Edit2 className="h-4 w-4 mr-2" />
                                        Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => {
                                        setLabelDevice(device);
                                        setShowLabelDialog(true);
                                      }}>
                                        <QrCode className="h-4 w-4 mr-2" />
                                        Print Label
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => setProcurementDevice({ id: device.id, label: `${device.brand} ${device.model}` })}>
                                        <FileText className="h-4 w-4 mr-2" />
                                        View PO / GRN
                                      </DropdownMenuItem>
                                      {device.status === 'in_stock' && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem onClick={() => handleQuickStatusChange(device.id, 'reserved')}>
                                            Mark Reserved
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleQuickStatusChange(device.id, 'sold')}>
                                            Mark Sold
                                          </DropdownMenuItem>
                                          {isSuperAdmin && (
                                            <DropdownMenuItem onClick={() => {
                                              setTransferDevice(device);
                                              setShowTransferDialog(true);
                                            }}>
                                              <ArrowRightLeft className="h-4 w-4 mr-2" />
                                              Transfer
                                            </DropdownMenuItem>
                                          )}
                                          {/* Send to FBA for VES devices */}
                                          {companies.find(c => c.id === device.company_id)?.code === 'VES' && (
                                            <DropdownMenuItem onClick={async () => {
                                              try {
                                                await supabase.from('devices').update({ fulfillment_channel: 'in_transit_fba' }).eq('id', device.id);
                                                logEvent({ action: 'UPDATE' as any, tableName: 'devices', recordId: device.id, module: 'Inventory', notes: 'Sent to FBA' });
                                                toast.success('Device marked as in transit to FBA');
                                                fetchDevices();
                                              } catch (e: any) { toast.error(e.message); }
                                            }}>
                                              <Send className="h-4 w-4 mr-2" />
                                              Send to FBA
                                            </DropdownMenuItem>
                                          )}
                                        </>
                                      )}
                                      {device.status === 'reserved' && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem onClick={() => handleQuickStatusChange(device.id, 'in_stock')}>
                                            Return to Stock
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-destructive"
                                        onClick={() => handleDeleteDevice(device.id)}
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products">
            <ProductsManagement canManage={canManage} />
          </TabsContent>


          {isSuperAdmin && (
            <TabsContent value="fba" className="space-y-6">
              <Tabs defaultValue="inventory">
                <TabsList>
                  <TabsTrigger value="inventory">FBA Inventory</TabsTrigger>
                  <TabsTrigger value="fees">Fee Analytics</TabsTrigger>
                </TabsList>
                <TabsContent value="inventory" className="mt-4">
                  <FBAInventoryTracker />
                </TabsContent>
                <TabsContent value="fees" className="mt-4">
                  <FBAFeeAnalytics />
                </TabsContent>
              </Tabs>
            </TabsContent>
          )}
        </Tabs>

        {/* Activity Log */}
        <ActivityLog tableName="devices" title="Inventory Activity" limit={10} />

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Device</DialogTitle>
              <DialogDescription>Update device information</DialogDescription>
            </DialogHeader>
            <DeviceForm onSubmit={handleUpdateDevice} submitLabel="Save Changes" />
          </DialogContent>
        </Dialog>

        {/* Transfer Dialog */}
        <InventoryTransferDialog
          open={showTransferDialog}
          onOpenChange={setShowTransferDialog}
          onSuccess={fetchDevices}
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

        {/* Batch Action Bar */}
        <BatchActionBar
          count={selection.count}
          onClear={selection.clear}
          actions={[
            { label: 'Export', icon: <Download className="h-4 w-4 mr-1" />, onClick: handleExportDevices },
            ...(canManage ? [
              { label: 'Mark In Stock', onClick: () => handleBulkStatusChange('in_stock') },
              { label: 'Mark Sold', onClick: () => handleBulkStatusChange('sold') },
              { label: 'Send to FBA', icon: <Send className="h-4 w-4 mr-1" />, onClick: handleBulkSendToFBA },
              { label: 'Delete', icon: <Trash2 className="h-4 w-4 mr-1" />, onClick: handleBulkDelete, variant: 'destructive' as const },
            ] : []),
          ]}
        />
      </div>
    </DashboardLayout>
  );
}
