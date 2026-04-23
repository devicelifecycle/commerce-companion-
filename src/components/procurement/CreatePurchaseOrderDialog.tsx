import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { emitRefetch } from '@/hooks/useDataRefetch';
import { ClipboardList, Plus, Trash2, Package, Wrench, Info, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { SupplierSearchCombobox } from '@/components/suppliers/SupplierSearchCombobox';
import { ProductFreeTextCombobox } from '@/components/procurement/ProductFreeTextCombobox';

interface CreatePurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface Supplier {
  id: string;
  name: string;
  supplier_code: string;
}

interface Company {
  id: string;
  name: string;
  code: string;
}

type TaxStatus = 'zero_rated' | 'gst_paid' | 'hst_paid' | 'tax_inclusive' | 'gst_pst';
// Devices are added through the dedicated Inventory Import section, NOT through POs.
// Purchase Orders are limited to bulk products and repair parts.
type ItemType = 'product' | 'repair_parts';

const TAX_OPTIONS: { value: TaxStatus; label: string }[] = [
  { value: 'zero_rated', label: 'Zero-Rated' },
  { value: 'gst_paid', label: 'GST 5%' },
  { value: 'hst_paid', label: 'HST 13%' },
  { value: 'gst_pst', label: 'GST+PST 12%' },
  { value: 'tax_inclusive', label: 'Incl. 13%' },
];

const ITEM_TYPE_CONFIG: { value: ItemType; label: string; icon: typeof Package; color: string; description: string }[] = [
  { value: 'product', label: 'Product', icon: Package, color: 'text-[hsl(var(--success))]', description: 'Bulk/generic items. Type a name or SKU; if it matches an existing product the SKU will be reused.' },
  { value: 'repair_parts', label: 'Repair Parts', icon: Wrench, color: 'text-[hsl(var(--warning))]', description: 'Parts inventory. Type a name or SKU; existing parts will be suggested to avoid duplicate SKUs.' },
];

function calcTax(unitCost: number, quantity: number, taxStatus: TaxStatus) {
  const lineTotal = unitCost * quantity;
  switch (taxStatus) {
    case 'zero_rated':
      return { gst: 0, pst: 0, preTax: lineTotal };
    case 'gst_paid':
      return { gst: parseFloat((lineTotal * 0.05).toFixed(2)), pst: 0, preTax: lineTotal };
    case 'hst_paid':
      return { gst: parseFloat((lineTotal * 0.13).toFixed(2)), pst: 0, preTax: lineTotal };
    case 'gst_pst':
      return { gst: parseFloat((lineTotal * 0.05).toFixed(2)), pst: parseFloat((lineTotal * 0.07).toFixed(2)), preTax: lineTotal };
    case 'tax_inclusive': {
      const preTax = parseFloat((lineTotal / 1.13).toFixed(2));
      const tax = parseFloat((lineTotal - preTax).toFixed(2));
      return { gst: tax, pst: 0, preTax };
    }
    default:
      return { gst: 0, pst: 0, preTax: lineTotal };
  }
}

interface POLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_cost: number;
  tax_status: TaxStatus;
  item_type: ItemType;
  product_id: string | null;
  matched_sku: string | null;
  /** User-supplied SKU/UPC for a brand-new item (only used when product_id is null). */
  new_sku: string;
}

let poLineCounter = 0;
function newPOLine(): POLineItem {
  poLineCounter++;
  return {
    id: `po-line-${poLineCounter}`,
    description: '',
    quantity: 1,
    unit_cost: 0,
    tax_status: 'hst_paid',
    item_type: 'product',
    product_id: null,
    matched_sku: null,
    new_sku: '',
  };
}

/**
 * SKU/UPC validation rules:
 *  - Optional (blank is fine — it auto-generates on receive)
 *  - 3–40 chars
 *  - Only A–Z, 0–9, dash, underscore, dot (UPCs are pure digits, our SKUs use dashes)
 */
const SKU_PATTERN = /^[A-Za-z0-9._-]+$/;
function validateSkuFormat(sku: string): string | null {
  const trimmed = sku.trim();
  if (!trimmed) return null; // optional
  if (trimmed.length < 3) return 'SKU must be at least 3 characters';
  if (trimmed.length > 40) return 'SKU must be 40 characters or fewer';
  if (!SKU_PATTERN.test(trimmed)) return 'Only letters, numbers, dash, underscore, and dot allowed';
  return null;
}

/** Async check result per line id. */
type SkuCheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok' }
  | { status: 'duplicate'; where: 'product' | 'repair_part'; name: string; sku: string };

export function CreatePurchaseOrderDialog({ open, onOpenChange, onSuccess }: CreatePurchaseOrderDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');

  const [formData, setFormData] = useState({
    po_number: '',
    supplier_id: '',
    supplier_name: '',
    po_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: null as string | null,
    payment_method: '',
    notes: '',
  });

  const [lineItems, setLineItems] = useState<POLineItem[]>([newPOLine()]);

  /** Per-line async SKU existence check state, keyed by line id. */
  const [skuChecks, setSkuChecks] = useState<Record<string, SkuCheckState>>({});
  const skuCheckTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Debounced existence check: when a user types a SKU/UPC for a NEW item,
  // see if it already belongs to a product or repair part in this company.
  useEffect(() => {
    // Cancel timers for lines that no longer exist
    Object.keys(skuCheckTimers.current).forEach(lineId => {
      if (!lineItems.find(li => li.id === lineId)) {
        clearTimeout(skuCheckTimers.current[lineId]);
        delete skuCheckTimers.current[lineId];
      }
    });

    lineItems.forEach(li => {
      // Only check when user typed a SKU AND line is not already linked to a product
      if (li.matched_sku || !li.new_sku.trim()) {
        if (skuChecks[li.id]?.status !== 'idle' && skuChecks[li.id] !== undefined) {
          setSkuChecks(prev => ({ ...prev, [li.id]: { status: 'idle' } }));
        }
        return;
      }
      // Format error: skip async check
      if (validateSkuFormat(li.new_sku)) return;

      // Debounce per-line
      if (skuCheckTimers.current[li.id]) clearTimeout(skuCheckTimers.current[li.id]);
      setSkuChecks(prev => ({ ...prev, [li.id]: { status: 'checking' } }));
      skuCheckTimers.current[li.id] = setTimeout(async () => {
        const trimmed = li.new_sku.trim();
        const table = li.item_type === 'product' ? 'products' : 'repair_parts';
        let q: any = supabase.from(table as any).select('id, name, sku').eq('sku', trimmed).limit(1);
        if (selectedCompanyId) q = q.eq('company_id', selectedCompanyId);
        const { data } = await q;
        if (data && data.length > 0) {
          setSkuChecks(prev => ({
            ...prev,
            [li.id]: {
              status: 'duplicate',
              where: li.item_type === 'product' ? 'product' : 'repair_part',
              name: data[0].name,
              sku: trimmed,
            },
          }));
        } else {
          setSkuChecks(prev => ({ ...prev, [li.id]: { status: 'ok' } }));
        }
      }, 350);
    });

    return () => {
      // (timers are cleared lazily; no leak because they're keyed)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItems.map(li => `${li.id}:${li.new_sku}:${li.item_type}:${li.matched_sku ?? ''}`).join('|'), selectedCompanyId]);

  /** Format-error string per line (sync). */
  const skuFormatErrors = useMemo(() => {
    const out: Record<string, string | null> = {};
    lineItems.forEach(li => {
      out[li.id] = li.matched_sku ? null : validateSkuFormat(li.new_sku);
    });
    return out;
  }, [lineItems]);

  /** Within-PO duplicate detection by typed SKU (case-insensitive). */
  const skuInPoDuplicates = useMemo(() => {
    const out: Record<string, number | null> = {};
    const seen = new Map<string, number>(); // sku -> first line index
    lineItems.forEach((li, idx) => {
      const sku = (li.matched_sku || li.new_sku || '').trim().toLowerCase();
      if (!sku) { out[li.id] = null; return; }
      const prev = seen.get(sku);
      if (prev !== undefined) {
        out[li.id] = prev + 1; // 1-based line number
      } else {
        seen.set(sku, idx);
        out[li.id] = null;
      }
    });
    return out;
  }, [lineItems]);

  /** Whether ANY line currently has a blocking SKU error. */
  const hasSkuErrors = useMemo(() => {
    return lineItems.some(li => {
      if (skuFormatErrors[li.id]) return true;
      if (skuInPoDuplicates[li.id]) return true;
      const check = skuChecks[li.id];
      if (check?.status === 'duplicate') return true;
      return false;
    });
  }, [lineItems, skuFormatErrors, skuInPoDuplicates, skuChecks]);

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);

  useEffect(() => {
    if (open) loadCompanies();
  }, [open]);

  useEffect(() => {
    if (selectedCompanyId) {
      loadSuppliers();
      generatePONumber();
    }
  }, [selectedCompanyId]);

  const loadCompanies = async () => {
    const { data } = await supabase.from('companies').select('id, name, code').order('name');
    if (data) {
      setCompanies(data);
      if (data.length === 1) setSelectedCompanyId(data[0].id);
    }
  };

  const loadSuppliers = async () => {
    let query = supabase.from('suppliers').select('id, name, supplier_code').order('name');
    if (selectedCompanyId) {
      query = query.or(`company_id.eq.${selectedCompanyId},company_id.is.null`);
    }
    const { data } = await query;
    if (data) setSuppliers(data);
  };

  const generatePONumber = async () => {
    const prefix = selectedCompany?.code || 'PO';
    const dateStr = format(new Date(), 'yyyyMMdd');
    const { count } = await supabase
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true });
    const num = (count || 0) + 1;
    setFormData(prev => ({ ...prev, po_number: `${prefix}-${dateStr}-${String(num).padStart(3, '0')}` }));
  };

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers;
    const s = supplierSearch.toLowerCase();
    return suppliers.filter(sup =>
      sup.name.toLowerCase().includes(s) || sup.supplier_code.toLowerCase().includes(s)
    );
  }, [suppliers, supplierSearch]);

  const addLine = () => setLineItems(prev => [...prev, newPOLine()]);
  const removeLine = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter(li => li.id !== id));
  };
  const updateLine = (id: string, updates: Partial<POLineItem>) => {
    // Guard: if a user just linked this line to an existing product/part, make
    // sure no OTHER line on this PO is already linked to the same id. Two
    // lines for the same SKU would create accounting + receiving ambiguity.
    if (updates.product_id) {
      const dup = lineItems.find(li => li.id !== id && li.product_id === updates.product_id);
      if (dup) {
        toast.error(
          `"${updates.description || dup.description}" is already on line ${lineItems.indexOf(dup) + 1}. Increase that line's quantity instead.`,
        );
        // Clear the attempted match so the user can re-type a different item
        setLineItems(prev => prev.map(li => li.id === id ? { ...li, product_id: null, description: '' } : li));
        return;
      }
    }
    setLineItems(prev => prev.map(li => li.id === id ? { ...li, ...updates } : li));
  };

  const computedLines = lineItems.map(li => {
    const tax = calcTax(li.unit_cost, li.quantity, li.tax_status);
    return { ...li, gst: tax.gst, pst: tax.pst, preTax: tax.preTax, total: tax.preTax + tax.gst + tax.pst };
  });

  const subtotal = computedLines.reduce((s, li) => s + li.preTax, 0);
  const totalGst = computedLines.reduce((s, li) => s + li.gst, 0);
  const totalPst = computedLines.reduce((s, li) => s + li.pst, 0);
  const grandTotal = subtotal + totalGst + totalPst;

  // Determine dominant PO type from line items (only product / repair_parts now)
  const dominantType = useMemo(() => {
    const types = new Set(lineItems.map(li => li.item_type));
    if (types.size === 1) return lineItems[0].item_type;
    return 'product'; // mixed → default to product
  }, [lineItems]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const handleSubmit = async () => {
    if (!selectedCompanyId) { toast.error('Select a company first'); return; }
    if (!formData.supplier_id) { toast.error('Select a supplier'); return; }
    const validItems = computedLines.filter(li => li.description && li.unit_cost > 0);
    if (validItems.length === 0) { toast.error('Add at least one line item'); return; }

    // Duplicate-line guard: prevent two lines pointing at the same product/part
    // (either by matched id, or by case-insensitive name within the same item type).
    const seenIds = new Map<string, number>();
    const seenNames = new Map<string, number>();
    for (let i = 0; i < validItems.length; i++) {
      const li = validItems[i];
      // (Devices are imported separately; product/repair_parts must be unique per PO.)
      if (li.product_id) {
        const prev = seenIds.get(li.product_id);
        if (prev !== undefined) {
          toast.error(`Lines ${prev + 1} and ${i + 1} reference the same SKU. Combine them into one line with a higher quantity.`);
          return;
        }
        seenIds.set(li.product_id, i);
      }
      const nameKey = `${li.item_type}::${li.description.trim().toLowerCase()}`;
      const prevName = seenNames.get(nameKey);
      if (prevName !== undefined) {
        toast.error(`Lines ${prevName + 1} and ${i + 1} have the same item name ("${li.description}"). Combine them into one line.`);
        return;
      }
      seenNames.set(nameKey, i);
    }

    setLoading(true);
    try {
      const { data: po, error: poError } = await supabase.from('purchase_orders').insert({
        po_number: formData.po_number,
        supplier_id: formData.supplier_id,
        supplier_name: formData.supplier_name,
        po_date: formData.po_date,
        expected_delivery_date: formData.expected_delivery_date,
        subtotal,
        gst_hst_amount: totalGst,
        pst_qst_amount: totalPst,
        total_amount: grandTotal,
        status: 'pending',
        payment_status: 'unpaid',
        payment_method: formData.payment_method || null,
        notes: formData.notes || null,
        company_id: selectedCompanyId,
        created_by: user?.id,
        po_type: dominantType,
      } as any).select('id').single();

      if (poError) throw poError;

      if (po) {
        const items = validItems.map(li => ({
          purchase_order_id: po.id,
          description: li.description,
          quantity: li.quantity,
          unit_cost: li.unit_cost,
          gst_hst_amount: li.gst,
          pst_qst_amount: li.pst,
          total_cost: li.total,
          item_type: li.item_type,
          // Carry SKU through: matched item reuses its SKU; otherwise use the
          // user-typed SKU/UPC (if any) so the new product/part is created with it on GRN.
          sku: li.matched_sku || (li.new_sku.trim() ? li.new_sku.trim() : null),
        }));
        const { error: itemsError } = await supabase.from('purchase_order_items').insert(items);
        if (itemsError) throw itemsError;

        // Create AP record immediately so the obligation is visible in AP view
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        await supabase.from('accounts_payable').insert({
          company_id: selectedCompanyId,
          vendor_name: formData.supplier_name,
          vendor_id: formData.supplier_id,
          bill_number: formData.po_number,
          bill_date: formData.po_date,
          due_date: dueDate.toISOString().split('T')[0],
          original_amount: grandTotal,
          gst_hst_amount: totalGst,
          pst_amount: totalPst,
          category: 'inventory_purchase',
          description: `PO ${formData.po_number} — ${validItems.length} line items`,
          status: 'outstanding',
          created_by: user?.id,
        });
      }

      toast.success('Purchase Order created');
      resetForm();
      emitRefetch('purchase_orders');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create PO');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      po_number: '',
      supplier_id: '',
      supplier_name: '',
      po_date: new Date().toISOString().split('T')[0],
      expected_delivery_date: null,
      payment_method: '',
      notes: '',
    });
    setLineItems([newPOLine()]);
    setSelectedCompanyId('');
  };

  const getItemTypeConfig = (type: ItemType) => ITEM_TYPE_CONFIG.find(c => c.value === type)!;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Create Purchase Order
          </DialogTitle>
          <DialogDescription>
            Order bulk products and repair parts from a supplier. (Devices are added through Inventory → Import.)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Header Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Company *</Label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="font-semibold">{c.code}</span>
                      <span className="text-muted-foreground ml-1">— {c.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">PO Number</Label>
              <Input className="h-9" value={formData.po_number} onChange={e => setFormData(prev => ({ ...prev, po_number: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">PO Date</Label>
              <Input className="h-9" type="date" value={formData.po_date} onChange={e => setFormData(prev => ({ ...prev, po_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Delivery Date</Label>
              <Input className="h-9" type="date" value={formData.expected_delivery_date || ''} onChange={e => setFormData(prev => ({ ...prev, expected_delivery_date: e.target.value || null }))} />
            </div>
          </div>

          {/* Supplier + Payment */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Supplier *</Label>
              <SupplierSearchCombobox
                value={formData.supplier_id || null}
                onSelect={(sup) => setFormData(prev => ({
                  ...prev,
                  supplier_id: sup?.id || '',
                  supplier_name: sup?.name || '',
                }))}
                companyId={selectedCompanyId || null}
                disabled={!selectedCompanyId}
                placeholder={selectedCompanyId ? 'Search supplier by name, code, contact, email…' : 'Select company first'}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Payment Method</Label>
              <Select value={formData.payment_method} onValueChange={v => setFormData(prev => ({ ...prev, payment_method: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Credit / Net Terms</SelectItem>
                  <SelectItem value="wire_transfer">Wire Transfer</SelectItem>
                  <SelectItem value="e_transfer">E-Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">Line Items</span>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs">
                      <p className="font-semibold mb-1">Item Types:</p>
                      {ITEM_TYPE_CONFIG.map(c => (
                        <p key={c.value} className="flex items-center gap-1.5 mb-0.5">
                          <c.icon className={cn('h-3 w-3', c.color)} />
                          <span className="font-medium">{c.label}:</span> {c.description}
                        </p>
                      ))}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Line
              </Button>
            </div>

            {/* Helper text — explains the type-ahead behavior of the Description field */}
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground flex items-start gap-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[hsl(var(--info))]" />
              <span>
                Search the Description field by <span className="font-medium text-foreground">name or SKU</span>.
                Matching items appear as suggestions — pick one to reuse its existing SKU and link this line to current stock.
                If nothing matches, just keep your typed name: a brand-new item with a fresh auto-generated SKU will be created when the PO is received.
              </span>
            </div>

            {/* Table header */}
            <div className="hidden md:grid grid-cols-[1fr,110px,auto,70px,90px,100px,80px,36px] gap-2 px-3 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              <span>Description</span>
              <span>SKU</span>
              <span className="w-[90px]">Type</span>
              <span>Qty</span>
              <span>Unit Cost</span>
              <span>Tax</span>
              <span className="text-right">Total</span>
              <span></span>
            </div>

            {lineItems.map((item, index) => {
              const computed = computedLines[index];
              const typeConfig = getItemTypeConfig(item.item_type);
              return (
                <div key={item.id} className="rounded-lg border border-border/60 p-3 bg-muted/20 hover:bg-muted/30 transition-colors">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr,110px,auto,70px,90px,100px,80px,36px] gap-2 items-center">
                    {/* Description / Product picker — type to search by name or SKU */}
                    <ProductFreeTextCombobox
                      value={item.description}
                      matchedId={item.product_id}
                      matchedSku={item.matched_sku}
                      source={item.item_type === 'product' ? 'product' : 'repair_part'}
                      companyId={selectedCompanyId || null}
                      disabled={!selectedCompanyId}
                      placeholder={item.item_type === 'product'
                        ? 'Type product name or SKU…'
                        : 'Type part name or SKU…'}
                      onChange={(next) => updateLine(item.id, {
                        description: next.description,
                        product_id: next.matchedId,
                        matched_sku: next.sku ?? null,
                        unit_cost: next.cost != null && next.cost > 0 ? next.cost : item.unit_cost,
                      })}
                    />
                    {/* SKU column — shows matched SKU; otherwise allows the user to enter a SKU/UPC for the new item */}
                    <div className="min-w-0">
                      {item.matched_sku ? (
                        <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0.5 truncate max-w-full" title={item.matched_sku}>
                          {item.matched_sku}
                        </Badge>
                      ) : (
                        <Input
                          className="h-8 text-[11px] font-mono px-2"
                          placeholder="SKU/UPC (optional)"
                          value={item.new_sku}
                          onChange={e => updateLine(item.id, { new_sku: e.target.value })}
                          title="Optional. Leave blank to auto-generate when received."
                        />
                      )}
                    </div>
                    {/* Type selector */}
                    <div className="w-[90px]">
                      <Select value={item.item_type} onValueChange={(v: ItemType) => updateLine(item.id, { item_type: v, product_id: null, matched_sku: null, new_sku: '' })}>
                        <SelectTrigger className="h-8 text-[11px] px-2">
                          <div className="flex items-center gap-1">
                            <typeConfig.icon className={cn('h-3 w-3 shrink-0', typeConfig.color)} />
                            <span className="truncate">{typeConfig.label}</span>
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {ITEM_TYPE_CONFIG.map(c => (
                            <SelectItem key={c.value} value={c.value}>
                              <div className="flex items-center gap-2">
                                <c.icon className={cn('h-3.5 w-3.5', c.color)} />
                                <span>{c.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Qty */}
                    <Input
                      className="h-8 text-xs text-center"
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={e => updateLine(item.id, { quantity: parseInt(e.target.value) || 1 })}
                    />
                    {/* Unit cost */}
                    <Input
                      className="h-8 text-xs"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={item.unit_cost || ''}
                      onChange={e => updateLine(item.id, { unit_cost: parseFloat(e.target.value) || 0 })}
                    />
                    {/* Tax */}
                    <Select value={item.tax_status} onValueChange={(v: TaxStatus) => updateLine(item.id, { tax_status: v })}>
                      <SelectTrigger className="h-8 text-[11px] px-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TAX_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Total */}
                    <div className="text-right">
                      <p className="text-xs font-mono font-semibold">{formatCurrency(computed?.total ?? 0)}</p>
                    </div>
                    {/* Delete */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => removeLine(item.id)}
                      disabled={lineItems.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Separator />

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 rounded-lg border border-border/60 p-3 bg-muted/20 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{formatCurrency(subtotal)}</span>
              </div>
              {totalGst > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">GST/HST</span>
                  <span className="font-mono">{formatCurrency(totalGst)}</span>
                </div>
              )}
              {totalPst > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">PST/QST</span>
                  <span className="font-mono">{formatCurrency(totalPst)}</span>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="font-mono">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Notes</Label>
            <Textarea
              className="min-h-[60px]"
              placeholder="Additional notes..."
              value={formData.notes}
              onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating...' : 'Create Purchase Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
