import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  RotateCcw, Plus, Package, ShoppingCart, DollarSign, 
  Clock, CheckCircle, XCircle, Truck 
} from 'lucide-react';
import { format } from 'date-fns';

interface ReturnAuthorization {
  id: string;
  rma_number: string;
  return_type: string;
  device_id: string | null;
  supplier_id: string | null;
  sale_id: string | null;
  customer_name: string | null;
  return_date: string;
  reason: string;
  original_cost: number | null;
  refund_amount: number | null;
  refund_date: string | null;
  tax_refunded: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  device?: { brand: string; model: string; imei: string | null };
  supplier?: { name: string };
}

export function ReturnsManagement() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [returns, setReturns] = useState<ReturnAuthorization[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    return_type: 'purchase_return' as 'purchase_return' | 'sales_return',
    device_id: '',
    supplier_id: '',
    sale_id: '',
    customer_name: '',
    reason: '',
    original_cost: '',
    refund_amount: '',
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, [selectedCompany]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch returns
      let rmaQuery = supabase
        .from('return_authorizations')
        .select(`
          *,
          device:devices(brand, model, imei),
          supplier:suppliers(name)
        `)
        .order('created_at', { ascending: false });

      if (selectedCompany) {
        rmaQuery = rmaQuery.eq('company_id', selectedCompany.id);
      }

      const { data: rmaData } = await rmaQuery;
      setReturns(rmaData || []);

      // Fetch available devices for return
      let devicesQuery = supabase
        .from('devices')
        .select('id, brand, model, imei, cost_price, supplier_id')
        .eq('status', 'in_stock');

      if (selectedCompany) {
        devicesQuery = devicesQuery.eq('company_id', selectedCompany.id);
      }

      const { data: devicesData } = await devicesQuery;
      setDevices(devicesData || []);

      // Fetch suppliers
      let suppliersQuery = supabase.from('suppliers').select('id, name');
      if (selectedCompany) {
        suppliersQuery = suppliersQuery.eq('company_id', selectedCompany.id);
      }
      const { data: suppliersData } = await suppliersQuery;
      setSuppliers(suppliersData || []);

      // Fetch recent sales for sales returns
      let salesQuery = supabase
        .from('sales')
        .select('id, order_number, customer_name, sale_price, device_id, devices(brand, model)')
        .order('sale_date', { ascending: false })
        .limit(100);

      if (selectedCompany) {
        salesQuery = salesQuery.eq('company_id', selectedCompany.id);
      }

      const { data: salesData } = await salesQuery;
      setSales(salesData || []);

    } catch (error) {
      console.error('Error fetching returns data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateRMANumber = () => {
    const prefix = formData.return_type === 'purchase_return' ? 'RMA-P' : 'RMA-S';
    const companyCode = selectedCompany?.code || 'XX';
    const year = new Date().getFullYear();
    const seq = String(Math.floor(Math.random() * 10000)).padStart(5, '0');
    return `${prefix}-${companyCode}-${year}-${seq}`;
  };

  const handleSubmit = async () => {
    if (!formData.reason) {
      toast.error('Please provide a reason for the return');
      return;
    }

    if (formData.return_type === 'purchase_return' && !formData.device_id) {
      toast.error('Please select a device to return');
      return;
    }

    if (formData.return_type === 'sales_return' && !formData.sale_id) {
      toast.error('Please select a sale to process the return');
      return;
    }

    try {
      const rmaNumber = generateRMANumber();
      
      const returnData = {
        company_id: selectedCompany?.id,
        rma_number: rmaNumber,
        return_type: formData.return_type,
        device_id: formData.device_id || null,
        supplier_id: formData.supplier_id || null,
        sale_id: formData.sale_id || null,
        customer_name: formData.customer_name || null,
        reason: formData.reason,
        original_cost: formData.original_cost ? parseFloat(formData.original_cost) : null,
        refund_amount: formData.refund_amount ? parseFloat(formData.refund_amount) : null,
        notes: formData.notes || null,
        status: 'pending',
        created_by: user?.id,
      };

      const { error } = await supabase
        .from('return_authorizations')
        .insert(returnData);

      if (error) throw error;

      toast.success(`RMA ${rmaNumber} created successfully`);
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Error creating return:', error);
      toast.error(error.message || 'Failed to create return');
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      
      if (newStatus === 'refunded') {
        updateData.refund_date = new Date().toISOString().split('T')[0];
        
        // Get the return details
        const rma = returns.find(r => r.id === id);
        if (rma?.device_id) {
          // Update device status
          await supabase
            .from('devices')
            .update({ status: rma.return_type === 'purchase_return' ? 'returned' : 'in_stock' })
            .eq('id', rma.device_id);
        }

        // Trigger return accounting reversal (journal entries)
        try {
          const { error: accError } = await supabase.functions.invoke('process-return-accounting', {
            body: { return_id: id },
          });
          if (accError) {
            console.error('Return accounting error:', accError);
            toast.error('Return saved but accounting entries could not be created');
          } else {
            toast.success('Return processed with accounting reversal entries');
          }
        } catch (accErr) {
          console.error('Error calling return accounting:', accErr);
        }
      }

      const { error } = await supabase
        .from('return_authorizations')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      if (newStatus !== 'refunded') {
        toast.success('Return status updated');
      }
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status');
    }
  };

  const resetForm = () => {
    setFormData({
      return_type: 'purchase_return',
      device_id: '',
      supplier_id: '',
      sale_id: '',
      customer_name: '',
      reason: '',
      original_cost: '',
      refund_amount: '',
      notes: '',
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-amber-500/10 text-amber-500',
      approved: 'bg-blue-500/10 text-blue-500',
      shipped: 'bg-purple-500/10 text-purple-500',
      received: 'bg-cyan-500/10 text-cyan-500',
      refunded: 'bg-emerald-500/10 text-emerald-500',
      cancelled: 'bg-red-500/10 text-red-500',
    };
    return <Badge className={styles[status] || 'bg-muted'}>{status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Badge>;
  };

  const filteredReturns = returns.filter(r => {
    if (activeTab === 'all') return true;
    if (activeTab === 'purchase') return r.return_type === 'purchase_return';
    if (activeTab === 'sales') return r.return_type === 'sales_return';
    if (activeTab === 'pending') return ['pending', 'approved'].includes(r.status);
    return true;
  });

  const formatCurrency = (value: number | null) =>
    value != null ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value) : '-';

  if (loading) {
    return <Card><CardContent className="p-6 animate-pulse"><div className="h-40 bg-muted rounded" /></CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5" />
          Returns Management
        </CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Return
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Return Authorization</DialogTitle>
              <DialogDescription>
                Process a return to supplier or from customer
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Return Type</Label>
                <Select
                  value={formData.return_type}
                  onValueChange={(v) => setFormData({ ...formData, return_type: v as any, device_id: '', sale_id: '' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase_return">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Return to Supplier
                      </div>
                    </SelectItem>
                    <SelectItem value="sales_return">
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4" />
                        Customer Return
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.return_type === 'purchase_return' ? (
                <>
                  <div className="space-y-2">
                    <Label>Device to Return *</Label>
                    <Select
                      value={formData.device_id}
                      onValueChange={(v) => {
                        const device = devices.find(d => d.id === v);
                        setFormData({
                          ...formData,
                          device_id: v,
                          supplier_id: device?.supplier_id || '',
                          original_cost: device?.cost_price?.toString() || '',
                          refund_amount: device?.cost_price?.toString() || '',
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select device" />
                      </SelectTrigger>
                      <SelectContent>
                        {devices.map(d => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.brand} {d.model} {d.imei ? `(${d.imei})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Supplier</Label>
                    <Select
                      value={formData.supplier_id || 'none'}
                      onValueChange={(v) => setFormData({ ...formData, supplier_id: v === 'none' ? '' : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No supplier</SelectItem>
                        {suppliers.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Original Sale *</Label>
                    <Select
                      value={formData.sale_id}
                      onValueChange={(v) => {
                        const sale = sales.find(s => s.id === v);
                        setFormData({
                          ...formData,
                          sale_id: v,
                          device_id: sale?.device_id || '',
                          customer_name: sale?.customer_name || '',
                          original_cost: sale?.sale_price?.toString() || '',
                          refund_amount: sale?.sale_price?.toString() || '',
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select sale" />
                      </SelectTrigger>
                      <SelectContent>
                        {sales.map(s => {
                          const device = s.devices as any;
                          return (
                            <SelectItem key={s.id} value={s.id}>
                              #{s.order_number} - {device?.brand} {device?.model}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Customer Name</Label>
                    <Input
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label>Reason for Return *</Label>
                <Select
                  value={formData.reason || 'none'}
                  onValueChange={(v) => setFormData({ ...formData, reason: v === 'none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a reason</SelectItem>
                    <SelectItem value="Defective">Defective</SelectItem>
                    <SelectItem value="Wrong Item">Wrong Item</SelectItem>
                    <SelectItem value="Changed Mind">Changed Mind</SelectItem>
                    <SelectItem value="Not as Described">Not as Described</SelectItem>
                    <SelectItem value="Damaged in Transit">Damaged in Transit</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Original Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.original_cost}
                    onChange={(e) => setFormData({ ...formData, original_cost: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Refund Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.refund_amount}
                    onChange={(e) => setFormData({ ...formData, refund_amount: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit}>Create RMA</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">All ({returns.length})</TabsTrigger>
            <TabsTrigger value="purchase">
              To Supplier ({returns.filter(r => r.return_type === 'purchase_return').length})
            </TabsTrigger>
            <TabsTrigger value="sales">
              From Customer ({returns.filter(r => r.return_type === 'sales_return').length})
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pending ({returns.filter(r => ['pending', 'approved'].includes(r.status)).length})
            </TabsTrigger>
          </TabsList>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RMA #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReturns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No returns found
                  </TableCell>
                </TableRow>
              ) : (
                filteredReturns.map((rma) => (
                  <TableRow key={rma.id}>
                    <TableCell className="font-mono text-sm">{rma.rma_number}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {rma.return_type === 'purchase_return' ? 'To Supplier' : 'From Customer'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {rma.device ? (
                        <div>
                          <p className="font-medium">{rma.device.brand} {rma.device.model}</p>
                          {rma.device.imei && (
                            <p className="text-xs text-muted-foreground">{rma.device.imei}</p>
                          )}
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{rma.reason}</TableCell>
                    <TableCell>{formatCurrency(rma.refund_amount)}</TableCell>
                    <TableCell>{getStatusBadge(rma.status)}</TableCell>
                    <TableCell>{format(new Date(rma.return_date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {rma.status === 'pending' && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus(rma.id, 'approved')}>
                            Approve
                          </Button>
                        )}
                        {rma.status === 'approved' && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus(rma.id, 'shipped')}>
                            <Truck className="h-4 w-4" />
                          </Button>
                        )}
                        {['shipped', 'received'].includes(rma.status) && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus(rma.id, 'refunded')}>
                            <DollarSign className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Tabs>
      </CardContent>
    </Card>
  );
}
