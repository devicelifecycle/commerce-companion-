import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calculator, DollarSign, TrendingUp, ShoppingCart, Search } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const MARKETPLACE_FEE_PRESETS: Record<string, { label: string; rate: number; flat: number; description: string }> = {
  amazon: { label: 'Amazon FBA', rate: 15, flat: 0, description: '~15% referral + FBA fulfillment' },
  shopify: { label: 'Shopify', rate: 2.9, flat: 0.30, description: '2.9% + $0.30 processing' },
  bestbuy: { label: 'Best Buy', rate: 12, flat: 0, description: '~12% commission' },
  custom: { label: 'Custom', rate: 0, flat: 0, description: 'Enter your own' },
};

interface PastSale {
  marketplace: string;
  sale_price: number;
  sale_date: string;
  profit: number | null;
}

const fmt = (v: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

export function BulkPricingCalculator() {
  // Inputs
  const [costPrice, setCostPrice] = useState('');
  const [partsCost, setPartsCost] = useState('');
  const [laborCost, setLaborCost] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [selectedMarketplace, setSelectedMarketplace] = useState('amazon');
  const [feeMode, setFeeMode] = useState<'preset' | 'percent' | 'dollar'>('preset');
  const [customFeePercent, setCustomFeePercent] = useState('');
  const [customFeeDollar, setCustomFeeDollar] = useState('');
  const [marginTarget, setMarginTarget] = useState('25');

  // Model lookup for past sales
  const [modelSearch, setModelSearch] = useState('');
  const [pastSales, setPastSales] = useState<PastSale[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);

  // Calculations
  const totalCost = useMemo(() => {
    return (parseFloat(costPrice) || 0) +
      (parseFloat(partsCost) || 0) +
      (parseFloat(laborCost) || 0) +
      (parseFloat(shippingCost) || 0);
  }, [costPrice, partsCost, laborCost, shippingCost]);

  const marginPct = parseFloat(marginTarget) || 0;

  const calculateMinPrice = (marketplace: string) => {
    if (totalCost <= 0 || marginPct <= 0 || marginPct >= 100) return 0;
    const preset = MARKETPLACE_FEE_PRESETS[marketplace];

    let feeRate = 0;
    let feeFlat = 0;

    if (feeMode === 'preset' && preset) {
      feeRate = preset.rate / 100;
      feeFlat = preset.flat;
    } else if (feeMode === 'percent') {
      feeRate = (parseFloat(customFeePercent) || 0) / 100;
    } else if (feeMode === 'dollar') {
      feeFlat = parseFloat(customFeeDollar) || 0;
    }

    // price = (totalCost + feeFlat) / (1 - feeRate - marginPct/100)
    const denominator = 1 - feeRate - marginPct / 100;
    if (denominator <= 0) return 0;
    return Math.ceil((totalCost + feeFlat) / denominator);
  };

  const minPrice = calculateMinPrice(selectedMarketplace);

  const feeAmount = useMemo(() => {
    if (minPrice <= 0) return 0;
    const preset = MARKETPLACE_FEE_PRESETS[selectedMarketplace];
    if (feeMode === 'preset' && preset) return minPrice * (preset.rate / 100) + preset.flat;
    if (feeMode === 'percent') return minPrice * ((parseFloat(customFeePercent) || 0) / 100);
    if (feeMode === 'dollar') return parseFloat(customFeeDollar) || 0;
    return 0;
  }, [minPrice, selectedMarketplace, feeMode, customFeePercent, customFeeDollar]);

  const profit = minPrice - totalCost - feeAmount;

  // Compare across all marketplaces
  const marketplaceComparison = useMemo(() => {
    if (totalCost <= 0) return [];
    return ['amazon', 'shopify', 'bestbuy'].map(mp => {
      const price = calculateMinPrice(mp);
      const preset = MARKETPLACE_FEE_PRESETS[mp];
      const fee = price > 0 ? price * (preset.rate / 100) + preset.flat : 0;
      return { key: mp, label: preset.label, price, fee, profit: price - totalCost - fee };
    });
  }, [totalCost, marginPct]);

  // Fetch past sales for model
  useEffect(() => {
    if (!modelSearch || modelSearch.length < 2) { setPastSales([]); return; }
    const timeout = setTimeout(async () => {
      setLoadingSales(true);
      try {
        const { data } = await supabase
          .from('sales')
          .select('marketplace, sale_price, sale_date, profit')
          .or(`marketplace_product_title.ilike.%${modelSearch}%,devices.model.ilike.%${modelSearch}%`)
          .order('sale_date', { ascending: false })
          .limit(20);
        setPastSales((data || []).map(s => ({
          marketplace: s.marketplace || 'Unknown',
          sale_price: Number(s.sale_price),
          sale_date: s.sale_date,
          profit: s.profit ? Number(s.profit) : null,
        })));
      } catch {
        setPastSales([]);
      } finally {
        setLoadingSales(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [modelSearch]);

  // Group past sales by marketplace
  const salesByMarketplace = useMemo(() => {
    const grouped: Record<string, { count: number; avgPrice: number; minPrice: number; maxPrice: number }> = {};
    pastSales.forEach(s => {
      const mp = s.marketplace;
      if (!grouped[mp]) grouped[mp] = { count: 0, avgPrice: 0, minPrice: Infinity, maxPrice: 0 };
      grouped[mp].count++;
      grouped[mp].avgPrice += s.sale_price;
      grouped[mp].minPrice = Math.min(grouped[mp].minPrice, s.sale_price);
      grouped[mp].maxPrice = Math.max(grouped[mp].maxPrice, s.sale_price);
    });
    Object.values(grouped).forEach(g => { g.avgPrice = g.avgPrice / g.count; });
    return grouped;
  }, [pastSales]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" /> Pricing & Margin Calculator
        </CardTitle>
        <CardDescription>
          Enter costs to calculate the minimum sale price for your desired margin across marketplaces.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Cost Inputs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Cost Price</Label>
            <div className="relative">
              <DollarSign className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={costPrice} onChange={e => setCostPrice(e.target.value)} className="pl-8" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Parts Cost</Label>
            <div className="relative">
              <DollarSign className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={partsCost} onChange={e => setPartsCost(e.target.value)} className="pl-8" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Labor Cost</Label>
            <div className="relative">
              <DollarSign className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={laborCost} onChange={e => setLaborCost(e.target.value)} className="pl-8" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Shipping Cost</Label>
            <div className="relative">
              <DollarSign className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={shippingCost} onChange={e => setShippingCost(e.target.value)} className="pl-8" />
            </div>
          </div>
        </div>

        <Separator />

        {/* Fee & Margin Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Marketplace Fees</Label>
            <ToggleGroup type="single" value={feeMode} onValueChange={(v) => v && setFeeMode(v as any)} className="justify-start">
              <ToggleGroupItem value="preset" className="text-xs">Preset</ToggleGroupItem>
              <ToggleGroupItem value="percent" className="text-xs">% Rate</ToggleGroupItem>
              <ToggleGroupItem value="dollar" className="text-xs">$ Amount</ToggleGroupItem>
            </ToggleGroup>
            {feeMode === 'preset' && (
              <Select value={selectedMarketplace} onValueChange={setSelectedMarketplace}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MARKETPLACE_FEE_PRESETS).filter(([k]) => k !== 'custom').map(([key, mp]) => (
                    <SelectItem key={key} value={key}>
                      {mp.label} — {mp.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {feeMode === 'percent' && (
              <Input type="number" min="0" max="50" step="0.1" placeholder="Fee %" value={customFeePercent} onChange={e => setCustomFeePercent(e.target.value)} />
            )}
            {feeMode === 'dollar' && (
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={customFeeDollar} onChange={e => setCustomFeeDollar(e.target.value)} className="pl-8" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Target Margin %</Label>
            <Input type="number" min="1" max="90" value={marginTarget} onChange={e => setMarginTarget(e.target.value)} className="w-28" />
            <p className="text-[10px] text-muted-foreground">Minimum profit margin on the sale price</p>
          </div>

          {/* Result */}
          <div className="bg-muted/50 rounded-lg p-4 border border-border/60 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Minimum Sale Price</p>
            <p className="text-3xl font-bold font-display text-primary">
              {totalCost > 0 && minPrice > 0 ? fmt(minPrice) : '—'}
            </p>
            {totalCost > 0 && minPrice > 0 && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>Total cost: {fmt(totalCost)} · Fees: ~{fmt(feeAmount)}</p>
                <p className="text-success font-medium">Profit: {fmt(profit)} ({marginTarget}% margin)</p>
              </div>
            )}
          </div>
        </div>

        {/* Marketplace Comparison */}
        {totalCost > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" /> Price Comparison Across Marketplaces
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {marketplaceComparison.map(mp => (
                  <div key={mp.key} className={`rounded-lg border p-3 space-y-1 ${mp.key === selectedMarketplace ? 'border-primary bg-primary/5' : 'border-border/60'}`}>
                    <p className="text-xs font-semibold">{mp.label}</p>
                    <p className="text-lg font-bold font-display">{mp.price > 0 ? fmt(mp.price) : '—'}</p>
                    {mp.price > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Fee: ~{fmt(mp.fee)} · Profit: {fmt(mp.profit)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Past Sales Lookup */}
        <Separator />
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" /> Historical Sales Lookup
          </h3>
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search model (e.g. iPhone 13 Pro)"
              value={modelSearch}
              onChange={e => setModelSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          {loadingSales && <p className="text-xs text-muted-foreground">Searching...</p>}

          {Object.keys(salesByMarketplace).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(salesByMarketplace).map(([mp, stats]) => (
                <div key={mp} className="rounded-lg border border-border/60 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold capitalize">{mp}</p>
                    <Badge variant="secondary" className="text-[10px]">{stats.count} sale{stats.count !== 1 ? 's' : ''}</Badge>
                  </div>
                  <p className="text-sm font-mono">
                    Avg: <span className="font-semibold">{fmt(stats.avgPrice)}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Range: {fmt(stats.minPrice)} – {fmt(stats.maxPrice)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {pastSales.length > 0 && (
            <div className="overflow-x-auto max-h-48">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Marketplace</TableHead>
                    <TableHead className="text-xs text-right">Sale Price</TableHead>
                    <TableHead className="text-xs text-right">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pastSales.slice(0, 10).map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{new Date(s.sale_date).toLocaleDateString('en-CA')}</TableCell>
                      <TableCell className="text-xs capitalize">{s.marketplace}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(s.sale_price)}</TableCell>
                      <TableCell className={`text-xs text-right font-mono ${s.profit && s.profit > 0 ? 'text-success' : s.profit && s.profit < 0 ? 'text-destructive' : ''}`}>
                        {s.profit != null ? fmt(s.profit) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {modelSearch.length >= 2 && !loadingSales && pastSales.length === 0 && (
            <p className="text-xs text-muted-foreground">No past sales found for "{modelSearch}"</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
