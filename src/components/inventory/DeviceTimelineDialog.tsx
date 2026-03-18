import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, ConditionBadge } from '@/components/ui/status-badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Package, ShoppingCart, RotateCcw, ArrowRightLeft, Truck,
  DollarSign, FileText, Clock, User, Building2, Calendar,
} from 'lucide-react';

interface TimelineEvent {
  id: string;
  date: string;
  type: 'purchase' | 'sale' | 'return' | 'transfer' | 'status_change' | 'created';
  title: string;
  description: string;
  metadata?: Record<string, string>;
  icon: React.ReactNode;
  color: string;
}

interface DeviceTimelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: {
    id: string;
    brand: string;
    model: string;
    storage?: string | null;
    color?: string | null;
    imei?: string | null;
    sku?: string | null;
    condition: string;
    status: string;
    cost_price: number;
    sale_price?: number | null;
    purchase_date?: string | null;
    company_id?: string | null;
    suppliers?: { name: string } | null;
    fulfillment_channel?: string | null;
    category?: string;
  } | null;
}

export function DeviceTimelineDialog({ open, onOpenChange, device }: DeviceTimelineDialogProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && device) {
      fetchTimeline(device.id);
    }
  }, [open, device]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(val);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });

  const fetchTimeline = async (deviceId: string) => {
    setLoading(true);
    const timeline: TimelineEvent[] = [];

    try {
      // 1. Device creation / purchase
      const { data: deviceData } = await supabase
        .from('devices')
        .select('created_at, purchase_date, cost_price, supplier_id, suppliers(name), import_batch_id')
        .eq('id', deviceId)
        .single();

      if (deviceData) {
        const supplierName = (deviceData.suppliers as any)?.name || 'Unknown supplier';
        timeline.push({
          id: 'purchase',
          date: deviceData.purchase_date || deviceData.created_at,
          type: 'purchase',
          title: 'Purchased from Supplier',
          description: `Acquired from ${supplierName} for ${formatCurrency(deviceData.cost_price)}`,
          metadata: {
            'Supplier': supplierName,
            'Cost': formatCurrency(deviceData.cost_price),
            ...(deviceData.import_batch_id ? { 'Import': 'Bulk import' } : { 'Import': 'Manual entry' }),
          },
          icon: <Package className="h-4 w-4" />,
          color: 'bg-blue-500',
        });
      }

      // 2. PO items linked to this device
      const { data: poItems } = await supabase
        .from('purchase_order_items')
        .select('purchase_order_id, unit_cost, created_at, purchase_orders(po_number, po_date, supplier_name)')
        .eq('device_id', deviceId);

      poItems?.forEach(item => {
        const po = item.purchase_orders as any;
        if (po) {
          timeline.push({
            id: `po-${item.purchase_order_id}`,
            date: po.po_date || item.created_at,
            type: 'purchase',
            title: `Purchase Order ${po.po_number}`,
            description: `Ordered from ${po.supplier_name}`,
            metadata: { 'PO#': po.po_number, 'Unit Cost': formatCurrency(item.unit_cost) },
            icon: <FileText className="h-4 w-4" />,
            color: 'bg-indigo-500',
          });
        }
      });

      // 3. GRN items (goods received)
      const { data: grnItems } = await supabase
        .from('grn_items')
        .select('created_at, condition_status, goods_received_notes(grn_number, received_date)')
        .eq('device_id', deviceId);

      grnItems?.forEach(item => {
        const grn = item.goods_received_notes as any;
        if (grn) {
          timeline.push({
            id: `grn-${grn.grn_number}`,
            date: grn.received_date || item.created_at,
            type: 'purchase',
            title: `Received — ${grn.grn_number}`,
            description: `Condition: ${item.condition_status || 'Passed'}`,
            icon: <Truck className="h-4 w-4" />,
            color: 'bg-green-500',
          });
        }
      });

      // 4. Sales
      const { data: saleItems } = await supabase
        .from('sale_items')
        .select('unit_price, quantity, sale_id, sales(order_number, sale_date, customer_name, marketplace, status)')
        .eq('device_id', deviceId);

      saleItems?.forEach(item => {
        const sale = item.sales as any;
        if (sale) {
          timeline.push({
            id: `sale-${item.sale_id}`,
            date: sale.sale_date,
            type: 'sale',
            title: `Sold — ${sale.order_number}`,
            description: `To ${sale.customer_name || 'Customer'} on ${sale.marketplace || 'Direct'}`,
            metadata: {
              'Order': sale.order_number,
              'Price': formatCurrency(item.unit_price),
              'Customer': sale.customer_name || '-',
              'Channel': sale.marketplace || 'Direct',
            },
            icon: <ShoppingCart className="h-4 w-4" />,
            color: 'bg-emerald-500',
          });
        }
      });

      // 5. Returns
      const { data: returns } = await supabase
        .from('return_authorizations')
        .select('rma_number, return_date, reason, status, resolution_type, customer_name, return_type, device_condition_on_return')
        .eq('device_id', deviceId);

      returns?.forEach(ret => {
        timeline.push({
          id: `return-${ret.rma_number}`,
          date: ret.return_date,
          type: 'return',
          title: `Return — ${ret.rma_number}`,
          description: `${ret.return_type === 'customer' ? 'Customer' : 'Supplier'} return: ${ret.reason}`,
          metadata: {
            'Type': ret.return_type,
            'Resolution': ret.resolution_type || '-',
            'Condition': ret.device_condition_on_return || '-',
            'Status': ret.status || '-',
          },
          icon: <RotateCcw className="h-4 w-4" />,
          color: 'bg-amber-500',
        });
      });

      // 6. Inventory transfers
      const { data: transfers } = await supabase
        .from('inventory_transfers')
        .select('transfer_date, reason, transfer_price, from_company:companies!inventory_transfers_from_company_id_fkey(name, code), to_company:companies!inventory_transfers_to_company_id_fkey(name, code)')
        .eq('device_id', deviceId);

      transfers?.forEach(t => {
        const from = (t.from_company as any)?.code || '?';
        const to = (t.to_company as any)?.code || '?';
        timeline.push({
          id: `transfer-${t.transfer_date}-${from}-${to}`,
          date: t.transfer_date,
          type: 'transfer',
          title: `Transferred ${from} → ${to}`,
          description: t.reason || 'Inter-company transfer',
          metadata: t.transfer_price ? { 'Transfer Price': formatCurrency(t.transfer_price) } : undefined,
          icon: <ArrowRightLeft className="h-4 w-4" />,
          color: 'bg-purple-500',
        });
      });

      // Sort chronologically
      timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setEvents(timeline);
    } catch (err) {
      console.error('Failed to fetch device timeline:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!device) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {device.brand} {device.model}
          </SheetTitle>
          <SheetDescription>
            {[device.storage, device.color].filter(Boolean).join(' • ')}
          </SheetDescription>
        </SheetHeader>

        {/* Device summary */}
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">IMEI / SKU</p>
              <p className="font-mono text-sm font-medium">{device.imei || device.sku || '-'}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Category</p>
              <p className="text-sm font-medium capitalize">{device.category || '-'}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Status</p>
              <StatusBadge status={device.status as any} />
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Condition</p>
              <ConditionBadge condition={device.condition as any} />
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Cost Price</p>
              <p className="text-sm font-semibold">{formatCurrency(device.cost_price)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Sale Price</p>
              <p className="text-sm font-semibold">{device.sale_price ? formatCurrency(device.sale_price) : '-'}</p>
            </div>
          </div>

          <Separator />

          {/* Timeline */}
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Device Lifecycle Timeline
            </h3>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : events.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No history recorded yet</p>
            ) : (
              <ScrollArea className="h-[calc(100vh-420px)]">
                <div className="relative pl-6">
                  {/* Vertical line */}
                  <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />

                  <div className="space-y-6">
                    {events.map((event, idx) => (
                      <div key={event.id} className="relative">
                        {/* Dot */}
                        <div className={`absolute -left-6 top-0.5 h-6 w-6 rounded-full ${event.color} flex items-center justify-center text-white`}>
                          {event.icon}
                        </div>

                        <div className="ml-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold">{event.title}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {event.type.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <Calendar className="h-3 w-3 inline mr-1" />
                            {formatDate(event.date)}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">{event.description}</p>

                          {event.metadata && (
                            <div className="mt-2 grid grid-cols-2 gap-1">
                              {Object.entries(event.metadata).map(([key, val]) => (
                                <div key={key} className="text-xs">
                                  <span className="text-muted-foreground">{key}: </span>
                                  <span className="font-medium">{val}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
