import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { emitRefetch } from '@/hooks/useDataRefetch';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
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
  Link as LinkIcon, Unlink, AlertTriangle, Wrench, Hash, Building2,
  Clock, TrendingUp, TrendingDown, Copy, Receipt, Truck, CheckCircle2,
  Circle, ShoppingBag, Mail, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeviceSearchCombobox } from '@/components/inventory/DeviceSearchCombobox';
import { ProductSearchCombobox } from '@/components/inventory/ProductSearchCombobox';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCompany } from '@/contexts/CompanyContext';
import { cn } from '@/lib/utils';

const PROVINCES = [
  { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' }, { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' }, { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' }, { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' }, { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' }, { code: 'SK', name: 'Saskatchewan' }, { code: 'YT', name: 'Yukon' },
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
  const [activeTab, setActiveTab] = useState<string>('overview');

  const { companies } = useCompany();

  useEffect(() => {
    setLocalProvince(sale.shipping_province || null);
    setManualCostAmount(sale.manual_cost?.toString() || '');
    setManualCostDesc(sale.manual_cost_description || '');
    setActiveTab('overview');
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
        accounting_status: 'revenue_only',
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
      setShowLinkDevice(false);
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
  const hasLinkedItem = !!sale.devices || !!sale.manual_cost || saleItems.length > 0;
  const grossRevenue = sale.sale_price;
  const totalDeductions = sale.shipping_cost + sale.marketplace_fees + sale.tax_amount;
  const netRevenue = grossRevenue - totalDeductions;
  const profit = sale.profit ?? (netRevenue - costPrice);
  const profitMargin = grossRevenue > 0 ? ((profit / grossRevenue) * 100) : 0;
  const isMultiItem = sale.is_multi_item || (sale.item_count && sale.item_count > 1) || saleItems.length > 1;
  const provinceName = PROVINCES.find(p => p.code === localProvince)?.name || localProvince;

  // Workflow status — derive completion of each step
  const steps = [
    { key: 'imported', label: 'Imported', done: true, time: sale.created_at },
    { key: 'province', label: 'Tax Province Set', done: !!localProvince },
    { key: 'cost', label: 'Cost Linked', done: hasCost },
    { key: 'accounting', label: 'Accounting Posted', done: sale.accounting_status === 'posted' || sale.accounting_status === 'processed' },
    { key: 'fulfilled', label: 'Fulfilled', done: ['shipped', 'delivered', 'fulfilled'].includes((sale.fulfillment_status || '').toLowerCase()) },
  ];
  const completedSteps = steps.filter(s => s.done).length;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 gap-0 h-[92vh] flex flex-col overflow-hidden">
        <DialogDescription className="sr-only">Details for order {sale.order_number}</DialogDescription>

        {/* ── Hero header ── */}
        <div className="border-b border-border/60 bg-gradient-to-br from-muted/40 to-muted/10 px-6 pt-5 pb-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-6">
            {/* Left: identity */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
                <span>Order</span>
                {companyName && (<><span>·</span><Building2 className="h-3 w-3" /><span>{companyName}</span></>)}
              </div>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2 flex-wrap font-display">
                <span className="truncate">{sale.order_number}</span>
                <button onClick={handleCopyOrderNumber} className="text-muted-foreground hover:text-foreground transition-colors" title="Copy order number">
                  <Copy className="h-4 w-4" />
                </button>
              </DialogTitle>
              {sale.product_title && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{sale.product_title}</p>
              )}
              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                <MarketplaceBadge marketplace={sale.marketplace as any} />
                <MarketplaceStatusBadge marketplace={sale.marketplace} marketplaceStatus={sale.marketplace_status} />
                <FulfillmentBadge status={(sale.fulfillment_status || 'received') as any} />
                {isMultiItem && (
                  <Badge variant="secondary" className="text-[10px]">
                    <ShoppingBag className="h-2.5 w-2.5 mr-1" />
                    {sale.item_count || saleItems.length} items
                  </Badge>
                )}
                {hasReturn && (
                  <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">
                    <RotateCcw className="h-2.5 w-2.5 mr-1" />
                    {returnData?.status === 'completed' || returnData?.status === 'closed' ? 'Returned' : 'RMA Open'}
                  </Badge>
                )}
              </div>
            </div>

            {/* Right: hero metrics */}
            <div className="flex-shrink-0 grid grid-cols-3 gap-5 text-right">
              <HeroMetric label="Sale Price" value={formatCurrency(grossRevenue)} />
              <HeroMetric
                label="Net Revenue"
                value={formatCurrency(netRevenue)}
                hint={`${formatCurrency(totalDeductions)} deductions`}
              />
              <HeroMetric
                label="Profit"
                value={formatCurrency(profit)}
                tone={hasCost ? (profit >= 0 ? 'positive' : 'negative') : 'neutral'}
                hint={hasCost ? `${profitMargin.toFixed(1)}% margin` : 'Cost not linked'}
                icon={hasCost ? (profit >= 0 ? TrendingUp : TrendingDown) : undefined}
              />
            </div>
          </div>

          {/* Workflow stepper */}
          <div className="mt-4 pt-3 border-t border-border/40">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Workflow · {completedSteps}/{steps.length} complete
              </p>
              <p className="text-[10px] text-muted-foreground">
                <Calendar className="h-2.5 w-2.5 inline mr-1" />
                {formatDate(sale.sale_date)}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {steps.map((step, idx) => (
                <div key={step.key} className="flex items-center flex-1 min-w-0">
                  <div className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium flex-1 min-w-0",
                    step.done ? "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]" : "bg-muted/30 text-muted-foreground"
                  )}>
                    {step.done ? <CheckCircle2 className="h-3 w-3 flex-shrink-0" /> : <Circle className="h-3 w-3 flex-shrink-0" />}
                    <span className="truncate">{step.label}</span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={cn("h-px flex-shrink-0 w-2", step.done ? "bg-[hsl(var(--success)/0.4)]" : "bg-border/50")} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Tabbed body ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-3 border-b border-border/40 flex-shrink-0">
            <TabsList className="bg-transparent h-9 p-0 gap-1">
              <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-muted">Overview</TabsTrigger>
              <TabsTrigger value="items" className="text-xs data-[state=active]:bg-muted">
                Items & Cost {!hasLinkedItem && <AlertTriangle className="h-3 w-3 ml-1 text-warning" />}
              </TabsTrigger>
              <TabsTrigger value="customer" className="text-xs data-[state=active]:bg-muted">
                Customer & Shipping {!localProvince && <AlertTriangle className="h-3 w-3 ml-1 text-warning" />}
              </TabsTrigger>
              <TabsTrigger value="returns" className="text-xs data-[state=active]:bg-muted">
                Returns {returnData && <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px]">1</Badge>}
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-6">
              {/* OVERVIEW */}
              <TabsContent value="overview" className="mt-0 space-y-5">
                {/* Action callouts for incomplete steps */}
                {(!localProvince || !hasLinkedItem) && (
                  <div className="space-y-2">
                    {!localProvince && (
                      <ActionCallout
                        tone="amber"
                        icon={MapPin}
                        title="Tax province not set"
                        body="Tax may be miscalculated until a province is assigned."
                        actionLabel="Set province"
                        onAction={() => setActiveTab('customer')}
                      />
                    )}
                    {!hasLinkedItem && (
                      <ActionCallout
                        tone="amber"
                        icon={Package}
                        title="No inventory or cost linked"
                        body="Profit will not be accurate until you link a device, product, or manual cost."
                        actionLabel="Link cost"
                        onAction={() => setActiveTab('items')}
                      />
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Financial breakdown */}
                  <Section icon={<DollarSign className="h-3.5 w-3.5" />} title="Financial Breakdown">
                    <div className="bg-muted/15 border border-border/40 rounded-lg p-4 space-y-1.5 text-sm">
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
                      <Separator className="my-2" />
                      <FinancialRow label="Net Revenue" value={formatCurrency(netRevenue)} bold />
                      {hasCost && (
                        <FinancialRow
                          label={sale.devices ? 'COGS (linked device)' : 'Direct Cost'}
                          value={`-${formatCurrency(costPrice)}`}
                          negative
                        />
                      )}
                      <Separator className="my-2" />
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-bold">Profit / Loss</span>
                        <div className="text-right">
                          <span className={cn(
                            "font-bold text-base tabular-nums",
                            !hasCost && "text-muted-foreground",
                            hasCost && profit >= 0 && "text-[hsl(var(--success))]",
                            hasCost && profit < 0 && "text-destructive"
                          )}>
                            {formatCurrency(profit)}
                          </span>
                          {hasCost && (
                            <p className={cn(
                              "text-[10px] flex items-center justify-end gap-0.5",
                              profit >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"
                            )}>
                              {profit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {profitMargin.toFixed(1)}% margin
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </Section>

                  {/* Order metadata */}
                  <Section icon={<Receipt className="h-3.5 w-3.5" />} title="Order Details">
                    <div className="bg-muted/15 border border-border/40 rounded-lg p-4 space-y-2.5 text-sm">
                      <MetaRow label="Marketplace" value={<span className="capitalize">{sale.marketplace}</span>} />
                      {sale.marketplace_sku && (
                        <MetaRow label="Marketplace SKU" value={<span className="font-mono text-xs">{sale.marketplace_sku}</span>} icon={<Hash className="h-3 w-3" />} />
                      )}
                      <MetaRow label="Sale Date" value={formatDate(sale.sale_date)} icon={<Calendar className="h-3 w-3" />} />
                      <MetaRow label="Province" value={provinceName ? <span>{localProvince} — {provinceName}</span> : <span className="text-warning">Not set</span>} icon={<MapPin className="h-3 w-3" />} />
                      <MetaRow label="Fulfillment" value={<span className="capitalize">{sale.fulfillment_status || 'Unknown'}</span>} icon={<Truck className="h-3 w-3" />} />
                      <MetaRow label="Accounting" value={
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {(sale.accounting_status || 'unprocessed').replace(/_/g, ' ')}
                        </Badge>
                      } />
                      {sale.created_at && (
                        <MetaRow label="Imported" value={formatDateTime(sale.created_at)} icon={<Clock className="h-3 w-3" />} />
                      )}
                    </div>
                  </Section>
                </div>

                {sale.notes && (
                  <Section icon={<FileText className="h-3.5 w-3.5" />} title="Order Notes">
                    <p className="text-sm leading-relaxed bg-muted/15 border border-border/40 rounded-lg p-3">{sale.notes}</p>
                  </Section>
                )}
              </TabsContent>

              {/* ITEMS & COST */}
              <TabsContent value="items" className="mt-0 space-y-5">
                {saleItems.length > 0 && (
                  <Section icon={<Package className="h-3.5 w-3.5" />} title={`Order Items (${saleItems.length})`}>
                    <div className="border border-border/40 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/40 text-[11px] text-muted-foreground uppercase tracking-wider">
                            <th className="text-left px-3 py-2 font-medium">Item</th>
                            <th className="text-right px-3 py-2 font-medium w-12">Qty</th>
                            <th className="text-right px-3 py-2 font-medium w-24">Unit Price</th>
                            <th className="text-right px-3 py-2 font-medium w-24">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {saleItems.map((item) => (
                            <tr key={item.id} className="border-t border-border/30">
                              <td className="px-3 py-2">
                                <p className="font-medium leading-tight text-sm">{item.description}</p>
                                <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-[10px] text-muted-foreground">
                                  {item.sku && <span className="font-mono">SKU: {item.sku}</span>}
                                  {item.imei && <span className="font-mono">IMEI: {item.imei}</span>}
                                  {item.cost_price != null && <span>Cost: {formatCurrency(item.cost_price)}</span>}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(item.unit_price)}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Section>
                )}

                <Section icon={<Wrench className="h-3.5 w-3.5" />} title="Linked Inventory & Cost">
                  {sale.devices ? (
                    <div className="bg-[hsl(var(--success)/0.05)] border border-[hsl(var(--success)/0.25)] rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                            <p className="font-semibold">{sale.devices.brand} {sale.devices.model}</p>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground pl-6">
                            {sale.devices.imei && <span className="font-mono">IMEI: {sale.devices.imei}</span>}
                            {sale.devices.storage && <span>{sale.devices.storage}</span>}
                            {sale.devices.color && <span>{sale.devices.color}</span>}
                            {sale.devices.condition && <span className="capitalize">{sale.devices.condition}</span>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost</p>
                          <p className="text-base font-bold tabular-nums">{formatCurrency(costPrice)}</p>
                          <Button variant="ghost" size="sm" className="h-6 mt-1 text-[10px] text-destructive hover:text-destructive" onClick={handleUnlinkDevice} disabled={linking}>
                            <Unlink className="h-3 w-3 mr-1" /> Unlink
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : sale.manual_cost ? (
                    <div className="bg-[hsl(var(--success)/0.05)] border border-[hsl(var(--success)/0.25)] rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold flex items-center gap-2">
                            <Wrench className="h-4 w-4 text-[hsl(var(--success))]" /> Manual Cost Entry
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 pl-6">{sale.manual_cost_description || 'Direct cost (labour, services, etc.)'}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost</p>
                          <p className="text-base font-bold tabular-nums">{formatCurrency(sale.manual_cost)}</p>
                          <Button variant="ghost" size="sm" className="h-6 mt-1 text-[10px] text-destructive hover:text-destructive" onClick={handleClearManualCost} disabled={savingManualCost}>
                            <Unlink className="h-3 w-3 mr-1" /> Clear
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : showLinkDevice ? (
                    <div className="bg-muted/15 border border-border/40 rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Info className="h-3.5 w-3.5" />
                        Choose how to attach a cost so profit can be calculated.
                      </div>
                      <Tabs value={linkType} onValueChange={(v) => { setLinkType(v as any); setSelectedDeviceId(null); setSelectedProductId(null); }}>
                        <TabsList className="w-full">
                          <TabsTrigger value="device" className="flex-1 text-xs">Serialized Device</TabsTrigger>
                          <TabsTrigger value="product" className="flex-1 text-xs">Bulk Product</TabsTrigger>
                          <TabsTrigger value="manual" className="flex-1 text-xs">Manual Cost</TabsTrigger>
                        </TabsList>
                        <TabsContent value="device" className="mt-3">
                          <DeviceSearchCombobox
                            value={selectedDeviceId}
                            onSelect={(device) => setSelectedDeviceId(device?.id ?? null)}
                            companyId={sale.company_id || undefined}
                            statusFilter={['in_stock', 'hold_for_refurbishment', 'in_repair', 'refurbished']}
                          />
                        </TabsContent>
                        <TabsContent value="product" className="mt-3">
                          <ProductSearchCombobox
                            value={selectedProductId}
                            onSelect={(product) => setSelectedProductId(product?.id ?? null)}
                            companyId={sale.company_id || undefined}
                          />
                        </TabsContent>
                        <TabsContent value="manual" className="mt-3 space-y-3">
                          <div>
                            <Label className="text-xs">Cost Amount (CAD)</Label>
                            <Input type="number" step="0.01" placeholder="e.g. 50.00" value={manualCostAmount} onChange={(e) => setManualCostAmount(e.target.value)} />
                          </div>
                          <div>
                            <Label className="text-xs">Description</Label>
                            <Textarea placeholder="e.g. 2 hours labour @ $25/hr" value={manualCostDesc} onChange={(e) => setManualCostDesc(e.target.value)} rows={2} />
                          </div>
                        </TabsContent>
                      </Tabs>
                      <div className="flex gap-2 justify-end pt-1">
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
                    <div className="bg-warning/5 border border-dashed border-warning/40 rounded-lg p-6 text-center">
                      <AlertTriangle className="h-6 w-6 text-warning mx-auto mb-2" />
                      <p className="text-sm font-medium mb-1">No cost linked to this order</p>
                      <p className="text-xs text-muted-foreground mb-3">Profit shown is incomplete until you attach inventory or a manual cost.</p>
                      <Button size="sm" onClick={() => setShowLinkDevice(true)}>
                        <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                        Link Inventory or Add Cost
                      </Button>
                    </div>
                  )}
                </Section>
              </TabsContent>

              {/* CUSTOMER & SHIPPING */}
              <TabsContent value="customer" className="mt-0 space-y-5">
                <Section icon={<User className="h-3.5 w-3.5" />} title="Customer">
                  <div className="bg-muted/15 border border-border/40 rounded-lg p-4 space-y-3">
                    <MetaRow label="Name" value={sale.customer_name || '—'} icon={<User className="h-3 w-3" />} />
                    <MetaRow label="Email" value={sale.customer_email || '—'} icon={<Mail className="h-3 w-3" />} />
                  </div>
                </Section>

                <Section icon={<Truck className="h-3.5 w-3.5" />} title="Shipping">
                  <div className="bg-muted/15 border border-border/40 rounded-lg p-4 space-y-4">
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Shipping Address</p>
                      <p className="text-sm leading-snug whitespace-pre-line">{sale.shipping_address || '—'}</p>
                    </div>

                    <Separator />

                    <div>
                      <Label className="text-[11px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                        <MapPin className="h-3 w-3" /> Tax Province
                        {!localProvince && !suggestedProvince && (
                          <span className="inline-flex items-center gap-0.5 text-destructive normal-case">
                            <AlertTriangle className="h-3 w-3" /> required
                          </span>
                        )}
                      </Label>
                      {!localProvince && suggestedProvince && (
                        <p className="text-[11px] text-warning mb-1.5">
                          Detected <span className="font-mono font-bold">{suggestedProvince}</span> from address —{' '}
                          <button className="underline font-medium hover:text-foreground" onClick={() => handleProvinceChange(suggestedProvince)} disabled={savingProvince}>
                            apply
                          </button>
                        </p>
                      )}
                      <Select
                        value={localProvince || 'none'}
                        onValueChange={(v) => { if (v !== 'none') handleProvinceChange(v); }}
                        disabled={savingProvince}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select province" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select province…</SelectItem>
                          {PROVINCES.map(p => (
                            <SelectItem key={p.code} value={p.code}>{p.code} — {p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        Changing province recalculates GST/HST/PST/QST and updates accounting.
                      </p>
                    </div>
                  </div>
                </Section>
              </TabsContent>

              {/* RETURNS */}
              <TabsContent value="returns" className="mt-0 space-y-5">
                {returnData ? (
                  <Section icon={<RotateCcw className="h-3.5 w-3.5" />} title="Return Authorization">
                    <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <ReturnField label="RMA #" value={<span className="font-mono">{returnData.rma_number}</span>} />
                        <ReturnField label="Status" value={<span className="capitalize font-medium">{returnData.status}</span>} />
                        <ReturnField label="Resolution" value={<span className="capitalize font-medium">{returnData.resolution_type || '—'}</span>} />
                        <ReturnField label="Refund Amount" value={<span className="text-destructive font-semibold tabular-nums">{formatCurrency(Number(returnData.refund_amount || 0))}</span>} />
                        <ReturnField label="Tax Refunded" value={<span className="text-destructive tabular-nums">{formatCurrency(Number(returnData.tax_refunded || 0))}</span>} />
                        <ReturnField label="Refund Date" value={returnData.refund_date ? formatDate(returnData.refund_date) : '—'} />
                      </div>
                      {returnData.reason && (
                        <div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Reason</p>
                          <p className="text-sm">{returnData.reason}</p>
                        </div>
                      )}
                      {returnData.notes && (
                        <div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Notes</p>
                          <p className="text-sm">{returnData.notes}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-2 border-t border-destructive/10">
                        <span className="text-[11px] text-muted-foreground">Accounting:</span>
                        {returnData.accounting_status === 'processed' ? (
                          <Badge variant="outline" className="text-[10px] text-[hsl(var(--success))] border-[hsl(var(--success)/0.3)]">JE Reversed</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-warning border-warning/30">Pending</Badge>
                        )}
                      </div>
                    </div>
                  </Section>
                ) : (
                  <div className="text-center py-12">
                    <RotateCcw className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-medium mb-1">No returns for this order</p>
                    <p className="text-xs text-muted-foreground mb-4">If the customer requests a refund or exchange, start a Return below.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { onOpenChange(false); onInitiateReturn(); }}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      Initiate Return / Refund
                    </Button>
                  </div>
                )}
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        {/* ── Sticky footer with primary actions ── */}
        <div className="border-t border-border/60 bg-muted/20 px-6 py-3 flex-shrink-0 flex items-center justify-between gap-2">
          <div className="text-[11px] text-muted-foreground">
            {hasReturn ? (
              <span className="flex items-center gap-1.5">
                <RotateCcw className="h-3 w-3 text-destructive" />
                Return on file — see Returns tab
              </span>
            ) : !hasLinkedItem ? (
              <span className="flex items-center gap-1.5 text-warning">
                <AlertTriangle className="h-3 w-3" />
                Action needed: link cost for accurate profit
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[hsl(var(--success))]">
                <CheckCircle2 className="h-3 w-3" />
                Order is fully set up
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!hasLinkedItem && (
              <Button variant="outline" size="sm" onClick={() => { setActiveTab('items'); setShowLinkDevice(true); }}>
                <LinkIcon className="h-3.5 w-3.5 mr-1.5" /> Link Cost
              </Button>
            )}
            {!hasReturn && !returnData && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => { onOpenChange(false); onInitiateReturn(); }}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Initiate Return
              </Button>
            )}
            <Button size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── helpers ── */

function HeroMetric({ label, value, hint, tone, icon: Icon }: {
  label: string; value: string; hint?: string;
  tone?: 'positive' | 'negative' | 'neutral';
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn(
        "text-xl font-bold tabular-nums font-display mt-0.5 flex items-center justify-end gap-1",
        tone === 'positive' && "text-[hsl(var(--success))]",
        tone === 'negative' && "text-destructive",
      )}>
        {Icon && <Icon className="h-4 w-4" />}
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        {icon} {title}
      </h4>
      {children}
    </section>
  );
}

function FinancialRow({ label, value, bold, negative }: { label: string; value: string; bold?: boolean; negative?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={cn("text-muted-foreground", bold && "font-medium text-foreground")}>{label}</span>
      <span className={cn("tabular-nums", bold && "font-semibold", negative && "text-destructive/80")}>{value}</span>
    </div>
  );
}

function MetaRow({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground text-xs flex items-center gap-1.5">{icon}{label}</span>
      <span className="font-medium text-right truncate min-w-0">{value}</span>
    </div>
  );
}

function ReturnField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function ActionCallout({ tone, icon: Icon, title, body, actionLabel, onAction }: {
  tone: 'amber' | 'destructive';
  icon: React.ComponentType<{ className?: string }>;
  title: string; body: string; actionLabel: string; onAction: () => void;
}) {
  const styles = tone === 'amber'
    ? 'bg-warning/5 border-warning/30 text-warning'
    : 'bg-destructive/5 border-destructive/30 text-destructive';
  return (
    <div className={cn("border rounded-lg p-3 flex items-center justify-between gap-3", styles)}>
      <div className="flex items-start gap-2.5 min-w-0">
        <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs opacity-80 mt-0.5">{body}</p>
        </div>
      </div>
      <Button size="sm" variant="outline" className="flex-shrink-0" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
