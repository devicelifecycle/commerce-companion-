import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { emitRefetch } from '@/hooks/useDataRefetch';
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
import {
  Package, User, MapPin, DollarSign, Calendar, FileText, RotateCcw,
  Link, Unlink, AlertTriangle, Wrench, ShoppingCart, Hash, Building2,
  Clock, CreditCard, TrendingUp, TrendingDown, Copy, ExternalLink,
  ChevronRight, Receipt, Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeviceSearchCombobox } from '@/components/inventory/DeviceSearchCombobox';
import { ProductSearchCombobox } from '@/components/inventory/ProductSearchCombobox';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCompany } from '@/contexts/CompanyContext';

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
  is_multi_item?: boolean | null;
  item_count?: number | null;
  subtotal?: number | null;
  created_at?: string;
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

interface SaleItem {
  id: string;
  description: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  cost_price: number | null;
  total: number;
  imei: string | null;
  device_id: string | null;
  product_id: string | null;
}

interface OrderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  onInitiateReturn: () => void;
  hasReturn: boolean;
  onSaleUpdated?: () => void;
}

function extractProvinceFromAddress(address: string | null): string | null {
  if (!address) return null;
  const upper = address.toUpperCase().trim();
  const PROVINCE_MAP: Record<string, string> = {
    'ONTARIO': 'ON', 'QUEBEC': 'QC', 'BRITISH COLUMBIA': 'BC', 'ALBERTA': 'AB',
    'MANITOBA': 'MB', 'SASKATCHEWAN': 'SK', 'NOVA SCOTIA': 'NS', 'NEW BRUNSWICK': 'NB',
    'NEWFOUNDLAND': 'NL', 'NEWFOUNDLAND AND LABRADOR': 'NL', 'PRINCE EDWARD ISLAND': 'PE',
    'NORTHWEST TERRITORIES': 'NT', 'NUNAVUT': 'NU', 'YUKON': 'YT',
    'PQ': 'QC', 'NFLD': 'NL', 'PEI': 'PE', 'NWT': 'NT',
  };
  const validCodes = new Set(['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'NU', 'YT']);
  const postalMatch = upper.match(/\b([A-Z]{2})\s+[A-Z]\d[A-Z]\s*\d[A-Z]\d/);
  if (postalMatch && validCodes.has(postalMatch[1])) return postalMatch[1];
  const parts = upper.split(',').map(p => p.trim());
  for (const part of parts) {
    const firstWord = part.split(/\s+/)[0];
    if (validCodes.has(firstWord)) return firstWord;
    for (const [name, code] of Object.entries(PROVINCE_MAP)) {
      if (part.includes(name)) return code;
    }
  }
  for (const code of validCodes) {
    if (new RegExp(`\\b${code}\\b`).test(upper)) return code;
  }
  return null;
}

function InfoRow({ label, value, icon, mono, className }: { label: string; value: React.ReactNode; icon?: React.ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mb-0.5">{icon}{label}</p>
      <p className={`text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );
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
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [returnData, setReturnData] = useState<any>(null);
  const [companyName, setCompanyName] = useState<string>('');

  const { companies } = useCompany();

  useEffect(() => {
    setLocalProvince(sale.shipping_province || null);
    setManualCostAmount(sale.manual_cost?.toString() || '');
    setManualCostDesc(sale.manual_cost_description || '');
  }, [sale.shipping_province, sale.id, sale.manual_cost]);

  useEffect(() => {
    if (sale.company_id && companies.length > 0) {
      const c = companies.find(c => c.id === sale.company_id);
      setCompanyName(c?.name || '');
    }
  }, [sale.company_id, companies]);

  useEffect(() => {
    if (!open) return;
    setLoadingItems(true);
    setReturnData(null);

    supabase
      .from('sale_items')
      .select('id, description, sku, quantity, unit_price, cost_price, total, imei, device_id, product_id')
      .eq('sale_id', sale.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setSaleItems((data || []) as SaleItem[]);
        setLoadingItems(false);
      });

    supabase
      .from('return_authorizations')
      .select('*')
      .eq('sale_id', sale.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setReturnData(data);
      });
  }, [open, sale.id]);

  const suggestedProvince = useMemo(() => {
    if (localProvince) return null;
    return extractProvinceFromAddress(sale.shipping_address);
  }, [sale.shipping_address, localProvince]);

  useEffect(() => {
    if (open && !localProvince && suggestedProvince && sale.marketplace === 'bestbuy') {
      handleProvinceChange(suggestedProvince);
    }
  }, [open, sale.id]);

  const handleProvinceChange = async (provinceCode: string) => {
    setLocalProvince(provinceCode);
    setSavingProvince(true);
    try {
      const { data: taxRate, error: taxError } = await supabase
        .from('provincial_tax_rates')
        .select('*')
        .eq('province_code', provinceCode)
        .single();
      if (taxError) throw taxError;

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

      const { error: updateError } = await supabase
        .from('sales')
        .update({
          shipping_province: provinceCode,
          tax_amount: parseFloat(newTaxAmount.toFixed(2)),
        })
        .eq('id', sale.id);
      if (updateError) throw updateError;

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

      toast.success(`Province updated to ${provinceCode} — tax recalculated to ${formatCurrency(newTaxAmount)}`);
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
      const { data: existingCOGS } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('reference_id', sale.id)
        .eq('reference_type', 'sale')
        .ilike('description', 'COGS%');
      if (existingCOGS && existingCOGS.length > 0) {
        for (const entry of existingCOGS) {
          await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', entry.id);
          await supabase.from('journal_entries').delete().eq('id', entry.id);
        }
      }

      const { error } = await supabase.from('sales').update({
        manual_cost: costValue,
        manual_cost_description: manualCostDesc || null,
        accounting_status: costValue ? 'revenue_only' : 'revenue_only',
      } as any).eq('id', sale.id);
      if (error) throw error;

      if (costValue && costValue > 0) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          await supabase.functions.invoke('process-sale-accounting', {
            body: { sale_ids: [sale.id] },
            headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
          });
        } catch (accErr: any) {
          console.error('Accounting trigger error:', accErr);
          toast.error('Cost saved but accounting entries failed — re-run accounting from Financials');
        }
      }

      toast.success(costValue ? 'Manual cost saved — COGS posted to P&L' : 'Manual cost cleared');
      emitRefetch('sales');
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
      const { data: existingCOGS } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('reference_id', sale.id)
        .eq('reference_type', 'sale')
        .ilike('description', 'COGS%');
      if (existingCOGS && existingCOGS.length > 0) {
        for (const entry of existingCOGS) {
          await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', entry.id);
          await supabase.from('journal_entries').delete().eq('id', entry.id);
        }
      }

      const { error } = await supabase.from('sales').update({
        manual_cost: null,
        manual_cost_description: null,
        accounting_status: 'revenue_only',
      } as any).eq('id', sale.id);
      if (error) throw error;
      setManualCostAmount('');
      setManualCostDesc('');
      toast.success('Manual cost cleared — COGS entries reversed');
      emitRefetch('sales');
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
    new Date(dateString).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });

  const formatDateTime = (dateString: string) =>
    new Date(dateString).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const costPrice = sale.devices?.cost_price ?? sale.manual_cost ?? 0;
  const hasCost = !!(sale.devices?.cost_price || sale.manual_cost);
  const grossRevenue = sale.sale_price;
  const totalDeductions = sale.shipping_cost + sale.marketplace_fees + sale.tax_amount;
  const netRevenue = grossRevenue - totalDeductions;
  const profit = sale.profit ?? (netRevenue - costPrice);
  const profitMargin = grossRevenue > 0 ? ((profit / grossRevenue) * 100) : 0;
  const isMultiItem = sale.is_multi_item || (sale.item_count && sale.item_count > 1) || saleItems.length > 1;

  const handleLinkDevice = async () => {
    if (!selectedDeviceId && !selectedProductId) return;
    setLinking(true);
    try {
      if (selectedDeviceId) {
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

  const handleCopyOrderNumber = () => {
    navigator.clipboard.writeText(sale.order_number);
    toast.success('Order number copied');
  };

  const provinceName = PROVINCES.find(p => p.code === localProvince)?.name || localProvince;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden">
        <DialogDescription className="sr-only">Details for order {sale.order_number}</DialogDescription>

        {/* ── Header ── */}
        <div className="border-b border-border/60 bg-muted/20 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-bold flex items-center gap-2 flex-wrap">
                <span className="truncate">{sale.order_number}</span>
                <button onClick={handleCopyOrderNumber} className="text-muted-foreground hover:text-foreground transition-colors">
                  <Copy className="h-3.5 w-3.5" />
                </button>
                {isMultiItem && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 font-normal">
                    {sale.item_count || saleItems.length} items
                  </Badge>
                )}
              </DialogTitle>
              {sale.product_title && (
                <p className="text-sm text-muted-foreground mt-1 truncate">{sale.product_title}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <MarketplaceBadge marketplace={sale.marketplace as any} />
              <MarketplaceStatusBadge marketplace={sale.marketplace} marketplaceStatus={sale.marketplace_status} />
              <FulfillmentBadge status={(sale.fulfillment_status || 'received') as any} />
            </div>
          </div>

          {/* Quick stats bar */}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(sale.sale_date)}
            </span>
            {companyName && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {companyName}
              </span>
            )}
            {sale.marketplace_sku && (
              <span className="flex items-center gap-1 font-mono">
                <Hash className="h-3 w-3" />
                {sale.marketplace_sku}
              </span>
            )}
            {sale.accounting_status && (
              <Badge variant="outline" className="text-[10px] px-1.5 h-5 capitalize font-normal">
                {sale.accounting_status.replace(/_/g, ' ')}
              </Badge>
            )}
            {hasReturn && (
              <Badge variant="outline" className="text-[10px] px-1.5 h-5 text-destructive border-destructive/40">
                <RotateCcw className="h-2.5 w-2.5 mr-0.5" />
                Returned
              </Badge>
            )}
          </div>
        </div>

        {/* ── Body — two columns ── */}
        <ScrollArea className="max-h-[calc(85vh-160px)]">
          <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-border/50">

            {/* LEFT COLUMN — 3/5 */}
            <div className="lg:col-span-3 p-5 space-y-5">

              {/* Line Items */}
              {saleItems.length > 0 && (
                <section>
                  <SectionTitle icon={<Package className="h-3.5 w-3.5" />} title={`Order Items (${saleItems.length})`} />
                  <div className="border border-border/40 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 text-[11px] text-muted-foreground uppercase tracking-wider">
                          <th className="text-left px-3 py-2 font-medium">Item</th>
                          <th className="text-right px-3 py-2 font-medium w-10">Qty</th>
                          <th className="text-right px-3 py-2 font-medium w-20">Price</th>
                          <th className="text-right px-3 py-2 font-medium w-20">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {saleItems.map((item) => (
                          <tr key={item.id} className="border-t border-border/30">
                            <td className="px-3 py-2">
                              <p className="font-medium leading-tight text-sm">{item.description}</p>
                              <div className="flex gap-2 mt-0.5 text-[10px] text-muted-foreground">
                                {item.sku && <span className="font-mono">SKU: {item.sku}</span>}
                                {item.imei && <span className="font-mono">IMEI: {item.imei}</span>}
                                {item.cost_price != null && <span>Cost: {formatCurrency(item.cost_price)}</span>}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(item.unit_price)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(item.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Linked Inventory & Cost */}
              <section>
                <SectionTitle icon={<Package className="h-3.5 w-3.5" />} title="Linked Inventory & Cost" />
                {sale.devices ? (
                  <div className="bg-muted/20 border border-border/40 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">{sale.devices.brand} {sale.devices.model}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                          {sale.devices.imei && <span className="font-mono">IMEI: {sale.devices.imei}</span>}
                          {sale.devices.storage && <span>{sale.devices.storage}</span>}
                          {sale.devices.color && <span>{sale.devices.color}</span>}
                          {sale.devices.condition && <span className="capitalize">{sale.devices.condition}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-semibold tabular-nums">{formatCurrency(costPrice)}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={handleUnlinkDevice} disabled={linking}>
                          <Unlink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : sale.manual_cost ? (
                  <div className="bg-muted/20 border border-border/40 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sm flex items-center gap-1.5">
                          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                          Manual Cost Entry
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{sale.manual_cost_description || 'Direct cost (labour, services, etc.)'}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-semibold tabular-nums">{formatCurrency(sale.manual_cost)}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={handleClearManualCost} disabled={savingManualCost}>
                          <Unlink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-muted/10 border border-dashed border-border/50 rounded-lg p-3">
                    {showLinkDevice ? (
                      <div className="space-y-3">
                        <Tabs value={linkType} onValueChange={(v) => { setLinkType(v as any); setSelectedDeviceId(null); setSelectedProductId(null); }}>
                          <TabsList className="w-full h-8">
                            <TabsTrigger value="device" className="flex-1 text-xs">Device</TabsTrigger>
                            <TabsTrigger value="product" className="flex-1 text-xs">Product</TabsTrigger>
                            <TabsTrigger value="manual" className="flex-1 text-xs">Manual Cost</TabsTrigger>
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
                          <TabsContent value="manual" className="mt-2 space-y-2">
                            <div>
                              <Label className="text-xs">Cost Amount</Label>
                              <Input type="number" step="0.01" placeholder="e.g. 50.00" value={manualCostAmount} onChange={(e) => setManualCostAmount(e.target.value)} className="h-8" />
                            </div>
                            <div>
                              <Label className="text-xs">Description</Label>
                              <Textarea placeholder="e.g. 2 hours labour @ $25/hr" value={manualCostDesc} onChange={(e) => setManualCostDesc(e.target.value)} rows={2} />
                            </div>
                          </TabsContent>
                        </Tabs>
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowLinkDevice(false); setSelectedDeviceId(null); setSelectedProductId(null); }}>Cancel</Button>
                          {linkType === 'manual' ? (
                            <Button size="sm" className="h-7 text-xs" onClick={handleSaveManualCost} disabled={!manualCostAmount || savingManualCost}>
                              {savingManualCost ? 'Saving...' : 'Save Cost'}
                            </Button>
                          ) : (
                            <Button size="sm" className="h-7 text-xs" onClick={handleLinkDevice} disabled={(!selectedDeviceId && !selectedProductId) || linking}>
                              {linking ? 'Linking...' : 'Confirm Link'}
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">No inventory item linked</p>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowLinkDevice(true)}>
                          <Link className="h-3 w-3 mr-1" />
                          Link / Add Cost
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Refund / Return */}
              {returnData && (
                <section>
                  <SectionTitle icon={<RotateCcw className="h-3.5 w-3.5" />} title="Refund / Return" />
                  <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <InfoRow label="RMA #" value={returnData.rma_number} mono />
                      <InfoRow label="Status" value={<span className="capitalize">{returnData.status}</span>} />
                      <InfoRow label="Resolution" value={<span className="capitalize">{returnData.resolution_type}</span>} />
                      <InfoRow label="Refund Amount" value={<span className="text-destructive font-semibold">{formatCurrency(Number(returnData.refund_amount || 0))}</span>} />
                      <InfoRow label="Tax Refunded" value={<span className="text-destructive">{formatCurrency(Number(returnData.tax_refunded || 0))}</span>} />
                      <InfoRow label="Refund Date" value={returnData.refund_date ? formatDate(returnData.refund_date) : '—'} />
                    </div>
                    {returnData.reason && (
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-0.5">Reason</p>
                        <p className="text-sm">{returnData.reason}</p>
                      </div>
                    )}
                    {returnData.notes && (
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-0.5">Notes</p>
                        <p className="text-sm">{returnData.notes}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1 border-t border-destructive/10">
                      <span className="text-[11px] text-muted-foreground">Accounting:</span>
                      {returnData.accounting_status === 'processed' ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 h-5 text-emerald-500 border-emerald-500/30">JE Posted</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 h-5 text-amber-500 border-amber-500/30">Pending</Badge>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* Notes */}
              {sale.notes && (
                <section>
                  <SectionTitle icon={<FileText className="h-3.5 w-3.5" />} title="Notes" />
                  <p className="text-sm text-muted-foreground leading-relaxed bg-muted/20 border border-border/30 rounded-lg p-3">{sale.notes}</p>
                </section>
              )}
            </div>

            {/* RIGHT COLUMN — 2/5 */}
            <div className="lg:col-span-2 p-5 space-y-5 bg-muted/5">

              {/* Financial Summary */}
              <section>
                <SectionTitle icon={<DollarSign className="h-3.5 w-3.5" />} title="Financial Summary" />
                <div className="space-y-2 text-sm">
                  {sale.subtotal != null && sale.subtotal !== sale.sale_price && (
                    <FinancialRow label="Subtotal" value={formatCurrency(sale.subtotal)} />
                  )}
                  <FinancialRow label="Sale Price" value={formatCurrency(grossRevenue)} bold />
                  <FinancialRow label="Shipping" value={`-${formatCurrency(sale.shipping_cost)}`} negative />
                  <FinancialRow label="Marketplace Fees" value={`-${formatCurrency(sale.marketplace_fees)}`} negative />
                  <FinancialRow
                    label={`Tax ${sale.is_marketplace_remitted ? '(mkt remits)' : '(you remit)'}`}
                    value={`-${formatCurrency(sale.tax_amount)}`}
                    negative
                  />
                  <Separator className="my-1.5" />
                  <FinancialRow label="Net Revenue" value={formatCurrency(netRevenue)} bold />
                  {hasCost && (
                    <FinancialRow
                      label={sale.devices ? 'COGS' : 'Direct Cost'}
                      value={`-${formatCurrency(costPrice)}`}
                      negative
                    />
                  )}
                  <Separator className="my-1.5" />
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-bold text-base">Profit / Loss</span>
                    <div className="text-right">
                      <span className={`font-bold text-base tabular-nums ${profit >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
                        {formatCurrency(profit)}
                      </span>
                      <p className={`text-[10px] flex items-center justify-end gap-0.5 ${profit >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
                        {profit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {profitMargin.toFixed(1)}% margin
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <Separator />

              {/* Customer & Shipping */}
              <section>
                <SectionTitle icon={<User className="h-3.5 w-3.5" />} title="Customer" />
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2">
                    <InfoRow label="Name" value={sale.customer_name} />
                    <InfoRow label="Email" value={sale.customer_email ? <span className="truncate block">{sale.customer_email}</span> : '—'} />
                  </div>
                  {sale.shipping_address && (
                    <div>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mb-0.5">
                        <Truck className="h-3 w-3" /> Shipping Address
                      </p>
                      <p className="text-sm font-medium leading-snug">{sale.shipping_address}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
                      <MapPin className="h-3 w-3" /> Province (tax)
                      {!localProvince && !suggestedProvince && (
                        <span className="inline-flex items-center gap-0.5 text-destructive ml-1">
                          <AlertTriangle className="h-3 w-3" /> Not set
                        </span>
                      )}
                      {!localProvince && suggestedProvince && (
                        <span className="inline-flex items-center gap-0.5 text-amber-500 ml-1 text-[10px]">
                          Detected: {suggestedProvince} —
                          <button className="underline font-medium hover:text-foreground" onClick={() => handleProvinceChange(suggestedProvince)} disabled={savingProvince}>Apply</button>
                        </span>
                      )}
                    </p>
                    <Select
                      value={localProvince || 'none'}
                      onValueChange={(v) => { if (v !== 'none') handleProvinceChange(v); }}
                      disabled={savingProvince}
                    >
                      <SelectTrigger className="h-8 text-xs">
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
              </section>

              <Separator />

              {/* Order Meta */}
              <section>
                <SectionTitle icon={<Receipt className="h-3.5 w-3.5" />} title="Order Details" />
                <div className="grid grid-cols-2 gap-2">
                  <InfoRow label="Order Date" value={formatDate(sale.sale_date)} />
                  <InfoRow label="Marketplace" value={<span className="capitalize">{sale.marketplace}</span>} />
                  <InfoRow label="Fulfillment" value={<span className="capitalize">{sale.fulfillment_status || 'Unknown'}</span>} />
                  <InfoRow label="Province" value={provinceName || '—'} />
                  {sale.created_at && (
                    <InfoRow className="col-span-2" label="Imported At" value={formatDateTime(sale.created_at)} icon={<Clock className="h-3 w-3" />} />
                  )}
                </div>
              </section>

              {/* Actions */}
              {!hasReturn && !returnData && (
                <>
                  <Separator />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-destructive hover:text-destructive h-8 text-xs"
                    onClick={() => {
                      onOpenChange(false);
                      onInitiateReturn();
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Initiate Return / Refund
                  </Button>
                </>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
      {icon} {title}
    </h4>
  );
}

function FinancialRow({ label, value, bold, negative }: { label: string; value: string; bold?: boolean; negative?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-muted-foreground ${bold ? 'font-medium text-foreground' : ''}`}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-semibold' : ''} ${negative ? 'text-destructive/80' : ''}`}>{value}</span>
    </div>
  );
}
