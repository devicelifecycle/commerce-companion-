import { useState, useEffect, useMemo } from 'react';
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
import { ClipboardList, Plus, Trash2, ChevronsUpDown, Check, Package, Wrench, Receipt, Info } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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
type ItemType = 'inventory' | 'repair_parts' | 'expense';

const TAX_OPTIONS: { value: TaxStatus; label: string }[] = [
  { value: 'zero_rated', label: 'Zero-Rated' },
  { value: 'gst_paid', label: 'GST 5%' },
  { value: 'hst_paid', label: 'HST 13%' },
  { value: 'gst_pst', label: 'GST+PST 12%' },
  { value: 'tax_inclusive', label: 'Incl. 13%' },
];

const ITEM_TYPE_CONFIG: { value: ItemType; label: string; icon: typeof Package; color: string; description: string }[] = [
  { value: 'inventory', label: 'Inventory', icon: Package, color: 'text-[hsl(var(--info))]', description: 'Added to product inventory on receive' },
  { value: 'repair_parts', label: 'Repair Parts', icon: Wrench, color: 'text-[hsl(var(--warning))]', description: 'Added to repair parts inventory' },
  { value: 'expense', label: 'Expense', icon: Receipt, color: 'text-[hsl(var(--accent))]', description: 'Recorded as expense, not inventory' },
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
    item_type: 'inventory',
  };
}

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

  // Determine dominant PO type from line items
  const dominantType = useMemo(() => {
    const types = new Set(lineItems.map(li => li.item_type));
    if (types.size === 1) return lineItems[0].item_type;
    return 'inventory'; // mixed
  }, [lineItems]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const handleSubmit = async () => {
    if (!selectedCompanyId) { toast.error('Select a company first'); return; }
    if (!formData.supplier_id) { toast.error('Select a supplier'); return; }
    const validItems = computedLines.filter(li => li.description && li.unit_cost > 0);
    if (validItems.length === 0) { toast.error('Add at least one line item'); return; }

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
        }));
        const { error: itemsError } = await supabase.from('purchase_order_items').insert(items);
        if (itemsError) throw itemsError;
      }

      toast.success('Purchase Order created');
      resetForm();
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
            Order inventory, repair parts, and tools/supplies from a supplier.
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
              <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-9" disabled={!selectedCompanyId}>
                    {formData.supplier_name || (selectedCompanyId ? 'Search supplier...' : 'Select company first')}
                    <ChevronsUpDown className="h-3.5 w-3.5 ml-2 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Search suppliers..." value={supplierSearch} onValueChange={setSupplierSearch} />
                    <CommandList>
                      <CommandEmpty>No suppliers found.</CommandEmpty>
                      <CommandGroup>
                        {filteredSuppliers.map(sup => (
                          <CommandItem
                            key={sup.id}
                            value={sup.id}
                            onSelect={() => {
                              setFormData(prev => ({ ...prev, supplier_id: sup.id, supplier_name: sup.name }));
                              setSupplierOpen(false);
                              setSupplierSearch('');
                            }}
                          >
                            <Check className={cn('h-4 w-4 mr-2', formData.supplier_id === sup.id ? 'opacity-100' : 'opacity-0')} />
                            <span className="font-medium">{sup.name}</span>
                            <Badge variant="outline" className="ml-auto text-[10px]">#{sup.supplier_code}</Badge>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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

            {/* Table header */}
            <div className="hidden md:grid grid-cols-[1fr,auto,70px,90px,100px,80px,36px] gap-2 px-3 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              <span>Description</span>
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
                  <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,70px,90px,100px,80px,36px] gap-2 items-center">
                    {/* Description */}
                    <Input
                      className="h-8 text-xs"
                      placeholder="Item description *"
                      value={item.description}
                      onChange={e => updateLine(item.id, { description: e.target.value })}
                    />
                    {/* Type selector */}
                    <div className="w-[90px]">
                      <Select value={item.item_type} onValueChange={(v: ItemType) => updateLine(item.id, { item_type: v })}>
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
