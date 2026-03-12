import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Settings, Save, Loader2 } from 'lucide-react';

const PROVINCES = [
  { value: 'AB', label: 'Alberta' },
  { value: 'BC', label: 'British Columbia' },
  { value: 'MB', label: 'Manitoba' },
  { value: 'NB', label: 'New Brunswick' },
  { value: 'NL', label: 'Newfoundland & Labrador' },
  { value: 'NS', label: 'Nova Scotia' },
  { value: 'NT', label: 'Northwest Territories' },
  { value: 'NU', label: 'Nunavut' },
  { value: 'ON', label: 'Ontario' },
  { value: 'PE', label: 'Prince Edward Island' },
  { value: 'QC', label: 'Quebec' },
  { value: 'SK', label: 'Saskatchewan' },
  { value: 'YT', label: 'Yukon' },
];

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
];

const appSettingsSchema = z.object({
  low_inventory_threshold: z.number().min(1).max(100),
  large_expense_threshold: z.number().min(0),
  auto_approve_expenses_under: z.number().min(0),
  default_payment_terms: z.number().min(0).max(365),
  default_ves_allocation: z.number().min(0).max(100),
  default_tgw_allocation: z.number().min(0).max(100),
  default_tax_province: z.string(),
  currency_format: z.string(),
  auto_generate_sku: z.boolean(),
  default_fulfillment_channel: z.string(),
  session_timeout_minutes: z.number().min(5).max(1440),
  reorder_point_threshold: z.number().min(0).max(100),
  default_invoice_notes: z.string().optional(),
  fiscal_year_start_month: z.number().min(1).max(12),
});

type AppSettingsFormData = z.infer<typeof appSettingsSchema>;

const DEFAULTS: AppSettingsFormData = {
  low_inventory_threshold: 5,
  large_expense_threshold: 1000,
  auto_approve_expenses_under: 100,
  default_payment_terms: 30,
  default_ves_allocation: 50,
  default_tgw_allocation: 50,
  default_tax_province: 'ON',
  currency_format: 'en-CA',
  auto_generate_sku: true,
  default_fulfillment_channel: 'local',
  session_timeout_minutes: 480,
  reorder_point_threshold: 3,
  default_invoice_notes: '',
  fiscal_year_start_month: 1,
};

export function AppSettings() {
  const { selectedCompany, isSuperAdmin, currentRole } = useCompany();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canEdit = isSuperAdmin || currentRole === 'admin';

  const form = useForm<AppSettingsFormData>({
    resolver: zodResolver(appSettingsSchema),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (selectedCompany) fetchSettings();
  }, [selectedCompany]);

  const fetchSettings = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('*')
        .eq('company_id', selectedCompany.id)
        .single();

      if (data) {
        form.reset({
          low_inventory_threshold: data.low_inventory_threshold ?? 5,
          large_expense_threshold: Number(data.large_expense_threshold) || 1000,
          auto_approve_expenses_under: Number(data.auto_approve_expenses_under) || 100,
          default_payment_terms: data.default_payment_terms ?? 30,
          default_ves_allocation: Number(data.default_ves_allocation) || 50,
          default_tgw_allocation: Number(data.default_tgw_allocation) || 50,
          default_tax_province: (data as any).default_tax_province ?? 'ON',
          currency_format: (data as any).currency_format ?? 'en-CA',
          auto_generate_sku: (data as any).auto_generate_sku ?? true,
          default_fulfillment_channel: (data as any).default_fulfillment_channel ?? 'local',
          session_timeout_minutes: (data as any).session_timeout_minutes ?? 480,
          reorder_point_threshold: (data as any).reorder_point_threshold ?? 3,
          default_invoice_notes: (data as any).default_invoice_notes ?? '',
          fiscal_year_start_month: (data as any).fiscal_year_start_month ?? 1,
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (data: AppSettingsFormData) => {
    if (!selectedCompany) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          company_id: selectedCompany.id,
          ...data,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'company_id' });

      if (error) throw error;
      toast.success('App settings saved');
    } catch (error: any) {
      console.error('Error saving:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const vesAllocation = form.watch('default_ves_allocation');

  useEffect(() => {
    form.setValue('default_tgw_allocation', 100 - vesAllocation);
  }, [vesAllocation, form]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Inventory & Procurement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Inventory & Procurement
            </CardTitle>
            <CardDescription>Thresholds and defaults for inventory management</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <FormField control={form.control} name="low_inventory_threshold" render={({ field }) => (
                <FormItem>
                  <FormLabel>Low Inventory Alert Threshold</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} disabled={!canEdit} />
                  </FormControl>
                  <FormDescription>Alert when stock falls below this number</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="reorder_point_threshold" render={({ field }) => (
                <FormItem>
                  <FormLabel>Reorder Point Threshold</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} disabled={!canEdit} />
                  </FormControl>
                  <FormDescription>Trigger reorder suggestion at this stock level</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="auto_generate_sku" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Auto-Generate SKU</FormLabel>
                    <FormDescription>Automatically create SKU codes for new devices</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!canEdit} />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="default_fulfillment_channel" render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Fulfillment Channel</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!canEdit}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="local">Local / Warehouse</SelectItem>
                      <SelectItem value="fba">FBA (Fulfilled by Amazon)</SelectItem>
                      <SelectItem value="fbm">FBM (Fulfilled by Merchant)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>Default channel for new inventory items</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </CardContent>
        </Card>

        {/* Financial & Tax */}
        <Card>
          <CardHeader>
            <CardTitle>Financial & Tax</CardTitle>
            <CardDescription>Tax, currency, and fiscal year configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <FormField control={form.control} name="default_tax_province" render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Tax Province</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!canEdit}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {PROVINCES.map(p => (
                        <SelectItem key={p.value} value={p.value}>{p.label} ({p.value})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Province used for tax rate calculations</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="fiscal_year_start_month" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fiscal Year Start Month</FormLabel>
                  <Select onValueChange={v => field.onChange(parseInt(v))} value={String(field.value)} disabled={!canEdit}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {MONTHS.map(m => (
                        <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>First month of your fiscal year</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="currency_format" render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency Locale</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!canEdit}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="en-CA">CAD (en-CA)</SelectItem>
                      <SelectItem value="en-US">USD (en-US)</SelectItem>
                      <SelectItem value="fr-CA">CAD French (fr-CA)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>Currency display format across the app</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="default_payment_terms" render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Payment Terms (days)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} disabled={!canEdit} />
                  </FormControl>
                  <FormDescription>Default due date for invoices</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </CardContent>
        </Card>

        {/* Expenses & Approval */}
        <Card>
          <CardHeader>
            <CardTitle>Expenses & Approval</CardTitle>
            <CardDescription>Thresholds and allocation defaults for expenses</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <FormField control={form.control} name="large_expense_threshold" render={({ field }) => (
                <FormItem>
                  <FormLabel>Large Expense Threshold ($)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} disabled={!canEdit} />
                  </FormControl>
                  <FormDescription>Expenses above this require approval</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="auto_approve_expenses_under" render={({ field }) => (
                <FormItem>
                  <FormLabel>Auto-Approve Expenses Under ($)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} disabled={!canEdit} />
                  </FormControl>
                  <FormDescription>Expenses below this are auto-approved</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <Separator />

            <FormField control={form.control} name="default_ves_allocation" render={({ field }) => (
              <FormItem>
                <FormLabel>Default Expense Allocation Split</FormLabel>
                <div className="space-y-4">
                  <Slider value={[field.value]} onValueChange={([v]) => field.onChange(v)} min={0} max={100} step={5} disabled={!canEdit} className="mt-2" />
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Virtual eShop: {field.value}%</span>
                    <span className="font-medium">Tech Genius Warehouse: {100 - field.value}%</span>
                  </div>
                </div>
                <FormDescription>Default allocation for shared expenses between companies</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {/* Invoices & General */}
        <Card>
          <CardHeader>
            <CardTitle>Invoices & General</CardTitle>
            <CardDescription>Invoice defaults and session configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <FormField control={form.control} name="session_timeout_minutes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Session Timeout (minutes)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 480)} disabled={!canEdit} />
                  </FormControl>
                  <FormDescription>Auto-logout after this many minutes of inactivity</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="default_invoice_notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Default Invoice Notes</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="e.g. Thank you for your business! Payment due within terms above." disabled={!canEdit} rows={3} />
                </FormControl>
                <FormDescription>Automatically added to new invoices</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save All Settings
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
