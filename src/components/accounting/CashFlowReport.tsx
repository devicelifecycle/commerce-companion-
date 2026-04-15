import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { useDataRefetch } from '@/hooks/useDataRefetch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Download, Printer, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';

interface CashFlowData {
  operating: {
    salesCollected: number;
    marketplacePayouts: number;
    expensesPaid: number;
    apPayments: number;
    taxPayments: number;
    netOperating: number;
  };
  investing: {
    inventoryPurchases: number;
    repairParts: number;
    netInvesting: number;
  };
  financing: {
    intercompanyTransfersIn: number;
    intercompanyTransfersOut: number;
    netFinancing: number;
  };
  netChange: number;
  openingCash: number;
  closingCash: number;
}

interface Props {
  companyView?: string;
}

export function CashFlowReport({ companyView }: Props) {
  const { selectedCompany, companies } = useCompany();
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [data, setData] = useState<CashFlowData | null>(null);

  const effectiveCompany = (() => {
    if (companyView && companyView !== 'consolidated') {
      return companies.find(c => c.id === companyView) || null;
    }
    return companyView === 'consolidated' ? null : selectedCompany;
  })();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const companyFilter = effectiveCompany?.id;

      // Sales collected (AR payments received)
      let arPayQ = supabase
        .from('ar_payments')
        .select('amount, accounts_receivable!inner(company_id)')
        .gte('payment_date', startDate)
        .lte('payment_date', endDate);

      // Marketplace payouts received
      let payoutQ = supabase
        .from('marketplace_payouts')
        .select('total_amount, company_id')
        .gte('payout_date', startDate)
        .lte('payout_date', endDate)
        .eq('status', 'processed');

      // Expenses paid
      let expenseQ = supabase
        .from('expenses')
        .select('total_amount, company_id')
        .gte('expense_date', startDate)
        .lte('expense_date', endDate);

      // AP payments
      let apPaymentQ = supabase
        .from('ap_payments')
        .select('amount, accounts_payable!inner(company_id)')
        .gte('payment_date', startDate)
        .lte('payment_date', endDate);

      // Inventory purchases (devices added in period)
      let deviceQ = supabase
        .from('devices')
        .select('cost_price, company_id')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      // Repair parts purchased
      let partsQ = supabase
        .from('device_refurbishment_parts')
        .select('total_cost, company_id')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      // Intercompany transfers
      let transferQ = supabase
        .from('inventory_transfers')
        .select('transfer_price, from_company_id, to_company_id')
        .gte('transfer_date', startDate)
        .lte('transfer_date', endDate);

      if (companyFilter) {
        payoutQ = payoutQ.eq('company_id', companyFilter);
        expenseQ = expenseQ.eq('company_id', companyFilter);
        deviceQ = deviceQ.eq('company_id', companyFilter);
        partsQ = partsQ.eq('company_id', companyFilter);
      }

      const [arPayRes, payoutRes, expenseRes, apPayRes, deviceRes, partsRes, transferRes] = await Promise.all([
        arPayQ, payoutQ, expenseQ, apPaymentQ, deviceRes = deviceQ, partsQ, transferQ,
      ]);

      const salesCollected = (arPayRes.data || []).reduce((s, r) => {
        if (companyFilter && (r as any).accounts_receivable?.company_id !== companyFilter) return s;
        return s + (r.amount || 0);
      }, 0);

      const marketplacePayouts = (payoutRes.data || []).reduce((s, r) => s + (r.total_amount || 0), 0);

      const expensesPaid = (expenseRes.data || []).reduce((s, r) => s + (r.total_amount || r.amount || 0), 0);

      const apPayments = (apPayRes.data || []).reduce((s, r) => {
        if (companyFilter && (r as any).accounts_payable?.company_id !== companyFilter) return s;
        return s + (r.amount || 0);
      }, 0);

      const inventoryPurchases = (deviceRes.data || []).reduce((s, r) => s + (r.cost_price || 0), 0);
      const repairParts = (partsRes.data || []).reduce((s, r) => s + (r.total_cost || 0), 0);

      const transfers = transferRes.data || [];
      const transfersIn = transfers
        .filter(t => !companyFilter || t.to_company_id === companyFilter)
        .reduce((s, t) => s + (t.transfer_price || 0), 0);
      const transfersOut = transfers
        .filter(t => !companyFilter || t.from_company_id === companyFilter)
        .reduce((s, t) => s + (t.transfer_price || 0), 0);

      // Get cash balance from chart of accounts
      let cashQ = supabase
        .from('chart_of_accounts')
        .select('current_balance')
        .ilike('account_name', '%cash%')
        .eq('account_type', 'asset');
      if (companyFilter) cashQ = cashQ.eq('company_id', companyFilter);
      const cashRes = await cashQ;
      const closingCash = (cashRes.data || []).reduce((s, r) => s + (r.current_balance || 0), 0);

      const netOperating = salesCollected + marketplacePayouts - expensesPaid - apPayments;
      const netInvesting = -(inventoryPurchases + repairParts);
      const netFinancing = (companyFilter ? transfersIn - transfersOut : 0);
      const netChange = netOperating + netInvesting + netFinancing;

      setData({
        operating: {
          salesCollected,
          marketplacePayouts,
          expensesPaid,
          apPayments,
          taxPayments: 0,
          netOperating,
        },
        investing: {
          inventoryPurchases,
          repairParts,
          netInvesting,
        },
        financing: {
          intercompanyTransfersIn: companyFilter ? transfersIn : 0,
          intercompanyTransfersOut: companyFilter ? transfersOut : 0,
          netFinancing,
        },
        netChange,
        openingCash: closingCash - netChange,
        closingCash,
      });
    } catch (err) {
      console.error('Cash flow fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, effectiveCompany?.id, companies]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useDataRefetch(fetchData, ['sales', 'expenses', 'payouts']);

  const fmt = (n: number) => {
    const abs = Math.abs(n);
    const str = abs.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
    return n < 0 ? `(${str})` : str;
  };

  const TrendIcon = ({ value }: { value: number }) =>
    value > 0 ? <TrendingUp className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> :
    value < 0 ? <TrendingDown className="h-3.5 w-3.5 text-destructive" /> :
    <Minus className="h-3.5 w-3.5 text-muted-foreground" />;

  const LineItem = ({ label, value, indent = false }: { label: string; value: number; indent?: boolean }) => (
    <div className={`flex items-center justify-between py-1 ${indent ? 'pl-4' : ''}`}>
      <span className={`text-sm ${indent ? 'text-muted-foreground' : 'font-medium'}`}>{label}</span>
      <span className={`text-sm font-mono tabular-nums ${value < 0 ? 'text-destructive' : ''}`}>{fmt(value)}</span>
    </div>
  );

  const SectionTotal = ({ label, value }: { label: string; value: number }) => (
    <div className="flex items-center justify-between py-2 border-t border-border">
      <span className="text-sm font-semibold flex items-center gap-1.5">
        <TrendIcon value={value} />
        {label}
      </span>
      <span className={`text-sm font-bold font-mono tabular-nums ${value < 0 ? 'text-destructive' : 'text-[hsl(var(--success))]'}`}>
        {fmt(value)}
      </span>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">
              Cash Flow Statement
              {effectiveCompany && (
                <span className="text-sm font-normal text-muted-foreground ml-2">— {effectiveCompany.name}</span>
              )}
              {!effectiveCompany && <span className="text-sm font-normal text-muted-foreground ml-2">— Consolidated</span>}
            </CardTitle>
            <CardDescription>Cash movements by operating, investing & financing activities</CardDescription>
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Print
            </Button>
          </div>
        </div>
        <div className="flex items-end gap-3 mt-2">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-xs w-36" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-xs w-36" />
          </div>
          <Button size="sm" variant="outline" onClick={fetchData} className="h-8">Refresh</Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading cash flow data…</div>
        ) : !data ? (
          <div className="py-12 text-center text-muted-foreground text-sm">No data available</div>
        ) : (
          <div className="space-y-5">
            {/* Operating */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Operating Activities</h3>
              <LineItem label="AR Collections" value={data.operating.salesCollected} indent />
              <LineItem label="Marketplace Payouts Received" value={data.operating.marketplacePayouts} indent />
              <LineItem label="Expenses Paid" value={-data.operating.expensesPaid} indent />
              <LineItem label="AP Payments" value={-data.operating.apPayments} indent />
              <SectionTotal label="Net Cash from Operations" value={data.operating.netOperating} />
            </div>

            <Separator />

            {/* Investing */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Investing Activities</h3>
              <LineItem label="Inventory Purchases" value={-data.investing.inventoryPurchases} indent />
              <LineItem label="Repair Parts" value={-data.investing.repairParts} indent />
              <SectionTotal label="Net Cash from Investing" value={data.investing.netInvesting} />
            </div>

            {effectiveCompany && (
              <>
                <Separator />
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Financing Activities</h3>
                  <LineItem label="Intercompany Transfers In" value={data.financing.intercompanyTransfersIn} indent />
                  <LineItem label="Intercompany Transfers Out" value={-data.financing.intercompanyTransfersOut} indent />
                  <SectionTotal label="Net Cash from Financing" value={data.financing.netFinancing} />
                </div>
              </>
            )}

            <Separator className="border-2" />

            {/* Summary */}
            <div className="bg-muted/30 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Opening Cash (estimated)</span>
                <span className="font-mono tabular-nums">{fmt(data.openingCash)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Net Change in Cash</span>
                <span className={`font-mono tabular-nums font-semibold ${data.netChange < 0 ? 'text-destructive' : 'text-[hsl(var(--success))]'}`}>
                  {fmt(data.netChange)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>Closing Cash</span>
                <span className="font-mono tabular-nums">{fmt(data.closingCash)}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
