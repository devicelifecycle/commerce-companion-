import { useState } from 'react';
import { emitRefetch } from '@/hooks/useDataRefetch';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
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
import { ShoppingBag, Plus, Trash2, Package } from 'lucide-react';
import { DeviceSearchCombobox, DeviceOption } from '@/components/inventory/DeviceSearchCombobox';
import { ProductSearchCombobox, ProductOption } from '@/components/inventory/ProductSearchCombobox';

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
  cost_price: number;
  tax_amount: number;
  item_type: 'device' | 'product' | 'custom';
}

const PROVINCES = [
  { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' }, { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' }, { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' }, { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' }, { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' }, { code: 'SK', name: 'Saskatchewan' }, { code: 'YT', name: 'Yukon' },
];

const orderSchema = z.object({
  order_number: z.string().min(1, 'Order number is required'),
  marketplace: z.string().min(1, 'Marketplace is required'),
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
    tax_amount: 0,
    item_type: 'custom',
  };
}

export function ManualSaleDialog({ open, onOpenChange, onSuccess }: ManualSaleDialogProps) {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([newLineItem()]);

  const form = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      order_number: '',
      marketplace: 'other',
      shipping_cost: 0,
      marketplace_fees: 0,
      customer_name: '',
      customer_email: '',
      shipping_address: '',
      shipping_province: 'ON',
      notes: '',
    },
  });

  const addLineItem = () => {
    setLineItems(prev => [...prev, newLineItem()]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter(item => item.id !== id));
  };

  const updateLineItem = (id: string, updates: Partial<LineItem>) => {
    setLineItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, ...updates };
        // Recalculate total when quantity or price changes
        return updated;
      })
    );
  };

  const handleDeviceSelect = (lineId: string, device: DeviceOption | null) => {
    if (device) {
      updateLineItem(lineId, {
        device_id: device.id,
        device,
        product_id: null,
        product: null,
        item_type: 'device',
        description: `${device.brand} ${device.model}${device.storage ? ` ${device.storage}` : ''}${device.color ? ` (${device.color})` : ''}`,
        cost_price: device.cost_price,
        unit_price: device.cost_price,
      });
    } else {
      updateLineItem(lineId, {
        device_id: null,
        device: null,
        item_type: 'custom',
        cost_price: 0,
      });
    }
  };

  const handleProductSelect = (lineId: string, product: ProductOption | null) => {
    if (product) {
      updateLineItem(lineId, {
        product_id: product.id,
        product,
        device_id: null,
        device: null,
        item_type: 'product',
        description: product.name,
        cost_price: product.cost_price,
        unit_price: product.sale_price || product.cost_price,
      });
    } else {
      updateLineItem(lineId, {
        product_id: null,
        product: null,
        item_type: 'custom',
        cost_price: 0,
      });
    }
  };

  const linkedDeviceIds = lineItems
    .filter(li => li.device_id)
    .map(li => li.device_id as string);

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const totalTax = lineItems.reduce((sum, item) => sum + item.tax_amount, 0);
  const shippingCost = form.watch('shipping_cost') || 0;
  const marketplaceFees = form.watch('marketplace_fees') || 0;
  const grandTotal = subtotal + totalTax + shippingCost;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const handleSubmit = async (data: OrderFormData) => {
    if (!selectedCompany) {
      toast.error('Please select a company');
      return;
    }

    const validItems = lineItems.filter(li => li.description && li.unit_price > 0);
    if (validItems.length === 0) {
      toast.error('Add at least one line item with a description and price');
      return;
    }

    setLoading(true);
    try {
      // Create the sale record
      const { data: sale, error: saleError } = await supabase.from('sales').insert({
        order_number: data.order_number,
        marketplace: data.marketplace as any,
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
        device_id: validItems.length === 1 ? validItems[0].device_id : null,
        company_id: selectedCompany.id,
        created_by: user?.id,
        is_multi_item: validItems.length > 1,
        item_count: validItems.length,
        subtotal,
      } as any).select('id').single();

      if (saleError) throw saleError;

      // Insert line items
      if (validItems.length > 0 && sale) {
        const saleItems = validItems.map(item => ({
          sale_id: sale.id,
          device_id: item.device_id,
          product_id: item.product_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          cost_price: item.cost_price,
          tax_amount: item.tax_amount,
          total: item.quantity * item.unit_price,
          sku: item.device?.sku || item.product?.sku || null,
          imei: item.device?.imei || null,
        }));

        const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
        if (itemsError) throw itemsError;

        // Deduct product quantities
        for (const item of validItems) {
          if (item.product_id && item.product) {
            await supabase.from('products').update({
              quantity_on_hand: Math.max(0, item.product.quantity_on_hand - item.quantity),
            }).eq('id', item.product_id);
          }
        }
      }

      toast.success(`Sale recorded with ${validItems.length} item(s)`);
      form.reset();
      setLineItems([newLineItem()]);
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
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Record Sale
          </DialogTitle>
          <DialogDescription>
            Record a sale with one or more items for {selectedCompany?.code || 'selected company'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Order Header */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="order_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order Number *</FormLabel>
                    <FormControl>
                      <Input placeholder="ORD-12345" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="marketplace"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Marketplace/Source</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="shopify">Shopify</SelectItem>
                        <SelectItem value="amazon">Amazon</SelectItem>
                        <SelectItem value="bestbuy">Best Buy</SelectItem>
                        <SelectItem value="ebay">eBay</SelectItem>
                        <SelectItem value="facebook">Facebook Marketplace</SelectItem>
                        <SelectItem value="kijiji">Kijiji</SelectItem>
                        <SelectItem value="temu">Temu</SelectItem>
                        <SelectItem value="walmart">Walmart</SelectItem>
                        <SelectItem value="private">Private Sale</SelectItem>
                        <SelectItem value="other">Other / Offline</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Line Items Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Line Items</span>
                  <Badge variant="secondary" className="text-xs">{lineItems.length}</Badge>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {lineItems.map((item, index) => (
                  <div key={item.id} className="border rounded-lg p-3 space-y-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Item {index + 1}
                      </span>
                      {lineItems.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => removeLineItem(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {/* Inventory Link */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground block">
                        Link to Inventory (Optional)
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Device</span>
                          <DeviceSearchCombobox
                            value={item.device_id}
                            onSelect={(device) => handleDeviceSelect(item.id, device)}
                            excludeIds={linkedDeviceIds.filter(id => id !== item.device_id)}
                            disabled={!!item.product_id}
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Product</span>
                          <ProductSearchCombobox
                            value={item.product_id}
                            onSelect={(product) => handleProductSelect(item.id, product)}
                            disabled={!!item.device_id}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Description & Pricing */}
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-5">
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                        <Input
                          placeholder="Item description"
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Qty</label>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateLineItem(item.id, { quantity: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Unit Price</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unit_price || ''}
                          onChange={(e) => updateLineItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Tax</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.tax_amount || ''}
                          onChange={(e) => updateLineItem(item.id, { tax_amount: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="col-span-1 flex items-end">
                        <p className="text-sm font-mono font-medium pb-2">
                          {formatCurrency(item.quantity * item.unit_price)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Order Totals */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="shipping_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shipping Cost</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="marketplace_fees"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Marketplace Fees</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Summary */}
            <div className="rounded-lg border p-3 space-y-1 bg-muted/30">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal ({lineItems.length} items)</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span>{formatCurrency(totalTax)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping</span>
                <span>{formatCurrency(shippingCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Marketplace Fees</span>
                <span className="text-destructive">-{formatCurrency(marketplaceFees)}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between font-medium">
                <span>Grand Total</span>
                <span>{formatCurrency(grandTotal)}</span>
              </div>
            </div>

            {/* Customer Info */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="shipping_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shipping Address</FormLabel>
                  <FormControl>
                    <Textarea placeholder="123 Main St, City, Province, Postal Code" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="shipping_province"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Province</FormLabel>
                  <FormDescription className="text-[11px]">Used for tax calculation</FormDescription>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select province" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PROVINCES.map(p => (
                        <SelectItem key={p.code} value={p.code}>{p.name} ({p.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Additional notes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Recording...' : `Record Sale (${lineItems.length} item${lineItems.length > 1 ? 's' : ''})`}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
