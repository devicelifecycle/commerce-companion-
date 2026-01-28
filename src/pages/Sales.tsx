import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MarketplaceBadge } from '@/components/ui/status-badge';
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
import { Search, Plus, Filter, TrendingUp, Trash2, Link } from 'lucide-react';
import { EditSaleDialog } from '@/components/sales/EditSaleDialog';

type Marketplace = 'shopify' | 'amazon' | 'bestbuy' | 'other';

interface Sale {
  id: string;
  device_id: string | null;
  order_number: string;
  marketplace: Marketplace;
  sale_price: number;
  shipping_cost: number;
  marketplace_fees: number;
  tax_amount: number;
  profit: number | null;
  sale_date: string;
  customer_name: string | null;
  customer_email: string | null;
  shipping_address: string | null;
  notes: string | null;
  created_at: string;
  devices?: {
    brand: string;
    model: string;
    cost_price: number;
  } | null;
}

interface AvailableDevice {
  id: string;
  brand: string;
  model: string;
  imei: string | null;
  cost_price: number;
}

export default function Sales() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [availableDevices, setAvailableDevices] = useState<AvailableDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<{id: string; deviceId: string | null; orderNumber: string} | null>(null);

  const [formData, setFormData] = useState({
    device_id: '',
    order_number: '',
    marketplace: 'shopify' as Marketplace,
    sale_price: '',
    shipping_cost: '0',
    marketplace_fees: '0',
    tax_amount: '0',
    customer_name: '',
    customer_email: '',
    shipping_address: '',
    notes: '',
  });

  useEffect(() => {
    fetchSales();
    fetchAvailableDevices();
  }, [marketplaceFilter]);

  const fetchSales = async () => {
    try {
      let query = supabase
        .from('sales')
        .select(`
          *,
          devices (brand, model, cost_price)
        `)
        .order('sale_date', { ascending: false });

      if (marketplaceFilter !== 'all') {
        query = query.eq('marketplace', marketplaceFilter as Marketplace);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSales((data || []) as Sale[]);
    } catch (error) {
      console.error('Error fetching sales:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch sales',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableDevices = async () => {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('id, brand, model, imei, cost_price')
        .eq('status', 'in_stock')
        .order('brand');
      if (error) throw error;
      setAvailableDevices(data || []);
    } catch (error) {
      console.error('Error fetching devices:', error);
    }
  };

  const handleAddSale = async () => {
    try {
      const { error } = await supabase.from('sales').insert({
        device_id: formData.device_id || null,
        order_number: formData.order_number,
        marketplace: formData.marketplace,
        sale_price: parseFloat(formData.sale_price),
        shipping_cost: parseFloat(formData.shipping_cost) || 0,
        marketplace_fees: parseFloat(formData.marketplace_fees) || 0,
        tax_amount: parseFloat(formData.tax_amount) || 0,
        customer_name: formData.customer_name || null,
        customer_email: formData.customer_email || null,
        shipping_address: formData.shipping_address || null,
        notes: formData.notes || null,
        created_by: user?.id,
      });

      if (error) throw error;

      toast({
        title: 'Sale recorded',
        description: 'The sale has been recorded successfully.',
      });

      setIsAddDialogOpen(false);
      resetForm();
      fetchSales();
      fetchAvailableDevices();
    } catch (error: any) {
      console.error('Error adding sale:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to record sale',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteSale = async (id: string) => {
    if (!confirm('Are you sure you want to delete this sale record?')) return;

    try {
      const { error } = await supabase.from('sales').delete().eq('id', id);
      if (error) throw error;

      toast({
        title: 'Sale deleted',
        description: 'The sale record has been removed.',
      });

      fetchSales();
    } catch (error: any) {
      console.error('Error deleting sale:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete sale',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      device_id: '',
      order_number: '',
      marketplace: 'shopify',
      sale_price: '',
      shipping_cost: '0',
      marketplace_fees: '0',
      tax_amount: '0',
      customer_name: '',
      customer_email: '',
      shipping_address: '',
      notes: '',
    });
  };

  const filteredSales = sales.filter((sale) => {
    const matchesSearch =
      sale.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.devices?.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.devices?.model.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

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
            <h1 className="text-2xl font-bold">Sales</h1>
            <p className="text-muted-foreground">Track and manage your sales</p>
          </div>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Record Sale
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Record New Sale</DialogTitle>
                <DialogDescription>
                  Record a new sale and link it to a device from inventory.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="order_number">Order Number *</Label>
                    <Input
                      id="order_number"
                      value={formData.order_number}
                      onChange={(e) => setFormData({ ...formData, order_number: e.target.value })}
                      placeholder="ORD-12345"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="marketplace">Marketplace *</Label>
                    <Select
                      value={formData.marketplace}
                      onValueChange={(value: Marketplace) => setFormData({ ...formData, marketplace: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="shopify">Shopify</SelectItem>
                        <SelectItem value="amazon">Amazon</SelectItem>
                        <SelectItem value="bestbuy">Best Buy</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="device">Link to Device</Label>
                  <Select
                    value={formData.device_id}
                    onValueChange={(value) => setFormData({ ...formData, device_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a device from inventory" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDevices.map((device) => (
                        <SelectItem key={device.id} value={device.id}>
                          {device.brand} {device.model} {device.imei ? `(${device.imei})` : ''} - {formatCurrency(device.cost_price)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sale_price">Sale Price *</Label>
                    <Input
                      id="sale_price"
                      type="number"
                      value={formData.sale_price}
                      onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })}
                      placeholder="999.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shipping_cost">Shipping Cost</Label>
                    <Input
                      id="shipping_cost"
                      type="number"
                      value={formData.shipping_cost}
                      onChange={(e) => setFormData({ ...formData, shipping_cost: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="marketplace_fees">Marketplace Fees</Label>
                    <Input
                      id="marketplace_fees"
                      type="number"
                      value={formData.marketplace_fees}
                      onChange={(e) => setFormData({ ...formData, marketplace_fees: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax_amount">Tax Amount</Label>
                    <Input
                      id="tax_amount"
                      type="number"
                      value={formData.tax_amount}
                      onChange={(e) => setFormData({ ...formData, tax_amount: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer_name">Customer Name</Label>
                    <Input
                      id="customer_name"
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer_email">Customer Email</Label>
                    <Input
                      id="customer_email"
                      type="email"
                      value={formData.customer_email}
                      onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shipping_address">Shipping Address</Label>
                  <Textarea
                    id="shipping_address"
                    value={formData.shipping_address}
                    onChange={(e) => setFormData({ ...formData, shipping_address: e.target.value })}
                    placeholder="123 Main St, City, State, ZIP"
                  />
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
              </div>

              <DialogFooter>
                <Button onClick={handleAddSale} disabled={!formData.order_number || !formData.sale_price}>
                  Record Sale
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sales..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={marketplaceFilter} onValueChange={setMarketplaceFilter}>
                <SelectTrigger className="w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Marketplace" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Marketplaces</SelectItem>
                  <SelectItem value="shopify">Shopify</SelectItem>
                  <SelectItem value="amazon">Amazon</SelectItem>
                  <SelectItem value="bestbuy">Best Buy</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {filteredSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No sales found</h3>
                <p className="text-muted-foreground">
                  {searchTerm ? 'Try adjusting your search' : 'Record your first sale to get started'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Marketplace</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Sale Price</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{sale.order_number}</p>
                            {sale.customer_name && (
                              <p className="text-sm text-muted-foreground">{sale.customer_name}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {sale.devices ? (
                            `${sale.devices.brand} ${sale.devices.model}`
                          ) : (
                            <span className="text-muted-foreground">Not linked</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <MarketplaceBadge marketplace={sale.marketplace} />
                        </TableCell>
                        <TableCell>{formatDate(sale.sale_date)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(sale.sale_price)}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${
                          sale.profit && sale.profit > 0 ? 'text-success' : 'text-destructive'
                        }`}>
                          {sale.profit ? formatCurrency(sale.profit) : '-'}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingSale({
                              id: sale.id,
                              deviceId: sale.device_id,
                              orderNumber: sale.order_number,
                            })}
                            title="Link device"
                          >
                            <Link className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteSale(sale.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
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

        {editingSale && (
          <EditSaleDialog
            open={!!editingSale}
            onOpenChange={(open) => !open && setEditingSale(null)}
            saleId={editingSale.id}
            currentDeviceId={editingSale.deviceId}
            orderNumber={editingSale.orderNumber}
            onSaved={() => {
              fetchSales();
              fetchAvailableDevices();
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
