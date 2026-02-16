import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { CompanySelector } from '@/components/layout/CompanySelector';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { InventoryDashboard } from '@/components/inventory/InventoryDashboard';
import { InventoryTransferDialog } from '@/components/inventory/InventoryTransferDialog';
import { InventoryLabelDialog } from '@/components/inventory/InventoryLabelDialog';
import { AgingInventoryReport } from '@/components/inventory/AgingInventoryReport';
import { ReturnsManagement } from '@/components/inventory/ReturnsManagement';
import { StatusBadge, ConditionBadge } from '@/components/ui/status-badge';
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
  LayoutDashboard, List, Clock, ArrowRightLeft, QrCode, Link, Upload, RotateCcw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type DeviceCondition = 'new' | 'refurbished' | 'used' | 'damaged';
type DeviceStatus = 'in_stock' | 'reserved' | 'sold' | 'returned';

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
  const [devices, setDevices] = useState<Device[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferDevice, setTransferDevice] = useState<Device | null>(null);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [labelDevice, setLabelDevice] = useState<Device | null>(null);

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
  });

  useEffect(() => {
    if (canView) {
      fetchDevices();
      fetchSuppliers();
    }
  }, [statusFilter, categoryFilter, selectedCompany, canView]);

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

  const handleAddDevice = async () => {
    if (!selectedCompany && !isSuperAdmin) {
      toast.error('Please select a company');
      return;
    }

    try {
      const { error } = await supabase.from('devices').insert({
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
        company_id: selectedCompany?.id,
        created_by: user?.id,
      });

      if (error) throw error;

      toast.success('Device added to inventory');
      setIsAddDialogOpen(false);
      resetForm();
      fetchDevices();
    } catch (error: any) {
      console.error('Error adding device:', error);
      toast.error(error.message || 'Failed to add device');
    }
  };

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
    });
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

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const DeviceForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
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
          <Label htmlFor="supplier">Supplier</Label>
          <Select
            value={formData.supplier_id}
            onValueChange={(value) => setFormData({ ...formData, supplier_id: value })}
          >
            <SelectTrigger>
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
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="purchase_date">Purchase Date</Label>
          <Input
            id="purchase_date"
            type="date"
            value={formData.purchase_date}
            onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
          />
        </div>
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
        <Button onClick={onSubmit} disabled={!formData.brand || !formData.model || !formData.cost_price}>
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
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Device
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Add New Device</DialogTitle>
                      <DialogDescription>Add a new device to your inventory</DialogDescription>
                    </DialogHeader>
                    <DeviceForm onSubmit={handleAddDevice} submitLabel="Add Device" />
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>

        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="list" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              All Devices
            </TabsTrigger>
            <TabsTrigger value="aging" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Aging Report
            </TabsTrigger>
            <TabsTrigger value="returns" className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Returns
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <InventoryDashboard />
          </TabsContent>

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
                          <TableHead>Device</TableHead>
                          <TableHead>IMEI/SKU</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Condition</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          {!selectedCompany && <TableHead>Company</TableHead>}
                          {canManage && <TableHead className="w-[50px]" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDevices.map((device) => {
                          const company = companies.find(c => c.id === device.company_id);
                          return (
                            <TableRow key={device.id}>
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

          <TabsContent value="aging">
            <AgingInventoryReport />
          </TabsContent>

          <TabsContent value="returns">
            <ReturnsManagement />
          </TabsContent>
        </Tabs>

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
      </div>
    </DashboardLayout>
  );
}
