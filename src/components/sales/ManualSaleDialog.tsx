import { useState, useMemo, useEffect } from 'react';
import { emitRefetch } from '@/hooks/useDataRefetch';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { useSaleAccounting } from '@/hooks/useSaleAccounting';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  ShoppingBag, Plus, Trash2, Package, User, Receipt, Calculator,
  Wrench, Smartphone, ChevronRight,
} from 'lucide-react';
import { DeviceSearchCombobox, DeviceOption } from '@/components/inventory/DeviceSearchCombobox';
import { ProductSearchCombobox, ProductOption } from '@/components/inventory/ProductSearchCombobox';
import { cn } from '@/lib/utils';

interface ManualSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  device_id: string | null;
  device?: DeviceOption | null;
  product_id: string | null;
  product?: ProductOption | null;
  cost_price: number;          // resolved cost (device/product cost OR manual cost)
  manual_cost: number;         // manual COGS when no inventory link (e.g., labour/services)
  manual_cost_note: string;    // description of what the manual cost is
  tax_treatment: 'standard' | 'zero_rated' | 'tax_included' | 'exempt';
  tax_amount: number;          // computed
  item_type: 'device' | 'product' | 'manual';
}

const PROVINCES = [
  { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' }, { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' }, { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' }, { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' }, { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' }, { code: 'SK', name: 'Saskatchewan' }, { code: 'YT', name: 'Yukon' },
];

// Combined sales tax rate by province (GST + HST/PST/QST)
const PROVINCE_TAX_RATES: Record<string, number> = {
  AB: 0.05, BC: 0.12, MB: 0.12, NB: 0.15, NL: 0.15, NS: 0.15,
  NT: 0.05, NU: 0.05, ON: 0.13, PE: 0.15, QC: 0.14975, SK: 0.11, YT: 0.05,
};

function computeLineTax(
  treatment: LineItem['tax_treatment'],
  province: string,
  qty: number,
  unitPrice: number,
): { tax: number; netUnitPrice: number } {
  const gross = qty * unitPrice;
  const rate = PROVINCE_TAX_RATES[province] ?? 0;
  switch (treatment) {
    case 'zero_rated':
    case 'exempt':
      return { tax: 0, netUnitPrice: unitPrice };
    case 'tax_included': {
      // Price entered already includes tax — extract it
      const net = gross / (1 + rate);
      const tax = gross - net;
      return { tax: +tax.toFixed(2), netUnitPrice: qty > 0 ? +(net / qty).toFixed(4) : unitPrice };
    }
    case 'standard':
    default:
      return { tax: +(gross * rate).toFixed(2), netUnitPrice: unitPrice };
  }
}

const TAX_TREATMENTS = [
  { value: 'standard', label: 'Standard (add tax)' },
  { value: 'tax_included', label: 'Tax Included in Price' },
  { value: 'zero_rated', label: 'Zero-rated (0%)' },
  { value: 'exempt', label: 'Exempt' },
] as const;

const PRESET_MARKETPLACES = [
  { value: 'ebay', label: 'eBay' },
  { value: 'facebook', label: 'Facebook Marketplace' },
  { value: 'kijiji', label: 'Kijiji' },
  { value: 'walmart', label: 'Walmart' },
  { value: 'temu', label: 'Temu' },
  { value: 'private', label: 'Private Sale' },
  { value: 'other', label: 'Other / Custom' },
];

const orderSchema = z.object({
  order_number: z.string().min(1, 'Order number is required'),
  marketplace: z.string().min(1, 'Marketplace is required'),
  marketplace_custom: z.string().optional(),
  shipping_cost: z.number().min(0).default(0),
  marketplace_fees: z.number().min(0).default(0),
  customer_name: z.string().optional(),
  customer_email: z.string().email().optional().or(z.literal('')),
  shipping_address: z.string().optional(),
  shipping_province: z.string().optional(),
  notes: z.string().optional(),
});

type OrderFormData = z.infer<typeof orderSchema>;

let lineItemCounter = 0;
function newLineItem(): LineItem {
  lineItemCounter++;
  return {
    id: `new-${lineItemCounter}`,
    description: '',
    quantity: 1,
    unit_price: 0,
    device_id: null,
    device: null,
    product_id: null,
    product: null,
    cost_price: 0,
    manual_cost: 0,
    manual_cost_note: '',
    tax_treatment: 'standard',
    tax_amount: 0,
    item_type: 'manual',
  };
}

// --- Section header (numbered step) ---
function SectionHeader({
  step, icon: Icon, title, description,
}: { step: number; icon: any; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3 pb-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
        {step}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}

export function ManualSaleDialog({ open, onOpenChange, onSuccess }: ManualSaleDialogProps) {
  const { user } = useAuth();
  const { selectedCompany, companies } = useCompany();
  const { processSaleAccounting } = useSaleAccounting();
  const [loading, setLoading] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([newLineItem()]);
  const [saleCompanyId, setSaleCompanyId] = useState<string>(selectedCompany?.id || '');

  const effectiveCompanyId = saleCompanyId || selectedCompany?.id || '';

  const form = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      order_number: '',
      marketplace: 'ebay',
      marketplace_custom: '',
      shipping_cost: 0,
      marketplace_fees: 0,
      customer_name: '',
      customer_email: '',
      shipping_address: '',
      shipping_province: 'ON',
      notes: '',
    },
  });

  const marketplaceValue = form.watch('marketplace');
  const showMarketplaceCustom = marketplaceValue === 'other';

  const addLineItem = () => setLineItems(prev => [...prev, newLineItem()]);

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter(item => item.id !== id));
  };

  const updateLineItem = (id: string, updates: Partial<LineItem>) => {
    setLineItems(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const handleDeviceSelect = (lineId: string, device: DeviceOption | null) => {
    if (device) {
      const existing = lineItems.find(li => li.id === lineId);
      updateLineItem(lineId, {
        device_id: device.id,
        device,
        product_id: null,
        product: null,
        item_type: 'device',
        description: `${device.brand} ${device.model}${device.storage ? ` ${device.storage}` : ''}${device.color ? ` (${device.color})` : ''}`,
        cost_price: device.cost_price,
        // Preserve user-entered sale price; only suggest device.sale_price if they haven't typed one
        unit_price: existing && existing.unit_price > 0 ? existing.unit_price : ((device as any).sale_price || 0),
        manual_cost: 0,
        manual_cost_note: '',
      });
    } else {
      updateLineItem(lineId, {
        device_id: null,
        device: null,
        item_type: 'manual',
        cost_price: 0,
      });
    }
  };

  const handleProductSelect = (lineId: string, product: ProductOption | null) => {
    if (product) {
      const existing = lineItems.find(li => li.id === lineId);
      updateLineItem(lineId, {
        product_id: product.id,
        product,
        device_id: null,
        device: null,
        item_type: 'product',
        description: product.name,
        cost_price: product.cost_price,
        // Preserve user-entered sale price; only suggest product.sale_price if they haven't typed one
        unit_price: existing && existing.unit_price > 0 ? existing.unit_price : (product.sale_price || 0),
        manual_cost: 0,
        manual_cost_note: '',
      });
    } else {
      updateLineItem(lineId, {
        product_id: null,
        product: null,
        item_type: 'manual',
        cost_price: 0,
      });
    }
  };

  const linkedDeviceIds = lineItems
    .filter(li => li.device_id)
    .map(li => li.device_id as string);

  const shippingProvince = form.watch('shipping_province') || 'ON';

  // Auto-recompute per-line tax whenever province / qty / price / treatment changes
  useEffect(() => {
    setLineItems(prev => {
      let changed = false;
      const next = prev.map(li => {
        const { tax } = computeLineTax(li.tax_treatment, shippingProvince, li.quantity, li.unit_price);
        if (Math.abs(tax - (li.tax_amount || 0)) > 0.005) {
          changed = true;
          return { ...li, tax_amount: tax };
        }
        return li;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingProvince, lineItems.map(l => `${l.id}:${l.quantity}:${l.unit_price}:${l.tax_treatment}`).join('|')]);

  // --- Totals ---
  const subtotal = lineItems.reduce((sum, item) => {
    // For tax_included items, the entered unit_price already contains tax — strip it for revenue subtotal
    if (item.tax_treatment === 'tax_included') {
      return sum + (item.quantity * item.unit_price - (item.tax_amount || 0));
    }
    return sum + item.quantity * item.unit_price;
  }, 0);
  const totalTax = lineItems.reduce((sum, item) => sum + (item.tax_amount || 0), 0);
  const shippingCost = Number(form.watch('shipping_cost')) || 0;
  const marketplaceFees = Number(form.watch('marketplace_fees')) || 0;

  // Gross customer paid (what hit the marketplace)
  const customerGross = subtotal + totalTax + shippingCost;
  // Net we receive (settlement) after marketplace fees
  const netReceivable = customerGross - marketplaceFees;

  // COGS — sum of inventory costs + manual costs across all lines
  const totalCOGS = lineItems.reduce((sum, item) => {
    if (item.item_type === 'device' || item.item_type === 'product') {
      return sum + item.cost_price * item.quantity;
    }
    return sum + (item.manual_cost || 0);
  }, 0);

  const grossProfit = subtotal - totalCOGS - marketplaceFees;
  const marginPct = subtotal > 0 ? (grossProfit / subtotal) * 100 : 0;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const handleSubmit = async (data: OrderFormData) => {
    if (!effectiveCompanyId) {
      toast.error('Please select a company');
      return;
    }

    const validItems = lineItems.filter(li => li.description && li.unit_price > 0);
    if (validItems.length === 0) {
      toast.error('Add at least one line item with a description and price');
      return;
    }

    // Resolve marketplace value — custom text if "other"
    const finalMarketplace = data.marketplace === 'other'
      ? (data.marketplace_custom?.trim() || 'other')
      : data.marketplace;

    // Aggregate manual costs across lines (for sales without inventory link)
    const aggregatedManualCost = validItems.reduce((sum, li) => {
      if (li.item_type === 'manual' && li.manual_cost > 0) {
        return sum + li.manual_cost;
      }
      return sum;
    }, 0);

    const manualCostDescription = validItems
      .filter(li => li.item_type === 'manual' && li.manual_cost > 0)
      .map(li => li.manual_cost_note || li.description)
      .filter(Boolean)
      .join('; ');

    setLoading(true);
    try {
      const { data: sale, error: saleError } = await supabase.from('sales').insert({
        order_number: data.order_number,
        marketplace: finalMarketplace as any,
        sale_price: subtotal,
        shipping_cost: data.shipping_cost,
        marketplace_fees: data.marketplace_fees,
        tax_amount: totalTax,
        sale_date: new Date().toISOString(),
        customer_name: data.customer_name || null,
        customer_email: data.customer_email || null,
        shipping_address: data.shipping_address || null,
        shipping_province: data.shipping_province || null,
        notes: data.notes || null,
        device_id: validItems.length === 1 && validItems[0].device_id ? validItems[0].device_id : null,
        company_id: effectiveCompanyId,
        created_by: user?.id,
        is_multi_item: validItems.length > 1,
        item_count: validItems.length,
        subtotal,
        manual_cost: aggregatedManualCost > 0 ? aggregatedManualCost : null,
        manual_cost_description: manualCostDescription || null,
      } as any).select('id').single();

      if (saleError) throw saleError;

      if (sale) {
        const saleItems = validItems.map(item => ({
          sale_id: sale.id,
          device_id: item.device_id,
          product_id: item.product_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          cost_price: item.item_type === 'manual' ? item.manual_cost : item.cost_price,
          tax_amount: item.tax_amount,
          total: item.quantity * item.unit_price,
          sku: item.device?.sku || item.product?.sku || null,
          imei: item.device?.imei || null,
        }));

        const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
        if (itemsError) throw itemsError;

        for (const item of validItems) {
          if (item.product_id && item.product) {
            await supabase.from('products').update({
              quantity_on_hand: Math.max(0, item.product.quantity_on_hand - item.quantity),
            }).eq('id', item.product_id);
          }
        }

        // Trigger accounting (Revenue, AR, marketplace fees, shipping, tax, COGS)
        await processSaleAccounting([sale.id]);
      }

      toast.success(`Sale recorded — ${validItems.length} item(s), net ${formatCurrency(netReceivable)}`);
      form.reset();
      setLineItems([newLineItem()]);
      setSaleCompanyId(selectedCompany?.id || '');
      emitRefetch('sales');
      emitRefetch('inventory');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error recording sale:', error);
      toast.error(error.message || 'Failed to record sale');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      form.reset();
      setLineItems([newLineItem()]);
      setSaleCompanyId(selectedCompany?.id || '');
    }
    onOpenChange(open);
  };

  // Indicate sections with missing data for visual progress
  const hasOrderInfo = !!form.watch('order_number') && !!effectiveCompanyId;
  const hasItems = lineItems.some(li => li.description && li.unit_price > 0);
  const hasCOGSResolved = lineItems.every(li =>
    !li.description || li.unit_price === 0 ||
    li.item_type === 'device' || li.item_type === 'product' || li.manual_cost > 0
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[820px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Record Manual Sale
          </DialogTitle>
          <DialogDescription>
            For orders from marketplaces or channels not auto-imported. All amounts flow into the accounting ledger.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">

            {/* ===== STEP 1: Source & Customer ===== */}
            <section className="space-y-3">
              <SectionHeader
                step={1}
                icon={User}
                title="Source & Customer"
                description="Where the order came from. Customer details are optional for anonymous sales."
              />

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Company *</label>
                  <Select value={effectiveCompanyId} onValueChange={(v) => {
                    setSaleCompanyId(v);
                    setLineItems(prev => prev.map(li => ({
                      ...li,
                      device_id: null,
                      device: null,
                      item_type: li.item_type === 'device' ? 'manual' : li.item_type,
                      cost_price: li.item_type === 'device' ? 0 : li.cost_price,
                    })));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      {companies.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code === 'VES' ? 'Virtual eShop' : c.code === 'TGW' ? 'Tech Genius Warehouse' : c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <FormField
                  control={form.control}
                  name="order_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Order # *</FormLabel>
                      <FormControl><Input placeholder="ORD-12345" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="marketplace"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Marketplace *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {PRESET_MARKETPLACES.map(m => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {showMarketplaceCustom && (
                <FormField
                  control={form.control}
                  name="marketplace_custom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Custom marketplace name</FormLabel>
                      <FormControl><Input placeholder="e.g., Mercari, OfferUp, In-store" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="customer_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Customer Name (optional)</FormLabel>
                      <FormControl><Input placeholder="Anonymous" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customer_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Customer Email (optional)</FormLabel>
                      <FormControl><Input type="email" placeholder="customer@example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <FormField
                    control={form.control}
                    name="shipping_address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Shipping Address (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="123 Main St, City, Postal" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="shipping_province"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Province</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {PROVINCES.map(p => (
                            <SelectItem key={p.code} value={p.code}>{p.code} — {p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-[10px]">Used for tax reference</FormDescription>
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <Separator />

            {/* ===== STEP 2: Order Charges (gross + fees) ===== */}
            <section className="space-y-3">
              <SectionHeader
                step={2}
                icon={Receipt}
                title="Order Charges"
                description="What the customer paid and what the marketplace charged you in fees."
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="shipping_cost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Shipping Charged to Customer</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field}
                          onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="marketplace_fees"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Marketplace Fees Deducted</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field}
                          onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                      </FormControl>
                      <FormDescription className="text-[10px]">Combined commission + payment processing</FormDescription>
                    </FormItem>
                  )}
                />
              </div>

              {/* Receivable preview banner */}
              <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Customer pays</span>
                  <span className="font-mono">{formatCurrency(customerGross)}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">- Fees</span>
                  <span className="font-mono text-destructive">{formatCurrency(marketplaceFees)}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">You receive</span>
                </div>
                <span className="font-semibold font-mono text-primary">{formatCurrency(netReceivable)}</span>
              </div>
            </section>

            <Separator />

            {/* ===== STEP 3: Items + Inventory / COGS linking ===== */}
            <section className="space-y-3">
              <SectionHeader
                step={3}
                icon={Package}
                title="Items Sold & Cost Attribution"
                description="Add each item and link it to inventory (search by IMEI, SKU, name) or enter a manual cost for labour/services."
              />

              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-xs">
                  {lineItems.length} line item{lineItems.length !== 1 ? 's' : ''}
                </Badge>
                <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {lineItems.map((item, index) => {
                  const grossLine = item.quantity * item.unit_price;
                  const lineSubtotal = item.tax_treatment === 'tax_included'
                    ? grossLine - (item.tax_amount || 0)
                    : grossLine;
                  const lineCost = item.item_type === 'manual' ? item.manual_cost : item.cost_price * item.quantity;
                  const lineProfit = lineSubtotal - lineCost;
                  const isCostMissing = item.description && item.unit_price > 0 &&
                    item.item_type === 'manual' && item.manual_cost === 0;

                  return (
                    <div key={item.id} className={cn(
                      "border rounded-lg p-3 space-y-3 bg-muted/20",
                      isCostMissing && "border-amber-500/40"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground">Item {index + 1}</span>
                          {item.item_type === 'device' && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Smartphone className="h-3 w-3" /> Device linked
                            </Badge>
                          )}
                          {item.item_type === 'product' && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Package className="h-3 w-3" /> Product linked
                            </Badge>
                          )}
                          {item.item_type === 'manual' && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Wrench className="h-3 w-3" /> Manual cost
                            </Badge>
                          )}
                        </div>
                        {lineItems.length > 1 && (
                          <Button type="button" variant="ghost" size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => removeLineItem(item.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>

                      {/* Description + quantity */}
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-10">
                          <label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">Description</label>
                          <Input
                            placeholder="Item description"
                            value={item.description}
                            onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">Qty</label>
                          <Input type="number" min={1} value={item.quantity}
                            onChange={(e) => updateLineItem(item.id, { quantity: parseInt(e.target.value) || 1 })} />
                        </div>
                      </div>

                      {/* === Two-column REVENUE vs COGS layout === */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* LEFT: Revenue (Sale Price) */}
                        <div className="rounded-md border-2 border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <Receipt className="h-3.5 w-3.5" />
                            REVENUE — What customer paid
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">Sale Price (per unit) *</label>
                              <Input type="number" step="0.01" placeholder="0.00" value={item.unit_price || ''}
                                onChange={(e) => updateLineItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">Tax</label>
                              <Input type="number" step="0.01" value={item.tax_amount || ''}
                                onChange={(e) => updateLineItem(item.id, { tax_amount: parseFloat(e.target.value) || 0 })} />
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20 text-xs">
                            <span className="text-muted-foreground">Line revenue:</span>
                            <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(lineSubtotal)}</span>
                          </div>
                        </div>

                        {/* RIGHT: COGS (Cost) */}
                        <div className={cn(
                          "rounded-md border-2 p-3 space-y-2",
                          isCostMissing ? "border-amber-500/40 bg-amber-500/5" : "border-blue-500/30 bg-blue-500/5"
                        )}>
                          <div className="flex items-center justify-between text-xs font-semibold text-blue-700 dark:text-blue-400">
                            <span className="flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5" />
                              COGS — Your cost for this item
                            </span>
                          </div>

                          {/* Inventory link search — always visible so user can attach/swap */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wide text-muted-foreground block">
                              Link inventory (IMEI / SKU / name)
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                              <DeviceSearchCombobox
                                value={item.device_id}
                                onSelect={(device) => handleDeviceSelect(item.id, device)}
                                companyId={effectiveCompanyId}
                                excludeIds={linkedDeviceIds.filter(id => id !== item.device_id)}
                                disabled={!!item.product_id}
                              />
                              <ProductSearchCombobox
                                value={item.product_id}
                                onSelect={(product) => handleProductSelect(item.id, product)}
                                companyId={effectiveCompanyId}
                                disabled={!!item.device_id}
                              />
                            </div>
                          </div>

                          {(item.item_type === 'device' || item.item_type === 'product') ? (
                            <div className="space-y-1.5">
                              <p className="text-[11px] text-muted-foreground">
                                Pulled from linked {item.item_type === 'device' ? 'device' : 'product'} inventory:
                              </p>
                              <div className="rounded bg-background px-2 py-1.5 text-xs font-mono">
                                {formatCurrency(item.cost_price)} × {item.quantity} = <span className="font-semibold">{formatCurrency(item.cost_price * item.quantity)}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground italic">
                                Inventory will be reduced and COGS booked automatically.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Wrench className="h-3 w-3" />
                                Manual cost (labour, services, or non-inventory):
                              </p>
                              <Input
                                type="number" step="0.01" placeholder="Cost amount"
                                value={item.manual_cost || ''}
                                onChange={(e) => updateLineItem(item.id, { manual_cost: parseFloat(e.target.value) || 0 })}
                              />
                              <Input
                                placeholder="What is this cost? (e.g., 2 hrs labour)"
                                value={item.manual_cost_note}
                                onChange={(e) => updateLineItem(item.id, { manual_cost_note: e.target.value })}
                                className="text-xs"
                              />
                              {isCostMissing && (
                                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                  ⚠ No COGS set — link inventory above or enter a manual cost.
                                </p>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1 border-t border-blue-500/20 text-xs">
                            <span className="text-muted-foreground">Line cost:</span>
                            <span className="font-mono font-semibold">{formatCurrency(lineCost)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Per-line profit */}
                      {lineSubtotal > 0 && (
                        <div className="flex items-center justify-end gap-2 text-xs border-t pt-2">
                          <span className="text-muted-foreground">Line profit:</span>
                          <span className={cn(
                            "font-mono font-semibold",
                            lineProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                          )}>{formatCurrency(lineProfit)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <Separator />

            {/* ===== STEP 4: Summary ===== */}
            <section className="space-y-3">
              <SectionHeader
                step={4}
                icon={Calculator}
                title="Order Summary & Accounting Preview"
                description="Posted journal entries: AR/Cash, Revenue, Tax, Marketplace Fees, COGS, Inventory."
              />

              <div className="rounded-lg border bg-card p-4 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Items subtotal ({lineItems.length})</span>
                  <span className="font-mono">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">+ Tax</span>
                  <span className="font-mono">{formatCurrency(totalTax)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">+ Shipping</span>
                  <span className="font-mono">{formatCurrency(shippingCost)}</span>
                </div>
                <Separator className="my-1.5" />
                <div className="flex justify-between text-sm font-medium">
                  <span>= Customer Paid (Gross)</span>
                  <span className="font-mono">{formatCurrency(customerGross)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">− Marketplace Fees</span>
                  <span className="font-mono text-destructive">−{formatCurrency(marketplaceFees)}</span>
                </div>
                <div className="flex justify-between font-semibold text-primary">
                  <span>= Net Settlement (You Receive)</span>
                  <span className="font-mono">{formatCurrency(netReceivable)}</span>
                </div>

                <Separator className="my-2" />

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">− Total COGS (inventory + manual)</span>
                  <span className="font-mono">−{formatCurrency(totalCOGS)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span>= Gross Profit</span>
                  <span className={cn(
                    "font-mono",
                    grossProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                  )}>
                    {formatCurrency(grossProfit)}
                    <span className="text-xs text-muted-foreground ml-2">({marginPct.toFixed(1)}%)</span>
                  </span>
                </div>
              </div>

              {!hasCOGSResolved && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Some items have no COGS — link inventory or enter a manual cost so the accounting reflects true profit.
                </p>
              )}
            </section>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Internal notes about this sale..." {...field} rows={2} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button type="submit" disabled={loading || !hasOrderInfo || !hasItems}>
                {loading ? 'Recording...' : `Record Sale — ${formatCurrency(netReceivable)} net`}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
