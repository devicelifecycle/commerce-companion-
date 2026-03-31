import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  RefreshCw, AlertTriangle, CheckCircle2, DollarSign, ArrowDownUp,
  Eye, MessageSquare, Loader2, TrendingUp, Target, PieChart, BarChart3
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart as RePieChart, Pie, Cell,
  LineChart, Line
} from 'recharts';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface MarketplacePayout {
  id: string;
  marketplace: string;
  payout_id: string;
  payout_date: string;
  period_start: string | null;
  period_end: string | null;
  gross_amount: number;
  fees_amount: number;
  adjustments_amount: number;
  net_payout: number;
  reserve_amount: number;
  system_order_total: number | null;
  system_fees_total: number | null;
  discrepancy_amount: number | null;
  reconciliation_status: string;
  review_notes: string | null;
  reviewed_at: string | null;
  raw_data: any;
  synced_at: string;
}

interface PayoutReconciliationProps {
  companyView?: 'consolidated' | string;
}

const marketplaceLabels: Record<string, string> = {
  amazon: 'Amazon', shopify: 'Shopify', bestbuy: 'Best Buy',
};

const MARKETPLACE_COLORS: Record<string, string> = {
  amazon: 'hsl(35, 95%, 50%)',
  shopify: 'hsl(142, 71%, 45%)',
  bestbuy: 'hsl(221, 83%, 53%)',
};

const STATUS_COLORS = {
  matched: 'hsl(var(--success))',
  discrepancy: 'hsl(var(--destructive))',
  reviewed: 'hsl(var(--muted-foreground))',
  pending: 'hsl(var(--warning))',
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'destructive' | 'outline' | 'secondary'; className?: string }> = {
  matched: { label: 'Matched', variant: 'default', className: 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]' },
  discrepancy: { label: 'Discrepancy', variant: 'destructive' },
  pending: { label: 'Pending', variant: 'secondary' },
  reviewed: { label: 'Reviewed', variant: 'outline' },
};

export function PayoutReconciliation({ companyView = 'consolidated' }: PayoutReconciliationProps) {
  const { companies } = useCompany();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [payouts, setPayouts] = useState<MarketplacePayout[]>([]);
  const [selectedPayout, setSelectedPayout] = useState<MarketplacePayout | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const fetchPayouts = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('marketplace_payouts')
        .select('*')
        .order('payout_date', { ascending: false })
        .limit(200);

      if (companyView !== 'consolidated') {
        query = query.eq('company_id', companyView);
      }

      const { data, error } = await query;
      if (error) throw error;
      setPayouts((data as unknown as MarketplacePayout[]) || []);
    } catch (err) {
      console.error('Error fetching payouts:', err);
    } finally {
      setLoading(false);
    }
  }, [companyView]);

  useEffect(() => {
    fetchPayouts();
  }, [fetchPayouts]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const body: any = {};
      if (companyView !== 'consolidated') body.company_id = companyView;

      const { data, error } = await supabase.functions.invoke('sync-marketplace-payouts', { body });
      if (error) throw error;

      toast({
        title: 'Payout Sync Complete',
        description: `Results: ${Object.entries(data?.results || {}).map(([k, v]: any) => `${k}: ${v.synced} new`).join(', ')}`,
      });
      fetchPayouts();
    } catch (err: any) {
      console.error('Sync error:', err);
      toast({ title: 'Sync Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const handleMarkReviewed = async (payout: MarketplacePayout) => {
    try {
      const { error } = await supabase
        .from('marketplace_payouts')
        .update({
          reconciliation_status: 'reviewed',
          review_notes: reviewNotes,
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq('id', payout.id);

      if (error) throw error;
      toast({ title: 'Payout marked as reviewed' });
      setSelectedPayout(null);
      setReviewNotes('');
      fetchPayouts();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // ============ METRICS ============
  const metrics = useMemo(() => {
    const totalPayouts = payouts.length;
    const matched = payouts.filter(p => p.reconciliation_status === 'matched').length;
    const reviewed = payouts.filter(p => p.reconciliation_status === 'reviewed').length;
    const discrepancies = payouts.filter(p => p.reconciliation_status === 'discrepancy').length;
    const pending = payouts.filter(p => p.reconciliation_status === 'pending').length;

    const reconciledCount = matched + reviewed;
    const accuracyRate = totalPayouts > 0 ? (matched / totalPayouts) * 100 : 0;
    const reconciliationRate = totalPayouts > 0 ? (reconciledCount / totalPayouts) * 100 : 0;

    const totalNetPayout = payouts.reduce((s, p) => s + p.net_payout, 0);
    const totalSystemExpected = payouts.reduce((s, p) => s + ((p.system_order_total || 0) - (p.system_fees_total || 0)), 0);
    const totalVariance = payouts.reduce((s, p) => s + (p.discrepancy_amount || 0), 0);
    const totalAbsVariance = payouts.reduce((s, p) => s + Math.abs(p.discrepancy_amount || 0), 0);

    // Per-marketplace breakdown
    const marketplaces = ['amazon', 'shopify', 'bestbuy'];
    const byMarketplace = marketplaces.map(mp => {
      const mpPayouts = payouts.filter(p => p.marketplace === mp);
      const mpMatched = mpPayouts.filter(p => p.reconciliation_status === 'matched').length;
      const mpTotal = mpPayouts.length;
      const mpNetPayout = mpPayouts.reduce((s, p) => s + p.net_payout, 0);
      const mpExpected = mpPayouts.reduce((s, p) => s + ((p.system_order_total || 0) - (p.system_fees_total || 0)), 0);
      const mpVariance = mpPayouts.reduce((s, p) => s + (p.discrepancy_amount || 0), 0);
      const mpAbsVariance = mpPayouts.reduce((s, p) => s + Math.abs(p.discrepancy_amount || 0), 0);
      const mpFeesPaid = mpPayouts.reduce((s, p) => s + p.fees_amount, 0);
      const mpSystemFees = mpPayouts.reduce((s, p) => s + (p.system_fees_total || 0), 0);

      return {
        name: marketplaceLabels[mp] || mp,
        key: mp,
        count: mpTotal,
        matched: mpMatched,
        accuracy: mpTotal > 0 ? (mpMatched / mpTotal) * 100 : 0,
        netPayout: mpNetPayout,
        expected: mpExpected,
        variance: mpVariance,
        absVariance: mpAbsVariance,
        feesPaid: mpFeesPaid,
        systemFees: mpSystemFees,
        feeDelta: mpFeesPaid - mpSystemFees,
      };
    }).filter(m => m.count > 0);

    // Status distribution for donut
    const statusDistribution = [
      { name: 'Matched', value: matched, color: STATUS_COLORS.matched },
      { name: 'Discrepancy', value: discrepancies, color: STATUS_COLORS.discrepancy },
      { name: 'Reviewed', value: reviewed, color: STATUS_COLORS.reviewed },
      { name: 'Pending', value: pending, color: STATUS_COLORS.pending },
    ].filter(s => s.value > 0);

    // Variance by marketplace for bar chart
    const varianceByMarketplace = byMarketplace.map(m => ({
      name: m.name,
      'Net Payout': m.netPayout,
      'System Expected': m.expected,
      Variance: m.variance,
      fill: MARKETPLACE_COLORS[m.key],
    }));

    // Fee accuracy by marketplace
    const feeAccuracy = byMarketplace.map(m => ({
      name: m.name,
      'Marketplace Fees': m.feesPaid,
      'System Fees': m.systemFees,
      Delta: m.feeDelta,
    }));

    // Monthly variance trend
    const monthMap: Record<string, { month: string; variance: number; count: number; matched: number }> = {};
    payouts.forEach(p => {
      const monthKey = p.payout_date.substring(0, 7); // YYYY-MM
      if (!monthMap[monthKey]) {
        monthMap[monthKey] = { month: monthKey, variance: 0, count: 0, matched: 0 };
      }
      monthMap[monthKey].variance += p.discrepancy_amount || 0;
      monthMap[monthKey].count++;
      if (p.reconciliation_status === 'matched') monthMap[monthKey].matched++;
    });
    const varianceTrend = Object.values(monthMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        month: format(new Date(m.month + '-01'), 'MMM yyyy'),
        Variance: m.variance,
        'Accuracy %': m.count > 0 ? (m.matched / m.count) * 100 : 0,
      }));

    return {
      totalPayouts, matched, reviewed, discrepancies, pending,
      accuracyRate, reconciliationRate,
      totalNetPayout, totalSystemExpected, totalVariance, totalAbsVariance,
      byMarketplace, statusDistribution, varianceByMarketplace, feeAccuracy, varianceTrend,
    };
  }, [payouts]);

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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Payout Reconciliation</h2>
          <p className="text-sm text-muted-foreground">
            Accuracy metrics, variance analysis, and settlement matching
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {syncing ? 'Syncing Payouts…' : 'Sync Payouts'}
        </Button>
      </div>

      {/* Top-Level KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Payouts</p>
            <p className="text-2xl font-bold">{metrics.totalPayouts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Target className="h-3 w-3" /> Accuracy
                </p>
                <p className="text-2xl font-bold text-[hsl(var(--success))]">{metrics.accuracyRate.toFixed(1)}%</p>
              </div>
            </div>
            <Progress value={metrics.accuracyRate} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))]" /> Matched
            </p>
            <p className="text-2xl font-bold text-[hsl(var(--success))]">{metrics.matched}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{metrics.reviewed} reviewed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-destructive" /> Discrepancies
            </p>
            <p className="text-2xl font-bold text-destructive">{metrics.discrepancies}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{metrics.pending} pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Net Variance</p>
            <p className={`text-2xl font-bold ${metrics.totalVariance >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
              {metrics.totalVariance >= 0 ? '+' : ''}{formatCurrency(metrics.totalVariance)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Abs. Variance</p>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(metrics.totalAbsVariance)}</p>
          </CardContent>
        </Card>
        {/* Reserves */}
        {(() => {
          const totalReserves = payouts.reduce((s, p) => s + (Number((p as any).reserve_amount) || 0), 0);
          return totalReserves > 0 ? (
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3 text-amber-500" /> Held Reserves
                </p>
                <p className="text-2xl font-bold text-amber-500">{formatCurrency(totalReserves)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Funds held by marketplaces</p>
              </CardContent>
            </Card>
          ) : null;
        })()}
      </div>

      {metrics.totalPayouts === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ArrowDownUp className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No payout data yet</p>
            <p className="text-sm mt-1">Click "Sync Payouts" to pull settlement data from your connected marketplaces.</p>
          </CardContent>
        </Card>
      )}

      {metrics.totalPayouts > 0 && (
        <>
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Status Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <PieChart className="h-4 w-4" /> Reconciliation Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={metrics.statusDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                        nameKey="name"
                      >
                        {metrics.statusDistribution.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => value} />
                      <Legend />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Payout vs Expected by Marketplace */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Payout vs Expected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.varianceByMarketplace}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Net Payout" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="System Expected" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Fee Accuracy */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Fee Accuracy
                </CardTitle>
                <CardDescription className="text-xs">Marketplace fees vs system-recorded fees</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.feeAccuracy}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Marketplace Fees" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="System Fees" fill="hsl(var(--warning))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Variance Trend + Per-Marketplace Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Variance Trend */}
            {metrics.varianceTrend.length > 1 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" /> Variance & Accuracy Trend
                  </CardTitle>
                  <CardDescription className="text-xs">Monthly variance and match rate over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={metrics.varianceTrend}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="left" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} domain={[0, 100]} />
                        <Tooltip formatter={(value: number, name: string) => name === 'Accuracy %' ? `${value.toFixed(1)}%` : formatCurrency(value)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line yAxisId="left" type="monotone" dataKey="Variance" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
                        <Line yAxisId="right" type="monotone" dataKey="Accuracy %" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Per-Marketplace Summary Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Per-Marketplace Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-center">Payouts</TableHead>
                      <TableHead className="text-center">Accuracy</TableHead>
                      <TableHead className="text-right">Net Payout</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead className="text-right">Fee Delta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.byMarketplace.map(mp => (
                      <TableRow key={mp.key}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MARKETPLACE_COLORS[mp.key] }} />
                            {mp.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{mp.count}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={mp.accuracy >= 90 ? 'default' : mp.accuracy >= 70 ? 'secondary' : 'destructive'}
                            className={mp.accuracy >= 90 ? 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]' : ''}>
                            {mp.accuracy.toFixed(0)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(mp.netPayout)}</TableCell>
                        <TableCell className="text-right">
                          <span className={mp.variance >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}>
                            {mp.variance >= 0 ? '+' : ''}{formatCurrency(mp.variance)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={mp.feeDelta <= 0.01 ? 'text-[hsl(var(--success))]' : 'text-destructive'}>
                            {formatCurrency(mp.feeDelta)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {metrics.discrepancies > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Payout Discrepancies Detected</AlertTitle>
              <AlertDescription>
                {metrics.discrepancies} payout{metrics.discrepancies > 1 ? 's' : ''} don't match recorded order totals.
                Total absolute variance: {formatCurrency(metrics.totalAbsVariance)}. Review each to identify missing orders, fee mismatches, or adjustments.
              </AlertDescription>
            </Alert>
          )}

          {/* Payout Details Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payout Details</CardTitle>
              <CardDescription>Click the eye icon to review discrepancy details</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Fees</TableHead>
                    <TableHead className="text-right">Adjustments</TableHead>
                    <TableHead className="text-right">Reserves</TableHead>
                    <TableHead className="text-right">Net Payout</TableHead>
                    <TableHead className="text-right">System Expected</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map(payout => {
                    const sc = statusConfig[payout.reconciliation_status] || statusConfig.pending;
                    const systemExpected = (payout.system_order_total || 0) - (payout.system_fees_total || 0);
                    const variance = payout.discrepancy_amount || 0;

                    return (
                      <TableRow
                        key={payout.id}
                        className={payout.reconciliation_status === 'discrepancy' ? 'bg-destructive/5' : ''}
                      >
                        <TableCell className="text-sm">
                          {format(new Date(payout.payout_date), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{marketplaceLabels[payout.marketplace] || payout.marketplace}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {payout.period_start && payout.period_end
                            ? `${format(new Date(payout.period_start), 'MMM dd')} – ${format(new Date(payout.period_end), 'MMM dd')}`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(payout.gross_amount)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(payout.fees_amount)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {payout.adjustments_amount ? formatCurrency(payout.adjustments_amount) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-amber-500">
                          {Number((payout as any).reserve_amount) > 0 ? formatCurrency(Number((payout as any).reserve_amount)) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(payout.net_payout)}</TableCell>
                        <TableCell className="text-right">
                          {systemExpected ? formatCurrency(systemExpected) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {variance !== 0 ? (
                            <TooltipProvider>
                              <UITooltip>
                                <TooltipTrigger>
                                  <span className={variance > 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}>
                                    {variance > 0 ? '+' : ''}{formatCurrency(variance)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {variance > 0 ? 'Received more than expected' : 'Received less than expected'}
                                </TooltipContent>
                              </UITooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-[hsl(var(--success))]">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={sc.variant} className={sc.className || ''}>
                            {sc.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSelectedPayout(payout); setReviewNotes(payout.review_notes || ''); }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Detail/Review Dialog */}
      <Dialog open={!!selectedPayout} onOpenChange={(open) => { if (!open) setSelectedPayout(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payout Detail</DialogTitle>
            <DialogDescription>
              {selectedPayout && `${marketplaceLabels[selectedPayout.marketplace] || selectedPayout.marketplace} — ${format(new Date(selectedPayout.payout_date), 'MMM dd, yyyy')}`}
            </DialogDescription>
          </DialogHeader>

          {selectedPayout && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Payout ID</p>
                  <p className="font-mono text-xs">{selectedPayout.payout_id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Period</p>
                  <p>{selectedPayout.period_start && selectedPayout.period_end
                    ? `${format(new Date(selectedPayout.period_start), 'MMM dd')} – ${format(new Date(selectedPayout.period_end), 'MMM dd, yyyy')}`
                    : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Gross Amount</p>
                  <p className="font-medium">{formatCurrency(selectedPayout.gross_amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Fees</p>
                  <p className="font-medium">{formatCurrency(selectedPayout.fees_amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Adjustments</p>
                  <p className="font-medium">{formatCurrency(selectedPayout.adjustments_amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Reserves Held</p>
                  <p className="font-medium text-amber-500">
                    {Number((selectedPayout as any).reserve_amount) > 0 ? formatCurrency(Number((selectedPayout as any).reserve_amount)) : '$0.00'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Net Payout</p>
                  <p className="font-bold text-lg">{formatCurrency(selectedPayout.net_payout)}</p>
                </div>
              </div>

              <div className="border-t pt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">System Order Total</p>
                  <p className="font-medium">{selectedPayout.system_order_total != null ? formatCurrency(selectedPayout.system_order_total) : '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">System Fees Total</p>
                  <p className="font-medium">{selectedPayout.system_fees_total != null ? formatCurrency(selectedPayout.system_fees_total) : '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Variance</p>
                  <p className={`font-bold text-lg ${(selectedPayout.discrepancy_amount || 0) > 0 ? 'text-[hsl(var(--success))]' : (selectedPayout.discrepancy_amount || 0) < 0 ? 'text-destructive' : 'text-[hsl(var(--success))]'}`}>
                    {selectedPayout.discrepancy_amount != null ? formatCurrency(selectedPayout.discrepancy_amount) : '$0.00'}
                  </p>
                </div>
              </div>

              {selectedPayout.reconciliation_status === 'discrepancy' && (
                <div className="border-t pt-3 space-y-2">
                  <p className="text-sm font-medium flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" /> Review Notes
                  </p>
                  <Textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Explain the discrepancy (e.g., refund not yet recorded, timing difference, etc.)"
                    rows={3}
                  />
                  <Button onClick={() => handleMarkReviewed(selectedPayout)} className="w-full">
                    Mark as Reviewed
                  </Button>
                </div>
              )}

              {selectedPayout.review_notes && selectedPayout.reconciliation_status === 'reviewed' && (
                <div className="border-t pt-3">
                  <p className="text-sm text-muted-foreground">Review Notes</p>
                  <p className="text-sm mt-1">{selectedPayout.review_notes}</p>
                  {selectedPayout.reviewed_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Reviewed {format(new Date(selectedPayout.reviewed_at), 'MMM dd, yyyy HH:mm')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
