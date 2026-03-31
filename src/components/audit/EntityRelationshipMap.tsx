import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatStatus } from '@/lib/utils';
import { Link2, ArrowRight } from 'lucide-react';

interface EntityRelationshipMapProps {
  companyFilter?: string | null;
}

export function EntityRelationshipMap({ companyFilter }: EntityRelationshipMapProps) {
  const { companies } = useCompany();
  const [loading, setLoading] = useState(true);
  const [relSales, setRelSales] = useState<any[]>([]);
  const [relJournals, setRelJournals] = useState<any[]>([]);
  const [relAP, setRelAP] = useState<any[]>([]);
  const [relAR, setRelAR] = useState<any[]>([]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const companyName = (id: string | null) => {
    if (!id) return '—';
    return companies.find(c => c.id === id)?.code || '—';
  };

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        let salesQ = supabase.from('sales')
          .select('id, order_number, marketplace, sale_price, sale_date, device_id, company_id, accounting_status, customer_name, shipping_cost, marketplace_fees, tax_amount')
          .order('sale_date', { ascending: false }).limit(200);
        if (companyFilter) salesQ = salesQ.eq('company_id', companyFilter);

        let jeQ = supabase.from('journal_entries')
          .select('id, entry_number, description, entry_date, reference_type, reference_id, total_debit, total_credit, status, is_auto_generated, company_id')
          .order('entry_date', { ascending: false }).limit(300);
        if (companyFilter) jeQ = jeQ.eq('company_id', companyFilter);

        let apQ = supabase.from('accounts_payable')
          .select('id, vendor_name, original_amount, balance_due, status, bill_date, description, company_id')
          .order('bill_date', { ascending: false }).limit(200);
        if (companyFilter) apQ = apQ.eq('company_id', companyFilter);

        let arQ = supabase.from('accounts_receivable')
          .select('id, customer_name, original_amount, balance_due, status, source_type, source_reference, marketplace, company_id')
          .order('created_at', { ascending: false }).limit(200);
        if (companyFilter) arQ = arQ.eq('company_id', companyFilter);

        const [s, j, a, r] = await Promise.all([salesQ, jeQ, apQ, arQ]);
        setRelSales(s.data || []);
        setRelJournals(j.data || []);
        setRelAP(a.data || []);
        setRelAR(r.data || []);
      } catch (err) {
        console.error('Error fetching relationships:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [companyFilter]);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-5 w-5" />Entity Relationship Map</CardTitle>
          <CardDescription>Shows how sales, devices, journal entries, AP, and AR records are connected</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Sales chain */}
            <div>
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Badge variant="outline">Sales</Badge><ArrowRight className="h-3 w-3" />
                <Badge variant="outline">Devices</Badge><ArrowRight className="h-3 w-3" />
                <Badge variant="outline">Journal Entries</Badge><ArrowRight className="h-3 w-3" />
                <Badge variant="outline">AR</Badge>
              </h3>
              <div className="border rounded-lg overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Order #</TableHead>
                      <TableHead>Marketplace</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Sale Price</TableHead>
                      <TableHead>Device Linked?</TableHead>
                      <TableHead>Accounting</TableHead>
                      <TableHead>Journal Entries</TableHead>
                      <TableHead>AR Record</TableHead>
                      <TableHead>Company</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relSales.slice(0, 100).map(sale => {
                      const linkedJEs = relJournals.filter(j => j.reference_id === sale.id);
                      const linkedAR = relAR.filter(a => a.source_reference === sale.order_number || a.source_reference === sale.id);
                      const hasDevice = !!sale.device_id;
                      const accStatus = sale.accounting_status || 'unprocessed';
                      return (
                        <TableRow key={sale.id}>
                          <TableCell className="font-mono text-sm font-medium">{sale.order_number}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px] capitalize">{sale.marketplace}</Badge></TableCell>
                          <TableCell className="text-sm">{sale.customer_name || '—'}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(sale.sale_price)}</TableCell>
                          <TableCell><Badge variant={hasDevice ? 'default' : 'destructive'} className="text-[10px]">{hasDevice ? '✓ Linked' : '✗ Missing'}</Badge></TableCell>
                          <TableCell><Badge variant={accStatus === 'fully_processed' ? 'default' : accStatus === 'revenue_only' ? 'secondary' : 'destructive'} className="text-[10px]">{formatStatus(accStatus)}</Badge></TableCell>
                          <TableCell>{linkedJEs.length > 0 ? <span className="text-xs text-emerald-600 font-medium">{linkedJEs.length} entries</span> : <span className="text-xs text-destructive">None</span>}</TableCell>
                          <TableCell>{linkedAR.length > 0 ? <Badge variant="outline" className="text-[10px]">{formatStatus(linkedAR[0].status)}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-xs">{companyName(sale.company_id)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {relSales.length > 100 && <p className="text-xs text-muted-foreground mt-2">Showing 100 of {relSales.length}</p>}
            </div>

            <Separator />

            {/* AP → Journal Entries */}
            <div>
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Badge variant="outline">Accounts Payable</Badge><ArrowRight className="h-3 w-3" /><Badge variant="outline">Journal Entries</Badge>
              </h3>
              <div className="border rounded-lg overflow-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Journal Entries</TableHead>
                      <TableHead>Company</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relAP.slice(0, 50).map(ap => {
                      const linkedJEs = relJournals.filter(j => j.reference_id === ap.id);
                      return (
                        <TableRow key={ap.id}>
                          <TableCell className="font-medium text-sm">{ap.vendor_name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(ap.original_amount)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(ap.balance_due || 0)}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{formatStatus(ap.status)}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{ap.description || '—'}</TableCell>
                          <TableCell>{linkedJEs.length > 0 ? <span className="text-xs text-emerald-600 font-medium">{linkedJEs.length} entries</span> : <span className="text-xs text-amber-500">No entries</span>}</TableCell>
                          <TableCell className="text-xs">{companyName(ap.company_id)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <Separator />

            {/* Journal Entries summary */}
            <div>
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Badge variant="outline">Journal Entries</Badge> — Source Breakdown
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {['sale', 'purchase', 'expense', 'return', 'invoice', 'tax_payment', 'manual'].map(refType => {
                  const count = relJournals.filter(j => j.reference_type === refType).length;
                  if (count === 0) return null;
                  return (
                    <Card key={refType}>
                      <CardContent className="pt-3 pb-3">
                        <p className="text-xs text-muted-foreground capitalize">{refType.replace('_', ' ')}</p>
                        <p className="text-lg font-bold">{count}</p>
                      </CardContent>
                    </Card>
                  );
                })}
                <Card><CardContent className="pt-3 pb-3"><p className="text-xs text-muted-foreground">Auto-Generated</p><p className="text-lg font-bold">{relJournals.filter(j => j.is_auto_generated).length}</p></CardContent></Card>
                <Card><CardContent className="pt-3 pb-3"><p className="text-xs text-muted-foreground">Manual</p><p className="text-lg font-bold">{relJournals.filter(j => !j.is_auto_generated).length}</p></CardContent></Card>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
