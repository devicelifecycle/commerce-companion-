import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Settings, Save, Loader2 } from 'lucide-react';

const appSettingsSchema = z.object({
  low_inventory_threshold: z.number().min(1).max(100),
  large_expense_threshold: z.number().min(0),
  auto_approve_expenses_under: z.number().min(0),
  default_payment_terms: z.number().min(0).max(365),
  default_ves_allocation: z.number().min(0).max(100),
  default_tgw_allocation: z.number().min(0).max(100),
});

type AppSettingsFormData = z.infer<typeof appSettingsSchema>;

export function AppSettings() {
  const { selectedCompany, isSuperAdmin, currentRole } = useCompany();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canEdit = isSuperAdmin || currentRole === 'company_admin';

  const form = useForm<AppSettingsFormData>({
    resolver: zodResolver(appSettingsSchema),
    defaultValues: {
      low_inventory_threshold: 5,
      large_expense_threshold: 1000,
      auto_approve_expenses_under: 100,
      default_payment_terms: 30,
      default_ves_allocation: 50,
      default_tgw_allocation: 50,
    },
  });

  useEffect(() => {
    if (selectedCompany) {
      fetchSettings();
    }
  }, [selectedCompany]);

  const fetchSettings = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
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
        }, { onConflict: 'company_id' });

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

  // Sync TGW allocation when VES changes
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Application Settings
        </CardTitle>
        <CardDescription>
          Configure thresholds and default values
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="low_inventory_threshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Low Inventory Alert Threshold</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field} 
                        onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                        disabled={!canEdit} 
                      />
                    </FormControl>
                    <FormDescription>
                      Alert when stock falls below this number
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="default_payment_terms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Payment Terms (days)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field} 
                        onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                        disabled={!canEdit} 
                      />
                    </FormControl>
                    <FormDescription>
                      Default due date for invoices
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="large_expense_threshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Large Expense Threshold ($)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01"
                        {...field} 
                        onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                        disabled={!canEdit} 
                      />
                    </FormControl>
                    <FormDescription>
                      Expenses above this require approval
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="auto_approve_expenses_under"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Auto-Approve Expenses Under ($)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01"
                        {...field} 
                        onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                        disabled={!canEdit} 
                      />
                    </FormControl>
                    <FormDescription>
                      Expenses below this are auto-approved
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="border-t pt-6">
              <h4 className="font-medium mb-4">Default Expense Allocation</h4>
              <FormField
                control={form.control}
                name="default_ves_allocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Virtual eShop / Tech Genius Warehouse Split</FormLabel>
                    <div className="space-y-4">
                      <Slider
                        value={[field.value]}
                        onValueChange={([v]) => field.onChange(v)}
                        min={0}
                        max={100}
                        step={5}
                        disabled={!canEdit}
                        className="mt-2"
                      />
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Virtual eShop: {field.value}%</span>
                        <span className="font-medium">Tech Genius Warehouse: {100 - field.value}%</span>
                      </div>
                    </div>
                    <FormDescription>
                      Default allocation for shared expenses between companies
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {canEdit && (
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Settings
                </Button>
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
