import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { emitRefetch } from '@/hooks/useDataRefetch';
import { Plus, Trash2, Search, PenLine, Smartphone, Package, Wrench } from 'lucide-react';
import { format } from 'date-fns';
import { toTitleCase } from '@/lib/utils';
import { CustomerAutoComplete } from './CustomerAutoComplete';
import { createAutoJournalEntry, getAccountIdByCode } from '@/lib/accounting/journalAutomation';

type TaxTreatment = 'hst' | 'gst' | 'zero_rated' | 'tax_inclusive';

interface LineItem {
  id: string;
  type: 'inventory' | 'manual';
  source_type?: 'device' | 'product' | 'repair_part';
  source_id: string | null;
  device_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_treatment: TaxTreatment;
}

interface InventoryItem {
  id: string;
  source: 'device' | 'product' | 'repair_part';
  label: string;
  sublabel: string;
  price: number;
  qty?: number;
  sku: string | null;
}

const TAX_RATES: Record<TaxTreatment, { label: string; rate: number; description: string }> = {
  hst: { label: 'HST (13%)', rate: 0.13, description: 'Ontario HST' },
  gst: { label: 'GST (5%)', rate: 0.05, description: 'Federal GST only' },
  zero_rated: { label: 'Zero-Rated', rate: 0, description: 'No tax applicable' },
  tax_inclusive: { label: 'Tax Inclusive', rate: 0.13, description: 'Price already includes HST' },
};

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  device: <Smartphone className="h-3 w-3" />,
  product: <Package className="h-3 w-3" />,
  repair_part: <Wrench className="h-3 w-3" />,
};

const SOURCE_LABELS: Record<string, string> = {
  device: 'Device',
  product: 'Product',
  repair_part: 'Part',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateInvoiceDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const { selectedCompany, accessibleCompanies } = useCompany();

  const [invoiceCompanyId, setInvoiceCompanyId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerGstHst, setCustomerGstHst] = useState('');
  const [dueDays, setDueDays] = useState('30');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open && selectedCompany && !invoiceCompanyId) {
      setInvoiceCompanyId(selectedCompany.id);
    }
  }, [open, selectedCompany]);

  // Line items — default to inventory type
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: generateId(), type: 'inventory', source_type: undefined, source_id: null, device_id: null, description: '', quantity: 1, unit_price: 0, tax_treatment: 'hst' },
  ]);

  // Unified inventory search
  const [allInventory, setAllInventory] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingLineId, setSearchingLineId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchAllInventory = useCallback(async () => {
    if (!invoiceCompanyId) return;

    const [devicesRes, productsRes, partsRes] = await Promise.all([
      supabase
        .from('devices')
        .select('id, brand, model, storage, color, sku, cost_price, sale_price, status, condition, imei')
        .eq('status', 'in_stock')
        .eq('company_id', invoiceCompanyId)
        .order('brand')
        .limit(500),
      supabase
        .from('products')
        .select('id, name, sku, cost_price, sale_price, quantity_on_hand, unit_of_measure')
        .eq('company_id', invoiceCompanyId)
        .eq('status', 'active')
        .gt('quantity_on_hand', 0)
        .order('name')
        .limit(200),
      supabase
        .from('repair_parts')
        .select('id, part_name, part_number, unit_cost, selling_price, quantity_in_stock')
        .eq('company_id', invoiceCompanyId)
        .gt('quantity_in_stock', 0)
        .order('part_name')
        .limit(200),
    ]);

    const items: InventoryItem[] = [];

    (devicesRes.data || []).forEach((d: any) => {
      const label = `${d.brand} ${d.model}${d.storage ? ` ${d.storage}` : ''}${d.color ? ` (${d.color})` : ''}`;
      const sublabel = [d.imei && `IMEI: ${d.imei}`, d.sku && `SKU: ${d.sku}`, d.condition].filter(Boolean).join(' · ');
      items.push({ id: d.id, source: 'device', label, sublabel, price: Number(d.sale_price || d.cost_price), sku: d.sku });
    });

    (productsRes.data || []).forEach((p: any) => {
      const sublabel = [p.sku && `SKU: ${p.sku}`, `Qty: ${p.quantity_on_hand}`, p.unit_of_measure].filter(Boolean).join(' · ');
      items.push({ id: p.id, source: 'product', label: p.name, sublabel, price: Number(p.sale_price || p.cost_price), qty: p.quantity_on_hand, sku: p.sku });
    });

    (partsRes.data || []).forEach((r: any) => {
      const sublabel = [r.part_number && `P/N: ${r.part_number}`, `Qty: ${r.quantity_in_stock}`].filter(Boolean).join(' · ');
      items.push({ id: r.id, source: 'repair_part', label: r.part_name, sublabel, price: Number(r.selling_price || r.unit_cost), qty: r.quantity_in_stock, sku: r.part_number });
    });

    setAllInventory(items);
  }, [invoiceCompanyId]);

  useEffect(() => {
    if (open) fetchAllInventory();
  }, [open, fetchAllInventory]);

  const filteredInventory = useMemo(() => {
    const usedIds = new Set(lineItems.filter(li => li.source_id).map(li => li.source_id));
    const available = allInventory.filter(i => !usedIds.has(i.id));
    if (!searchQuery.trim()) return available.slice(0, 30);
    const q = searchQuery.toLowerCase();
    return available.filter(i =>
      i.label.toLowerCase().includes(q) ||
      i.sublabel.toLowerCase().includes(q) ||
      i.sku?.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [allInventory, searchQuery, lineItems]);

  const addLineItem = (type: 'inventory' | 'manual') => {
    setLineItems(prev => [...prev, {
      id: generateId(), type, source_type: undefined, source_id: null, device_id: null, description: '', quantity: 1, unit_price: 0, tax_treatment: 'hst',
    }]);
  };

  const updateLine = (id: string, updates: Partial<LineItem>) => {
    setLineItems(prev => prev.map(li => li.id === id ? { ...li, ...updates } : li));
  };

  const removeLine = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter(li => li.id !== id));
  };

  const selectInventoryItem = (lineId: string, item: InventoryItem) => {
    updateLine(lineId, {
      type: 'inventory',
      source_type: item.source,
      source_id: item.id,
      device_id: item.source === 'device' ? item.id : null,
      description: item.label,
      unit_price: item.price,
    });
    setSearchingLineId(null);
    setSearchQuery('');
  };

  // Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;

    lineItems.forEach(li => {
      const lineTotal = li.quantity * li.unit_price;
      const taxInfo = TAX_RATES[li.tax_treatment];

      if (li.tax_treatment === 'tax_inclusive') {
        const preTax = lineTotal / (1 + taxInfo.rate);
        subtotal += preTax;
        totalTax += lineTotal - preTax;
      } else {
        subtotal += lineTotal;
        totalTax += lineTotal * taxInfo.rate;
      }
    });

    return { subtotal, totalTax, grandTotal: subtotal + totalTax };
  }, [lineItems]);

  const resetForm = () => {
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerGstHst('');
    setDueDays('30');
    setNotes('');
    setInvoiceCompanyId(selectedCompany?.id || '');
    setLineItems([{ id: generateId(), type: 'inventory', source_type: undefined, source_id: null, device_id: null, description: '', quantity: 1, unit_price: 0, tax_treatment: 'hst' }]);
    setSearchingLineId(null);
    setSearchQuery('');
  };

  const handleSubmit = async () => {
    if (!invoiceCompanyId) {
      toast.error('Please select a company (VES or TGW)');
      return;
    }
    if (!customerName.trim()) {
      toast.error('Customer name is required');
      return;
    }
    const validLines = lineItems.filter(li => li.description.trim() && li.unit_price > 0);
    if (validLines.length === 0) {
      toast.error('Add at least one line item with a description and price');
      return;
    }

    const invoiceCompany = accessibleCompanies.find(c => c.id === invoiceCompanyId);

    setSubmitting(true);
    try {
      // Generate invoice number
      const prefix = invoiceCompany?.code || 'INV';
      const date = format(new Date(), 'yyyyMM');
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const invoiceNumber = `${prefix}-${date}-${random}`;

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + parseInt(dueDays));

      // Insert invoice
      const { data: invoice, error: invError } = await supabase.from('invoices').insert({
        invoice_number: invoiceNumber,
        customer_name: toTitleCase(customerName),
        customer_email: customerEmail.trim() || null,
        customer_address: customerAddress.trim() || null,
        customer_phone: customerPhone.trim() || null,
        customer_gst_hst_number: customerGstHst.trim() || null,
        subtotal: Math.round(calculations.subtotal * 100) / 100,
        tax_amount: Math.round(calculations.totalTax * 100) / 100,
        total: Math.round(calculations.grandTotal * 100) / 100,
        status: 'sent' as const,
        issue_date: new Date().toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        notes: notes.trim() || null,
        created_by: user?.id,
        company_id: invoiceCompanyId,
      }).select('id').single();

      if (invError) throw invError;

      // Insert line items
      const itemsToInsert = validLines.map(li => ({
        invoice_id: invoice.id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        total: li.quantity * li.unit_price,
        device_id: li.device_id,
        tax_treatment: li.tax_treatment,
      }));

      const { error: itemsError } = await supabase.from('invoice_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      // Mark inventory devices as sold
      const deviceIds = validLines.filter(li => li.device_id).map(li => li.device_id!);
      if (deviceIds.length > 0) {
        await supabase.from('devices').update({ status: 'sold' as any }).in('id', deviceIds);
      }

      // Create AR entry
      const { error: arError } = await supabase.from('accounts_receivable').insert({
        company_id: invoiceCompanyId,
        invoice_id: invoice.id,
        source_type: 'invoice',
        source_reference: invoiceNumber,
        customer_name: customerName.trim(),
        original_amount: Math.round(calculations.grandTotal * 100) / 100,
        paid_amount: 0,
        due_date: dueDate.toISOString().split('T')[0],
        status: 'outstanding',
      });
      if (arError) {
        console.error('AR entry failed:', arError);
        toast.warning('Invoice created but AR entry failed — check permissions');
      }

      // Create journal entry: Dr. AR, Cr. Revenue, Cr. Tax Collected
      try {
        const isVES = invoiceCompany?.code === 'VES';
        const arAccount = isVES ? '1050' : '1051';
        const revenueAccount = isVES ? '4400' : '4401';
        const taxCollectedAccount = isVES ? '4200' : '4201';

        const [arAccId, revenueAccId, taxAccId] = await Promise.all([
          getAccountIdByCode(invoiceCompanyId, arAccount),
          getAccountIdByCode(invoiceCompanyId, revenueAccount),
          getAccountIdByCode(invoiceCompanyId, taxCollectedAccount),
        ]);

        if (arAccId && revenueAccId) {
          const journalLines = [
            {
              accountCode: arAccount,
              accountId: arAccId,
              description: `AR - Invoice ${invoiceNumber} - ${customerName.trim()}`,
              debitAmount: Math.round(calculations.grandTotal * 100) / 100,
              creditAmount: 0,
            },
            {
              accountCode: revenueAccount,
              accountId: revenueAccId,
              description: `Revenue - Invoice ${invoiceNumber}`,
              debitAmount: 0,
              creditAmount: Math.round(calculations.subtotal * 100) / 100,
            },
          ];

          if (calculations.totalTax > 0 && taxAccId) {
            journalLines.push({
              accountCode: taxCollectedAccount,
              accountId: taxAccId,
              description: `Tax collected - Invoice ${invoiceNumber}`,
              debitAmount: 0,
              creditAmount: Math.round(calculations.totalTax * 100) / 100,
            });
          }

          await createAutoJournalEntry({
            companyId: invoiceCompanyId,
            entryDate: new Date().toISOString().split('T')[0],
            description: `Invoice ${invoiceNumber} - ${customerName.trim()}`,
            referenceType: 'sale',
            referenceId: invoice.id,
            lines: journalLines,
          });
        }
      } catch (jeError) {
        console.error('Invoice journal entry failed:', jeError);
        toast.warning('Invoice created but journal entry could not be created');
      }

      toast.success(`Invoice ${invoiceNumber} created`);
      emitRefetch('invoices');
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      console.error('Error creating invoice:', err);
      toast.error('Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4">
          <DialogHeader>
            <DialogTitle className="font-display text-xl tracking-tight flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <PenLine className="h-4 w-4 text-primary" />
              </div>
              New Invoice
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-6">
          {/* Top Row: Company + Payment Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company *</Label>
              <Select value={invoiceCompanyId} onValueChange={(v) => { setInvoiceCompanyId(v); setAllInventory([]); }}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {accessibleCompanies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment Terms</Label>
              <Select value={dueDays} onValueChange={setDueDays}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Due on Receipt</SelectItem>
                  <SelectItem value="7">Net 7</SelectItem>
                  <SelectItem value="15">Net 15</SelectItem>
                  <SelectItem value="30">Net 30</SelectItem>
                  <SelectItem value="60">Net 60</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Issue Date</Label>
              <Input value={format(new Date(), 'MMM d, yyyy')} readOnly className="h-10 bg-muted/30 cursor-default" />
            </div>
          </div>

          {/* Customer Section */}
          <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Bill To</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name *</Label>
                <CustomerAutoComplete
                  companyId={invoiceCompanyId || null}
                  value={customerName}
                  onChange={setCustomerName}
                  onSelect={(c) => {
                    setCustomerName(c.name);
                    if (c.email) setCustomerEmail(c.email);
                    if (c.phone) setCustomerPhone(c.phone);
                    if (c.address) setCustomerAddress(c.address);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="customer@example.com" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+1 (555) 000-0000" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">GST/HST #</Label>
                <Input value={customerGstHst} onChange={e => setCustomerGstHst(e.target.value)} placeholder="123456789 RT0001" className="h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Address</Label>
              <Input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="Full billing address" className="h-10" />
            </div>
          </div>

          {/* Line Items Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Items</h3>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => addLineItem('inventory')}>
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground" onClick={() => addLineItem('manual')}>
                  <PenLine className="h-3.5 w-3.5" /> Custom
                </Button>
              </div>
            </div>

            {/* Table-style line items */}
            <div className="rounded-xl border border-border overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_64px_100px_120px_80px_36px] gap-0 bg-muted/40 border-b border-border">
                <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Description</div>
                <div className="px-2 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Qty</div>
                <div className="px-2 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Price</div>
                <div className="px-2 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Tax</div>
                <div className="px-2 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold text-right">Amount</div>
                <div />
              </div>

              {/* Line item rows */}
              {lineItems.map((li, idx) => {
                const lineAmount = li.quantity * li.unit_price;
                const taxInfo = TAX_RATES[li.tax_treatment];
                const lineTax = li.tax_treatment === 'tax_inclusive'
                  ? lineAmount - (lineAmount / (1 + taxInfo.rate))
                  : lineAmount * taxInfo.rate;
                const lineTotal = li.tax_treatment === 'tax_inclusive' ? lineAmount : lineAmount + lineTax;

                return (
                  <div
                    key={li.id}
                    className={`grid grid-cols-[1fr_64px_100px_120px_80px_36px] gap-0 items-center border-b border-border/50 last:border-b-0 ${idx % 2 === 0 ? 'bg-card' : 'bg-card/60'}`}
                  >
                    {/* Description */}
                    <div className="px-2 py-1.5">
                      {li.type === 'inventory' && !li.source_id ? (
                        <div className="relative">
                          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            className="pl-7 h-8 text-xs border-dashed"
                            value={searchingLineId === li.id ? searchQuery : ''}
                            onChange={e => { setSearchQuery(e.target.value); setSearchingLineId(li.id); }}
                            onFocus={() => setSearchingLineId(li.id)}
                            placeholder="Search devices, products, parts..."
                            autoFocus
                          />
                          {searchingLineId === li.id && (
                            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-2xl max-h-56 overflow-y-auto">
                              {filteredInventory.length === 0 ? (
                                <div className="p-3 text-xs text-muted-foreground text-center">No matching inventory items</div>
                              ) : (
                                filteredInventory.map(item => (
                                  <button
                                    key={`${item.source}-${item.id}`}
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center gap-2 transition-colors"
                                    onClick={() => selectInventoryItem(li.id, item)}
                                  >
                                    <span className="text-muted-foreground shrink-0">{SOURCE_ICONS[item.source]}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-medium truncate">{item.label}</span>
                                        <Badge variant="secondary" className="text-[9px] shrink-0 px-1 py-0">{SOURCE_LABELS[item.source]}</Badge>
                                      </div>
                                      <div className="text-[10px] text-muted-foreground truncate">{item.sublabel}</div>
                                    </div>
                                    <span className="text-muted-foreground font-mono shrink-0">{formatCurrency(item.price)}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      ) : li.type === 'inventory' && li.source_id ? (
                        <div className="flex items-center gap-1.5 h-8 px-1">
                          <span className="text-muted-foreground">{li.source_type && SOURCE_ICONS[li.source_type]}</span>
                          <span className="text-xs font-medium truncate">{li.description}</span>
                          {li.source_type && <Badge variant="outline" className="text-[9px] shrink-0 px-1 py-0">{SOURCE_LABELS[li.source_type]}</Badge>}
                        </div>
                      ) : (
                        <Input
                          className="h-8 text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 px-1"
                          value={li.description}
                          onChange={e => updateLine(li.id, { description: e.target.value })}
                          placeholder="Type item description..."
                        />
                      )}
                    </div>
                    {/* Qty */}
                    <div className="px-1 py-1.5">
                      <Input
                        type="number"
                        min="1"
                        className="h-8 text-xs text-center border-0 bg-transparent shadow-none focus-visible:ring-1 px-1"
                        value={li.quantity}
                        onChange={e => updateLine(li.id, { quantity: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                    {/* Price */}
                    <div className="px-1 py-1.5">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="h-8 text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 px-1"
                        value={li.unit_price || ''}
                        onChange={e => updateLine(li.id, { unit_price: parseFloat(e.target.value) || 0 })}
                        placeholder="0.00"
                      />
                    </div>
                    {/* Tax */}
                    <div className="px-1 py-1.5">
                      <Select value={li.tax_treatment} onValueChange={v => updateLine(li.id, { tax_treatment: v as TaxTreatment })}>
                        <SelectTrigger className="h-8 text-[11px] border-0 bg-transparent shadow-none focus:ring-1 px-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(TAX_RATES).map(([key, val]) => (
                            <SelectItem key={key} value={key} className="text-xs">
                              {val.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Amount */}
                    <div className="px-2 py-1.5 text-right">
                      <span className="text-xs font-semibold tabular-nums">{formatCurrency(lineTotal)}</span>
                    </div>
                    {/* Delete */}
                    <div className="px-1 py-1.5 flex justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeLine(li.id)}
                        disabled={lineItems.length <= 1}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</Label>
            <Textarea
              className="text-xs min-h-[60px] resize-none"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Payment instructions, thank you message, etc."
            />
          </div>

          {/* Totals & Submit */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_280px] gap-4 items-end">
            {/* Accounting note */}
            <div className="text-[10px] text-muted-foreground bg-muted/20 rounded-lg p-3 border border-border/40 leading-relaxed">
              <strong className="text-foreground/80">Auto-accounting:</strong> Revenue posted to Sales Revenue, tax to GST/HST Payable, AR entry created. Inventory items marked sold.
            </div>

            {/* Totals card */}
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums">{formatCurrency(calculations.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium tabular-nums">{formatCurrency(calculations.totalTax)}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-primary tabular-nums">{formatCurrency(calculations.grandTotal)}</span>
              </div>
              <Button onClick={handleSubmit} disabled={submitting} className="w-full mt-2 h-10 gradient-primary font-semibold">
                {submitting ? 'Creating...' : 'Create & Send Invoice'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
