import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { MetricCard } from '@/components/ui/metric-card';
import { 
  RotateCcw, Plus, Package, ShoppingCart, DollarSign, 
  Clock, CheckCircle, XCircle, Truck, Search, Wrench, ArrowRightLeft,
  AlertTriangle, Timer, AlertCircle
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { useDataRefetch, emitRefetch } from '@/hooks/useDataRefetch';
import { SupplierReturnDialog } from './SupplierReturnDialog';

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
  marketplace_initiated?: boolean;
  refund_reason_detail?: string | null;
  created_by?: string | null;
  device?: { brand: string; model: string; imei: string | null; storage: string | null; color: string | null };
  supplier?: { name: string };
  sale?: { order_number: string; marketplace: string | null; sale_price: number | null };
}

export function ReturnsManagement() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [returns, setReturns] = useState<ReturnAuthorization[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingRma, setViewingRma] = useState<ReturnAuthorization | null>(null);
  const [supplierReturnOpen, setSupplierReturnOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedCompany]);

  useDataRefetch('returns', fetchData);

  async function fetchData() {
    setLoading(true);
    try {
      let rmaQuery = supabase
        .from('return_authorizations')
        .select(`
          *,
          device:devices(brand, model, imei, storage, color),
          supplier:suppliers(name),
          sale:sales(order_number, marketplace, sale_price)
        `)
        .order('created_at', { ascending: false });

      if (selectedCompany) {
        rmaQuery = rmaQuery.eq('company_id', selectedCompany.id);
      }

      const { data: rmaData } = await rmaQuery;
      setReturns((rmaData as any[]) || []);
    } catch (error) {
      console.error('Error fetching returns data:', error);
    } finally {
      setLoading(false);
    }
  }

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

      // For purchase return completions (exchange/repair), also trigger accounting
      if (newStatus === 'completed') {
        const rma = returns.find(r => r.id === id);
        if (rma?.return_type === 'purchase_return') {
          try {
            const { error: accError } = await supabase.functions.invoke('process-return-accounting', {
              body: { return_id: id },
            });
            if (accError) {
              console.error('Return accounting error:', accError);
              toast.error('Status updated but accounting entries could not be created');
            } else {
              toast.success('Return completed with accounting entries');
            }
          } catch (accErr) {
            console.error('Error calling return accounting:', accErr);
          }
        } else {
          toast.success('Return status updated');
        }
      } else if (newStatus !== 'refunded') {
        toast.success('Return status updated');
      }
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status');
    }
  };

  // KPI calculations
  const kpis = useMemo(() => {
    const open = returns.filter(r => ['pending', 'approved', 'shipped'].includes(r.status));
    const pendingRefunds = open
      .filter(r => r.resolution_type === 'refund' || r.resolution_type === 'adjustment')
      .reduce((sum, r) => sum + (r.refund_amount || r.original_cost || 0), 0);
    const resolved = returns.filter(r => ['refunded', 'completed', 'cancelled'].includes(r.status));
    const avgDays = resolved.length > 0
      ? resolved.reduce((sum, r) => {
          const created = new Date(r.created_at);
          const end = r.refund_date ? new Date(r.refund_date) : new Date(r.created_at);
          return sum + differenceInDays(end, created);
        }, 0) / resolved.length
      : 0;
    const overdue = open.filter(r => differenceInDays(new Date(), new Date(r.created_at)) > 7);
    const marketplaceFlags = returns.filter(r => r.marketplace_initiated && !['refunded', 'completed', 'cancelled'].includes(r.status));
    return { openCount: open.length, pendingRefunds, avgDays: Math.round(avgDays), overdueCount: overdue.length, marketplaceFlags: marketplaceFlags.length };
  }, [returns]);

  const formatCurrencyValue = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const getRmaTimeline = (rma: ReturnAuthorization) => {
    if (rma.return_type === 'sales_return') {
      return [
        { label: 'Created', status: 'done' as const, date: rma.created_at, icon: Plus },
        { 
          label: rma.resolution_type === 'refund' ? 'Refunded' : rma.resolution_type === 'adjustment' ? 'Credited' : rma.resolution_type === 'repair' ? 'In Repair' : 'Exchanged',
          status: (['refunded', 'completed'].includes(rma.status) ? 'done' : 'current') as 'done' | 'current',
          date: rma.refund_date || undefined,
          icon: rma.resolution_type === 'refund' || rma.resolution_type === 'adjustment' ? DollarSign : rma.resolution_type === 'repair' ? Wrench : ArrowRightLeft,
        },
      ];
    }
    const steps = [
      { label: 'Created', status: 'done' as const, date: rma.created_at, icon: Plus },
      { label: 'Approved', status: (['approved', 'shipped', 'received', 'refunded', 'completed'].includes(rma.status) ? 'done' : rma.status === 'pending' ? 'current' : 'upcoming') as any, icon: CheckCircle },
      { label: 'Shipped', status: (['shipped', 'received', 'refunded', 'completed'].includes(rma.status) ? 'done' : rma.status === 'approved' ? 'current' : 'upcoming') as any, icon: Truck },
      { 
        label: rma.resolution_type === 'refund' ? 'Refunded' : rma.resolution_type === 'repair' ? 'Repaired' : 'Exchanged',
        status: (['refunded', 'completed'].includes(rma.status) ? 'done' : ['shipped', 'received'].includes(rma.status) ? 'current' : 'upcoming') as any,
        date: rma.refund_date || undefined,
        icon: rma.resolution_type === 'refund' ? DollarSign : rma.resolution_type === 'repair' ? Wrench : ArrowRightLeft,
      },
    ];
    return steps;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-amber-500/10 text-amber-500',
      approved: 'bg-blue-500/10 text-blue-500',
      shipped: 'bg-purple-500/10 text-purple-500',
      received: 'bg-cyan-500/10 text-cyan-500',
      refunded: 'bg-emerald-500/10 text-emerald-500',
      completed: 'bg-emerald-500/10 text-emerald-500',
      cancelled: 'bg-red-500/10 text-red-500',
    };
    return <Badge className={styles[status] || 'bg-muted'}>{status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Badge>;
  };

  const getResolutionBadge = (resolution: string | null) => {
    if (!resolution) return null;
    const config: Record<string, { icon: React.ReactNode; className: string; label: string }> = {
      refund: { icon: <DollarSign className="h-3 w-3" />, className: 'bg-emerald-500/10 text-emerald-600', label: 'Refund' },
      adjustment: { icon: <DollarSign className="h-3 w-3" />, className: 'bg-orange-500/10 text-orange-600', label: 'Adjustment' },
      exchange: { icon: <ArrowRightLeft className="h-3 w-3" />, className: 'bg-blue-500/10 text-blue-600', label: 'Exchange' },
      repair: { icon: <Wrench className="h-3 w-3" />, className: 'bg-amber-500/10 text-amber-600', label: 'Repair' },
    };
    const c = config[resolution] || config.refund;
    return <Badge className={`${c.className} gap-1`}>{c.icon}{c.label}</Badge>;
  };

  const getConditionBadge = (condition: string | null) => {
    if (!condition) return null;
    const config: Record<string, string> = {
      working: 'bg-emerald-500/10 text-emerald-600',
      defective: 'bg-amber-500/10 text-amber-600',
      damaged: 'bg-orange-500/10 text-orange-600',
      unrepairable: 'bg-red-500/10 text-red-600',
      wrong_item: 'bg-purple-500/10 text-purple-600',
    };
    return <Badge className={config[condition] || 'bg-muted'}>{condition.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Badge>;
  };

  const filteredReturns = returns.filter(r => {
    const matchTab = activeTab === 'all' ? true
      : activeTab === 'purchase' ? r.return_type === 'purchase_return'
      : activeTab === 'sales' ? r.return_type === 'sales_return'
      : activeTab === 'pending' ? ['pending', 'approved'].includes(r.status)
      : activeTab === 'adjustments' ? r.resolution_type === 'adjustment'
      : activeTab === 'exchanges' ? r.resolution_type === 'exchange'
      : activeTab === 'repairs' ? r.resolution_type === 'repair'
      : activeTab === 'flagged' ? r.marketplace_initiated === true
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
    <>
    {/* KPI Summary Cards */}
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      <MetricCard
        title="Open RMAs"
        value={kpis.openCount}
        icon={RotateCcw}
        change={`${returns.filter(r => r.return_type === 'purchase_return' && ['pending','approved','shipped'].includes(r.status)).length} supplier · ${returns.filter(r => r.return_type === 'sales_return' && ['pending','approved','shipped'].includes(r.status)).length} customer`}
      />
      <MetricCard
        title="Pending Refunds"
        value={formatCurrencyValue(kpis.pendingRefunds)}
        icon={DollarSign}
        iconClassName="bg-amber-500/10"
      />
      <MetricCard
        title="Avg Resolution"
        value={`${kpis.avgDays}d`}
        icon={Timer}
        change={kpis.avgDays > 7 ? 'Above target' : 'On track'}
        changeType={kpis.avgDays > 7 ? 'negative' : 'positive'}
      />
      <MetricCard
        title="Overdue (>7d)"
        value={kpis.overdueCount}
        icon={AlertTriangle}
        iconClassName={kpis.overdueCount > 0 ? 'bg-destructive/10' : undefined}
        changeType={kpis.overdueCount > 0 ? 'negative' : 'positive'}
        change={kpis.overdueCount > 0 ? 'Needs attention' : 'All clear'}
      />
      <MetricCard
        title="Marketplace Flags"
        value={kpis.marketplaceFlags}
        icon={AlertCircle}
        iconClassName={kpis.marketplaceFlags > 0 ? 'bg-destructive/10' : undefined}
        changeType={kpis.marketplaceFlags > 0 ? 'negative' : 'positive'}
        change={kpis.marketplaceFlags > 0 ? 'Review needed' : 'None'}
      />
    </div>

    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5" />
          Returns Management
        </CardTitle>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground hidden md:block">
            Customer returns: use Orders → Initiate Return
          </p>
          <Button onClick={() => setSupplierReturnOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Supplier Return
          </Button>
        </div>
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
              Supplier ({returns.filter(r => r.return_type === 'purchase_return').length})
            </TabsTrigger>
            <TabsTrigger value="sales">
              Customer ({returns.filter(r => r.return_type === 'sales_return').length})
            </TabsTrigger>
            <TabsTrigger value="adjustments">
              Adjustments ({returns.filter(r => r.resolution_type === 'adjustment').length})
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
            {kpis.marketplaceFlags > 0 && (
              <TabsTrigger value="flagged" className="text-destructive">
                ⚠ Flagged ({kpis.marketplaceFlags})
              </TabsTrigger>
            )}
          </TabsList>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[20px]"></TableHead>
                <TableHead>RMA #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Resolution</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Condition</TableHead>
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
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    No returns found
                  </TableCell>
                </TableRow>
              ) : (
                filteredReturns.map((rma) => (
                  <TableRow key={rma.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setViewingRma(rma)}>
                    <TableCell>
                      {rma.marketplace_initiated && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <AlertCircle className="h-4 w-4 text-destructive" />
                            </TooltipTrigger>
                            <TooltipContent>Marketplace-initiated — needs review</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{rma.rma_number}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {rma.return_type === 'purchase_return' ? 'Supplier' : 'Customer'}
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
                      ) : rma.customer_name ? (
                        <p className="text-sm text-muted-foreground">{rma.customer_name}</p>
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
                            {(rma as any).refund_reason_detail && <p className="mt-1 text-xs">{(rma as any).refund_reason_detail}</p>}
                            {rma.repair_notes && <p className="mt-1 text-xs">🔧 {rma.repair_notes}</p>}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>{formatCurrency(rma.refund_amount)}</TableCell>
                    <TableCell>{getStatusBadge(rma.status)}</TableCell>
                    <TableCell>{format(new Date(rma.return_date), 'MMM d, yyyy')}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {/* Customer returns are auto-resolved */}
                        {rma.return_type === 'sales_return' && ['refunded', 'completed'].includes(rma.status) && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            <CheckCircle className="h-3 w-3 mr-1" /> Resolved
                          </Badge>
                        )}
                        {/* Supplier returns go through approval pipeline */}
                        {rma.return_type === 'purchase_return' && (
                          <>
                            {rma.status === 'pending' && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => updateStatus(rma.id, 'approved')}>
                                  Approve
                                </Button>
                                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => updateStatus(rma.id, 'cancelled')}>
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
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
                          </>
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

    {/* Supplier Return Dialog */}
    <SupplierReturnDialog
      open={supplierReturnOpen}
      onOpenChange={setSupplierReturnOpen}
      onSuccess={fetchData}
    />

    {/* RMA Detail Dialog with Timeline */}
    <Dialog open={!!viewingRma} onOpenChange={(open) => !open && setViewingRma(null)}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        {viewingRma && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span className="font-mono flex items-center gap-2">
                  {viewingRma.marketplace_initiated && (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                  {viewingRma.rma_number}
                </span>
                <div className="flex gap-2">
                  {getResolutionBadge(viewingRma.resolution_type)}
                  {getStatusBadge(viewingRma.status)}
                </div>
              </DialogTitle>
              <DialogDescription className="sr-only">Details for {viewingRma.rma_number}</DialogDescription>
            </DialogHeader>

            {viewingRma.marketplace_initiated && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-destructive">Marketplace-Initiated</p>
                  <p className="text-xs text-muted-foreground">This refund was initiated by the marketplace (A-to-Z claim, chargeback, etc.). Please review and verify.</p>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="py-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Progress Timeline</h4>
              <div className="flex items-center justify-between relative">
                <div className="absolute top-4 left-6 right-6 h-0.5 bg-border" />
                {getRmaTimeline(viewingRma).map((step, i) => {
                  const StepIcon = step.icon;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1.5 relative z-10">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                        step.status === 'done' ? 'bg-primary border-primary text-primary-foreground' :
                        step.status === 'current' ? 'bg-background border-primary text-primary animate-pulse' :
                        'bg-muted border-border text-muted-foreground'
                      }`}>
                        <StepIcon className="h-3.5 w-3.5" />
                      </div>
                      <span className={`text-[10px] font-medium ${step.status === 'done' ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {step.label}
                      </span>
                      {step.date && (
                        <span className="text-[9px] text-muted-foreground">
                          {format(new Date(step.date), 'MMM d')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Type</p>
                  <p className="font-medium">{viewingRma.return_type === 'purchase_return' ? 'To Supplier' : 'From Customer'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Date</p>
                  <p className="font-medium">{format(new Date(viewingRma.return_date), 'MMM d, yyyy')}</p>
                </div>
                {viewingRma.customer_name && (
                  <div>
                    <p className="text-muted-foreground text-xs">Customer</p>
                    <p className="font-medium">{viewingRma.customer_name}</p>
                  </div>
                )}
                {viewingRma.supplier && (
                  <div>
                    <p className="text-muted-foreground text-xs">Supplier</p>
                    <p className="font-medium">{viewingRma.supplier.name}</p>
                  </div>
                )}
              </div>

              {viewingRma.device && (
                <div className="bg-muted/30 border border-border/40 rounded-lg p-3">
                  <p className="font-semibold">{viewingRma.device.brand} {viewingRma.device.model}</p>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    {viewingRma.device.imei && <span className="font-mono">IMEI: {viewingRma.device.imei}</span>}
                    {viewingRma.device_condition_on_return && getConditionBadge(viewingRma.device_condition_on_return)}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Original Amount</p>
                  <p className="font-medium">{formatCurrency(viewingRma.original_cost)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">
                    {viewingRma.resolution_type === 'adjustment' ? 'Credit Amount' : 'Refund Amount'}
                  </p>
                  <p className="font-medium">{formatCurrency(viewingRma.refund_amount)}</p>
                </div>
              </div>

              <div>
                <p className="text-muted-foreground text-xs">Reason</p>
                <p className="font-medium">{viewingRma.reason}</p>
                {(viewingRma as any).refund_reason_detail && (
                  <p className="text-xs text-muted-foreground mt-0.5">{(viewingRma as any).refund_reason_detail}</p>
                )}
              </div>

              {viewingRma.outbound_tracking_number && (
                <div>
                  <p className="text-muted-foreground text-xs">Tracking Number</p>
                  <p className="font-mono text-sm">{viewingRma.outbound_tracking_number}</p>
                </div>
              )}

              {(viewingRma.notes || viewingRma.repair_notes) && (
                <div>
                  <p className="text-muted-foreground text-xs">Notes</p>
                  <p className="text-sm">{viewingRma.notes}</p>
                  {viewingRma.repair_notes && <p className="text-sm mt-1">🔧 {viewingRma.repair_notes}</p>}
                </div>
              )}

              {!['refunded', 'completed', 'cancelled'].includes(viewingRma.status) && (
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                  differenceInDays(new Date(), new Date(viewingRma.created_at)) > 7
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  <Clock className="h-3.5 w-3.5" />
                  Open for {differenceInDays(new Date(), new Date(viewingRma.created_at))} days
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
