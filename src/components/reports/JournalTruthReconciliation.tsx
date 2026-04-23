/**
 * JournalTruthReconciliation
 *
 * Compares each posted marketplace order's "API truth" (subtotal, shipping,
 * taxes, fees, payout — captured from Shopify/Amazon/Best Buy at import) against
 * the totals on the journal entry that was posted to the GL.
 *
 * Flags any line where the GL doesn't match the marketplace within tolerance,
 * so accounting can investigate drift before period close.
 */
import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useReportQuery } from '@/hooks/useReportQuery';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, AlertTriangle, CheckCircle2, FileSearch } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { toast } from 'sonner';
import { getChannelKey, getChannelLabel, parseMarketplaceFilter } from '@/lib/marketplaceAccounts';

const TOLERANCE = 0.02; // 2¢ rounding tolerance per line

type Mismatch = {
  field: 'subtotal' | 'shipping' | 'tax' | 'fees' | 'payout';
  marketplace: number | null;
  journal: number;
  diff: number;
};

interface ReconRow {
  saleId: string;
  orderNumber: string;
  marketplace: string;
  marketplaceAccount: string | null;
  channel: string;
  saleDate: string;
  companyId: string | null;
  // Marketplace truth
  mpSubtotal: number;
  mpShipping: number | null;
  mpTax: number | null;
  mpFees: number;
  mpPayout: number | null;
  // Journal totals
  jeNumber: string | null;
  jeRevenue: number;
  jeShipping: number;
  jeTax: number;
  jeFees: number;
  jeClearing: number; // AR / clearing account net (proxy for expected payout)
  hasJournal: boolean;
  mismatches: Mismatch[];
}

interface Props {
  companyView?: 'consolidated' | string;
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const d = subMonths(new Date(), i);
  return { value: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') };
});

const ACCOUNT_BUCKETS = {
  revenue: (code: string, name: string) =>
    code.startsWith('4') && /sales revenue|product sales/i.test(name),
  shipping: (_code: string, name: string) => /shipping/i.test(name),
  tax: (code: string, name: string) =>
    code.startsWith('20') || /gst|hst|qst|pst|tax payable/i.test(name),
  fees: (_code: string, name: string) => /marketplace fee|commission|processing fee/i.test(name),
  clearing: (_code: string, name: string) =>
    /accounts receivable|clearing|payout|undeposited/i.test(name),
};

export function JournalTruthReconciliation({ companyView = 'consolidated' }: Props) {
  const [period, setPeriod] = useState(format(new Date(), 'yyyy-MM'));
  const [filter, setFilter] = useState<'all' | 'mismatched' | 'no_journal'>('mismatched');
  const [marketplace, setMarketplace] = useState<string>('all');
  const [openSaleId, setOpenSaleId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useReportQuery<ReconRow[]>({
    queryKey: ['journal-truth-recon', companyView, period, marketplace],
    queryFn: () => fetchRecon(companyView, period, marketplace),
  });

  const rows = data ?? [];

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'no_journal') return rows.filter((r) => !r.hasJournal);
    return rows.filter((r) => r.mismatches.length > 0 || !r.hasJournal);
  }, [rows, filter]);

  const summary = useMemo(() => {
    const total = rows.length;
    const clean = rows.filter((r) => r.hasJournal && r.mismatches.length === 0).length;
    const mismatched = rows.filter((r) => r.hasJournal && r.mismatches.length > 0).length;
    const missing = rows.filter((r) => !r.hasJournal).length;
    const totalDrift = rows.reduce(
      (s, r) => s + r.mismatches.reduce((x, m) => x + Math.abs(m.diff), 0),
      0,
    );
    return { total, clean, mismatched, missing, totalDrift };
  }, [rows]);

  const exportCSV = () => {
    const header = [
      'Order',
      'Marketplace',
      'Date',
      'Journal Entry',
      'MP Subtotal',
      'JE Revenue',
      'MP Shipping',
      'JE Shipping',
      'MP Tax',
      'JE Tax',
      'MP Fees',
      'JE Fees',
      'MP Payout',
      'JE Clearing',
      'Mismatches',
    ];
    const lines = filtered.map((r) =>
      [
        r.orderNumber,
        r.marketplace,
        r.saleDate,
        r.jeNumber ?? '',
        r.mpSubtotal.toFixed(2),
        r.jeRevenue.toFixed(2),
        (r.mpShipping ?? 0).toFixed(2),
        r.jeShipping.toFixed(2),
        (r.mpTax ?? 0).toFixed(2),
        r.jeTax.toFixed(2),
        r.mpFees.toFixed(2),
        r.jeFees.toFixed(2),
        (r.mpPayout ?? 0).toFixed(2),
        r.jeClearing.toFixed(2),
        r.mismatches.map((m) => `${m.field}:${m.diff.toFixed(2)}`).join('|'),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-truth-recon-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported reconciliation report');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSearch className="h-4 w-4 text-primary" />
                Journal vs Marketplace Truth
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Compares each posted order's marketplace API values against its journal entry totals.
                Drift &gt; ${TOLERANCE.toFixed(2)} per line is flagged.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={marketplace} onValueChange={(v) => setMarketplace(v)}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All channels</SelectItem>
                  <SelectItem value="shopify">Shopify</SelectItem>
                  <SelectItem value="amazon">Amazon</SelectItem>
                  <SelectItem value="bestbuy:tgw">Best Buy — TGW</SelectItem>
                  <SelectItem value="bestbuy:ves">Best Buy — VES</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mismatched">Issues only</SelectItem>
                  <SelectItem value="no_journal">Missing journal</SelectItem>
                  <SelectItem value="all">All orders</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={exportCSV} disabled={!filtered.length}>
                <Download className="h-3.5 w-3.5 mr-1" /> CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <SummaryTile label="Posted orders" value={summary.total} />
            <SummaryTile label="Reconciled clean" value={summary.clean} tone="success" />
            <SummaryTile label="Drift detected" value={summary.mismatched} tone="warning" />
            <SummaryTile label="Missing journal" value={summary.missing} tone="danger" />
            <SummaryTile
              label="Total drift"
              value={`$${summary.totalDrift.toFixed(2)}`}
              tone={summary.totalDrift > 0 ? 'warning' : 'success'}
            />
          </div>

          {!isLoading && summary.mismatched === 0 && summary.missing === 0 && summary.total > 0 && (
            <Alert className="mb-4 border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              <AlertTitle>All orders reconciled</AlertTitle>
              <AlertDescription className="text-xs">
                Every posted order in {format(new Date(period + '-01'), 'MMMM yyyy')} matches its journal entry within tolerance.
              </AlertDescription>
            </Alert>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Marketplace</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Shipping</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                  <TableHead className="text-right">Payout</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">Loading…</TableCell></TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">No orders match the current filter.</TableCell></TableRow>
                )}
                {!isLoading && filtered.map((r) => (
                  <ReconRowView
                    key={r.saleId}
                    row={r}
                    expanded={openSaleId === r.saleId}
                    onToggle={() => setOpenSaleId((p) => (p === r.saleId ? null : r.saleId))}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: { label: string; value: string | number; tone?: 'success' | 'warning' | 'danger' }) {
  const toneCls =
    tone === 'success'
      ? 'border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5 text-[hsl(var(--success))]'
      : tone === 'warning'
      ? 'border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 text-[hsl(var(--warning))]'
      : tone === 'danger'
      ? 'border-destructive/30 bg-destructive/5 text-destructive'
      : 'border-border bg-muted/30 text-foreground';
  return (
    <div className={`rounded-md border px-3 py-2 ${toneCls}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function fieldCell(mp: number | null, je: number, field: Mismatch['field'], mismatches: Mismatch[]) {
  const m = mismatches.find((x) => x.field === field);
  return (
    <div className="text-right text-xs tabular-nums">
      <div>{(mp ?? 0).toFixed(2)}</div>
      <div className={m ? 'text-destructive font-medium' : 'text-muted-foreground'}>
        {je.toFixed(2)}{m && ` (${m.diff > 0 ? '+' : ''}${m.diff.toFixed(2)})`}
      </div>
    </div>
  );
}

function ReconRowView({ row, expanded, onToggle }: { row: ReconRow; expanded: boolean; onToggle: () => void }) {
  const status = !row.hasJournal
    ? <Badge variant="destructive" className="text-[10px]">No journal</Badge>
    : row.mismatches.length === 0
    ? <Badge className="text-[10px] bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30">Match</Badge>
    : <Badge className="text-[10px] bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30">
        <AlertTriangle className="h-3 w-3 mr-1" />{row.mismatches.length} drift
      </Badge>;

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell className="font-mono text-xs">{row.orderNumber}</TableCell>
        <TableCell className="text-xs">{getChannelLabel(row.channel)}</TableCell>
        <TableCell className="text-xs">{format(new Date(row.saleDate), 'MMM d')}</TableCell>
        <TableCell>{fieldCell(row.mpSubtotal, row.jeRevenue, 'subtotal', row.mismatches)}</TableCell>
        <TableCell>{fieldCell(row.mpShipping, row.jeShipping, 'shipping', row.mismatches)}</TableCell>
        <TableCell>{fieldCell(row.mpTax, row.jeTax, 'tax', row.mismatches)}</TableCell>
        <TableCell>{fieldCell(row.mpFees, row.jeFees, 'fees', row.mismatches)}</TableCell>
        <TableCell>{fieldCell(row.mpPayout, row.jeClearing, 'payout', row.mismatches)}</TableCell>
        <TableCell>{status}</TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/30">
            <div className="p-3 text-xs space-y-2">
              <div className="font-semibold">Journal entry: {row.jeNumber ?? '—'}</div>
              {row.mismatches.length === 0 ? (
                <div className="text-muted-foreground">No drift detected. Top row = marketplace truth, bottom row = posted journal totals.</div>
              ) : (
                <ul className="space-y-1">
                  {row.mismatches.map((m) => (
                    <li key={m.field} className="flex justify-between border-b border-border/50 pb-1">
                      <span className="capitalize">{m.field} mismatch</span>
                      <span className="tabular-nums">
                        Marketplace ${(m.marketplace ?? 0).toFixed(2)} vs Journal ${m.journal.toFixed(2)} ·
                        <span className="text-destructive font-medium ml-1">Δ ${m.diff.toFixed(2)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ---------- Data fetch ----------

async function fetchRecon(
  companyView: string,
  period: string,
  marketplace: string,
): Promise<ReconRow[]> {
  const [year, month] = period.split('-');
  const start = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
  const end = endOfMonth(start);

  let salesQuery = supabase
    .from('sales')
    .select('id, order_number, marketplace, marketplace_account, sale_date, company_id, sale_price, subtotal, shipping_cost, shipping_revenue, tax_amount, marketplace_fees, payout_amount, marketplace_total_tax, marketplace_total_shipping, accounting_status')
    .gte('sale_date', start.toISOString())
    .lte('sale_date', end.toISOString())
    .eq('accounting_status', 'posted')
    .order('sale_date', { ascending: false })
    .limit(2000);

  if (companyView !== 'consolidated') salesQuery = salesQuery.eq('company_id', companyView);
  if (marketplace !== 'all') {
    const parsed = parseMarketplaceFilter(marketplace);
    salesQuery = salesQuery.eq('marketplace', parsed.marketplace as any);
    if (parsed.account) salesQuery = salesQuery.eq('marketplace_account', parsed.account);
  }

  const { data: sales, error } = await salesQuery;
  if (error) throw error;
  const saleRows = sales || [];
  if (saleRows.length === 0) return [];

  const saleIds = saleRows.map((s: any) => s.id);

  const { data: jes } = await supabase
    .from('journal_entries')
    .select('id, entry_number, reference_id, status')
    .eq('reference_type', 'sale')
    .in('reference_id', saleIds);

  const jeBySale = new Map<string, { id: string; entry_number: string }>();
  (jes || []).forEach((j: any) => {
    if (j.status === 'posted' || j.status === 'approved' || !j.status) {
      jeBySale.set(j.reference_id, { id: j.id, entry_number: j.entry_number });
    }
  });

  const jeIds = Array.from(jeBySale.values()).map((j) => j.id);
  let lines: any[] = [];
  if (jeIds.length > 0) {
    const { data: lineData } = await supabase
      .from('journal_entry_lines')
      .select('journal_entry_id, debit_amount, credit_amount, account_id, chart_of_accounts:account_id(account_code, account_name, account_type)')
      .in('journal_entry_id', jeIds);
    lines = lineData || [];
  }

  const linesByJe = new Map<string, any[]>();
  for (const l of lines) {
    const arr = linesByJe.get(l.journal_entry_id) || [];
    arr.push(l);
    linesByJe.set(l.journal_entry_id, arr);
  }

  return saleRows.map((s: any): ReconRow => {
    const je = jeBySale.get(s.id);
    const jeLines = je ? linesByJe.get(je.id) || [] : [];

    let jeRevenue = 0, jeShipping = 0, jeTax = 0, jeFees = 0, jeClearing = 0;
    for (const l of jeLines) {
      const acc = l.chart_of_accounts;
      if (!acc) continue;
      const code = acc.account_code as string;
      const name = acc.account_name as string;
      const credit = Number(l.credit_amount || 0);
      const debit = Number(l.debit_amount || 0);

      if (ACCOUNT_BUCKETS.shipping(code, name)) jeShipping += credit - debit;
      else if (ACCOUNT_BUCKETS.tax(code, name)) jeTax += credit - debit;
      else if (ACCOUNT_BUCKETS.fees(code, name)) jeFees += debit - credit; // fees are an expense
      else if (ACCOUNT_BUCKETS.revenue(code, name)) jeRevenue += credit - debit;
      else if (ACCOUNT_BUCKETS.clearing(code, name)) jeClearing += debit - credit;
    }

    const mpSubtotal = Number(s.subtotal ?? s.sale_price ?? 0);
    const mpShipping = s.marketplace_total_shipping != null
      ? Number(s.marketplace_total_shipping)
      : (s.shipping_revenue != null ? Number(s.shipping_revenue) : null);
    const mpTax = s.marketplace_total_tax != null
      ? Number(s.marketplace_total_tax)
      : (s.tax_amount != null ? Number(s.tax_amount) : null);
    const mpFees = Number(s.marketplace_fees || 0);
    const mpPayout = s.payout_amount != null ? Number(s.payout_amount) : null;

    const mismatches: Mismatch[] = [];
    const check = (field: Mismatch['field'], mp: number | null, j: number) => {
      if (mp == null) return;
      const diff = j - mp;
      if (Math.abs(diff) > TOLERANCE) mismatches.push({ field, marketplace: mp, journal: j, diff });
    };

    if (je) {
      check('subtotal', mpSubtotal, jeRevenue);
      check('shipping', mpShipping, jeShipping);
      check('tax', mpTax, jeTax);
      check('fees', mpFees, jeFees);
      if (mpPayout != null) check('payout', mpPayout, jeClearing);
    }

    return {
      saleId: s.id,
      orderNumber: s.order_number,
      marketplace: s.marketplace,
      marketplaceAccount: s.marketplace_account ?? null,
      channel: getChannelKey(s.marketplace, s.marketplace_account as any),
      saleDate: s.sale_date,
      companyId: s.company_id,
      mpSubtotal,
      mpShipping,
      mpTax,
      mpFees,
      mpPayout,
      jeNumber: je?.entry_number ?? null,
      jeRevenue,
      jeShipping,
      jeTax,
      jeFees,
      jeClearing,
      hasJournal: !!je,
      mismatches,
    };
  });
}
