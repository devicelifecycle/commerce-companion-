import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { useDataRefetch } from '@/hooks/useDataRefetch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Download, Printer, Building2 } from 'lucide-react';
import { format } from 'date-fns';

interface BalanceSheetData {
  assets: {
    cash: number;
    accountsReceivable: number;
    inventory: number;
    prepaidExpenses: number;
    intercompanyReceivable: number;
    totalAssets: number;
  };
  liabilities: {
    accountsPayable: number;
    gstPayable: number;
    qstPayable: number;
    intercompanyPayable: number;
    totalLiabilities: number;
  };
  equity: {
    ownersEquity: number;
    retainedEarnings: number;
    currentYearPL: number;
    totalEquity: number;
  };
  totalLiabilitiesEquity: number;
  isBalanced: boolean;
}

interface Props {
  companyView?: string;
}

export function BalanceSheetReport({ companyView }: Props) {
  const { selectedCompany, companies } = useCompany();
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [data, setData] = useState<BalanceSheetData | null>(null);

  const effectiveCompany = (() => {
    if (companyView && companyView !== 'consolidated') {
      return companies.find(c => c.id === companyView) || null;
    }
    if (companyView === 'consolidated') return null;
    return selectedCompany;
  })();

  const fetchBalanceSheet = useCallback(async () => {
    setLoading(true);
    try {
      // Step 1: Fetch all active accounts with their opening_balance and metadata
      let acctQuery = supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type, normal_balance, opening_balance')
        .eq('is_active', true);

      if (effectiveCompany) {
        acctQuery = acctQuery.eq('company_id', effectiveCompany.id);
      }

      const { data: accounts, error: acctError } = await acctQuery;
      if (acctError) throw acctError;
      if (!accounts || accounts.length === 0) {
        setData(null);
        setLoading(false);
        return;
      }

      // Step 2: Fetch ALL journal_entry_lines for these accounts (live ledger)
      const accountIds = accounts.map(a => a.id);
      let allLines: Array<{ account_id: string; debit_amount: number | null; credit_amount: number | null }> = [];

      for (let i = 0; i < accountIds.length; i += 200) {
        const chunk = accountIds.slice(i, i + 200);
        const { data: lines } = await supabase
          .from('journal_entry_lines')
          .select('account_id, debit_amount, credit_amount')
          .in('account_id', chunk);
        if (lines) allLines = allLines.concat(lines);
      }

      // Step 3: Aggregate lines by account_id
      const lineAgg = new Map<string, { totalDebit: number; totalCredit: number }>();
      for (const line of allLines) {
        const existing = lineAgg.get(line.account_id) || { totalDebit: 0, totalCredit: 0 };
        existing.totalDebit += Number(line.debit_amount || 0);
        existing.totalCredit += Number(line.credit_amount || 0);
        lineAgg.set(line.account_id, existing);
      }

      // Step 4: Compute live balance for each account
      // For debit-normal accounts: balance = opening + debits - credits
      // For credit-normal accounts: balance = opening + credits - debits
      const bs: BalanceSheetData = {
        assets: { cash: 0, accountsReceivable: 0, inventory: 0, prepaidExpenses: 0, intercompanyReceivable: 0, totalAssets: 0 },
        liabilities: { accountsPayable: 0, gstPayable: 0, qstPayable: 0, intercompanyPayable: 0, totalLiabilities: 0 },
        equity: { ownersEquity: 0, retainedEarnings: 0, currentYearPL: 0, totalEquity: 0 },
        totalLiabilitiesEquity: 0,
        isBalanced: false,
      };

      for (const acc of accounts) {
        const opening = Number(acc.opening_balance || 0);
        const agg = lineAgg.get(acc.id) || { totalDebit: 0, totalCredit: 0 };
        const balance = acc.normal_balance === 'debit'
          ? opening + agg.totalDebit - agg.totalCredit
          : opening + agg.totalCredit - agg.totalDebit;

        const code = acc.account_code;

        // Assets
        if (code === '1000' || code === '1001') bs.assets.cash += balance;
        else if (code === '1050' || code === '1051') bs.assets.accountsReceivable += balance;
        else if (code === '1100' || code === '1101') bs.assets.inventory += balance;
        else if (code === '1200' || code === '1201') bs.assets.prepaidExpenses += balance;
        else if (code === '2201') bs.assets.intercompanyReceivable += balance;
        // Liabilities
        else if (code === '2010' || code === '2011') bs.liabilities.accountsPayable += balance;
        else if (code === '2000' || code === '2001') bs.liabilities.gstPayable += balance;
        else if (code === '2100' || code === '2101') bs.liabilities.qstPayable += balance;
        else if (code === '2200') bs.liabilities.intercompanyPayable += balance;
        // Equity
        else if (code === '3000' || code === '3001') bs.equity.ownersEquity += balance;
        else if (code === '3100' || code === '3101') bs.equity.retainedEarnings += balance;
        else if (code === '3200' || code === '3201') bs.equity.currentYearPL += balance;
      }

      // Consolidated: eliminate intercompany
      const isConsolidated = !effectiveCompany;
      if (isConsolidated) {
        bs.assets.intercompanyReceivable = 0;
        bs.liabilities.intercompanyPayable = 0;
      }

      bs.assets.totalAssets = bs.assets.cash + bs.assets.accountsReceivable + bs.assets.inventory
        + bs.assets.prepaidExpenses + bs.assets.intercompanyReceivable;
      bs.liabilities.totalLiabilities = bs.liabilities.accountsPayable + bs.liabilities.gstPayable
        + bs.liabilities.qstPayable + bs.liabilities.intercompanyPayable;
      bs.equity.totalEquity = bs.equity.ownersEquity + bs.equity.retainedEarnings + bs.equity.currentYearPL;
      bs.totalLiabilitiesEquity = bs.liabilities.totalLiabilities + bs.equity.totalEquity;
      bs.isBalanced = Math.abs(bs.assets.totalAssets - bs.totalLiabilitiesEquity) < 0.01;

      setData(bs);
    } catch (error) {
      console.error('Error fetching balance sheet:', error);
    } finally {
      setLoading(false);
    }
  }, [effectiveCompany?.id, asOfDate]);

  useEffect(() => {
    fetchBalanceSheet();
  }, [fetchBalanceSheet]);

  // Auto-refresh when any financial data changes
  useDataRefetch(['financials', 'sales', 'expenses', 'inventory', 'invoices', 'purchase_orders'], fetchBalanceSheet);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const companyLabel = effectiveCompany?.name || 'All Companies';

  const handleExport = () => {
    if (!data) return;
    const lines = [
      `Balance Sheet`,
      companyLabel,
      `As of: ${format(new Date(asOfDate), 'MMMM d, yyyy')}`,
      '',
      'ASSETS',
      `Cash,${data.assets.cash.toFixed(2)}`,
      `Accounts Receivable,${data.assets.accountsReceivable.toFixed(2)}`,
      `Inventory (FIFO),${data.assets.inventory.toFixed(2)}`,
      `Prepaid Expenses,${data.assets.prepaidExpenses.toFixed(2)}`,
      `Inter-company Receivable,${data.assets.intercompanyReceivable.toFixed(2)}`,
      `Total Assets,${data.assets.totalAssets.toFixed(2)}`,
      '',
      'LIABILITIES',
      `Accounts Payable,${data.liabilities.accountsPayable.toFixed(2)}`,
      `GST/HST Payable,${data.liabilities.gstPayable.toFixed(2)}`,
      `QST Payable,${data.liabilities.qstPayable.toFixed(2)}`,
      `Inter-company Payable,${data.liabilities.intercompanyPayable.toFixed(2)}`,
      `Total Liabilities,${data.liabilities.totalLiabilities.toFixed(2)}`,
      '',
      'EQUITY',
      `Owner's Equity,${data.equity.ownersEquity.toFixed(2)}`,
      `Retained Earnings,${data.equity.retainedEarnings.toFixed(2)}`,
      `Current Year P/L,${data.equity.currentYearPL.toFixed(2)}`,
      `Total Equity,${data.equity.totalEquity.toFixed(2)}`,
      '',
      `Total Liabilities + Equity,${data.totalLiabilitiesEquity.toFixed(2)}`,
    ];
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `balance-sheet-${asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label>As of Date</Label>
          <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="w-[180px]" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />Print
          </Button>
        </div>
      </div>

      <Card className="print:shadow-none">
        <CardHeader className="text-center border-b">
          <CardTitle className="text-2xl flex items-center justify-center gap-2">
            <Building2 className="h-6 w-6" />
            Balance Sheet
          </CardTitle>
          <CardDescription>
            {companyLabel} | As of {format(new Date(asOfDate), 'MMMM d, yyyy')}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {data ? (
            <div className="grid md:grid-cols-2 gap-8">
              {/* Assets */}
              <div>
                <h3 className="font-bold text-lg text-blue-500 mb-4 pb-2 border-b">ASSETS</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Cash</span>
                    <span className="font-medium">{formatCurrency(data.assets.cash)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Accounts Receivable</span>
                    <span className="font-medium">{formatCurrency(data.assets.accountsReceivable)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Inventory (FIFO valuation)</span>
                    <span className="font-medium">{formatCurrency(data.assets.inventory)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Prepaid Expenses</span>
                    <span className="font-medium">{formatCurrency(data.assets.prepaidExpenses)}</span>
                  </div>
                  {data.assets.intercompanyReceivable > 0 && (
                    <div className="flex justify-between">
                      <span>Inter-company Receivable</span>
                      <span className="font-medium">{formatCurrency(data.assets.intercompanyReceivable)}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between font-bold text-lg mt-4 pt-4 border-t-2 border-blue-500/30">
                  <span>Total Assets</span>
                  <span>{formatCurrency(data.assets.totalAssets)}</span>
                </div>
              </div>

              {/* Liabilities & Equity */}
              <div>
                <h3 className="font-bold text-lg text-primary mb-4 pb-2 border-b">LIABILITIES</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Accounts Payable</span>
                    <span className="font-medium">{formatCurrency(data.liabilities.accountsPayable)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST/HST Payable</span>
                    <span className="font-medium">{formatCurrency(data.liabilities.gstPayable)}</span>
                  </div>
                  {data.liabilities.qstPayable > 0 && (
                    <div className="flex justify-between">
                      <span>QST Payable</span>
                      <span className="font-medium">{formatCurrency(data.liabilities.qstPayable)}</span>
                    </div>
                  )}
                  {data.liabilities.intercompanyPayable > 0 && (
                    <div className="flex justify-between">
                      <span>Inter-company Payable</span>
                      <span className="font-medium">{formatCurrency(data.liabilities.intercompanyPayable)}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between font-bold mt-4 pt-2 border-t">
                  <span>Total Liabilities</span>
                  <span>{formatCurrency(data.liabilities.totalLiabilities)}</span>
                </div>

                <Separator className="my-6" />

                <h3 className="font-bold text-lg text-purple-500 mb-4 pb-2 border-b">EQUITY</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Owner's Equity</span>
                    <span className="font-medium">{formatCurrency(data.equity.ownersEquity)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Retained Earnings</span>
                    <span className="font-medium">{formatCurrency(data.equity.retainedEarnings)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Current Year Profit/Loss</span>
                    <span className={`font-medium ${data.equity.currentYearPL >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                      {formatCurrency(data.equity.currentYearPL)}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between font-bold mt-4 pt-2 border-t">
                  <span>Total Equity</span>
                  <span>{formatCurrency(data.equity.totalEquity)}</span>
                </div>

                <div className={`flex justify-between font-bold text-lg mt-6 pt-4 border-t-2 ${data.isBalanced ? 'border-emerald-500/30' : 'border-destructive'}`}>
                  <span>Total Liabilities + Equity</span>
                  <span>{formatCurrency(data.totalLiabilitiesEquity)}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground">
              No data available. Initialize Chart of Accounts first.
            </p>
          )}

          {data && (
            <div className={`mt-6 p-4 rounded-lg text-center border ${data.isBalanced ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-destructive/40 bg-destructive/10'}`}>
              {data.isBalanced ? (
                <p className="text-emerald-500 font-medium">
                  ✓ Balance Sheet is balanced (Assets = Liabilities + Equity)
                </p>
              ) : (
                <p className="text-destructive font-medium">
                  ⚠ Balance Sheet is NOT balanced. Difference: {formatCurrency(Math.abs(data.assets.totalAssets - data.totalLiabilitiesEquity))}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
