import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { formatStatus } from '@/lib/utils';
import {
  AlertTriangle, Package, BookOpen, DollarSign, ShoppingCart,
  ExternalLink, RefreshCw, CheckCircle2,
} from 'lucide-react';

interface UnaccountedMarketplaceDataProps {
  companyFilter?: string | null;
}

export function UnaccountedMarketplaceData({ companyFilter }: UnaccountedMarketplaceDataProps) {
  const { companies } = useCompany();
  const [loading, setLoading] = useState(true);
  const [marketplaceFilter, setMarketplaceFilter] = useState('All');

  // Data
  const [sales, setSales] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [validationIssues, setValidationIssues] = useState<any[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Sales missing devices or accounting
      let salesQ = supabase
        .from('sales')
        .select('id, order_number, marketplace, sale_price, sale_date, device_id, company_id, accounting_status, customer_name, shipping_cost, marketplace_fees, tax_amount, shipping_province, product_title, marketplace_sku')
        .order('sale_date', { ascending: false })
        .limit(1000);
      if (companyFilter) salesQ = salesQ.eq('company_id', companyFilter);
      const { data: salesData } = await salesQ;

      // Journal entries for cross-referencing
      let jeQ = supabase
        .from('journal_entries')
        .select('id, reference_id, reference_type, status, company_id')
        .limit(2000);
      if (companyFilter) jeQ = jeQ.eq('company_id', companyFilter);
      const { data: jeData } = await jeQ;

      // Open validation issues
      let viQ = supabase
        .from('data_validation_issues')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(200);
      if (companyFilter) viQ = viQ.eq('company_id', companyFilter);
      const { data: viData } = await viQ;

      setSales(salesData || []);
      setJournals(jeData || []);
      setValidationIssues(viData || []);
    } catch (err) {
      console.error('Error fetching unaccounted data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [companyFilter]);

  const jeRefIds = useMemo(() => new Set(journals.map(j => j.reference_id).filter(Boolean)), [journals]);

  // Categorize unaccounted sales
  const unaccountedSales = useMemo(() => {
    let filtered = sales;
    if (marketplaceFilter !== 'All') {
      filtered = filtered.filter(s => s.marketplace === marketplaceFilter);
    }

    const noDevice = filtered.filter(s => !s.device_id);
    const noAccounting = filtered.filter(s => !s.accounting_status || s.accounting_status === 'unprocessed');
    const revenueOnly = filtered.filter(s => s.accounting_status === 'revenue_only');
    const noJournal = filtered.filter(s => !jeRefIds.has(s.id));
    const noTaxProvince = filtered.filter(s => !s.shipping_province && s.sale_price > 0);

    return { noDevice, noAccounting, revenueOnly, noJournal, noTaxProvince };
  }, [sales, marketplaceFilter, jeRefIds]);

  const marketplaces = useMemo(() => {
    const set = new Set(sales.map(s => s.marketplace).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [sales]);

  const companyName = (id: string | null) => {
    if (!id) return '—';
    return companies.find(c => c.id === id)?.code || '—';
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const totalIssues = unaccountedSales.noDevice.length + unaccountedSales.noAccounting.length +
    unaccountedSales.revenueOnly.length + unaccountedSales.noTaxProvince.length + validationIssues.length;

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className={unaccountedSales.noDevice.length > 0 ? 'border-amber-500/50' : ''}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-[11px] text-muted-foreground">No Device Linked</p>
                <p className={`text-xl font-bold ${unaccountedSales.noDevice.length > 0 ? 'text-amber-500' : ''}`}>{unaccountedSales.noDevice.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={unaccountedSales.noAccounting.length > 0 ? 'border-destructive/50' : ''}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-destructive" />
              <div>
                <p className="text-[11px] text-muted-foreground">Unprocessed</p>
                <p className={`text-xl font-bold ${unaccountedSales.noAccounting.length > 0 ? 'text-destructive' : ''}`}>{unaccountedSales.noAccounting.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={unaccountedSales.revenueOnly.length > 0 ? 'border-amber-500/50' : ''}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-[11px] text-muted-foreground">Revenue Only</p>
                <p className={`text-xl font-bold ${unaccountedSales.revenueOnly.length > 0 ? 'text-amber-500' : ''}`}>{unaccountedSales.revenueOnly.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={unaccountedSales.noTaxProvince.length > 0 ? 'border-amber-500/50' : ''}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-[11px] text-muted-foreground">Missing Province</p>
                <p className={`text-xl font-bold ${unaccountedSales.noTaxProvince.length > 0 ? 'text-amber-500' : ''}`}>{unaccountedSales.noTaxProvince.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={unaccountedSales.noJournal.length > 0 ? 'border-destructive/50' : ''}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-destructive" />
              <div>
                <p className="text-[11px] text-muted-foreground">No Journal Entry</p>
                <p className={`text-xl font-bold ${unaccountedSales.noJournal.length > 0 ? 'text-destructive' : ''}`}>{unaccountedSales.noJournal.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={validationIssues.length > 0 ? 'border-destructive/50' : ''}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <div>
                <p className="text-[11px] text-muted-foreground">Validation Issues</p>
                <p className={`text-xl font-bold ${validationIssues.length > 0 ? 'text-destructive' : ''}`}>{validationIssues.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Marketplace filter + refresh */}
      <div className="flex items-center gap-3">
        <Select value={marketplaceFilter} onValueChange={setMarketplaceFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Marketplace" />
          </SelectTrigger>
          <SelectContent>
            {marketplaces.map(m => (
              <SelectItem key={m} value={m}>{m === 'All' ? 'All Marketplaces' : m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-1" />Refresh
        </Button>
        {totalIssues === 0 && (
          <Badge className="bg-emerald-500 text-white gap-1">
            <CheckCircle2 className="h-3 w-3" />All Accounted For
          </Badge>
        )}
      </div>

      {/* Orders without device linked */}
      {unaccountedSales.noDevice.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-5 w-5 text-amber-500" />
              Orders Without Linked Device ({unaccountedSales.noDevice.length})
            </CardTitle>
            <CardDescription>Marketplace orders that have no inventory device assigned — link a device from the Orders page to complete COGS tracking</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <SaleTable sales={unaccountedSales.noDevice.slice(0, 100)} companyName={companyName} formatCurrency={formatCurrency} highlight="device" />
          </CardContent>
        </Card>
      )}

      {/* Unprocessed accounting */}
      {unaccountedSales.noAccounting.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-destructive" />
              Unprocessed Accounting ({unaccountedSales.noAccounting.length})
            </CardTitle>
            <CardDescription>Sales with no accounting entries generated — process from the Orders page or link a device to trigger auto-accounting</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <SaleTable sales={unaccountedSales.noAccounting.slice(0, 100)} companyName={companyName} formatCurrency={formatCurrency} highlight="accounting" />
          </CardContent>
        </Card>
      )}

      {/* Revenue only (partial accounting) */}
      {unaccountedSales.revenueOnly.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-amber-500" />
              Revenue Only — Missing COGS ({unaccountedSales.revenueOnly.length})
            </CardTitle>
            <CardDescription>Revenue was recorded but COGS journal entry is missing — link a device to generate the cost entry</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <SaleTable sales={unaccountedSales.revenueOnly.slice(0, 100)} companyName={companyName} formatCurrency={formatCurrency} highlight="cogs" />
          </CardContent>
        </Card>
      )}

      {/* Missing province */}
      {unaccountedSales.noTaxProvince.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Missing Shipping Province ({unaccountedSales.noTaxProvince.length})
            </CardTitle>
            <CardDescription>Orders without a province — tax calculations may be inaccurate</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <SaleTable sales={unaccountedSales.noTaxProvince.slice(0, 50)} companyName={companyName} formatCurrency={formatCurrency} highlight="province" />
          </CardContent>
        </Card>
      )}

      {/* Open validation issues from data_validation_issues table */}
      {validationIssues.length > 0 && (
        <>
          <Separator />
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Open Data Validation Issues ({validationIssues.length})
              </CardTitle>
              <CardDescription>Flagged anomalies from automated data integrity checks</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border rounded-lg overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Severity</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Marketplace</TableHead>
                      <TableHead className="max-w-[300px]">Description</TableHead>
                      <TableHead>Record</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Company</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationIssues.map(vi => (
                      <TableRow key={vi.id}>
                        <TableCell>
                          <Badge variant={vi.severity === 'critical' ? 'destructive' : vi.severity === 'warning' ? 'secondary' : 'outline'} className="text-[10px]">
                            {vi.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{vi.issue_type}</TableCell>
                        <TableCell>
                          {vi.marketplace ? <Badge variant="outline" className="text-[10px] capitalize">{vi.marketplace}</Badge> : '—'}
                        </TableCell>
                        <TableCell className="text-xs max-w-[300px] truncate">{vi.description}</TableCell>
                        <TableCell className="font-mono text-[10px]">{vi.record_id?.slice(0, 8) || '—'}</TableCell>
                        <TableCell className="text-xs">{format(new Date(vi.created_at), 'MMM d, HH:mm')}</TableCell>
                        <TableCell className="text-xs">{companyName(vi.company_id)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {totalIssues === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4" />
              <h3 className="text-lg font-semibold">All Marketplace Data Accounted For</h3>
              <p className="text-muted-foreground text-sm">Every order has a linked device, complete accounting entries, and valid province data.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Reusable sale table sub-component
function SaleTable({ sales, companyName, formatCurrency, highlight }: {
  sales: any[];
  companyName: (id: string | null) => string;
  formatCurrency: (v: number) => string;
  highlight: 'device' | 'accounting' | 'cogs' | 'province';
}) {
  return (
    <div className="border rounded-lg overflow-auto max-h-[400px]">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Order #</TableHead>
            <TableHead>Marketplace</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Sale Price</TableHead>
            <TableHead className="text-right">Fees</TableHead>
            {highlight === 'province' && <TableHead>Province</TableHead>}
            {highlight !== 'province' && <TableHead>Status</TableHead>}
            <TableHead>Company</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map(sale => (
            <TableRow key={sale.id} className="hover:bg-muted/30">
              <TableCell className="font-mono text-xs font-medium">{sale.order_number}</TableCell>
              <TableCell><Badge variant="outline" className="text-[10px] capitalize">{sale.marketplace}</Badge></TableCell>
              <TableCell className="text-xs">{format(new Date(sale.sale_date), 'MMM d, yyyy')}</TableCell>
              <TableCell className="text-sm">{sale.customer_name || '—'}</TableCell>
              <TableCell className="text-xs max-w-[150px] truncate">{sale.product_title || sale.marketplace_sku || '—'}</TableCell>
              <TableCell className="text-right font-mono text-sm">{formatCurrency(sale.sale_price)}</TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground">
                {formatCurrency((sale.shipping_cost || 0) + (sale.marketplace_fees || 0))}
              </TableCell>
              {highlight === 'province' ? (
                <TableCell><Badge variant="destructive" className="text-[10px]">Missing</Badge></TableCell>
              ) : (
                <TableCell>
                  <Badge
                    variant={
                      highlight === 'device' ? 'secondary' :
                      highlight === 'accounting' ? 'destructive' : 'secondary'
                    }
                    className="text-[10px]"
                  >
                    {highlight === 'device' ? 'No Device' :
                     highlight === 'accounting' ? 'Unprocessed' : 'Revenue Only'}
                  </Badge>
                </TableCell>
              )}
              <TableCell className="text-xs">{companyName(sale.company_id)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
