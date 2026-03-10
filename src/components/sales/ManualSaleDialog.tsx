import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { ShoppingBag, Smartphone } from 'lucide-react';

interface ManualSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface Device {
  id: string;
  brand: string;
  model: string;
  imei: string | null;
  cost_price: number;
  company_id: string;
}

const manualSaleSchema = z.object({
  order_number: z.string().min(1, 'Order number is required'),
  marketplace: z.enum(['shopify', 'amazon', 'bestbuy', 'other']),
  device_id: z.string().optional(),
  sale_price: z.number().min(0.01, 'Sale price must be greater than 0'),
  shipping_cost: z.number().min(0).default(0),
  marketplace_fees: z.number().min(0).default(0),
  tax_amount: z.number().min(0).default(0),
  customer_name: z.string().optional(),
  customer_email: z.string().email().optional().or(z.literal('')),
  shipping_address: z.string().optional(),
  notes: z.string().optional(),
});

type ManualSaleFormData = z.infer<typeof manualSaleSchema>;

export function ManualSaleDialog({ open, onOpenChange, onSuccess }: ManualSaleDialogProps) {
  const { user } = useAuth();
  const { selectedCompany, hasPermission } = useCompany();
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);

  const form = useForm<ManualSaleFormData>({
    resolver: zodResolver(manualSaleSchema),
    defaultValues: {
      order_number: '',
      marketplace: 'other',
      sale_price: 0,
      shipping_cost: 0,
      marketplace_fees: 0,
      tax_amount: 0,
      customer_name: '',
      customer_email: '',
      shipping_address: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (open && selectedCompany) {
      loadDevices();
    }
  }, [open, selectedCompany]);

  const loadDevices = async () => {
    if (!selectedCompany) return;

    const { data, error } = await supabase
      .from('devices')
      .select('id, brand, model, imei, cost_price, company_id')
      .eq('status', 'in_stock')
      .eq('company_id', selectedCompany.id)
      .order('brand');

    if (!error && data) {
      setDevices(data as Device[]);
    }
  };

  const handleSubmit = async (data: ManualSaleFormData) => {
    if (!selectedCompany) {
      toast.error('Please select a company');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('sales').insert({
        order_number: data.order_number,
        marketplace: data.marketplace,
        sale_price: data.sale_price,
        shipping_cost: data.shipping_cost,
        marketplace_fees: data.marketplace_fees,
        tax_amount: data.tax_amount,
        sale_date: new Date().toISOString(),
        customer_name: data.customer_name || null,
        customer_email: data.customer_email || null,
        shipping_address: data.shipping_address || null,
        notes: data.notes || null,
        device_id: data.device_id && data.device_id !== 'none' ? data.device_id : null,
        company_id: selectedCompany.id,
        created_by: user?.id,
      });

      if (error) throw error;

      toast.success('Sale recorded successfully');
      form.reset();
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error recording sale:', error);
      toast.error(error.message || 'Failed to record sale');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Record Manual Sale
          </DialogTitle>
          <DialogDescription>
            Record an offline sale or manual order for {selectedCompany?.code || 'selected company'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                        <SelectItem value="other">Other / Offline</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="device_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    Link to Device (Optional)
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a device from inventory" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No device</SelectItem>
                      {devices.map((device) => (
                        <SelectItem key={device.id} value={device.id}>
                          {device.brand} {device.model} 
                          {device.imei ? ` (${device.imei})` : ''} 
                          - Cost: {formatCurrency(device.cost_price)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Link this sale to an inventory item for profit calculation
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sale_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sale Price *</FormLabel>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
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

              <FormField
                control={form.control}
                name="tax_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax Amount</FormLabel>
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
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Recording...' : 'Record Sale'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
