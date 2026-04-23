import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, Calendar, Info } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { getChannelLabel } from '@/lib/marketplaceAccounts';

interface PayoutRow {
  id: string;
  payout_id: string;
  marketplace: string;
  payout_date: string;
  period_start: string | null;
  period_end: string | null;
  gross_amount: number;
  fees_amount: number;
  adjustments_amount: number;
  net_payout: number;
  currency: string;
}

interface PayoutSummary {
  count: number;
  totalGross: number;
  totalFees: number;
  totalNet: number;
}

interface MarketplaceReconciliationProps {
  companyView?: 'consolidated' | string;
}

export function MarketplaceReconciliation({ companyView = 'consolidated' }: MarketplaceReconciliationProps) {
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(format(new Date(), 'yyyy-MM'));
  const [marketplaceFilter, setMarketplaceFilter] = useState<'all' | 'amazon' | 'shopify' | 'bestbuy' | 'temu'>('all');
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [summary, setSummary] = useState<PayoutSummary>({ count: 0, totalGross: 0, totalFees: 0, totalNet: 0 });

  useEffect(() => {
    fetchPayouts();
  }, [companyView, selectedPeriod, marketplaceFilter]);

  const fetchPayouts = async () => {
    setLoading(true);
    try {
      const [year, month] = selectedPeriod.split('-');
      const start = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
      const end = endOfMonth(start);

      let q = supabase
        .from('marketplace_payouts')
        .select('id, payout_id, marketplace, payout_date, period_start, period_end, gross_amount, fees_amount, adjustments_amount, net_payout, currency, company_id')
        .gte('payout_date', start.toISOString().split('T')[0])
        .lte('payout_date', end.toISOString().split('T')[0])
        .order('payout_date', { ascending: false });

      if (companyView !== 'consolidated') q = q.eq('company_id', companyView);
      if (marketplaceFilter !== 'all') q = q.eq('marketplace', marketplaceFilter);

      const { data } = await q;
      const list = (data || []) as PayoutRow[];
      setRows(list);
      setSummary({
        count: list.length,
        totalGross: list.reduce((s, r) => s + Number(r.gross_amount || 0), 0),
        totalFees: list.reduce((s, r) => s + Number(r.fees_amount || 0), 0),
        totalNet: list.reduce((s, r) => s + Number(r.net_payout || 0), 0),
      });
    } catch (err) {
      console.error('Error fetching payouts:', err);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const periodOptions = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return { value: format(date, 'yyyy-MM'), label: format(date, 'MMMM yyyy') };
  });

  const handleExport = () => {
    const header = 'Payout ID,Marketplace,Payout Date,Period Start,Period End,Gross,Fees,Adjustments,Net,Currency';
    const csvRows = rows.map(r =>
      `${r.payout_id},${r.marketplace},${r.payout_date},${r.period_start || ''},${r.period_end || ''},${r.gross_amount},${r.fees_amount},${r.adjustments_amount},${r.net_payout},${r.currency}`
    );
    const csv = [header, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marketplace-payouts-${selectedPeriod}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Payout log</AlertTitle>
        <AlertDescription>
          Marketplaces don't expose per-order breakdowns in their payout APIs, so we no longer reconcile
          individual orders against payouts. Each marketplace sale is posted directly to the operating
          bank account when it's marked as posted. This page is now a simple log of payout totals and
          dates so you can verify that bank deposits match what marketplaces reported.
        </AlertDescription>
      </Alert>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-[200px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={marketplaceFilter} onValueChange={(v) => setMarketplaceFilter(v as any)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All marketplaces</SelectItem>
            <SelectItem value="amazon">Amazon</SelectItem>
            <SelectItem value="shopify">Shopify</SelectItem>
            <SelectItem value="bestbuy">Best Buy</SelectItem>
            <SelectItem value="temu">Temu</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Payouts</p>
            <p className="text-2xl font-bold">{summary.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Gross</p>
            <p className="text-2xl font-bold">{fmt(summary.totalGross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Fees</p>
            <p className="text-2xl font-bold text-destructive">{fmt(summary.totalFees)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Net deposited</p>
            <p className="text-2xl font-bold text-emerald-600">{fmt(summary.totalNet)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Payout Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payouts</CardTitle>
          <CardDescription>Totals and dates for each marketplace payout in the selected period.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payout ID</TableHead>
                <TableHead>Marketplace</TableHead>
                <TableHead>Payout Date</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead className="text-right">Adjustments</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.payout_id}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{getChannelLabel(row.marketplace)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{format(new Date(row.payout_date), 'MMM dd, yyyy')}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.period_start && row.period_end
                      ? `${format(new Date(row.period_start), 'MMM dd')} – ${format(new Date(row.period_end), 'MMM dd')}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right">{fmt(Number(row.gross_amount))}</TableCell>
                  <TableCell className="text-right text-destructive">{fmt(Number(row.fees_amount))}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmt(Number(row.adjustments_amount))}</TableCell>
                  <TableCell className="text-right font-medium text-emerald-600">{fmt(Number(row.net_payout))}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No payouts recorded for this period
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
