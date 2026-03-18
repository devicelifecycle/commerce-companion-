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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { 
  RotateCcw, Plus, Package, ShoppingCart, DollarSign, 
  Clock, CheckCircle, XCircle, Truck, Search, Wrench, RefreshCw, ArrowRightLeft
} from 'lucide-react';
import { format } from 'date-fns';
import { DeviceSearchCombobox } from '@/components/inventory/DeviceSearchCombobox';

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
  resolution_type: string | null;
  device_condition_on_return: string | null;
  replacement_device_id: string | null;
  outbound_tracking_number: string | null;
  repair_notes: string | null;
  purchase_order_id: string | null;
  company_id: string | null;
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
    resolution_type: 'refund' as 'refund' | 'exchange' | 'repair',
    device_condition_on_return: '',
    outbound_tracking_number: '',
    repair_notes: '',
  });

  useEffect(() => {
    fetchData();
  }, [selectedCompany]);

  const fetchData = async () => {
    setLoading(true);
    try {
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
      setReturns((rmaData as any[]) || []);

      let devicesQuery = supabase
        .from('devices')
        .select('id, brand, model, imei, cost_price, supplier_id')
        .eq('status', 'in_stock');

      if (selectedCompany) {
        devicesQuery = devicesQuery.eq('company_id', selectedCompany.id);
      }

      const { data: devicesData } = await devicesQuery;
      setDevices(devicesData || []);

      let suppliersQuery = supabase.from('suppliers').select('id, name');
      if (selectedCompany) {
        suppliersQuery = suppliersQuery.eq('company_id', selectedCompany.id);
      }
      const { data: suppliersData } = await suppliersQuery;
      setSuppliers(suppliersData || []);

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
    if (!formData.device_condition_on_return) {
      toast.error('Please assess the device condition');
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
        refund_amount: formData.resolution_type === 'refund' && formData.refund_amount ? parseFloat(formData.refund_amount) : 0,
        notes: formData.notes || null,
        status: 'pending',
        created_by: user?.id,
        resolution_type: formData.resolution_type,
        device_condition_on_return: formData.device_condition_on_return,
        outbound_tracking_number: formData.outbound_tracking_number || null,
        repair_notes: formData.resolution_type === 'repair' ? formData.repair_notes : null,
      };

      const { error } = await supabase
        .from('return_authorizations')
        .insert(returnData as any);

      if (error) throw error;

      toast.success(`RMA ${rmaNumber} created — ${formData.resolution_type}`);
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
        
        const rma = returns.find(r => r.id === id);
        if (rma?.device_id) {
          await supabase
            .from('devices')
            .update({ status: rma.return_type === 'purchase_return' ? 'returned' : 'in_stock' })
            .eq('id', rma.device_id);
        }

        // For purchase returns, reduce the linked AP balance
        if (rma?.return_type === 'purchase_return' && rma?.purchase_order_id && rma?.company_id) {
          // Find linked PO to get the bill_number
          const { data: linkedPO } = await supabase
            .from('purchase_orders')
            .select('po_number')
            .eq('id', rma.purchase_order_id)
            .single();

          if (linkedPO) {
            const { data: apRecord } = await supabase
              .from('accounts_payable')
              .select('id, original_amount, paid_amount, balance_due')
              .eq('company_id', rma.company_id)
              .eq('bill_number', linkedPO.po_number)
              .maybeSingle();

            if (apRecord) {
              const refundAmt = rma.refund_amount || rma.original_cost || 0;
              const newOriginal = Math.max(0, apRecord.original_amount - refundAmt);
              const newBalance = Math.max(0, (apRecord.balance_due || 0) - refundAmt);
              const apStatus = newBalance <= 0.01 ? 'paid' : (apRecord.paid_amount || 0) > 0 ? 'partial' : 'unpaid';

              await supabase.from('accounts_payable').update({
                original_amount: newOriginal,
                balance_due: newBalance,
                status: apStatus,
                notes: `Reduced by ${refundAmt} due to supplier return RMA ${rma.rma_number}`,
              }).eq('id', apRecord.id);

              toast.success(`AP balance reduced by $${refundAmt.toFixed(2)} for supplier return`);
            }
          }
        }

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
      resolution_type: 'refund',
      device_condition_on_return: '',
      outbound_tracking_number: '',
      repair_notes: '',
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

  const getResolutionBadge = (resolution: string | null) => {
    if (!resolution) return null;
    const config: Record<string, { icon: React.ReactNode; className: string; label: string }> = {
      refund: { icon: <DollarSign className="h-3 w-3" />, className: 'bg-emerald-500/10 text-emerald-600', label: 'Refund' },
      exchange: { icon: <ArrowRightLeft className="h-3 w-3" />, className: 'bg-blue-500/10 text-blue-600', label: 'Exchange' },
      repair: { icon: <Wrench className="h-3 w-3" />, className: 'bg-amber-500/10 text-amber-600', label: 'Repair' },
    };
    const c = config[resolution] || config.refund;
    return (
      <Badge className={`${c.className} gap-1`}>
        {c.icon}
        {c.label}
      </Badge>
    );
  };

  const getConditionBadge = (condition: string | null) => {
    if (!condition) return null;
    const config: Record<string, string> = {
      working: 'bg-emerald-500/10 text-emerald-600',
      defective: 'bg-amber-500/10 text-amber-600',
      damaged: 'bg-orange-500/10 text-orange-600',
      unrepairable: 'bg-red-500/10 text-red-600',
    };
    return <Badge className={config[condition] || 'bg-muted'}>{condition.charAt(0).toUpperCase() + condition.slice(1)}</Badge>;
  };

  const filteredReturns = returns.filter(r => {
    const matchTab = activeTab === 'all' ? true
      : activeTab === 'purchase' ? r.return_type === 'purchase_return'
      : activeTab === 'sales' ? r.return_type === 'sales_return'
      : activeTab === 'pending' ? ['pending', 'approved'].includes(r.status)
      : activeTab === 'exchanges' ? r.resolution_type === 'exchange'
      : activeTab === 'repairs' ? r.resolution_type === 'repair'
      : true;
    if (!matchTab) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.rma_number.toLowerCase().includes(term) ||
      r.customer_name?.toLowerCase().includes(term) ||
      r.reason?.toLowerCase().includes(term) ||
      r.device?.brand?.toLowerCase().includes(term) ||
      r.device?.model?.toLowerCase().includes(term) ||
      r.device?.imei?.toLowerCase().includes(term) ||
      r.supplier?.name?.toLowerCase().includes(term) ||
      r.outbound_tracking_number?.toLowerCase().includes(term)
    );
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

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
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

              {/* Resolution Type */}
              <div className="space-y-2">
                <Label>Resolution *</Label>
                <Select
                  value={formData.resolution_type}
                  onValueChange={(v) => setFormData({ ...formData, resolution_type: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="refund">💰 Refund</SelectItem>
                    <SelectItem value="exchange">🔄 Exchange — Send replacement</SelectItem>
                    <SelectItem value="repair">🔧 Repair — Fix and return</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Device Condition */}
              <div className="space-y-2">
                <Label>Device Condition on Return *</Label>
                <Select
                  value={formData.device_condition_on_return || 'none'}
                  onValueChange={(v) => setFormData({ ...formData, device_condition_on_return: v === 'none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Assess condition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select condition</SelectItem>
                    <SelectItem value="working">✅ Working</SelectItem>
                    <SelectItem value="defective">⚠️ Defective</SelectItem>
                    <SelectItem value="damaged">🔨 Damaged</SelectItem>
                    <SelectItem value="unrepairable">❌ Unrepairable</SelectItem>
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
                {formData.resolution_type === 'refund' && (
                  <div className="space-y-2">
                    <Label>Refund Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.refund_amount}
                      onChange={(e) => setFormData({ ...formData, refund_amount: e.target.value })}
                    />
                  </div>
                )}
              </div>

              {/* Exchange / Repair specific fields */}
              {formData.resolution_type === 'exchange' && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-3">
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Exchange Details</p>
                  <div className="space-y-2">
                    <Label>Replacement Device</Label>
                    <DeviceSearchCombobox
                      value={formData.replacement_device_id || null}
                      onSelect={(device) => setFormData({ ...formData, replacement_device_id: device?.id || '' })}
                      companyId={selectedCompany?.id}
                      placeholder="Search replacement device by IMEI, SKU..."
                    />
                    <p className="text-xs text-muted-foreground">Select the device being sent as replacement</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Outbound Tracking #</Label>
                    <Input
                      value={formData.outbound_tracking_number}
                      onChange={(e) => setFormData({ ...formData, outbound_tracking_number: e.target.value })}
                      placeholder="Tracking for replacement shipment"
                    />
                  </div>
                </div>
              )}

              {formData.resolution_type === 'repair' && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Repair Details</p>
                  <div className="space-y-2">
                    <Label>Repair Notes</Label>
                    <Textarea
                      value={formData.repair_notes}
                      onChange={(e) => setFormData({ ...formData, repair_notes: e.target.value })}
                      placeholder="Describe the repair..."
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Outbound Tracking #</Label>
                    <Input
                      value={formData.outbound_tracking_number}
                      onChange={(e) => setFormData({ ...formData, outbound_tracking_number: e.target.value })}
                      placeholder="Tracking when sending back"
                    />
                  </div>
                </div>
              )}

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
        <div className="mb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search RMA, customer, device, tracking..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="all">All ({returns.length})</TabsTrigger>
            <TabsTrigger value="purchase">
              To Supplier ({returns.filter(r => r.return_type === 'purchase_return').length})
            </TabsTrigger>
            <TabsTrigger value="sales">
              From Customer ({returns.filter(r => r.return_type === 'sales_return').length})
            </TabsTrigger>
            <TabsTrigger value="exchanges">
              Exchanges ({returns.filter(r => r.resolution_type === 'exchange').length})
            </TabsTrigger>
            <TabsTrigger value="repairs">
              Repairs ({returns.filter(r => r.resolution_type === 'repair').length})
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
                <TableHead>Resolution</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReturns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
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
                    <TableCell>{getResolutionBadge(rma.resolution_type)}</TableCell>
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
                    <TableCell>{getConditionBadge(rma.device_condition_on_return)}</TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="truncate max-w-[100px] block">{rma.reason}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{rma.reason}</p>
                            {rma.repair_notes && <p className="mt-1 text-xs">🔧 {rma.repair_notes}</p>}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>{formatCurrency(rma.refund_amount)}</TableCell>
                    <TableCell>{getStatusBadge(rma.status)}</TableCell>
                    <TableCell>
                      {rma.outbound_tracking_number ? (
                        <span className="font-mono text-xs">{rma.outbound_tracking_number}</span>
                      ) : '-'}
                    </TableCell>
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
                        {['shipped', 'received'].includes(rma.status) && rma.resolution_type === 'refund' && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus(rma.id, 'refunded')}>
                            <DollarSign className="h-4 w-4" />
                          </Button>
                        )}
                        {['shipped', 'received'].includes(rma.status) && rma.resolution_type === 'repair' && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus(rma.id, 'completed')}>
                            <Wrench className="h-4 w-4 mr-1" /> Done
                          </Button>
                        )}
                        {['shipped', 'received'].includes(rma.status) && rma.resolution_type === 'exchange' && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus(rma.id, 'completed')}>
                            <ArrowRightLeft className="h-4 w-4 mr-1" /> Done
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
