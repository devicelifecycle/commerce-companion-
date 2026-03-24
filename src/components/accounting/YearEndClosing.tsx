import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Lock, AlertTriangle, CheckCircle } from 'lucide-react';
import { emitRefetch } from '@/hooks/useDataRefetch';

export function YearEndClosing() {
  const { companies } = useCompany();
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear() - 1);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<{ revenue: number; expenses: number; netIncome: number } | null>(null);

  const handlePreview = async () => {
    if (!selectedCompanyId) { toast.error('Select a company'); return; }
    setLoading(true);
    try {
      const startDate = `${fiscalYear}-01-01`;
      const endDate = `${fiscalYear}-12-31`;

      // Sum all revenue (4xxx) and expense (5xxx-7xxx) journal entries for the year
      const { data: lines, error } = await supabase
        .from('journal_entry_lines')
        .select(`
          debit_amount, credit_amount,
          chart_of_accounts!inner(account_code, account_type),
          journal_entries!inner(entry_date, company_id, status)
        `)
        .eq('journal_entries.company_id', selectedCompanyId)
        .eq('journal_entries.status', 'posted')
        .gte('journal_entries.entry_date', startDate)
        .lte('journal_entries.entry_date', endDate);

      if (error) throw error;

      let revenue = 0;
      let expenses = 0;

      (lines || []).forEach((line: any) => {
        const code = line.chart_of_accounts.account_code;
        const credit = Number(line.credit_amount || 0);
        const debit = Number(line.debit_amount || 0);

        if (code.startsWith('4')) {
          revenue += credit - debit; // Revenue = credits - debits
        } else if (code.startsWith('5') || code.startsWith('6') || code.startsWith('7')) {
          expenses += debit - credit; // Expenses = debits - credits
        }
      });

      setPreview({ revenue, expenses, netIncome: revenue - expenses });
    } catch (err: any) {
      toast.error(err.message || 'Failed to calculate closing entries');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    if (!preview || !selectedCompanyId) return;
    setLoading(true);
    try {
      const closingDate = `${fiscalYear}-12-31`;

      // Get retained earnings account (3100 or 3101)
      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code')
        .eq('company_id', selectedCompanyId)
        .in('account_code', ['3100', '3101', '3200', '3201']);

      const retainedEarningsId = accounts?.find(a => ['3100', '3101'].includes(a.account_code))?.id;
      const currentYearPLId = accounts?.find(a => ['3200', '3201'].includes(a.account_code))?.id;

      if (!retainedEarningsId) {
        throw new Error('Retained Earnings account (3100/3101) not found. Set up Chart of Accounts first.');
      }

      const entryNumber = `CLOSE-${fiscalYear}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

      // Create closing entry: transfer net income to retained earnings
      // If net income > 0: Dr. Income Summary (current year P/L) / Cr. Retained Earnings
      // If net loss: Dr. Retained Earnings / Cr. Income Summary
      const netIncome = preview.netIncome;
      const lines = [];

      if (currentYearPLId) {
        if (netIncome >= 0) {
          lines.push(
            { account_id: currentYearPLId, description: `Close ${fiscalYear} net income to retained earnings`, debit_amount: netIncome, credit_amount: 0 },
            { account_id: retainedEarningsId, description: `${fiscalYear} net income transferred`, debit_amount: 0, credit_amount: netIncome },
          );
        } else {
          const loss = Math.abs(netIncome);
          lines.push(
            { account_id: retainedEarningsId, description: `${fiscalYear} net loss transferred`, debit_amount: loss, credit_amount: 0 },
            { account_id: currentYearPLId, description: `Close ${fiscalYear} net loss to retained earnings`, debit_amount: 0, credit_amount: loss },
          );
        }
      } else {
        // No current year P/L account — just credit retained earnings directly
        if (netIncome >= 0) {
          lines.push(
            { account_id: retainedEarningsId, description: `${fiscalYear} closing — net income`, debit_amount: 0, credit_amount: netIncome },
          );
        }
      }

      if (lines.length < 2) {
        throw new Error('Need at least 2 accounts for closing entry. Ensure Current Year P/L account (3200/3201) exists.');
      }

      const totalDebit = lines.reduce((s, l) => s + l.debit_amount, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit_amount, 0);

      const { data: entry, error: entryErr } = await supabase.from('journal_entries').insert({
        company_id: selectedCompanyId,
        entry_number: entryNumber,
        entry_date: closingDate,
        description: `Year-end closing entry — FY${fiscalYear}`,
        reference_type: 'year_end_closing',
        total_debit: totalDebit,
        total_credit: totalCredit,
        is_auto_generated: true,
        status: 'posted',
        posted_at: new Date().toISOString(),
      }).select('id').single();

      if (entryErr) throw entryErr;

      await supabase.from('journal_entry_lines').insert(
        lines.map(l => ({ journal_entry_id: entry.id, ...l }))
      );

      // Update account balances
      for (const line of lines) {
        const { data: acct } = await supabase.from('chart_of_accounts')
          .select('current_balance, normal_balance').eq('id', line.account_id).single();
        if (acct) {
          const current = Number(acct.current_balance || 0);
          const newBal = acct.normal_balance === 'debit'
            ? current + line.debit_amount - line.credit_amount
            : current + line.credit_amount - line.debit_amount;
          await supabase.from('chart_of_accounts').update({ current_balance: newBal }).eq('id', line.account_id);
        }
      }

      toast.success(`Year-end closing complete for FY${fiscalYear}. Net income of $${netIncome.toFixed(2)} transferred to Retained Earnings.`);
      setPreview(null);
      setConfirmOpen(false);
      emitRefetch('financials');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create closing entries');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Year-End Closing
        </CardTitle>
        <CardDescription>
          Transfer net income/loss to Retained Earnings and close the fiscal year.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <div className="space-y-2 flex-1">
            <Label>Company</Label>
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
              <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
              <SelectContent>
                {companies.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 w-32">
            <Label>Fiscal Year</Label>
            <Input type="number" value={fiscalYear} onChange={e => setFiscalYear(parseInt(e.target.value))} />
          </div>
          <div className="flex items-end">
            <Button onClick={handlePreview} disabled={loading || !selectedCompanyId}>
              {loading ? 'Calculating...' : 'Preview'}
            </Button>
          </div>
        </div>

        {preview && (
          <div className="rounded-lg border p-4 space-y-3">
            <h4 className="font-semibold">FY{fiscalYear} Closing Summary</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-lg font-bold text-emerald-500">{formatCurrency(preview.revenue)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Expenses</p>
                <p className="text-lg font-bold text-destructive">{formatCurrency(preview.expenses)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Net Income</p>
                <p className={`text-lg font-bold ${preview.netIncome >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                  {formatCurrency(preview.netIncome)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground border-t pt-3">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              This will create a closing journal entry transferring {formatCurrency(Math.abs(preview.netIncome))} to Retained Earnings.
            </div>

            <Button onClick={() => setConfirmOpen(true)} className="w-full" disabled={loading}>
              <Lock className="h-4 w-4 mr-2" />
              Close FY{fiscalYear}
            </Button>
          </div>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Year-End Closing</AlertDialogTitle>
              <AlertDialogDescription>
                This will post a closing journal entry for FY{fiscalYear}, transferring the net income of{' '}
                {formatCurrency(preview?.netIncome || 0)} to Retained Earnings. This action should only be done once per fiscal year.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleClose} disabled={loading}>
                {loading ? 'Processing...' : 'Confirm & Close'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
