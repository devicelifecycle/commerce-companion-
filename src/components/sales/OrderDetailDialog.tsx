import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MarketplaceBadge, FulfillmentBadge, MarketplaceStatusBadge } from '@/components/ui/status-badge';
import { Package, User, MapPin, DollarSign, Calendar, FileText, RotateCcw, Link, Unlink, AlertTriangle, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeviceSearchCombobox } from '@/components/inventory/DeviceSearchCombobox';
import { ProductSearchCombobox } from '@/components/inventory/ProductSearchCombobox';
import { toast } from 'sonner';

const PROVINCES = [
  { code: 'AB', name: 'Alberta' },
  { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' },
  { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' },
  { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
];

interface Sale {
  id: string;
  device_id: string | null;
  order_number: string;
  marketplace: string;
  sale_price: number;
  shipping_cost: number;
  marketplace_fees: number;
  tax_amount: number;
  profit: number | null;
  sale_date: string;
  customer_name: string | null;
  customer_email: string | null;
  shipping_address: string | null;
  notes: string | null;
  company_id: string | null;
  fulfillment_status: string | null;
  marketplace_status: string | null;
  is_marketplace_remitted?: boolean;
  accounting_status?: string | null;
  product_title?: string | null;
  marketplace_sku?: string | null;
  shipping_province?: string | null;
  manual_cost?: number | null;
  manual_cost_description?: string | null;
  devices?: {
    brand: string;
    model: string;
    cost_price: number;
    imei: string | null;
    storage?: string | null;
    condition?: string | null;
    color?: string | null;
  } | null;
}

interface OrderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  onInitiateReturn: () => void;
  hasReturn: boolean;
  onSaleUpdated?: () => void;
}

// Extract province code from a Canadian address string
function extractProvinceFromAddress(address: string | null): string | null {
  if (!address) return null;
  const upper = address.toUpperCase().trim();
  
  // Province code map including common full names and abbreviations
  const PROVINCE_MAP: Record<string, string> = {
    'ONTARIO': 'ON', 'QUEBEC': 'QC', 'BRITISH COLUMBIA': 'BC', 'ALBERTA': 'AB',
    'MANITOBA': 'MB', 'SASKATCHEWAN': 'SK', 'NOVA SCOTIA': 'NS', 'NEW BRUNSWICK': 'NB',
    'NEWFOUNDLAND': 'NL', 'NEWFOUNDLAND AND LABRADOR': 'NL', 'PRINCE EDWARD ISLAND': 'PE',
    'NORTHWEST TERRITORIES': 'NT', 'NUNAVUT': 'NU', 'YUKON': 'YT',
    'PQ': 'QC', 'NFLD': 'NL', 'PEI': 'PE', 'NWT': 'NT',
  };
  
  const validCodes = new Set(['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'NU', 'YT']);

  // Try to find province code before a Canadian postal code pattern (e.g., "ON K1A 0B1")
  const postalMatch = upper.match(/\b([A-Z]{2})\s+[A-Z]\d[A-Z]\s*\d[A-Z]\d/);
  if (postalMatch && validCodes.has(postalMatch[1])) return postalMatch[1];

  // Try comma-separated segments: "City, ON K1A 0B1" or "City, Ontario"
  const parts = upper.split(',').map(p => p.trim());
  for (const part of parts) {
    // Check if part starts with a valid code
    const firstWord = part.split(/\s+/)[0];
    if (validCodes.has(firstWord)) return firstWord;
    // Check full province name
    for (const [name, code] of Object.entries(PROVINCE_MAP)) {
      if (part.includes(name)) return code;
    }
  }

  // Last resort: scan for any standalone 2-letter province code
  for (const code of validCodes) {
    const regex = new RegExp(`\\b${code}\\b`);
    if (regex.test(upper)) return code;
  }

  return null;
}

export function OrderDetailDialog({ open, onOpenChange, sale, onInitiateReturn, hasReturn, onSaleUpdated }: OrderDetailDialogProps) {
  const [showLinkDevice, setShowLinkDevice] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<'device' | 'product' | 'manual'>('device');
  const [linking, setLinking] = useState(false);
  const [savingProvince, setSavingProvince] = useState(false);
  const [localProvince, setLocalProvince] = useState<string | null>(sale.shipping_province || null);
  const [manualCostAmount, setManualCostAmount] = useState<string>(sale.manual_cost?.toString() || '');
  const [manualCostDesc, setManualCostDesc] = useState<string>(sale.manual_cost_description || '');
  const [savingManualCost, setSavingManualCost] = useState(false);

  // Sync local province when sale changes
  useEffect(() => {
    setLocalProvince(sale.shipping_province || null);
    setManualCostAmount(sale.manual_cost?.toString() || '');
    setManualCostDesc(sale.manual_cost_description || '');
  }, [sale.shipping_province, sale.id, sale.manual_cost]);

  // Auto-extract province from address if not set
  const suggestedProvince = useMemo(() => {
    if (localProvince) return null; // Already set
    return extractProvinceFromAddress(sale.shipping_address);
  }, [sale.shipping_address, localProvince]);

  // Auto-apply suggested province on dialog open for Best Buy orders
  useEffect(() => {
    if (open && !localProvince && suggestedProvince && sale.marketplace === 'bestbuy') {
      handleProvinceChange(suggestedProvince);
    }
  }, [open, sale.id]);

  const handleProvinceChange = async (provinceCode: string) => {
    setLocalProvince(provinceCode); // Immediately update UI
    setSavingProvince(true);
    try {
      // Fetch tax rates for the selected province
      const { data: taxRate, error: taxError } = await supabase
        .from('provincial_tax_rates')
        .select('*')
        .eq('province_code', provinceCode)
        .single();

      if (taxError) throw taxError;

      // Recalculate tax based on sale price
      let newTaxAmount = 0;
      let calculatedGst = 0, calculatedHst = 0, calculatedPst = 0, calculatedQst = 0;

      if (taxRate.is_hst_province && taxRate.hst_rate) {
        calculatedHst = parseFloat((sale.sale_price * taxRate.hst_rate / 100).toFixed(2));
        newTaxAmount = calculatedHst;
      } else {
        if (taxRate.gst_rate) calculatedGst = parseFloat((sale.sale_price * taxRate.gst_rate / 100).toFixed(2));
        if (taxRate.pst_rate) calculatedPst = parseFloat((sale.sale_price * taxRate.pst_rate / 100).toFixed(2));
        if (taxRate.qst_rate) calculatedQst = parseFloat((sale.sale_price * taxRate.qst_rate / 100).toFixed(2));
        newTaxAmount = calculatedGst + calculatedPst + calculatedQst;
      }

      // Update the sale with new province and recalculated tax
      const { error: updateError } = await supabase
        .from('sales')
        .update({
          shipping_province: provinceCode,
          tax_amount: parseFloat(newTaxAmount.toFixed(2)),
        })
        .eq('id', sale.id);

      if (updateError) throw updateError;

      // Update sales_tax_details
      await supabase
        .from('sales_tax_details')
        .update({
          customer_province: provinceCode,
          gst_amount: calculatedGst,
          hst_amount: calculatedHst,
          pst_amount: calculatedPst,
          qst_amount: calculatedQst,
          total_tax: parseFloat(newTaxAmount.toFixed(2)),
        })
        .eq('sale_id', sale.id);

      toast.success(`Province updated to ${provinceCode} — tax recalculated to ${new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(newTaxAmount)}`);
      onSaleUpdated?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update province');
    } finally {
      setSavingProvince(false);
    }
  };

  const handleSaveManualCost = async () => {
    setSavingManualCost(true);
    try {
      const costValue = manualCostAmount ? parseFloat(manualCostAmount) : null;
      const { error } = await supabase.from('sales').update({
        manual_cost: costValue,
        manual_cost_description: manualCostDesc || null,
        accounting_status: costValue ? 'fully_processed' : 'revenue_only',
      } as any).eq('id', sale.id);
      if (error) throw error;
      toast.success(costValue ? 'Manual cost saved — profit updated' : 'Manual cost cleared');
      onSaleUpdated?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save manual cost');
    } finally {
      setSavingManualCost(false);
    }
  };

  const handleClearManualCost = async () => {
    setSavingManualCost(true);
    try {
      const { error } = await supabase.from('sales').update({
        manual_cost: null,
        manual_cost_description: null,
        accounting_status: 'revenue_only',
      } as any).eq('id', sale.id);
      if (error) throw error;
      setManualCostAmount('');
      setManualCostDesc('');
      toast.success('Manual cost cleared');
      onSaleUpdated?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to clear manual cost');
    } finally {
      setSavingManualCost(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });

  const costPrice = sale.devices?.cost_price ?? sale.manual_cost ?? 0;
  const hasCost = !!(sale.devices?.cost_price || sale.manual_cost);
  const grossRevenue = sale.sale_price;
  const totalDeductions = sale.shipping_cost + sale.marketplace_fees + sale.tax_amount;
  const netRevenue = grossRevenue - totalDeductions;
  const profit = sale.profit ?? (netRevenue - costPrice);

  const handleLinkDevice = async () => {
    if (!selectedDeviceId && !selectedProductId) return;
    setLinking(true);
    try {
      if (selectedDeviceId) {
        const { data: device } = await supabase.from('devices').select('cost_price, sale_price').eq('id', selectedDeviceId).single();
        
        const { error: saleError } = await supabase.from('sales').update({
          device_id: selectedDeviceId,
          accounting_status: 'unprocessed',
        }).eq('id', sale.id);
        if (saleError) throw saleError;

        const { error: deviceError } = await supabase.from('devices').update({
          status: 'sold' as any,
          sale_price: sale.sale_price,
        }).eq('id', selectedDeviceId);
        if (deviceError) throw deviceError;

        toast.success('Device linked to order');
      } else if (selectedProductId) {
        // Create a sale_item linking the product to this sale
        const { data: product } = await supabase.from('products').select('name, sku, cost_price, sale_price').eq('id', selectedProductId).single();
        if (!product) throw new Error('Product not found');

        const { error: itemError } = await supabase.from('sale_items').insert({
          sale_id: sale.id,
          product_id: selectedProductId,
          description: product.name,
          sku: product.sku,
          quantity: 1,
          unit_price: sale.sale_price,
          cost_price: product.cost_price || 0,
          total: sale.sale_price,
        } as any);
        if (itemError) throw itemError;

        toast.success('Product linked to order');
      }

      setShowLinkDevice(false);
      setSelectedDeviceId(null);
      setSelectedProductId(null);
      onSaleUpdated?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to link item');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkDevice = async () => {
    if (!sale.device_id) return;
    setLinking(true);
    try {
      const { error: saleError } = await supabase.from('sales').update({
        device_id: null,
        accounting_status: 'revenue_only',
      }).eq('id', sale.id);
      if (saleError) throw saleError;

      const { error: deviceError } = await supabase.from('devices').update({
        status: 'in_stock' as any,
        sale_price: null,
      }).eq('id', sale.device_id);
      if (deviceError) throw deviceError;

      // Clean up COGS journal entries
      const { data: cogsEntries } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('reference_id', sale.id)
        .eq('reference_type', 'sale')
        .ilike('description', 'COGS%');

      if (cogsEntries && cogsEntries.length > 0) {
        const entryIds = cogsEntries.map(e => e.id);
        await supabase.from('journal_entry_lines').delete().in('journal_entry_id', entryIds);
        await supabase.from('journal_entries').delete().in('id', entryIds);
      }

      toast.success('Device unlinked — COGS entries reversed');
      onSaleUpdated?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to unlink device');
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Order {sale.order_number}</span>
            <div className="flex items-center gap-2">
              <MarketplaceBadge marketplace={sale.marketplace as any} />
              {hasReturn && (
                <Badge variant="outline" className="text-destructive border-destructive/50">
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Returned
                </Badge>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Details for order {sale.order_number}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Status Row */}
          <div className="flex items-center gap-3 flex-wrap">
            <MarketplaceStatusBadge marketplace={sale.marketplace as any} marketplaceStatus={sale.marketplace_status} />
            <FulfillmentBadge status={(sale.fulfillment_status || 'received') as any} />
            {sale.accounting_status && (
              <Badge variant="outline" className="text-xs capitalize">{sale.accounting_status.replace('_', ' ')}</Badge>
            )}
          </div>

          <Separator />

          {/* Customer Info */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Customer
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Name</p>
                <p className="font-medium">{sale.customer_name || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Email</p>
                <p className="font-medium">{sale.customer_email || '—'}</p>
              </div>
              {sale.shipping_address && (
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs flex items-center gap-1"><MapPin className="h-3 w-3" /> Shipping Address</p>
                  <p className="font-medium">{sale.shipping_address}</p>
                </div>
              )}
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs flex items-center gap-1 mb-1">
                  <MapPin className="h-3 w-3" /> Shipping Province (for tax)
                  {!localProvince && !suggestedProvince && (
                    <span className="inline-flex items-center gap-0.5 text-destructive ml-1">
                      <AlertTriangle className="h-3 w-3" /> Not set
                    </span>
                  )}
                  {!localProvince && suggestedProvince && (
                    <span className="inline-flex items-center gap-0.5 text-amber-500 ml-1 text-[10px]">
                      Detected: {suggestedProvince} —
                      <button
                        className="underline font-medium hover:text-foreground"
                        onClick={() => handleProvinceChange(suggestedProvince)}
                        disabled={savingProvince}
                      >
                        Apply
                      </button>
                    </span>
                  )}
                </p>
                <Select
                  value={localProvince || 'none'}
                  onValueChange={(v) => { if (v !== 'none') handleProvinceChange(v); }}
                  disabled={savingProvince}
                >
                  <SelectTrigger className="h-8 text-sm w-[220px]">
                    <SelectValue placeholder="Select province" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select province…</SelectItem>
                    {PROVINCES.map(p => (
                      <SelectItem key={p.code} value={p.code}>{p.code} — {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Device / Item */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" /> Item & Cost
            </h4>
            {sale.devices ? (
              <div className="bg-muted/30 border border-border/40 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{sale.devices.brand} {sale.devices.model}</p>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      {sale.devices.imei && <span className="font-mono">IMEI: {sale.devices.imei}</span>}
                      {sale.devices.storage && <span>{sale.devices.storage}</span>}
                      {sale.devices.color && <span>{sale.devices.color}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-muted-foreground">Cost: {formatCurrency(costPrice)}</p>
                    <Button variant="ghost" size="sm" onClick={handleUnlinkDevice} disabled={linking} className="text-destructive hover:text-destructive">
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : sale.manual_cost ? (
              <div className="bg-muted/30 border border-border/40 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                      Manual Cost Entry
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{sale.manual_cost_description || 'Direct cost (labour, services, etc.)'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-muted-foreground">Cost: {formatCurrency(sale.manual_cost)}</p>
                    <Button variant="ghost" size="sm" onClick={handleClearManualCost} disabled={savingManualCost} className="text-destructive hover:text-destructive">
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-muted/20 border border-border/40 rounded-lg p-3">
                {showLinkDevice ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Link an item or enter a manual cost</p>
                    <Tabs value={linkType} onValueChange={(v) => { setLinkType(v as any); setSelectedDeviceId(null); setSelectedProductId(null); }}>
                      <TabsList className="w-full">
                        <TabsTrigger value="device" className="flex-1">Device</TabsTrigger>
                        <TabsTrigger value="product" className="flex-1">Product</TabsTrigger>
                        <TabsTrigger value="manual" className="flex-1">Manual Cost</TabsTrigger>
                      </TabsList>
                      <TabsContent value="device" className="mt-2">
                        <DeviceSearchCombobox
                          value={selectedDeviceId}
                          onSelect={(device) => setSelectedDeviceId(device?.id ?? null)}
                          companyId={sale.company_id || undefined}
                        />
                      </TabsContent>
                      <TabsContent value="product" className="mt-2">
                        <ProductSearchCombobox
                          value={selectedProductId}
                          onSelect={(product) => setSelectedProductId(product?.id ?? null)}
                          companyId={sale.company_id || undefined}
                        />
                      </TabsContent>
                      <TabsContent value="manual" className="mt-2 space-y-3">
                        <div>
                          <Label className="text-xs">Cost Amount</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="e.g. 50.00"
                            value={manualCostAmount}
                            onChange={(e) => setManualCostAmount(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Description</Label>
                          <Textarea
                            placeholder="e.g. 2 hours labour @ $25/hr, service fee, parts..."
                            value={manualCostDesc}
                            onChange={(e) => setManualCostDesc(e.target.value)}
                            rows={2}
                          />
                        </div>
                      </TabsContent>
                    </Tabs>
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => { setShowLinkDevice(false); setSelectedDeviceId(null); setSelectedProductId(null); }}>Cancel</Button>
                      {linkType === 'manual' ? (
                        <Button size="sm" onClick={handleSaveManualCost} disabled={!manualCostAmount || savingManualCost}>
                          {savingManualCost ? 'Saving...' : 'Save Cost'}
                        </Button>
                      ) : (
                        <Button size="sm" onClick={handleLinkDevice} disabled={(!selectedDeviceId && !selectedProductId) || linking}>
                          {linking ? 'Linking...' : 'Confirm Link'}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">No item linked to this order</p>
                      {sale.product_title && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Marketplace listing: {sale.product_title}
                          {sale.marketplace_sku && <span className="font-mono ml-1">({sale.marketplace_sku})</span>}
                        </p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowLinkDevice(true)}>
                      <Link className="h-3.5 w-3.5 mr-1.5" />
                      Link / Add Cost
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Financial Breakdown */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Financial Breakdown
            </h4>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sale Price</span>
                <span className="font-medium">{formatCurrency(grossRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping Cost</span>
                <span className="text-destructive">-{formatCurrency(sale.shipping_cost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Marketplace Fees</span>
                <span className="text-destructive">-{formatCurrency(sale.marketplace_fees)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Tax {sale.is_marketplace_remitted ? '(marketplace remits)' : '(you remit)'}
                </span>
                <span className="text-destructive">-{formatCurrency(sale.tax_amount)}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Net Revenue</span>
                <span className="font-medium">{formatCurrency(netRevenue)}</span>
              </div>
              {hasCost && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {sale.devices ? 'Cost of Goods (COGS)' : 'Direct Cost'}
                    {sale.manual_cost && !sale.devices && (
                      <span className="text-xs ml-1">({sale.manual_cost_description || 'manual'})</span>
                    )}
                  </span>
                  <span className="text-destructive">-{formatCurrency(costPrice)}</span>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between text-base font-bold">
                <span>Profit / Loss</span>
                <span className={profit >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}>
                  {formatCurrency(profit)}
                </span>
              </div>
            </div>
          </div>

          {/* Date & Notes */}
          <Separator />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Sale Date</p>
              <p className="font-medium">{formatDate(sale.sale_date)}</p>
            </div>
            {sale.notes && (
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs flex items-center gap-1"><FileText className="h-3 w-3" /> Notes</p>
                <p className="text-sm">{sale.notes}</p>
              </div>
            )}
          </div>

          {/* Return Action */}
          {!hasReturn && (
            <>
              <Separator />
              <Button
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => {
                  onOpenChange(false);
                  onInitiateReturn();
                }}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Initiate Return
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
