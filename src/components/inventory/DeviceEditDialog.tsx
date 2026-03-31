import { useState, useEffect } from 'react';
import { normalizeBrand, normalizeModel, modelFuzzyKey } from '@/lib/modelNormalization';
import { emitRefetch } from '@/hooks/useDataRefetch';
import { supabase } from '@/integrations/supabase/client';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useCompany } from '@/contexts/CompanyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { AlertTriangle, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type DeviceCondition = 'new' | 'refurbished' | 'used' | 'damaged';
type DeviceStatus = 'in_stock' | 'reserved' | 'sold' | 'returned' | 'hold_for_refurbishment';

const CATEGORIES = ['phone', 'laptop', 'tablet', 'accessory', 'smartwatch', 'other'];

interface Device {
  id: string;
  imei: string | null;
  sku: string | null;
  category: string;
  model: string;
  brand: string;
  storage: string | null;
  color: string | null;
  condition: string;
  status: string;
  cost_price: number;
  sale_price: number | null;
  supplier_id: string | null;
  purchase_date: string | null;
  warehouse_location: string | null;
  notes: string | null;
}

interface DeviceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: Device | null;
  onSuccess: () => void;
}

export function DeviceEditDialog({ open, onOpenChange, device, onSuccess }: DeviceEditDialogProps) {
  const { logEvent } = useAuditLog();
  const { selectedCompany } = useCompany();
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const [form, setForm] = useState({
    imei: '', sku: '', category: 'phone', model: '', brand: '', storage: '', color: '',
    condition: 'new' as DeviceCondition, status: 'in_stock' as DeviceStatus,
    cost_price: '', sale_price: '', supplier_id: '', purchase_date: '', warehouse_location: '', notes: '',
    management_labor_cost: '', management_labor_hours: '', cosmetic_grade: '',
  });

  useEffect(() => {
    if (device && open) {
      setForm({
        imei: device.imei || '', sku: device.sku || '', category: device.category || 'phone',
        model: device.model, brand: device.brand, storage: device.storage || '', color: device.color || '',
        condition: device.condition as DeviceCondition, status: device.status as DeviceStatus,
        cost_price: device.cost_price.toString(), sale_price: device.sale_price?.toString() || '',
        supplier_id: device.supplier_id || '', purchase_date: device.purchase_date || '',
        warehouse_location: device.warehouse_location || '', notes: device.notes || '',
        management_labor_cost: (device as any).management_labor_cost?.toString() || '',
        management_labor_hours: (device as any).management_labor_hours?.toString() || '',
        cosmetic_grade: (device as any).cosmetic_grade || '',
      });
    }
  }, [device, open]);

  useEffect(() => {
    if (open) {
      let query = supabase.from('suppliers').select('id, name').order('name');
      if (selectedCompany) query = query.eq('company_id', selectedCompany.id);
      query.then(({ data }) => setSuppliers(data || []));
    }
  }, [open, selectedCompany]);

  // Duplicate check
  useEffect(() => {
    if (!form.brand || !form.model) { setDuplicateWarning(null); return; }
    const key = modelFuzzyKey(normalizeBrand(form.brand), normalizeModel(form.model));
    const checkDupe = async () => {
      const { count } = await supabase.from('devices').select('id', { count: 'exact', head: true })
        .neq('id', device?.id || '')
        .ilike('brand', normalizeBrand(form.brand))
        .ilike('model', normalizeModel(form.model));
      if (count && count > 0) {
        setDuplicateWarning(`${count} similar device(s) already exist with this brand/model`);
      } else {
        setDuplicateWarning(null);
      }
    };
    const t = setTimeout(checkDupe, 400);
    return () => clearTimeout(t);
  }, [form.brand, form.model, device?.id]);

  const handleSubmit = async () => {
    if (!device) return;
    try {
      const { error } = await supabase.from('devices').update({
        imei: form.imei || null, sku: form.sku || null, category: form.category,
        model: form.model, brand: form.brand, storage: form.storage || null,
        color: form.color || null, condition: form.condition, status: form.status,
        cost_price: parseFloat(form.cost_price), sale_price: form.sale_price ? parseFloat(form.sale_price) : null,
        supplier_id: form.supplier_id || null, purchase_date: form.purchase_date || null,
        warehouse_location: form.warehouse_location || null, notes: form.notes || null,
        management_labor_cost: form.management_labor_cost ? parseFloat(form.management_labor_cost) : null,
        management_labor_hours: form.management_labor_hours ? parseFloat(form.management_labor_hours) : null,
      } as any).eq('id', device.id);
      if (error) throw error;
      logEvent({ action: 'UPDATE' as any, tableName: 'devices', recordId: device.id, module: 'Inventory', notes: `Updated ${form.brand} ${form.model}` });
      toast.success('Device updated');
      emitRefetch('inventory');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update device');
    }
  };

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Device</DialogTitle>
          <DialogDescription>Update device information</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
          {duplicateWarning && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{duplicateWarning}</span>
            </div>
          )}

          {form.brand && form.model && (
            <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
              Will be saved as: <span className="font-medium text-foreground">{normalizeBrand(form.brand)} {normalizeModel(form.model)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Brand *</Label>
              <Input value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Apple, Samsung..." />
            </div>
            <div className="space-y-2">
              <Label>Model *</Label>
              <Input value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="iPhone 15 Pro" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => set('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="SKU-12345" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>IMEI / Serial Number</Label>
              <Input value={form.imei} onChange={(e) => set('imei', e.target.value)} placeholder="123456789012345" />
            </div>
            <div className="space-y-2">
              <Label>Storage</Label>
              <Input value={form.storage} onChange={(e) => set('storage', e.target.value)} placeholder="256GB" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Color</Label>
              <Input value={form.color} onChange={(e) => set('color', e.target.value)} placeholder="Space Black" />
            </div>
            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={(v: DeviceCondition) => set('condition', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="refurbished">Refurbished</SelectItem>
                  <SelectItem value="used">Used</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cost Price *</Label>
              <Input type="number" value={form.cost_price} onChange={(e) => set('cost_price', e.target.value)} placeholder="500.00" />
            </div>
            <div className="space-y-2">
              <Label>Sale Price</Label>
              <Input type="number" value={form.sale_price} onChange={(e) => set('sale_price', e.target.value)} placeholder="699.00" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select value={form.supplier_id} onValueChange={(v) => set('supplier_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v: DeviceStatus) => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_stock">In Stock</SelectItem>
                  <SelectItem value="reserved">Reserved</SelectItem>
                  <SelectItem value="hold_for_refurbishment">Hold for Refurbishment</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Purchase Date</Label>
              <Input type="date" value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Warehouse Location</Label>
              <Input value={form.warehouse_location} onChange={(e) => set('warehouse_location', e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Additional notes..." />
          </div>

          {/* Management Labor Section */}
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-semibold">Management Labor Estimate</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Used for management profit calculations only. Does not affect accounting books or device cost.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Labor Hours</Label>
                <Input type="number" step="0.25" value={form.management_labor_hours} onChange={(e) => set('management_labor_hours', e.target.value)} placeholder="e.g. 1.5" />
              </div>
              <div className="space-y-2">
                <Label>Labor Cost ($)</Label>
                <Input type="number" step="0.01" value={form.management_labor_cost} onChange={(e) => set('management_labor_cost', e.target.value)} placeholder="e.g. 25.00" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!form.brand || !form.model || !form.cost_price}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
