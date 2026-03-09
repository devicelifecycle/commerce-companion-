import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowDownRight, ArrowUpRight, DollarSign, CheckCircle, AlertTriangle, Zap, RefreshCw } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import {
  runAutoMatching,
  applyMatch,
  applyAllMatches,
  type ReconciliationResult,
  type MatchResult,
  type UnmatchedTransaction,
} from '@/lib/accounting/bankReconciliation';

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string | null;
  current_balance: number | null;
  company_id: string | null;
}

export default function CashFlow() {
  const { selectedCompany } = useCompany();
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);

  useEffect(() => {
    loadBankAccounts();
  }, [selectedCompany?.id]);

  const loadBankAccounts = async () => {
    let query = supabase.from('bank_accounts').select('id, account_name, bank_name, current_balance, company_id').eq('is_active', true);
    if (selectedCompany?.id) query = query.eq('company_id', selectedCompany.id);
    const { data } = await query;
    setBankAccounts(data || []);
    if (data && data.length > 0 && !selectedAccountId) {
      setSelectedAccountId(data[0].id);
    }
  };

  const handleRunMatching = async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      const res = await runAutoMatching(selectedAccountId, startDate, endDate);
      setResult(res);
      toast.success(`Found ${res.matched.length} matches, ${res.unmatchedBank.length} unmatched bank txns`);
    } catch (err: any) {
      toast.error(err.message || 'Matching failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyMatch = async (match: MatchResult) => {
    try {
      await applyMatch(match.bankTransactionId, match.journalEntryId);
      toast.success('Match applied');
      // Re-run to refresh
      handleRunMatching();
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply match');
    }
  };

  const handleApplyAll = async () => {
    if (!result) return;
    setApplyingAll(true);
    try {
      const count = await applyAllMatches(result.matched, 'high');
      toast.success(`Applied ${count} high-confidence matches`);
      handleRunMatching();
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply matches');
    } finally {
      setApplyingAll(false);
    }
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const confidenceBadge = (c: string) => {
    switch (c) {
      case 'exact': return <Badge className="bg-emerald-500/20 text-emerald-700 border-emerald-300">Exact</Badge>;
      case 'high': return <Badge className="bg-blue-500/20 text-blue-700 border-blue-300">High</Badge>;
      default: return <Badge variant="secondary">Low</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold gradient-text">Bank Reconciliation</h1>
          <p className="text-muted-foreground mt-1">Match bank transactions to journal entries and identify discrepancies</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Bank Balance</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{result ? formatCurrency(result.totalBankAmount) : '—'}</p>
              <p className="text-xs text-muted-foreground mt-1">Total bank transactions in period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Book Balance</CardTitle>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{result ? formatCurrency(result.totalJournalAmount) : '—'}</p>
              <p className="text-xs text-muted-foreground mt-1">Total journal entries in period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Variance</CardTitle>
              <ArrowDownRight className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${result && Math.abs(result.variance) > 0.01 ? 'text-destructive' : 'text-emerald-600'}`}>
                {result ? formatCurrency(result.variance) : '—'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Bank − Book difference</p>
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reconciliation Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label>Bank Account</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.account_name} {a.bank_name ? `(${a.bank_name})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-[160px]" />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-[160px]" />
              </div>
              <Button onClick={handleRunMatching} disabled={loading || !selectedAccountId}>
                <Zap className="h-4 w-4 mr-2" />
                {loading ? 'Matching...' : 'Run Auto-Match'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <>
            {/* Matched Transactions */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                    Matched Transactions ({result.matched.length})
                  </CardTitle>
                  <CardDescription>Auto-matched by amount and date proximity</CardDescription>
                </div>
                {result.matched.length > 0 && (
                  <Button size="sm" onClick={handleApplyAll} disabled={applyingAll}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${applyingAll ? 'animate-spin' : ''}`} />
                    Apply All High-Confidence
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {result.matched.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No matches found in this period</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Amount Diff</TableHead>
                        <TableHead>Date Diff</TableHead>
                        <TableHead className="w-[120px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.matched.map((m, i) => (
                        <TableRow key={i}>
                          <TableCell>{confidenceBadge(m.confidence)}</TableCell>
                          <TableCell className="font-mono">{formatCurrency(m.amountDiff)}</TableCell>
                          <TableCell>{m.dateDiff.toFixed(0)} days</TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => handleApplyMatch(m)}>
                              Reconcile
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Unmatched Bank Transactions */}
            {result.unmatchedBank.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Unmatched Bank Transactions ({result.unmatchedBank.length})
                  </CardTitle>
                  <CardDescription>Bank transactions with no matching journal entry — may need manual entry</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.unmatchedBank.map(t => (
                        <TableRow key={t.id}>
                          <TableCell>{format(new Date(t.transaction_date), 'MMM d, yyyy')}</TableCell>
                          <TableCell className="text-muted-foreground">{t.description || '—'}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(t.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Unmatched Journal Entries */}
            {result.unmatchedJournal.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Unmatched Journal Entries ({result.unmatchedJournal.length})
                  </CardTitle>
                  <CardDescription>Journal entries with no corresponding bank transaction — may be outstanding</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.unmatchedJournal.map(t => (
                        <TableRow key={t.id}>
                          <TableCell>{format(new Date(t.transaction_date), 'MMM d, yyyy')}</TableCell>
                          <TableCell className="text-muted-foreground">{t.description || '—'}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(t.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!result && (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center text-center">
                <DollarSign className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Bank Reconciliation</h3>
                <p className="text-muted-foreground max-w-md">
                  Select a bank account and date range, then click "Run Auto-Match" to automatically match bank transactions to journal entries.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
