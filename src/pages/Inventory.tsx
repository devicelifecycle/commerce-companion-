import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatusBadge, ConditionBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Search, Plus, Filter, Smartphone, Trash2, Edit2 } from 'lucide-react';

type DeviceCondition = 'new' | 'refurbished' | 'used' | 'damaged';
type DeviceStatus = 'in_stock' | 'reserved' | 'sold' | 'returned';

interface Device {
  id: string;
  imei: string | null;
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
  created_at: string;
  suppliers?: { name: string } | null;
}

interface Supplier {
  id: string;
  name: string;
}

export default function Inventory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  const [formData, setFormData] = useState({
    imei: '',
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
    fetchDevices();
    fetchSuppliers();
  }, [statusFilter]);

  const fetchDevices = async () => {
    try {
      let query = supabase
        .from('devices')
        .select(`
          *,
          suppliers (name)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as DeviceStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDevices((data || []) as Device[]);
    } catch (error) {
      console.error('Error fetching devices:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch devices',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name')
        .order('name');
      if (error) throw error;
      setSuppliers(data || []);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const handleAddDevice = async () => {
    try {
      const { error } = await supabase.from('devices').insert({
        imei: formData.imei || null,
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
        created_by: user?.id,
      });

      if (error) throw error;

      toast({
        title: 'Device added',
        description: 'The device has been added to inventory.',
      });

      setIsAddDialogOpen(false);
      resetForm();
      fetchDevices();
    } catch (error: any) {
      console.error('Error adding device:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add device',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateDevice = async () => {
    if (!selectedDevice) return;

    try {
      const { error } = await supabase
        .from('devices')
        .update({
          imei: formData.imei || null,
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

      toast({
        title: 'Device updated',
        description: 'The device has been updated.',
      });

      setIsEditDialogOpen(false);
      setSelectedDevice(null);
      resetForm();
      fetchDevices();
    } catch (error: any) {
      console.error('Error updating device:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update device',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteDevice = async (id: string) => {
    if (!confirm('Are you sure you want to delete this device?')) return;

    try {
      const { error } = await supabase.from('devices').delete().eq('id', id);
      if (error) throw error;

      toast({
        title: 'Device deleted',
        description: 'The device has been removed from inventory.',
      });

      fetchDevices();
    } catch (error: any) {
      console.error('Error deleting device:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete device',
        variant: 'destructive',
      });
    }
  };

  const openEditDialog = (device: Device) => {
    setSelectedDevice(device);
    setFormData({
      imei: device.imei || '',
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
      device.color?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

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
          <Label htmlFor="imei">IMEI</Label>
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

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-96 bg-muted rounded-lg" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Inventory</h1>
            <p className="text-muted-foreground">Manage your phone inventory</p>
          </div>

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
                <DialogDescription>
                  Add a new device to your inventory. Fill in the details below.
                </DialogDescription>
              </DialogHeader>
              <DeviceForm onSubmit={handleAddDevice} submitLabel="Add Device" />
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search devices..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
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
            </div>
          </CardHeader>
          <CardContent>
            {filteredDevices.length === 0 ? (
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
                      <TableHead>IMEI</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDevices.map((device) => (
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
                          {device.imei || '-'}
                        </TableCell>
                        <TableCell>
                          <ConditionBadge condition={device.condition} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={device.status} />
                        </TableCell>
                        <TableCell>
                          {device.suppliers?.name || '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(device.cost_price)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(device)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteDevice(device.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Device</DialogTitle>
              <DialogDescription>
                Update device information.
              </DialogDescription>
            </DialogHeader>
            <DeviceForm onSubmit={handleUpdateDevice} submitLabel="Update Device" />
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
