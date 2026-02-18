import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  RefreshCw, AlertTriangle, CheckCircle2, DollarSign, ArrowDownUp, 
  Eye, MessageSquare, Loader2 
} from 'lucide-react';
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

  // Summary stats
  const totalPayouts = payouts.length;
  const matched = payouts.filter(p => p.reconciliation_status === 'matched').length;
  const discrepancies = payouts.filter(p => p.reconciliation_status === 'discrepancy').length;
  const totalDiscrepancyAmount = payouts
    .filter(p => p.discrepancy_amount)
    .reduce((sum, p) => sum + Math.abs(Number(p.discrepancy_amount || 0)), 0);

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
            Compare marketplace payouts against recorded orders
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {syncing ? 'Syncing Payouts…' : 'Sync Payouts'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Payouts</p>
            <p className="text-2xl font-bold">{totalPayouts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> Matched
            </p>
            <p className="text-2xl font-bold text-[hsl(var(--success))]">{matched}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))]" /> Discrepancies
            </p>
            <p className="text-2xl font-bold text-[hsl(var(--warning))]">{discrepancies}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5 text-destructive" /> Total Variance
            </p>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(totalDiscrepancyAmount)}</p>
          </CardContent>
        </Card>
      </div>

      {discrepancies > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Payout Discrepancies Detected</AlertTitle>
          <AlertDescription>
            {discrepancies} payout{discrepancies > 1 ? 's' : ''} don't match recorded order totals.
            Total variance: {formatCurrency(totalDiscrepancyAmount)}. Review each to identify missing orders, fee mismatches, or adjustments.
          </AlertDescription>
        </Alert>
      )}

      {totalPayouts === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ArrowDownUp className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No payout data yet</p>
            <p className="text-sm mt-1">Click "Sync Payouts" to pull settlement data from your connected marketplaces.</p>
          </CardContent>
        </Card>
      )}

      {totalPayouts > 0 && (
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
                      <TableCell className="text-right font-medium">{formatCurrency(payout.net_payout)}</TableCell>
                      <TableCell className="text-right">
                        {systemExpected ? formatCurrency(systemExpected) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {variance !== 0 ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <span className={variance > 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}>
                                  {variance > 0 ? '+' : ''}{formatCurrency(variance)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {variance > 0 ? 'Received more than expected' : 'Received less than expected'}
                              </TooltipContent>
                            </Tooltip>
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
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSelectedPayout(payout); setReviewNotes(payout.review_notes || ''); }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
