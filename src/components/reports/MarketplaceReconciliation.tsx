import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, AlertTriangle, CheckCircle2, Calendar, Search } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { TransactionAuditTrail } from './TransactionAuditTrail';

interface ReconciliationRow {
  id: string;
  orderNumber: string;
  marketplace: string;
  saleDate: string;
  salePrice: number;
  fees: number;
  shipping: number;
  expectedPayout: number;
  deviceLinked: boolean;
  deviceCost: number | null;
  profit: number | null;
  hasJournalEntries: boolean;
  discrepancy: string | null;
}

interface ReconciliationSummary {
  totalSales: number;
  matchedEntries: number;
  unmatchedEntries: number;
  missingDeviceLinks: number;
  totalDiscrepancy: number;
}

interface MarketplaceReconciliationProps {
  companyView?: 'consolidated' | string;
}

export function MarketplaceReconciliation({ companyView = 'consolidated' }: MarketplaceReconciliationProps) {
  const { companies } = useCompany();
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(format(new Date(), 'yyyy-MM'));
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary>({ totalSales: 0, matchedEntries: 0, unmatchedEntries: 0, missingDeviceLinks: 0, totalDiscrepancy: 0 });
  const [filterStatus, setFilterStatus] = useState<'all' | 'issues'>('all');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  useEffect(() => {
    fetchReconciliationData();
  }, [companyView, selectedPeriod]);

  const fetchReconciliationData = async () => {
    setLoading(true);
    try {
      const [year, month] = selectedPeriod.split('-');
      const start = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
      const end = endOfMonth(start);

      // Fetch sales
      let salesQuery = supabase
        .from('sales')
        .select('id, order_number, marketplace, sale_date, sale_price, marketplace_fees, shipping_cost, profit, device_id, company_id')
        .gte('sale_date', start.toISOString())
        .lte('sale_date', end.toISOString())
        .order('sale_date', { ascending: false });

      if (companyView !== 'consolidated') {
        salesQuery = salesQuery.eq('company_id', companyView);
      }

      const { data: sales } = await salesQuery;
      if (!sales || sales.length === 0) {
        setRows([]);
        setSummary({ totalSales: 0, matchedEntries: 0, unmatchedEntries: 0, missingDeviceLinks: 0, totalDiscrepancy: 0 });
        setLoading(false);
        return;
      }

      // Fetch device costs
      const deviceIds = sales.filter(s => s.device_id).map(s => s.device_id!);
      let deviceCosts: Record<string, number> = {};
      if (deviceIds.length > 0) {
        const { data: devices } = await supabase
          .from('devices')
          .select('id, cost_price')
          .in('id', deviceIds);
        devices?.forEach(d => { deviceCosts[d.id] = Number(d.cost_price); });
      }

      // Fetch journal entries linked to these sales
      const saleIds = sales.map(s => s.id);
      const { data: journalEntries } = await supabase
        .from('journal_entries')
        .select('reference_id')
        .eq('reference_type', 'sale')
        .in('reference_id', saleIds);

      const salesWithJE = new Set(journalEntries?.map(je => je.reference_id) || []);

      // Build reconciliation rows
      const reconcRows: ReconciliationRow[] = sales.map(sale => {
        const salePrice = Number(sale.sale_price);
        const fees = Number(sale.marketplace_fees || 0);
        const shipping = Number(sale.shipping_cost || 0);
        const expectedPayout = salePrice - fees;
        const deviceCost = sale.device_id ? (deviceCosts[sale.device_id] ?? null) : null;
        const hasJE = salesWithJE.has(sale.id);
        const discrepancies: string[] = [];

        if (!sale.device_id) discrepancies.push('No device linked');
        if (!hasJE) discrepancies.push('Missing journal entries');
        if (sale.device_id && deviceCost === null) discrepancies.push('Device cost unknown');

        return {
          id: sale.id,
          orderNumber: sale.order_number,
          marketplace: sale.marketplace,
          saleDate: sale.sale_date,
          salePrice,
          fees,
          shipping,
          expectedPayout,
          deviceLinked: !!sale.device_id,
          deviceCost,
          profit: sale.profit !== null ? Number(sale.profit) : null,
          hasJournalEntries: hasJE,
          discrepancy: discrepancies.length > 0 ? discrepancies.join('; ') : null,
        };
      });

      setRows(reconcRows);

      const matched = reconcRows.filter(r => !r.discrepancy).length;
      setSummary({
        totalSales: reconcRows.length,
        matchedEntries: matched,
        unmatchedEntries: reconcRows.length - matched,
        missingDeviceLinks: reconcRows.filter(r => !r.deviceLinked).length,
        totalDiscrepancy: reconcRows.filter(r => r.discrepancy).length,
      });
    } catch (error) {
      console.error('Error fetching reconciliation data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const marketplaceLabels: Record<string, string> = {
    amazon: 'Amazon', bestbuy: 'Best Buy', shopify: 'Shopify', manual: 'Manual',
  };

  const filteredRows = filterStatus === 'issues' ? rows.filter(r => r.discrepancy) : rows;

  const periodOptions = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return { value: format(date, 'yyyy-MM'), label: format(date, 'MMMM yyyy') };
  });

  const handleExport = () => {
    const header = 'Order #,Marketplace,Date,Sale Price,Fees,Shipping,Expected Payout,Device Linked,Device Cost,Profit,Journal Entries,Issues';
    const csvRows = rows.map(r =>
      `${r.orderNumber},${r.marketplace},${r.saleDate},${r.salePrice},${r.fees},${r.shipping},${r.expectedPayout},${r.deviceLinked},${r.deviceCost ?? ''},${r.profit ?? ''},${r.hasJournalEntries},"${r.discrepancy || ''}"`
    );
    const csv = [header, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reconciliation-${selectedPeriod}.csv`;
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
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
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
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Transactions</SelectItem>
            <SelectItem value="issues">Issues Only</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Sales</p>
            <p className="text-2xl font-bold">{summary.totalSales}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Fully Matched
            </p>
            <p className="text-2xl font-bold text-emerald-600">{summary.matchedEntries}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> With Issues
            </p>
            <p className="text-2xl font-bold text-amber-600">{summary.unmatchedEntries}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Missing Device Links</p>
            <p className="text-2xl font-bold text-destructive">{summary.missingDeviceLinks}</p>
          </CardContent>
        </Card>
      </div>

      {summary.unmatchedEntries > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Reconciliation Issues Found</AlertTitle>
          <AlertDescription>
            {summary.unmatchedEntries} transaction{summary.unmatchedEntries > 1 ? 's' : ''} have issues that need attention.
            {summary.missingDeviceLinks > 0 && ` ${summary.missingDeviceLinks} sale(s) have no device linked — COGS cannot be calculated.`}
          </AlertDescription>
        </Alert>
      )}

      {/* Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction Reconciliation</CardTitle>
          <CardDescription>Click any row to view the full audit trail</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Sale Price</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map(row => (
                <TableRow key={row.id} className={row.discrepancy ? 'bg-destructive/5' : ''}>
                  <TableCell className="font-mono text-sm">{row.orderNumber}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{marketplaceLabels[row.marketplace] || row.marketplace}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{format(new Date(row.saleDate), 'MMM dd, yyyy')}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.salePrice)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatCurrency(row.fees)}</TableCell>
                  <TableCell className="text-right">
                    {row.deviceCost !== null ? formatCurrency(row.deviceCost) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.profit !== null ? (
                      <span className={row.profit >= 0 ? 'text-emerald-600' : 'text-destructive'}>
                        {formatCurrency(row.profit)}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {row.discrepancy ? (
                      <Badge variant="destructive" className="text-xs">{row.discrepancy}</Badge>
                    ) : (
                      <Badge variant="default" className="bg-emerald-600 text-xs">Matched</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedSaleId(row.id)}
                    >
                      <Search className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {filterStatus === 'issues' ? 'No issues found — all transactions are matched!' : 'No sales data for this period'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Audit Trail Dialog */}
      {selectedSaleId && (
        <TransactionAuditTrail
          saleId={selectedSaleId}
          open={!!selectedSaleId}
          onOpenChange={(open) => { if (!open) setSelectedSaleId(null); }}
        />
      )}
    </div>
  );
}
