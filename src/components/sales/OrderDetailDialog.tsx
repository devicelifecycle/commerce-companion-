import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MarketplaceBadge, FulfillmentBadge, MarketplaceStatusBadge } from '@/components/ui/status-badge';
import { Package, User, MapPin, DollarSign, Calendar, FileText, RotateCcw, Link, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeviceSearchCombobox } from '@/components/inventory/DeviceSearchCombobox';
import { ProductSearchCombobox } from '@/components/inventory/ProductSearchCombobox';
import { toast } from 'sonner';

interface Sale {
  id: string;
  device_id: string | null;
  order_number: string;
  marketplace: string;
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
  company_id: string | null;
  fulfillment_status: string | null;
  marketplace_status: string | null;
  is_marketplace_remitted?: boolean;
  accounting_status?: string | null;
  product_title?: string | null;
  marketplace_sku?: string | null;
  devices?: {
    brand: string;
    model: string;
    cost_price: number;
    imei: string | null;
    storage?: string | null;
    condition?: string | null;
    color?: string | null;
  } | null;
}

interface OrderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  onInitiateReturn: () => void;
  hasReturn: boolean;
  onSaleUpdated?: () => void;
}

export function OrderDetailDialog({ open, onOpenChange, sale, onInitiateReturn, hasReturn, onSaleUpdated }: OrderDetailDialogProps) {
  const [showLinkDevice, setShowLinkDevice] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<'device' | 'product'>('device');
  const [linking, setLinking] = useState(false);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });

  const costPrice = sale.devices?.cost_price ?? 0;
  const grossRevenue = sale.sale_price;
  const totalDeductions = sale.shipping_cost + sale.marketplace_fees + sale.tax_amount;
  const netRevenue = grossRevenue - totalDeductions;
  const profit = sale.profit ?? (netRevenue - costPrice);

  const handleLinkDevice = async () => {
    if (!selectedDeviceId) return;
    setLinking(true);
    try {
      const { data: device } = await supabase.from('devices').select('cost_price, sale_price').eq('id', selectedDeviceId).single();
      
      const { error: saleError } = await supabase.from('sales').update({
        device_id: selectedDeviceId,
        accounting_status: 'unprocessed',
      }).eq('id', sale.id);
      if (saleError) throw saleError;

      const { error: deviceError } = await supabase.from('devices').update({
        status: 'sold' as any,
        sale_price: sale.sale_price,
      }).eq('id', selectedDeviceId);
      if (deviceError) throw deviceError;

      toast.success('Device linked to order');
      setShowLinkDevice(false);
      setSelectedDeviceId(null);
      onSaleUpdated?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to link device');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkDevice = async () => {
    if (!sale.device_id) return;
    setLinking(true);
    try {
      const { error: saleError } = await supabase.from('sales').update({
        device_id: null,
        accounting_status: 'revenue_only',
      }).eq('id', sale.id);
      if (saleError) throw saleError;

      const { error: deviceError } = await supabase.from('devices').update({
        status: 'in_stock' as any,
        sale_price: null,
      }).eq('id', sale.device_id);
      if (deviceError) throw deviceError;

      // Clean up COGS journal entries
      const { data: cogsEntries } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('reference_id', sale.id)
        .eq('reference_type', 'sale')
        .ilike('description', 'COGS%');

      if (cogsEntries && cogsEntries.length > 0) {
        const entryIds = cogsEntries.map(e => e.id);
        await supabase.from('journal_entry_lines').delete().in('journal_entry_id', entryIds);
        await supabase.from('journal_entries').delete().in('id', entryIds);
      }

      toast.success('Device unlinked — COGS entries reversed');
      onSaleUpdated?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to unlink device');
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Order {sale.order_number}</span>
            <div className="flex items-center gap-2">
              <MarketplaceBadge marketplace={sale.marketplace as any} />
              {hasReturn && (
                <Badge variant="outline" className="text-destructive border-destructive/50">
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Returned
                </Badge>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Details for order {sale.order_number}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Status Row */}
          <div className="flex items-center gap-3 flex-wrap">
            <MarketplaceStatusBadge marketplace={sale.marketplace as any} marketplaceStatus={sale.marketplace_status} />
            <FulfillmentBadge status={(sale.fulfillment_status || 'received') as any} />
            {sale.accounting_status && (
              <Badge variant="outline" className="text-xs capitalize">{sale.accounting_status.replace('_', ' ')}</Badge>
            )}
          </div>

          <Separator />

          {/* Customer Info */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Customer
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Name</p>
                <p className="font-medium">{sale.customer_name || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Email</p>
                <p className="font-medium">{sale.customer_email || '—'}</p>
              </div>
              {sale.shipping_address && (
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs flex items-center gap-1"><MapPin className="h-3 w-3" /> Shipping Address</p>
                  <p className="font-medium">{sale.shipping_address}</p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Device / Item */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" /> Item
            </h4>
            {sale.devices ? (
              <div className="bg-muted/30 border border-border/40 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{sale.devices.brand} {sale.devices.model}</p>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      {sale.devices.imei && <span className="font-mono">IMEI: {sale.devices.imei}</span>}
                      {sale.devices.storage && <span>{sale.devices.storage}</span>}
                      {sale.devices.color && <span>{sale.devices.color}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-muted-foreground">Cost: {formatCurrency(costPrice)}</p>
                    <Button variant="ghost" size="sm" onClick={handleUnlinkDevice} disabled={linking} className="text-destructive hover:text-destructive">
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : sale.product_title ? (
              <div className="bg-muted/30 border border-border/40 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{sale.product_title}</p>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      {sale.marketplace_sku && <span className="font-mono">SKU: {sale.marketplace_sku}</span>}
                      <span>From marketplace listing</span>
                    </div>
                  </div>
                  {!showLinkDevice && (
                    <Button variant="outline" size="sm" onClick={() => setShowLinkDevice(true)}>
                      <Link className="h-3.5 w-3.5 mr-1.5" />
                      Link Device
                    </Button>
                  )}
                </div>
                {showLinkDevice && (
                  <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                    <DeviceSearchCombobox
                      value={selectedDeviceId}
                      onSelect={(device) => setSelectedDeviceId(device?.id ?? null)}
                      companyId={sale.company_id || undefined}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => { setShowLinkDevice(false); setSelectedDeviceId(null); }}>Cancel</Button>
                      <Button size="sm" onClick={handleLinkDevice} disabled={!selectedDeviceId || linking}>
                        {linking ? 'Linking...' : 'Confirm Link'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-muted/20 border border-border/40 rounded-lg p-3">
                {showLinkDevice ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Search for a device to link</p>
                    <DeviceSearchCombobox
                      value={selectedDeviceId}
                      onSelect={(device) => setSelectedDeviceId(device?.id ?? null)}
                      companyId={sale.company_id || undefined}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => { setShowLinkDevice(false); setSelectedDeviceId(null); }}>Cancel</Button>
                      <Button size="sm" onClick={handleLinkDevice} disabled={!selectedDeviceId || linking}>
                        {linking ? 'Linking...' : 'Confirm Link'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">No device linked to this order</p>
                    <Button variant="outline" size="sm" onClick={() => setShowLinkDevice(true)}>
                      <Link className="h-3.5 w-3.5 mr-1.5" />
                      Link Device
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Financial Breakdown */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Financial Breakdown
            </h4>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sale Price</span>
                <span className="font-medium">{formatCurrency(grossRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping Cost</span>
                <span className="text-destructive">-{formatCurrency(sale.shipping_cost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Marketplace Fees</span>
                <span className="text-destructive">-{formatCurrency(sale.marketplace_fees)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Tax {sale.is_marketplace_remitted ? '(marketplace remits)' : '(you remit)'}
                </span>
                <span className="text-destructive">-{formatCurrency(sale.tax_amount)}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Net Revenue</span>
                <span className="font-medium">{formatCurrency(netRevenue)}</span>
              </div>
              {sale.devices && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cost of Goods (COGS)</span>
                  <span className="text-destructive">-{formatCurrency(costPrice)}</span>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between text-base font-bold">
                <span>Profit / Loss</span>
                <span className={profit >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}>
                  {formatCurrency(profit)}
                </span>
              </div>
            </div>
          </div>

          {/* Date & Notes */}
          <Separator />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Sale Date</p>
              <p className="font-medium">{formatDate(sale.sale_date)}</p>
            </div>
            {sale.notes && (
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs flex items-center gap-1"><FileText className="h-3 w-3" /> Notes</p>
                <p className="text-sm">{sale.notes}</p>
              </div>
            )}
          </div>

          {/* Return Action */}
          {!hasReturn && (
            <>
              <Separator />
              <Button
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => {
                  onOpenChange(false);
                  onInitiateReturn();
                }}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Initiate Return
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
