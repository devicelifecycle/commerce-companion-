import { useState } from 'react';
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
import { ArrowRightLeft, Building2 } from 'lucide-react';

interface IntercompanySaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const intercompanySchema = z.object({
  from_company: z.enum(['VES', 'TGW']),
  to_company: z.enum(['VES', 'TGW']),
  device_id: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  unit_price: z.number().min(0, 'Price must be positive'),
  notes: z.string().optional(),
}).refine(data => data.from_company !== data.to_company, {
  message: 'Source and destination companies must be different',
  path: ['to_company'],
});

type IntercompanyFormData = z.infer<typeof intercompanySchema>;

export function IntercompanySaleDialog({ open, onOpenChange, onSuccess }: IntercompanySaleDialogProps) {
  const { user } = useAuth();
  const { companies } = useCompany();
  const [loading, setLoading] = useState(false);

  const form = useForm<IntercompanyFormData>({
    resolver: zodResolver(intercompanySchema),
    defaultValues: {
      from_company: 'VES',
      to_company: 'TGW',
      description: '',
      quantity: 1,
      unit_price: 0,
      notes: '',
    },
  });

  const handleSubmit = async (data: IntercompanyFormData) => {
    setLoading(true);
    try {
      const fromCompany = companies.find(c => c.code === data.from_company);
      const toCompany = companies.find(c => c.code === data.to_company);

      if (!fromCompany || !toCompany) {
        throw new Error('Companies not found');
      }

      const totalPrice = data.quantity * data.unit_price;
      const orderNumber = `IC-${data.from_company}-${data.to_company}-${Date.now()}`;

      // Create sale record for selling company
      const { error } = await supabase.from('sales').insert({
        order_number: orderNumber,
        marketplace: 'other',
        sale_price: totalPrice,
        shipping_cost: 0,
        marketplace_fees: 0,
        tax_amount: 0,
        sale_date: new Date().toISOString(),
        customer_name: `${data.to_company} (Intercompany)`,
        notes: `Intercompany Sale: ${data.description} | From: ${data.from_company} To: ${data.to_company} | Qty: ${data.quantity} @ $${data.unit_price} each${data.notes ? ` | Notes: ${data.notes}` : ''}`,
        device_id: data.device_id || null,
        company_id: fromCompany.id,
        created_by: user?.id,
        is_marketplace_remitted: false,
        accounting_status: 'unprocessed',
      });

      if (error) throw error;

      // Trigger dual-sided intercompany accounting via edge function
      try {
        const { error: icError } = await supabase.functions.invoke('process-intercompany-accounting', {
          body: {
            device_id: data.device_id || null,
            from_company_id: fromCompany.id,
            to_company_id: toCompany.id,
            transfer_price: totalPrice,
            reason: `Intercompany sale: ${data.description}`,
          },
        });

        if (icError) {
          console.error('Intercompany accounting error:', icError);
          toast.error('Sale recorded but dual-sided accounting entries could not be created');
        } else {
          toast.success('Intercompany sale recorded with dual-sided accounting');
        }
      } catch (accErr) {
        console.error('Error calling intercompany accounting:', accErr);
        toast.success('Intercompany sale recorded');
      }

      form.reset();
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error recording intercompany sale:', error);
      toast.error(error.message || 'Failed to record sale');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Record Intercompany Sale
          </DialogTitle>
          <DialogDescription>
            Record a sale between Virtual eShop and Tech Genius Warehouse.
            This will create dual-sided AR/AP entries and journal entries for both companies.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="from_company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling Company</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="VES">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Virtual eShop
                          </div>
                        </SelectItem>
                        <SelectItem value="TGW">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Tech Genius Warehouse
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="to_company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Buying Company</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="VES">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Virtual eShop
                          </div>
                        </SelectItem>
                        <SelectItem value="TGW">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Tech Genius Warehouse
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="iPhone 15 Pro Max 256GB" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field} 
                        onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="unit_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Price ($)</FormLabel>
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

            <div className="rounded-lg border p-3 bg-muted/50">
              <p className="text-sm font-medium">
                Total: ${(form.watch('quantity') * form.watch('unit_price')).toFixed(2)}
              </p>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
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
