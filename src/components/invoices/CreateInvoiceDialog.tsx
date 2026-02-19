import { useState, useEffect, useMemo } from 'react';
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
import { toast } from 'sonner';
import { Plus, Trash2, Search, Package, PenLine } from 'lucide-react';
import { format } from 'date-fns';

type TaxTreatment = 'hst' | 'gst' | 'zero_rated' | 'tax_inclusive';

interface LineItem {
  id: string;
  type: 'inventory' | 'manual';
  device_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_treatment: TaxTreatment;
}

interface InventoryDevice {
  id: string;
  brand: string;
  model: string;
  storage: string | null;
  color: string | null;
  sku: string | null;
  cost_price: number;
  sale_price: number | null;
  status: string;
  condition: string;
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateInvoiceDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();

  // Customer
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerGstHst, setCustomerGstHst] = useState('');
  const [dueDays, setDueDays] = useState('30');
  const [notes, setNotes] = useState('');

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: generateId(), type: 'manual', device_id: null, description: '', quantity: 1, unit_price: 0, tax_treatment: 'hst' },
  ]);

  // Inventory search
  const [devices, setDevices] = useState<InventoryDevice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingLineId, setSearchingLineId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) fetchDevices();
  }, [open]);

  const fetchDevices = async () => {
    const { data } = await supabase
      .from('devices')
      .select('id, brand, model, storage, color, sku, cost_price, sale_price, status, condition')
      .eq('status', 'in_stock')
      .order('brand');
    if (data) setDevices(data as InventoryDevice[]);
  };

  const filteredDevices = useMemo(() => {
    if (!searchQuery.trim()) return devices.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return devices.filter(d =>
      `${d.brand} ${d.model} ${d.storage || ''} ${d.sku || ''}`.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [devices, searchQuery]);

  const addLineItem = (type: 'inventory' | 'manual') => {
    setLineItems(prev => [...prev, {
      id: generateId(), type, device_id: null, description: '', quantity: 1, unit_price: 0, tax_treatment: 'hst',
    }]);
    if (type === 'inventory') {
      setSearchingLineId(lineItems.length.toString()); // will be updated
    }
  };

  const updateLine = (id: string, updates: Partial<LineItem>) => {
    setLineItems(prev => prev.map(li => li.id === id ? { ...li, ...updates } : li));
  };

  const removeLine = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter(li => li.id !== id));
  };

  const selectDevice = (lineId: string, device: InventoryDevice) => {
    updateLine(lineId, {
      type: 'inventory',
      device_id: device.id,
      description: `${device.brand} ${device.model}${device.storage ? ` ${device.storage}` : ''}${device.color ? ` (${device.color})` : ''}`,
      unit_price: Number(device.sale_price || device.cost_price),
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
        // Price includes tax — extract it
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
    setLineItems([{ id: generateId(), type: 'manual', device_id: null, description: '', quantity: 1, unit_price: 0, tax_treatment: 'hst' }]);
    setSearchingLineId(null);
    setSearchQuery('');
  };

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      toast.error('Customer name is required');
      return;
    }
    const validLines = lineItems.filter(li => li.description.trim() && li.unit_price > 0);
    if (validLines.length === 0) {
      toast.error('Add at least one line item with a description and price');
      return;
    }

    setSubmitting(true);
    try {
      // Generate invoice number
      const prefix = selectedCompany?.code || 'INV';
      const date = format(new Date(), 'yyyyMM');
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const invoiceNumber = `${prefix}-${date}-${random}`;

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + parseInt(dueDays));

      // Insert invoice
      const { data: invoice, error: invError } = await supabase.from('invoices').insert({
        invoice_number: invoiceNumber,
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim() || null,
        customer_address: customerAddress.trim() || null,
        customer_phone: customerPhone.trim() || null,
        customer_gst_hst_number: customerGstHst.trim() || null,
        subtotal: Math.round(calculations.subtotal * 100) / 100,
        tax_amount: Math.round(calculations.totalTax * 100) / 100,
        total: Math.round(calculations.grandTotal * 100) / 100,
        status: 'draft' as const,
        issue_date: new Date().toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        notes: notes.trim() || null,
        created_by: user?.id,
        company_id: selectedCompany?.id || null,
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
      await supabase.from('accounts_receivable').insert({
        company_id: selectedCompany?.id || null,
        invoice_id: invoice.id,
        source_type: 'invoice',
        source_reference: invoiceNumber,
        customer_name: customerName.trim(),
        original_amount: Math.round(calculations.grandTotal * 100) / 100,
        balance_due: Math.round(calculations.grandTotal * 100) / 100,
        due_date: dueDate.toISOString().split('T')[0],
        status: 'outstanding',
      });

      toast.success(`Invoice ${invoiceNumber} created`);
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
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Create Invoice</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Customer Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Customer Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Customer Name *</Label>
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Company or individual" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="customer@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">GST/HST Number</Label>
                <Input value={customerGstHst} onChange={e => setCustomerGstHst(e.target.value)} placeholder="123456789 RT0001" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Address</Label>
              <Input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="Full billing address" />
            </div>
          </div>

          <Separator />

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Line Items</h3>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => addLineItem('inventory')}>
                  <Package className="h-3.5 w-3.5 mr-1.5" /> From Inventory
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => addLineItem('manual')}>
                  <PenLine className="h-3.5 w-3.5 mr-1.5" /> Manual Item
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-[1fr_70px_100px_130px_32px] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">
                <span>Description</span>
                <span>Qty</span>
                <span>Unit Price</span>
                <span>Tax</span>
                <span />
              </div>

              {lineItems.map((li) => (
                <div key={li.id} className="space-y-1">
                  <div className="grid grid-cols-[1fr_70px_100px_130px_32px] gap-2 items-center">
                    {li.type === 'inventory' && !li.device_id ? (
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          className="pl-8 text-xs"
                          value={searchQuery}
                          onChange={e => { setSearchQuery(e.target.value); setSearchingLineId(li.id); }}
                          onFocus={() => setSearchingLineId(li.id)}
                          placeholder="Search inventory..."
                          autoFocus
                        />
                        {searchingLineId === li.id && (
                          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                            {filteredDevices.length === 0 ? (
                              <div className="p-3 text-xs text-muted-foreground text-center">No matching devices</div>
                            ) : (
                              filteredDevices.map(d => (
                                <button
                                  key={d.id}
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex justify-between items-center transition-colors"
                                  onClick={() => selectDevice(li.id, d)}
                                >
                                  <span className="font-medium">{d.brand} {d.model} {d.storage || ''}</span>
                                  <span className="text-muted-foreground">{formatCurrency(Number(d.sale_price || d.cost_price))}</span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <Input
                        className="text-xs"
                        value={li.description}
                        onChange={e => updateLine(li.id, { description: e.target.value })}
                        placeholder={li.type === 'inventory' ? li.description : 'Item description'}
                        readOnly={li.type === 'inventory' && !!li.device_id}
                      />
                    )}
                    <Input
                      type="number"
                      min="1"
                      className="text-xs"
                      value={li.quantity}
                      onChange={e => updateLine(li.id, { quantity: parseInt(e.target.value) || 1 })}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="text-xs"
                      value={li.unit_price || ''}
                      onChange={e => updateLine(li.id, { unit_price: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                    />
                    <Select value={li.tax_treatment} onValueChange={v => updateLine(li.id, { tax_treatment: v as TaxTreatment })}>
                      <SelectTrigger className="h-9 text-xs">
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeLine(li.id)}
                      disabled={lineItems.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {/* Line subtotal */}
                  <div className="text-right text-[10px] text-muted-foreground pr-10">
                    Line: {formatCurrency(li.quantity * li.unit_price)}
                    {li.tax_treatment !== 'zero_rated' && li.tax_treatment !== 'tax_inclusive' && (
                      <> + {TAX_RATES[li.tax_treatment].label}</>
                    )}
                    {li.tax_treatment === 'tax_inclusive' && <> (tax included)</>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Payment Terms & Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Terms</Label>
              <Select value={dueDays} onValueChange={setDueDays}>
                <SelectTrigger className="h-9 text-xs">
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
              <Label className="text-xs">Notes</Label>
              <Textarea
                className="text-xs min-h-[36px] h-9 resize-none"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional notes..."
              />
            </div>
          </div>

          <Separator />

          {/* Totals */}
          <div className="space-y-2 bg-muted/30 rounded-lg p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatCurrency(calculations.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-medium">{formatCurrency(calculations.totalTax)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(calculations.grandTotal)}</span>
            </div>
          </div>

          {/* Accounting note */}
          <div className="text-[10px] text-muted-foreground bg-muted/20 rounded-md p-2.5 border border-border/40">
            <strong>Accounting Treatment:</strong> Revenue → Sales Revenue account, Tax collected → GST/HST Payable, AR entry created automatically. Inventory items marked as sold.
          </div>

          <Button onClick={handleSubmit} disabled={submitting} className="w-full gradient-primary">
            {submitting ? 'Creating...' : 'Create Invoice'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
