import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { emitRefetch } from '@/hooks/useDataRefetch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  CheckCircle2, AlertTriangle, MapPin, User, Package, Calculator,
  Send, Link2, FileText, Hash, Calendar, Building2, ChevronRight,
  TrendingUp, TrendingDown, BookOpen,
} from 'lucide-react';
import { DeviceSearchCombobox } from '@/components/inventory/DeviceSearchCombobox';
import { ProductSearchCombobox } from '@/components/inventory/ProductSearchCombobox';
import { MarketplaceBadge } from '@/components/ui/status-badge';

const PROVINCES = [
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
];

interface PendingOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string | null;
  onPosted?: () => void;
}

interface SaleFull {
  id: string;
  order_number: string;
  marketplace: string;
  marketplace_account: string | null;
  sale_price: number;
  shipping_cost: number | null;
  marketplace_fees: number | null;
  tax_amount: number | null;
  sale_date: string;
  customer_name: string | null;
  customer_email: string | null;
  shipping_address: string | null;
  shipping_province: string | null;
  province_inferred: boolean | null;
  device_id: string | null;
  manual_cost: number | null;
  manual_cost_description: string | null;
  accounting_status: string;
  review_reason: string | null;
  notes: string | null;
  company_id: string | null;
  product_title: string | null;
  marketplace_sku: string | null;
  devices?: {
    brand: string;
    model: string;
    imei: string | null;
    cost_price: number;
    original_cost_price: number | null;
    management_labor_cost: number | null;
    storage: string | null;
    color: string | null;
  } | null;
}

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Number(n || 0));

export function PendingOrderDialog({ open, onOpenChange, saleId, onPosted }: PendingOrderDialogProps) {
  const [sale, setSale] = useState<SaleFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkType, setLinkType] = useState<'device' | 'product' | 'manual'>('device');
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);
  const [manualCost, setManualCost] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [savingProvince, setSavingProvince] = useState(false);
  const [posting, setPosting] = useState(false);

  // Load full sale record
  useEffect(() => {
    if (!open || !saleId) return;
    setLoading(true);
    supabase
      .from('sales')
      .select('*, devices(brand, model, imei, cost_price, original_cost_price, management_labor_cost, storage, color)')
      .eq('id', saleId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          toast.error(error.message);
        } else {
          const s = data as any;
          setSale(s);
          setPendingDeviceId(s.device_id);
          setManualCost(s.manual_cost?.toString() || '');
          setManualDesc(s.manual_cost_description || '');
          if (s.device_id) setLinkType('device');
          else if (s.manual_cost) setLinkType('manual');
        }
        setLoading(false);
      });
  }, [open, saleId]);

  // Re-fetch helper after each mutation so gates stay accurate
  const reload = async () => {
    if (!saleId) return;
    const { data } = await supabase
      .from('sales')
      .select('*, devices(brand, model, imei, cost_price, original_cost_price, management_labor_cost, storage, color)')
      .eq('id', saleId)
      .single();
    if (data) setSale(data as any);
  };

  // ============ GATES ============
  const gates = useMemo(() => {
    if (!sale) return [];
    const isMarketplace = ['amazon', 'bestbuy', 'shopify'].includes(sale.marketplace);
    return [
      {
        key: 'price',
        label: 'Sale price',
        ok: Number(sale.sale_price) > 0,
        detail: sale.sale_price > 0 ? fmt(sale.sale_price) : 'Missing or zero',
      },
      {
        key: 'province',
        label: 'Shipping province',
        ok: !!sale.shipping_province,
        detail: sale.shipping_province
          ? `${sale.shipping_province}${sale.province_inferred ? ' (inferred)' : ''}`
          : 'Required for tax calculation',
      },
      {
        key: 'cost',
        label: 'Cost basis',
        ok: !!sale.device_id || (!!sale.manual_cost && sale.manual_cost > 0),
        detail: sale.device_id
          ? `Linked: ${sale.devices?.brand} ${sale.devices?.model}`
          : sale.manual_cost
            ? `Manual: ${fmt(sale.manual_cost)}`
            : 'Link device or set manual cost',
      },
      {
        key: 'fees',
        label: 'Marketplace fees',
        ok: !isMarketplace || sale.marketplace_fees !== null,
        detail: !isMarketplace
          ? 'N/A (non-marketplace)'
          : sale.marketplace_fees !== null
            ? fmt(sale.marketplace_fees)
            : 'Awaiting payout sync',
      },
    ];
  }, [sale]);

  const allGatesPass = gates.every(g => g.ok);

  // ============ FINANCIAL CALCS ============
  const financials = useMemo(() => {
    if (!sale) return null;
    const revenue = Number(sale.sale_price);
    const tax = Number(sale.tax_amount || 0);
    const fees = Number(sale.marketplace_fees || 0);
    const shipping = Number(sale.shipping_cost || 0);

    // Accounting cost = recorded cost (post-refurb if any) OR manual
    const acctCost = sale.devices
      ? Number(sale.devices.cost_price)
      : Number(sale.manual_cost || 0);

    // Management cost = ORIGINAL cost (pre-refurb) + management labor
    const origCost = sale.devices?.original_cost_price ?? sale.devices?.cost_price ?? 0;
    const mgmtLabor = Number(sale.devices?.management_labor_cost || 0);
    const mgmtCost = sale.devices ? Number(origCost) + mgmtLabor : Number(sale.manual_cost || 0);

    const acctProfit = revenue - acctCost - fees - shipping;
    const mgmtProfit = revenue - mgmtCost - fees - shipping;

    return {
      revenue, tax, fees, shipping,
      acctCost, mgmtCost, mgmtLabor,
      acctProfit, mgmtProfit,
    };
  }, [sale]);

  // ============ JE PREVIEW ============
  const journalPreview = useMemo(() => {
    if (!sale || !financials) return [];
    const f = financials;
    const mp = sale.marketplace;
    const isVES = mp === 'amazon';
    const suffix = isVES ? 'VES' : 'TGW';
    const lines: { account: string; debit: number; credit: number; note?: string }[] = [];

    // Revenue side
    lines.push({
      account: `1050 — AR — ${suffix}`,
      debit: f.revenue + f.tax,
      credit: 0,
      note: 'Receivable from marketplace',
    });
    if (f.tax > 0) {
      lines.push({
        account: `2200 — Sales Tax Payable — ${suffix}`,
        debit: 0,
        credit: f.tax,
        note: `Tax collected (${sale.shipping_province || '—'})`,
      });
    }
    if (f.fees > 0) {
      lines.push({
        account: `${isVES ? '6000' : '6001'} — Marketplace Fees — ${suffix}`,
        debit: f.fees,
        credit: 0,
        note: `${mp} commission`,
      });
      lines.push({
        account: `1050 — AR — ${suffix}`,
        debit: 0,
        credit: f.fees,
        note: 'Net of fees',
      });
    }
    lines.push({
      account: `${isVES ? '4000' : mp === 'shopify' ? '4101' : '4100'} — Sales Revenue — ${mp} — ${suffix}`,
      debit: 0,
      credit: f.revenue,
    });

    // COGS side
    if (f.acctCost > 0) {
      lines.push({
        account: `${isVES ? '5000' : '5001'} — COGS — ${suffix}`,
        debit: f.acctCost,
        credit: 0,
        note: sale.devices
          ? `${sale.devices.brand} ${sale.devices.model}${sale.devices.imei ? ` · ${sale.devices.imei}` : ''}`
          : 'Manual cost basis',
      });
      lines.push({
        account: `${isVES ? '1100' : '1101'} — Inventory — ${suffix}`,
        debit: 0,
        credit: f.acctCost,
        note: 'Inventory reduction',
      });
    }
    return lines;
  }, [sale, financials]);

  // ============ ACTIONS ============
  const handleProvinceChange = async (code: string) => {
    if (!sale) return;
    setSavingProvince(true);
    try {
      const { data: rate } = await supabase
        .from('provincial_tax_rates')
        .select('*')
        .eq('province_code', code)
        .single();
      let newTax = 0, gst = 0, hst = 0, pst = 0, qst = 0;
      if (rate?.is_hst_province && rate.hst_rate) {
        hst = +(sale.sale_price * rate.hst_rate / 100).toFixed(2);
        newTax = hst;
      } else if (rate) {
        if (rate.gst_rate) gst = +(sale.sale_price * rate.gst_rate / 100).toFixed(2);
        if (rate.pst_rate) pst = +(sale.sale_price * rate.pst_rate / 100).toFixed(2);
        if (rate.qst_rate) qst = +(sale.sale_price * rate.qst_rate / 100).toFixed(2);
        newTax = gst + pst + qst;
      }
      await supabase.from('sales').update({
        shipping_province: code,
        province_inferred: false,
        tax_amount: newTax,
      } as any).eq('id', sale.id);
      await supabase.from('sales_tax_details').update({
        customer_province: code,
        gst_amount: gst, hst_amount: hst, pst_amount: pst, qst_amount: qst,
        total_tax: newTax,
      } as any).eq('sale_id', sale.id);
      toast.success(`Province set to ${code} — tax ${fmt(newTax)}`);
      await reload();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSavingProvince(false);
  };

  const handleLinkDevice = async () => {
    if (!sale || !pendingDeviceId) return;
    setSavingLink(true);
    try {
      await supabase.from('sales').update({
        device_id: pendingDeviceId,
        manual_cost: null,
        manual_cost_description: null,
      } as any).eq('id', sale.id);
      toast.success('Device linked');
      await reload();
      emitRefetch('sales');
    } catch (e: any) {
      toast.error(e.message);
    }
    setSavingLink(false);
  };

  const handleUnlinkDevice = async () => {
    if (!sale) return;
    setSavingLink(true);
    try {
      await supabase.from('sales').update({ device_id: null } as any).eq('id', sale.id);
      setPendingDeviceId(null);
      toast.success('Device unlinked');
      await reload();
      emitRefetch('sales');
    } catch (e: any) {
      toast.error(e.message);
    }
    setSavingLink(false);
  };

  const handleSaveManualCost = async () => {
    if (!sale) return;
    const n = parseFloat(manualCost);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Enter a positive cost');
      return;
    }
    setSavingLink(true);
    try {
      await supabase.from('sales').update({
        manual_cost: n,
        manual_cost_description: manualDesc || null,
        device_id: null,
      } as any).eq('id', sale.id);
      toast.success('Manual cost saved');
      await reload();
      emitRefetch('sales');
    } catch (e: any) {
      toast.error(e.message);
    }
    setSavingLink(false);
  };

  const handlePost = async () => {
    if (!sale) return;
    setPosting(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-sale-accounting', {
        body: { mode: 'post', sale_ids: [sale.id] },
      });
      if (error) throw error;
      toast.success(`Posted to GL — ${data?.processed ?? 1} order`);
      onPosted?.();
      emitRefetch('sales');
      emitRefetch('financials');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Post failed: ${e.message}`);
    }
    setPosting(false);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] p-0 gap-0 flex flex-col">
        {loading || !sale ? (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* ---------- STICKY HEADER ---------- */}
            <DialogHeader className="px-6 py-4 border-b shrink-0">
              <div className="flex items-start justify-between gap-4 pr-8">
                <div className="space-y-1">
                  <DialogTitle className="text-lg flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono">{sale.order_number}</span>
                    <MarketplaceBadge marketplace={sale.marketplace} account={sale.marketplace_account} />
                  </DialogTitle>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(sale.sale_date).toLocaleString()}</span>
                    <span>•</span>
                    <span>{sale.accounting_status.replace(/_/g, ' ')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {allGatesPass ? (
                    <Badge className="gap-1 bg-success text-success-foreground">
                      <CheckCircle2 className="h-3 w-3" /> All gates passed
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {gates.filter(g => !g.ok).length} of 4 gates pending
                    </Badge>
                  )}
                </div>
              </div>

              {/* Gate strip */}
              <div className="grid grid-cols-4 gap-2 mt-3">
                {gates.map(g => (
                  <div
                    key={g.key}
                    className={`px-3 py-2 rounded-md border text-xs ${
                      g.ok
                        ? 'border-success/40 bg-success/5'
                        : 'border-warning/40 bg-warning/5'
                    }`}
                  >
                    <div className="flex items-center gap-1 font-medium">
                      {g.ok
                        ? <CheckCircle2 className="h-3 w-3 text-success" />
                        : <AlertTriangle className="h-3 w-3 text-warning" />}
                      {g.label}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate" title={g.detail}>
                      {g.detail}
                    </p>
                  </div>
                ))}
              </div>
            </DialogHeader>

            {/* ---------- SCROLLABLE BODY ---------- */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-6 py-4 space-y-5">

                {/* SECTION 1: Order details */}
                <Section icon={<Package className="h-4 w-4" />} title="Order details">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Field label="Product" value={sale.product_title || sale.devices ? `${sale.devices?.brand} ${sale.devices?.model}` : '—'} />
                    <Field label="SKU" value={sale.marketplace_sku || '—'} mono />
                    <Field label="Subtotal" value={fmt(sale.sale_price)} />
                    <Field label="Tax" value={fmt(sale.tax_amount)} />
                    <Field label="Shipping" value={fmt(sale.shipping_cost)} />
                    <Field label="Fees" value={sale.marketplace_fees !== null ? fmt(sale.marketplace_fees) : 'Pending payout'} />
                    <Field label="Total" value={fmt(Number(sale.sale_price) + Number(sale.tax_amount || 0) + Number(sale.shipping_cost || 0))} bold />
                  </div>
                </Section>

                {/* SECTION 2: Customer + shipping */}
                <Section icon={<User className="h-4 w-4" />} title="Customer & shipping">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Name" value={sale.customer_name || '—'} />
                    <Field label="Email" value={sale.customer_email || '—'} />
                    <div className="md:col-span-2">
                      <Label className="text-[11px] text-muted-foreground">Shipping address</Label>
                      <p className="text-sm mt-0.5 whitespace-pre-wrap">{sale.shipping_address || '—'}</p>
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Province (drives tax)
                      </Label>
                      <Select value={sale.shipping_province || ''} onValueChange={handleProvinceChange} disabled={savingProvince}>
                        <SelectTrigger className="mt-1 h-9">
                          <SelectValue placeholder="Select province" />
                        </SelectTrigger>
                        <SelectContent>
                          {PROVINCES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {sale.province_inferred && sale.shipping_province && (
                        <p className="text-[10px] text-warning mt-1">* Inferred — confirm if needed</p>
                      )}
                    </div>
                  </div>
                </Section>

                {/* SECTION 3: Linking */}
                <Section icon={<Link2 className="h-4 w-4" />} title="Cost basis (link device, product, or set manual cost)">
                  <Tabs value={linkType} onValueChange={v => setLinkType(v as any)}>
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="device">Link device</TabsTrigger>
                      <TabsTrigger value="product">Link product</TabsTrigger>
                      <TabsTrigger value="manual">Manual cost</TabsTrigger>
                    </TabsList>

                    <TabsContent value="device" className="space-y-3 pt-3">
                      {sale.device_id && sale.devices ? (
                        <div className="flex items-center justify-between p-3 border rounded-md bg-success/5">
                          <div className="text-sm">
                            <p className="font-medium">{sale.devices.brand} {sale.devices.model}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {sale.devices.imei || 'No IMEI'} · cost {fmt(sale.devices.cost_price)}
                            </p>
                          </div>
                          <Button variant="outline" size="sm" onClick={handleUnlinkDevice} disabled={savingLink}>
                            Unlink
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <DeviceSearchCombobox
                            value={pendingDeviceId}
                            onChange={setPendingDeviceId}
                            companyId={sale.company_id}
                            statusFilter={['in_stock']}
                          />
                          <Button onClick={handleLinkDevice} disabled={!pendingDeviceId || savingLink} size="sm">
                            Link selected device
                          </Button>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="product" className="space-y-3 pt-3">
                      <p className="text-xs text-muted-foreground">
                        For non-serialized inventory (accessories, parts).
                      </p>
                      <ProductSearchCombobox
                        value={null}
                        onChange={() => toast.info('Product linking coming soon for pending dialog — use Manual cost for now.')}
                        companyId={sale.company_id}
                      />
                    </TabsContent>

                    <TabsContent value="manual" className="space-y-3 pt-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs">Cost (CAD)</Label>
                          <Input
                            type="number" step="0.01"
                            value={manualCost}
                            onChange={e => setManualCost(e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Description (optional)</Label>
                          <Input
                            value={manualDesc}
                            onChange={e => setManualDesc(e.target.value)}
                            placeholder="e.g. accessory bundle"
                          />
                        </div>
                      </div>
                      <Button onClick={handleSaveManualCost} disabled={savingLink} size="sm">
                        Save manual cost
                      </Button>
                    </TabsContent>
                  </Tabs>
                </Section>

                {/* SECTION 4: Financial summary */}
                {financials && (
                  <Section icon={<Calculator className="h-4 w-4" />} title="Financial summary">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ProfitCard
                        title="Accounting profit (GAAP)"
                        subtitle="What posts to your books"
                        revenue={financials.revenue}
                        cost={financials.acctCost}
                        fees={financials.fees}
                        shipping={financials.shipping}
                        profit={financials.acctProfit}
                      />
                      <ProfitCard
                        title="Management profit"
                        subtitle="Original cost + labor (real economics)"
                        revenue={financials.revenue}
                        cost={financials.mgmtCost}
                        fees={financials.fees}
                        shipping={financials.shipping}
                        profit={financials.mgmtProfit}
                        extraLine={financials.mgmtLabor > 0 ? { label: 'Mgmt labor', value: financials.mgmtLabor } : undefined}
                      />
                    </div>
                  </Section>
                )}

                {/* SECTION 5: JE Preview */}
                <Section icon={<BookOpen className="h-4 w-4" />} title="Journal entry preview">
                  <p className="text-xs text-muted-foreground mb-2">
                    These are the exact debits and credits that will post when you click <strong>Post to GL</strong>.
                  </p>
                  {journalPreview.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Resolve the gates above to see the preview.</p>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium">Account</th>
                            <th className="text-right px-3 py-2 font-medium w-24">Debit</th>
                            <th className="text-right px-3 py-2 font-medium w-24">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {journalPreview.map((l, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-3 py-1.5">
                                <div className="font-mono text-[11px]">{l.account}</div>
                                {l.note && <div className="text-[10px] text-muted-foreground">{l.note}</div>}
                              </td>
                              <td className="text-right tabular-nums px-3 py-1.5">{l.debit > 0 ? fmt(l.debit) : ''}</td>
                              <td className="text-right tabular-nums px-3 py-1.5">{l.credit > 0 ? fmt(l.credit) : ''}</td>
                            </tr>
                          ))}
                          <tr className="border-t bg-muted/30 font-medium">
                            <td className="px-3 py-1.5">Total</td>
                            <td className="text-right tabular-nums px-3 py-1.5">
                              {fmt(journalPreview.reduce((s, l) => s + l.debit, 0))}
                            </td>
                            <td className="text-right tabular-nums px-3 py-1.5">
                              {fmt(journalPreview.reduce((s, l) => s + l.credit, 0))}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>

                {/* SECTION 6: Notes / review reason */}
                {(sale.review_reason || sale.notes) && (
                  <Section icon={<FileText className="h-4 w-4" />} title="Notes">
                    {sale.review_reason && (
                      <div className="text-xs p-2 rounded bg-warning/10 border border-warning/30 mb-2">
                        <span className="font-medium text-warning">Review reason: </span>
                        {sale.review_reason}
                      </div>
                    )}
                    {sale.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{sale.notes}</p>}
                  </Section>
                )}
              </div>
            </ScrollArea>

            {/* ---------- STICKY FOOTER ---------- */}
            <div className="px-6 py-3 border-t bg-muted/30 flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-muted-foreground">
                {allGatesPass
                  ? 'Ready to post to General Ledger'
                  : `${gates.filter(g => !g.ok).map(g => g.label).join(', ')} still required`}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                <Button onClick={handlePost} disabled={!allGatesPass || posting}>
                  <Send className={`h-4 w-4 mr-2 ${posting ? 'animate-pulse' : ''}`} />
                  Post to GL
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============ Sub-components ============

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
        <span className="text-primary">{icon}</span>
        {title}
      </h3>
      <div className="border rounded-md p-3 bg-card">{children}</div>
    </div>
  );
}

function Field({ label, value, mono, bold }: { label: string; value: React.ReactNode; mono?: boolean; bold?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-sm ${mono ? 'font-mono' : ''} ${bold ? 'font-semibold' : ''}`}>{value || '—'}</p>
    </div>
  );
}

function ProfitCard({
  title, subtitle, revenue, cost, fees, shipping, profit, extraLine,
}: {
  title: string; subtitle: string;
  revenue: number; cost: number; fees: number; shipping: number; profit: number;
  extraLine?: { label: string; value: number };
}) {
  const positive = profit >= 0;
  return (
    <div className="border rounded-md p-3 space-y-1.5">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
      <Separator className="my-2" />
      <Row label="Revenue" value={fmt(revenue)} />
      <Row label="− Cost" value={fmt(cost)} />
      {extraLine && <Row label={`− ${extraLine.label}`} value={fmt(extraLine.value)} />}
      {fees > 0 && <Row label="− Fees" value={fmt(fees)} />}
      {shipping > 0 && <Row label="− Shipping" value={fmt(shipping)} />}
      <Separator className="my-1" />
      <div className="flex items-center justify-between font-semibold">
        <span className="text-sm flex items-center gap-1">
          {positive ? <TrendingUp className="h-3 w-3 text-success" /> : <TrendingDown className="h-3 w-3 text-destructive" />}
          Profit
        </span>
        <span className={`text-base tabular-nums ${positive ? 'text-success' : 'text-destructive'}`}>
          {fmt(profit)}
        </span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
