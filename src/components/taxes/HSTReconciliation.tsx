import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { MetricCard } from '@/components/ui/metric-card';
import { Scale, AlertTriangle, CheckCircle, Download, TrendingUp, ArrowDown, ArrowUp } from 'lucide-react';
import { format, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subQuarters } from 'date-fns';

interface ReconciliationRow {
  label: string;
  ledgerAmount: number;
  operationalAmount: number;
  variance: number;
}

export function HSTReconciliation() {
  const { selectedCompany, companies } = useCompany();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('current_quarter');
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [totals, setTotals] = useState({ ledger: 0, operational: 0, variance: 0 });

  useEffect(() => { fetchReconciliation(); }, [selectedCompany, period]);

  const getPeriodDates = () => {
    const now = new Date();
    switch (period) {
      case 'current_quarter': return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case 'last_quarter': return { start: startOfQuarter(subQuarters(now, 1)), end: endOfQuarter(subQuarters(now, 1)) };
      case 'ytd': return { start: startOfYear(now), end: now };
      default: return { start: startOfQuarter(now), end: endOfQuarter(now) };
    }
  };

  const fetchReconciliation = async () => {
    setLoading(true);
    try {
      const { start, end } = getPeriodDates();
      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];

      // 1. LEDGER: Tax collected from journal entries (accounts 4200/4201)
      let jeQuery = supabase
        .from('journal_entry_lines')
        .select('credit_amount, debit_amount, account_id, journal_entry_id')
        .gt('credit_amount', 0);

      const { data: jeLines } = await jeQuery;

      // Get tax account IDs
      let accountQuery = supabase
        .from('chart_of_accounts')
        .select('id, account_code, company_id')
        .in('account_code', ['4200', '4201', '8000', '8001']);

      if (selectedCompany) {
        accountQuery = accountQuery.eq('company_id', selectedCompany.id);
      }
      const { data: taxAccounts } = await accountQuery;

      const taxCollectedIds = new Set(
        (taxAccounts || []).filter(a => a.account_code === '4200' || a.account_code === '4201').map(a => a.id)
      );
      const itcAccountIds = new Set(
        (taxAccounts || []).filter(a => a.account_code === '8000' || a.account_code === '8001').map(a => a.id)
      );

      // Get journal entries in the period
      let jeHeaderQuery = supabase
        .from('journal_entries')
        .select('id')
        .gte('entry_date', startStr)
        .lte('entry_date', endStr)
        .neq('status', 'voided');

      if (selectedCompany) {
        jeHeaderQuery = jeHeaderQuery.eq('company_id', selectedCompany.id);
      }
      const { data: jeHeaders } = await jeHeaderQuery;
      const jeIds = new Set((jeHeaders || []).map(j => j.id));

      // Filter lines to period
      const periodLines = (jeLines || []).filter(l => jeIds.has(l.journal_entry_id));
      const ledgerTaxCollected = periodLines
        .filter(l => taxCollectedIds.has(l.account_id))
        .reduce((sum, l) => sum + Number(l.credit_amount || 0) - Number(l.debit_amount || 0), 0);

      // ITC from ledger (debit side of 8000/8001)
      let allJeLines = await supabase
        .from('journal_entry_lines')
        .select('credit_amount, debit_amount, account_id, journal_entry_id');

      const ledgerITC = (allJeLines.data || [])
        .filter(l => itcAccountIds.has(l.account_id) && jeIds.has(l.journal_entry_id))
        .reduce((sum, l) => sum + Number(l.debit_amount || 0) - Number(l.credit_amount || 0), 0);

      // 2. OPERATIONAL: Tax from sales table
      let salesQuery = supabase
        .from('sales')
        .select('tax_amount, is_marketplace_remitted')
        .gte('sale_date', startStr)
        .lte('sale_date', endStr);

      if (selectedCompany) {
        salesQuery = salesQuery.eq('company_id', selectedCompany.id);
      }
      const { data: sales } = await salesQuery;

      const opTaxTotal = (sales || []).reduce((sum, s) => sum + Number(s.tax_amount || 0), 0);
      const opTaxYouOwe = (sales || [])
        .filter(s => !s.is_marketplace_remitted)
        .reduce((sum, s) => sum + Number(s.tax_amount || 0), 0);
      const opTaxMarketplace = opTaxTotal - opTaxYouOwe;

      // 3. OPERATIONAL: ITC from expenses
      let expQuery = supabase
        .from('expenses')
        .select('gst_hst_amount, pst_amount')
        .gte('expense_date', startStr)
        .lte('expense_date', endStr);

      if (selectedCompany) {
        expQuery = expQuery.eq('company_id', selectedCompany.id);
      }
      const { data: expenses } = await expQuery;

      const opITC = (expenses || []).reduce(
        (sum, e) => sum + Number(e.gst_hst_amount || 0), 0
      );

      // Build reconciliation rows
      const reconRows: ReconciliationRow[] = [
        {
          label: 'Tax Collected on Sales',
          ledgerAmount: ledgerTaxCollected,
          operationalAmount: opTaxTotal,
          variance: ledgerTaxCollected - opTaxTotal,
        },
        {
          label: 'Tax You Owe (Non-Marketplace)',
          ledgerAmount: ledgerTaxCollected, // Ledger doesn't distinguish
          operationalAmount: opTaxYouOwe,
          variance: ledgerTaxCollected - opTaxYouOwe,
        },
        {
          label: 'Marketplace-Remitted Tax',
          ledgerAmount: 0,
          operationalAmount: opTaxMarketplace,
          variance: -opTaxMarketplace,
        },
        {
          label: 'Input Tax Credits (GST/HST)',
          ledgerAmount: ledgerITC,
          operationalAmount: opITC,
          variance: ledgerITC - opITC,
        },
      ];

      const netLedger = ledgerTaxCollected - ledgerITC;
      const netOp = opTaxYouOwe - opITC;

      reconRows.push({
        label: 'Net Tax Payable',
        ledgerAmount: netLedger,
        operationalAmount: netOp,
        variance: netLedger - netOp,
      });

      setRows(reconRows);
      setTotals({ ledger: netLedger, operational: netOp, variance: netLedger - netOp });
    } catch (error) {
      console.error('HST reconciliation error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const { start, end } = getPeriodDates();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">HST Reconciliation</h3>
          <p className="text-sm text-muted-foreground">
            Ledger (GL) vs Operational (Sales/Expenses) — {format(start, 'MMM d')} to {format(end, 'MMM d, yyyy')}
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current_quarter">Current Quarter</SelectItem>
            <SelectItem value="last_quarter">Last Quarter</SelectItem>
            <SelectItem value="ytd">Year to Date</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="GL Net Payable"
          value={formatCurrency(totals.ledger)}
          icon={Scale}
          changeType="neutral"
          change="From journal entries"
        />
        <MetricCard
          title="Operational Net Payable"
          value={formatCurrency(totals.operational)}
          icon={TrendingUp}
          changeType="neutral"
          change="From sales & expenses"
        />
        <MetricCard
          title="Variance"
          value={formatCurrency(Math.abs(totals.variance))}
          icon={Math.abs(totals.variance) < 1 ? CheckCircle : AlertTriangle}
          changeType={Math.abs(totals.variance) < 1 ? 'positive' : 'negative'}
          change={Math.abs(totals.variance) < 1 ? 'Reconciled' : 'Needs review'}
        />
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="h-40 animate-pulse bg-muted rounded" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">GL (Ledger)</TableHead>
                  <TableHead className="text-right">Operational</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.label} className={row.label === 'Net Tax Payable' ? 'font-bold border-t-2' : ''}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.ledgerAmount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.operationalAmount)}</TableCell>
                    <TableCell className="text-right">
                      <span className={Math.abs(row.variance) > 1 ? 'text-destructive' : 'text-muted-foreground'}>
                        {row.variance > 0 && '+'}{formatCurrency(row.variance)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {Math.abs(row.variance) < 1 ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600">
                          <CheckCircle className="h-3 w-3 mr-1" /> Match
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <AlertTriangle className="h-3 w-3 mr-1" /> {formatCurrency(Math.abs(row.variance))}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
