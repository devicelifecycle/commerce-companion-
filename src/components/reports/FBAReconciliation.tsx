import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Download, AlertTriangle, CheckCircle2, Calendar, DollarSign, Package, TrendingDown,
} from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';

interface FBAReconciliationRow {
  id: string;
  orderNumber: string;
  saleDate: string;
  salePrice: number;
  amazonFees: number;
  shippingCost: number;
  expectedPayout: number;
  payoutReceived: number | null;
  feeDifference: number;
  status: 'matched' | 'fee_discrepancy' | 'missing_payout' | 'missing_sale';
}

interface FBAReconciliationSummary {
  totalSales: number;
  totalRevenue: number;
  totalFees: number;
  totalExpectedPayout: number;
  totalPayoutReceived: number;
  feeDiscrepancies: number;
  missingPayouts: number;
  totalFeeVariance: number;
  avgFeeRate: number;
}

export function FBAReconciliation() {
  const { selectedCompany, companies } = useCompany();
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(format(new Date(), 'yyyy-MM'));
  const [rows, setRows] = useState<FBAReconciliationRow[]>([]);
  const [summary, setSummary] = useState<FBAReconciliationSummary>({
    totalSales: 0, totalRevenue: 0, totalFees: 0, totalExpectedPayout: 0,
    totalPayoutReceived: 0, feeDiscrepancies: 0, missingPayouts: 0, totalFeeVariance: 0, avgFeeRate: 0,
  });
  const [filterStatus, setFilterStatus] = useState<'all' | 'issues'>('all');

  useEffect(() => {
    fetchData();
  }, [selectedCompany, selectedPeriod]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [year, month] = selectedPeriod.split('-');
      const start = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
      const end = endOfMonth(start);

      // Get VES company (FBA is typically VES)
      const vesCompany = companies.find(c => c.code === 'VES');
      const companyId = selectedCompany?.id || vesCompany?.id;

      // Fetch Amazon FBA sales
      let salesQ = supabase
        .from('sales')
        .select('id, order_number, sale_date, sale_price, marketplace_fees, shipping_cost, profit')
        .eq('marketplace', 'amazon')
        .gte('sale_date', start.toISOString())
        .lte('sale_date', end.toISOString())
        .order('sale_date', { ascending: false })
        .limit(2000);
      if (companyId) salesQ = salesQ.eq('company_id', companyId);
      const { data: sales } = await salesQ;

      // Fetch payouts for this period
      let payoutsQ = supabase
        .from('marketplace_payouts')
        .select('*')
        .eq('marketplace', 'amazon')
        .gte('payout_date', start.toISOString().split('T')[0])
        .lte('payout_date', end.toISOString().split('T')[0]);
      if (companyId) payoutsQ = payoutsQ.eq('company_id', companyId);
      const { data: payouts } = await payoutsQ;

      const totalPayoutReceived = payouts?.reduce((s, p) => s + Number(p.net_payout || 0), 0) || 0;

      // Build rows
      const reconcRows: FBAReconciliationRow[] = (sales || []).map(sale => {
        const salePrice = Number(sale.sale_price);
        const fees = Number(sale.marketplace_fees || 0);
        const shipping = Number(sale.shipping_cost || 0);
        const expectedPayout = salePrice - fees - shipping;

        // Check if fees seem reasonable (Amazon typically 8-15%)
        const feeRate = salePrice > 0 ? (fees / salePrice) * 100 : 0;
        const isFeeSuspicious = feeRate > 20 || (salePrice > 50 && fees === 0);

        let status: FBAReconciliationRow['status'] = 'matched';
        if (isFeeSuspicious) status = 'fee_discrepancy';

        return {
          id: sale.id,
          orderNumber: sale.order_number,
          saleDate: sale.sale_date,
          salePrice,
          amazonFees: fees,
          shippingCost: shipping,
          expectedPayout,
          payoutReceived: null,
          feeDifference: 0,
          status,
        };
      });

      const totalRevenue = reconcRows.reduce((s, r) => s + r.salePrice, 0);
      const totalFees = reconcRows.reduce((s, r) => s + r.amazonFees, 0);
      const totalExpectedPayout = reconcRows.reduce((s, r) => s + r.expectedPayout, 0);
      const feeDiscrepancies = reconcRows.filter(r => r.status === 'fee_discrepancy').length;
      const totalFeeVariance = totalExpectedPayout - totalPayoutReceived;

      setSummary({
        totalSales: reconcRows.length,
        totalRevenue,
        totalFees,
        totalExpectedPayout,
        totalPayoutReceived,
        feeDiscrepancies,
        missingPayouts: totalPayoutReceived === 0 && reconcRows.length > 0 ? 1 : 0,
        totalFeeVariance,
        avgFeeRate: totalRevenue > 0 ? (totalFees / totalRevenue) * 100 : 0,
      });

      setRows(reconcRows);
    } catch (err) {
      console.error('FBA Reconciliation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const periodOptions = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return { value: format(date, 'yyyy-MM'), label: format(date, 'MMMM yyyy') };
  });

  const filteredRows = filterStatus === 'issues'
    ? rows.filter(r => r.status !== 'matched')
    : rows;

  const handleExport = () => {
    const header = 'Order #,Date,Sale Price,Amazon Fees,Shipping,Expected Payout,Fee Rate,Status';
    const csvRows = rows.map(r => {
      const feeRate = r.salePrice > 0 ? ((r.amazonFees / r.salePrice) * 100).toFixed(1) : '0';
      return `${r.orderNumber},${r.saleDate},${r.salePrice},${r.amazonFees},${r.shippingCost},${r.expectedPayout},${feeRate}%,${r.status}`;
    });
    const csv = [header, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fba-reconciliation-${selectedPeriod}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <Card><CardContent className="py-12 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></CardContent></Card>;
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
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="issues">Issues Only</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Package className="h-3 w-3" /> FBA Orders</p>
            <p className="text-2xl font-bold">{summary.totalSales}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Revenue</p>
            <p className="text-2xl font-bold">{fmt(summary.totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3 text-destructive" /> Total Fees</p>
            <p className="text-2xl font-bold text-destructive">{fmt(summary.totalFees)}</p>
            <p className="text-[10px] text-muted-foreground">{summary.avgFeeRate.toFixed(1)}% avg rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Expected Payout</p>
            <p className="text-2xl font-bold">{fmt(summary.totalExpectedPayout)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Payout Variance</p>
            <p className={`text-2xl font-bold ${Math.abs(summary.totalFeeVariance) > 10 ? 'text-warning' : 'text-success'}`}>
              {fmt(summary.totalFeeVariance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {summary.feeDiscrepancies > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fee Discrepancies Detected</AlertTitle>
          <AlertDescription>
            {summary.feeDiscrepancies} order(s) have unusual fee rates (&gt;20% or missing fees). Review these for potential Amazon billing errors or reimbursement opportunities.
          </AlertDescription>
        </Alert>
      )}

      {/* Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">FBA Order Reconciliation</CardTitle>
          <CardDescription>Amazon FBA orders with fee analysis. Flag orders with unusual fee rates for reimbursement claims.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Sale Price</TableHead>
                <TableHead className="text-right">Amazon Fees</TableHead>
                <TableHead className="text-right">Fee Rate</TableHead>
                <TableHead className="text-right">Shipping</TableHead>
                <TableHead className="text-right">Net Payout</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map(row => {
                const feeRate = row.salePrice > 0 ? (row.amazonFees / row.salePrice) * 100 : 0;
                return (
                  <TableRow key={row.id} className={row.status !== 'matched' ? 'bg-destructive/5' : ''}>
                    <TableCell className="font-mono text-sm">{row.orderNumber}</TableCell>
                    <TableCell className="text-sm">{format(new Date(row.saleDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell className="text-right">{fmt(row.salePrice)}</TableCell>
                    <TableCell className="text-right text-destructive">{fmt(row.amazonFees)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={feeRate > 20 ? 'destructive' : feeRate > 15 ? 'secondary' : 'outline'} className="text-xs">
                        {feeRate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmt(row.shippingCost)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(row.expectedPayout)}</TableCell>
                    <TableCell>
                      {row.status === 'matched' ? (
                        <Badge variant="default" className="bg-emerald-600 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" /> OK</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" /> Review</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {filterStatus === 'issues' ? 'No issues found' : 'No Amazon FBA sales for this period'}
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
