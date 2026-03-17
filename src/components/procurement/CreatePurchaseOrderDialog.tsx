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
import { toast } from 'sonner';
import { ClipboardList, Plus, Trash2, ChevronsUpDown, Check } from 'lucide-react';
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

const TAX_OPTIONS: { value: TaxStatus; label: string; rate: number }[] = [
  { value: 'zero_rated', label: 'Zero-Rated', rate: 0 },
  { value: 'gst_paid', label: 'GST Paid (5%)', rate: 0.05 },
  { value: 'hst_paid', label: 'HST Paid (13%)', rate: 0.13 },
  { value: 'gst_pst', label: 'GST + PST (5% + 7%)', rate: 0.12 },
  { value: 'tax_inclusive', label: 'Tax Inclusive (13%)', rate: 0 },
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
    if (open) {
      loadCompanies();
    }
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
    if (selectedCompanyId) query = query.eq('company_id', selectedCompanyId);
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

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const handleSubmit = async () => {
    if (!selectedCompanyId) {
      toast.error('Select a company first');
      return;
    }
    if (!formData.supplier_id) {
      toast.error('Select a supplier');
      return;
    }
    const validItems = computedLines.filter(li => li.description && li.unit_cost > 0);
    if (validItems.length === 0) {
      toast.error('Add at least one line item');
      return;
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
      }).select('id').single();

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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Create Purchase Order
          </DialogTitle>
          <DialogDescription>
            Create a manual purchase order for bulk items, supplies, and non-device inventory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Company + PO Header */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Company *</Label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company..." />
                </SelectTrigger>
                <SelectContent>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="font-medium">{c.code}</span>
                      <span className="text-muted-foreground ml-1.5">— {c.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">PO Number</Label>
              <Input
                value={formData.po_number}
                onChange={e => setFormData(prev => ({ ...prev, po_number: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">PO Date</Label>
              <Input
                type="date"
                value={formData.po_date}
                onChange={e => setFormData(prev => ({ ...prev, po_date: e.target.value }))}
              />
            </div>
          </div>

          {/* Supplier Search */}
          <div className="space-y-1.5">
            <Label className="text-xs">Supplier *</Label>
            <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal" disabled={!selectedCompanyId}>
                  {formData.supplier_name || (selectedCompanyId ? 'Search supplier by name or code...' : 'Select a company first')}
                  <ChevronsUpDown className="h-4 w-4 ml-2 opacity-50" />
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
                          <Badge variant="outline" className="ml-auto text-xs">#{sup.supplier_code}</Badge>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Expected Delivery Date</Label>
              <Input
                type="date"
                value={formData.expected_delivery_date || ''}
                onChange={e => setFormData(prev => ({ ...prev, expected_delivery_date: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Method</Label>
              <Select value={formData.payment_method} onValueChange={v => setFormData(prev => ({ ...prev, payment_method: v }))}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
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

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">Line Items</span>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
              </Button>
            </div>

            {lineItems.map((item, index) => {
              const computed = computedLines[index];
              return (
                <div key={item.id} className="border rounded-lg p-3 space-y-2 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Item {index + 1}</span>
                    {lineItems.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeLine(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-4">
                      <label className="text-xs text-muted-foreground mb-1 block">Description *</label>
                      <Input placeholder="Item description" value={item.description} onChange={e => updateLine(item.id, { description: e.target.value })} />
                    </div>
                    <div className="col-span-1">
                      <label className="text-xs text-muted-foreground mb-1 block">Qty</label>
                      <Input type="number" min={1} value={item.quantity} onChange={e => updateLine(item.id, { quantity: parseInt(e.target.value) || 1 })} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">Unit Cost</label>
                      <Input type="number" step="0.01" value={item.unit_cost || ''} onChange={e => updateLine(item.id, { unit_cost: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-3">
                      <label className="text-xs text-muted-foreground mb-1 block">Tax Treatment</label>
                      <Select value={item.tax_status} onValueChange={(v: TaxStatus) => updateLine(item.id, { tax_status: v })}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TAX_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 flex items-end">
                      <div className="pb-2 text-right w-full">
                        <p className="text-sm font-mono font-medium">{formatCurrency(computed?.total ?? 0)}</p>
                        {(computed?.gst > 0 || computed?.pst > 0) && (
                          <p className="text-[10px] text-muted-foreground">
                            Tax: {formatCurrency((computed?.gst ?? 0) + (computed?.pst ?? 0))}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Separator />

          {/* Totals */}
          <div className="rounded-lg border p-3 space-y-1 bg-muted/30">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {totalGst > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">GST/HST</span>
                <span>{formatCurrency(totalGst)}</span>
              </div>
            )}
            {totalPst > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">PST/QST</span>
                <span>{formatCurrency(totalPst)}</span>
              </div>
            )}
            <Separator className="my-1" />
            <div className="flex justify-between font-medium">
              <span>Total</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              placeholder="Additional notes..."
              value={formData.notes}
              onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating...' : 'Create Purchase Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
