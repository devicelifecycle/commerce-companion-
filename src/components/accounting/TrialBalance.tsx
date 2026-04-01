import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { useDataRefetch } from '@/hooks/useDataRefetch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Download, FileText, CheckCircle, AlertCircle, Printer } from 'lucide-react';
import { format } from 'date-fns';

interface AccountBalance {
  account_code: string;
  account_name: string;
  account_type: string;
  debit_balance: number;
  credit_balance: number;
}

export function TrialBalance() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);

  const fetchTrialBalance = useCallback(async () => {
    setLoading(true);
    try {
      // Step 1: Fetch all active accounts
      let query = supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type, normal_balance, opening_balance')
        .eq('is_active', true)
        .order('account_code');

      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) {
        setAccounts([]);
        setLoading(false);
        return;
      }

      // Step 2: Fetch all journal_entry_lines for these accounts
      const accountIds = data.map(a => a.id);
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

      // Step 4: Compute live balance and format as debit/credit
      const balances: AccountBalance[] = data.map((acc: any) => {
        const opening = Number(acc.opening_balance || 0);
        const agg = lineAgg.get(acc.id) || { totalDebit: 0, totalCredit: 0 };
        const liveBalance = acc.normal_balance === 'debit'
          ? opening + agg.totalDebit - agg.totalCredit
          : opening + agg.totalCredit - agg.totalDebit;

        return {
          account_code: acc.account_code,
          account_name: acc.account_name,
          account_type: acc.account_type,
          debit_balance: acc.normal_balance === 'debit' ? liveBalance : 0,
          credit_balance: acc.normal_balance === 'credit' ? liveBalance : 0,
        };
      }).filter((acc: AccountBalance) => acc.debit_balance !== 0 || acc.credit_balance !== 0);

      setAccounts(balances);
    } catch (error) {
      console.error('Error fetching trial balance:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedCompany?.id, asOfDate]);

  useEffect(() => {
    fetchTrialBalance();
  }, [fetchTrialBalance]);

  // Auto-refresh when any financial data changes
  useDataRefetch(['financials', 'sales', 'expenses', 'inventory', 'invoices', 'purchase_orders'], fetchTrialBalance);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const totalDebits = accounts.reduce((sum, a) => sum + a.debit_balance, 0);
  const totalCredits = accounts.reduce((sum, a) => sum + a.credit_balance, 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  const accountsByType = {
    asset: accounts.filter(a => a.account_type === 'asset'),
    liability: accounts.filter(a => a.account_type === 'liability'),
    equity: accounts.filter(a => a.account_type === 'equity'),
    revenue: accounts.filter(a => a.account_type === 'revenue'),
    expense: accounts.filter(a => a.account_type === 'expense'),
  };

  const handleExport = () => {
    const headers = ['Account Code', 'Account Name', 'Type', 'Debit', 'Credit'];
    const rows = accounts.map(a => [
      a.account_code, a.account_name, a.account_type,
      a.debit_balance > 0 ? a.debit_balance.toFixed(2) : '',
      a.credit_balance > 0 ? a.credit_balance.toFixed(2) : '',
    ]);
    rows.push(['', 'TOTALS', '', totalDebits.toFixed(2), totalCredits.toFixed(2)]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trial-balance-${asOfDate}.csv`;
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

  const renderSection = (label: string, items: AccountBalance[], bgClass: string) => {
    if (items.length === 0) return null;
    return (
      <>
        <TableRow className={bgClass}>
          <TableCell colSpan={4} className="font-semibold">{label}</TableCell>
        </TableRow>
        {items.map(acc => (
          <TableRow key={acc.account_code}>
            <TableCell className="font-mono">{acc.account_code}</TableCell>
            <TableCell>{acc.account_name}</TableCell>
            <TableCell className="text-right">
              {acc.debit_balance > 0 ? formatCurrency(acc.debit_balance) : ''}
            </TableCell>
            <TableCell className="text-right">
              {acc.credit_balance > 0 ? formatCurrency(acc.credit_balance) : ''}
            </TableCell>
          </TableRow>
        ))}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label>As of Date:</Label>
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

      <Card className={isBalanced ? 'border-emerald-500/50' : 'border-destructive/50'}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isBalanced ? (
                <CheckCircle className="h-8 w-8 text-emerald-500" />
              ) : (
                <AlertCircle className="h-8 w-8 text-destructive" />
              )}
              <div>
                <p className="font-semibold text-lg">
                  {isBalanced ? 'Trial Balance is Balanced' : 'Trial Balance is NOT Balanced'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isBalanced
                    ? 'Debits equal Credits'
                    : `Difference: ${formatCurrency(Math.abs(totalDebits - totalCredits))}`}
                </p>
              </div>
            </div>
            <div className="flex gap-8">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Total Debits</p>
                <p className="text-2xl font-bold">{formatCurrency(totalDebits)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Total Credits</p>
                <p className="text-2xl font-bold">{formatCurrency(totalCredits)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="print:shadow-none">
        <CardHeader className="text-center border-b">
          <CardTitle className="text-2xl flex items-center justify-center gap-2">
            <FileText className="h-6 w-6" />
            Trial Balance
          </CardTitle>
          <CardDescription>
            {selectedCompany?.name || 'All Companies'} | As of {format(new Date(asOfDate), 'MMMM d, yyyy')}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {accounts.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              No account balances found. Initialize Chart of Accounts first.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Code</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead className="w-[150px] text-right">Debit</TableHead>
                  <TableHead className="w-[150px] text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renderSection('ASSETS', accountsByType.asset, 'bg-blue-500/10')}
                {renderSection('LIABILITIES', accountsByType.liability, 'bg-amber-500/10')}
                {renderSection('EQUITY', accountsByType.equity, 'bg-purple-500/10')}
                {renderSection('REVENUE', accountsByType.revenue, 'bg-emerald-500/10')}
                {renderSection('EXPENSES', accountsByType.expense, 'bg-destructive/10')}
                <TableRow className="font-bold bg-muted/50">
                  <TableCell colSpan={2}>TOTALS</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalDebits)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalCredits)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
