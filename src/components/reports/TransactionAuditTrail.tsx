import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShoppingCart, BookOpen, Package, Truck, FileText, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

interface SaleDetail {
  id: string;
  order_number: string;
  marketplace: string;
  sale_price: number;
  shipping_cost: number;
  marketplace_fees: number;
  tax_amount: number;
  profit: number;
  sale_date: string;
  customer_name: string | null;
  device_id: string | null;
}

interface DeviceDetail {
  id: string;
  brand: string;
  model: string;
  imei: string | null;
  cost_price: number;
  status: string;
  sku: string | null;
}

interface JournalEntryDetail {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  total_debit: number;
  total_credit: number;
  status: string;
  is_auto_generated: boolean;
  lines: {
    description: string | null;
    debit_amount: number;
    credit_amount: number;
    account_name: string;
    account_code: string;
  }[];
}

interface PODetail {
  id: string;
  po_number: string;
  supplier_name: string;
  po_date: string;
  total_amount: number;
  status: string;
}

interface GRNDetail {
  id: string;
  grn_number: string;
  received_date: string;
  status: string;
}

interface TransactionAuditTrailProps {
  saleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransactionAuditTrail({ saleId, open, onOpenChange }: TransactionAuditTrailProps) {
  const [loading, setLoading] = useState(true);
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntryDetail[]>([]);
  const [purchaseOrder, setPurchaseOrder] = useState<PODetail | null>(null);
  const [grn, setGrn] = useState<GRNDetail | null>(null);

  useEffect(() => {
    if (open && saleId) fetchAuditTrail();
  }, [open, saleId]);

  const fetchAuditTrail = async () => {
    setLoading(true);
    try {
      // Fetch sale
      const { data: saleData } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .single();
      
      if (!saleData) return;
      setSale(saleData as SaleDetail);

      // Parallel fetches
      const promises: Promise<void>[] = [];

      // Fetch device if linked
      if (saleData.device_id) {
        promises.push(
          (async () => {
            const { data } = await supabase
              .from('devices')
              .select('id, brand, model, imei, cost_price, status, sku')
              .eq('id', saleData.device_id!)
              .single();
            if (data) setDevice(data as DeviceDetail);
          })()
        );

        promises.push(
          (async () => {
            const { data: poItems } = await supabase
              .from('purchase_order_items')
              .select('purchase_order_id')
              .eq('device_id', saleData.device_id!)
              .limit(1);
            if (poItems && poItems.length > 0) {
              const { data: po } = await supabase
                .from('purchase_orders')
                .select('id, po_number, supplier_name, po_date, total_amount, status')
                .eq('id', poItems[0].purchase_order_id)
                .single();
              if (po) setPurchaseOrder(po as PODetail);
            }
          })()
        );

        promises.push(
          (async () => {
            const { data: grnItems } = await supabase
              .from('grn_items')
              .select('grn_id')
              .eq('device_id', saleData.device_id!)
              .limit(1);
            if (grnItems && grnItems.length > 0) {
              const { data: grnData } = await supabase
                .from('goods_received_notes')
                .select('id, grn_number, received_date, status')
                .eq('id', grnItems[0].grn_id)
                .single();
              if (grnData) setGrn(grnData as GRNDetail);
            }
          })()
        );
      }

      // Fetch journal entries for this sale
      promises.push(
        (async () => {
          const { data: entries } = await supabase
            .from('journal_entries')
            .select('id, entry_number, entry_date, description, total_debit, total_credit, status, is_auto_generated')
            .eq('reference_type', 'sale')
            .eq('reference_id', saleId)
            .order('entry_date');
          
          if (!entries) return;
          const entriesWithLines: JournalEntryDetail[] = [];
          for (const entry of entries) {
            const { data: lines } = await supabase
              .from('journal_entry_lines')
              .select('description, debit_amount, credit_amount, account_id')
              .eq('journal_entry_id', entry.id);

            const accountIds = lines?.map(l => l.account_id) || [];
            let accountMap: Record<string, { name: string; code: string }> = {};
            if (accountIds.length > 0) {
              const { data: accounts } = await supabase
                .from('chart_of_accounts')
                .select('id, account_name, account_code')
                .in('id', accountIds);
              accounts?.forEach(a => { accountMap[a.id] = { name: a.account_name, code: a.account_code }; });
            }

            entriesWithLines.push({
              ...entry,
              total_debit: Number(entry.total_debit),
              total_credit: Number(entry.total_credit),
              is_auto_generated: entry.is_auto_generated ?? false,
              lines: (lines || []).map(l => ({
                description: l.description,
                debit_amount: Number(l.debit_amount || 0),
                credit_amount: Number(l.credit_amount || 0),
                account_name: accountMap[l.account_id]?.name || 'Unknown',
                account_code: accountMap[l.account_id]?.code || '',
              })),
            });
          }
          setJournalEntries(entriesWithLines);
        })()
      );

      await Promise.all(promises);
    } catch (error) {
      console.error('Error fetching audit trail:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const marketplaceLabels: Record<string, string> = {
    amazon: 'Amazon', bestbuy: 'Best Buy', shopify: 'Shopify', manual: 'Manual',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Transaction Audit Trail
          </DialogTitle>
          <DialogDescription>
            {sale ? `Order #${sale.order_number} — ${marketplaceLabels[sale.marketplace] || sale.marketplace}` : 'Loading...'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : sale ? (
            <div className="space-y-6 pr-4">
              {/* Flow Visualization */}
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground flex-wrap">
                {purchaseOrder && (
                  <>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Package className="h-3 w-3" /> PO
                    </Badge>
                    <ArrowRight className="h-3 w-3" />
                  </>
                )}
                {grn && (
                  <>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Truck className="h-3 w-3" /> GRN
                    </Badge>
                    <ArrowRight className="h-3 w-3" />
                  </>
                )}
                {device && (
                  <>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Package className="h-3 w-3" /> Inventory
                    </Badge>
                    <ArrowRight className="h-3 w-3" />
                  </>
                )}
                <Badge variant="default" className="flex items-center gap-1">
                  <ShoppingCart className="h-3 w-3" /> Sale
                </Badge>
                <ArrowRight className="h-3 w-3" />
                <Badge variant="outline" className="flex items-center gap-1">
                  <BookOpen className="h-3 w-3" /> {journalEntries.length} Journal Entries
                </Badge>
              </div>

              <Separator />

              {/* Sale Details */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-primary" /> Sale Record
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Date</span><p className="font-medium">{format(new Date(sale.sale_date), 'MMM dd, yyyy')}</p></div>
                  <div><span className="text-muted-foreground">Sale Price</span><p className="font-medium">{formatCurrency(Number(sale.sale_price))}</p></div>
                  <div><span className="text-muted-foreground">Fees</span><p className="font-medium">{formatCurrency(Number(sale.marketplace_fees || 0))}</p></div>
                  <div><span className="text-muted-foreground">Shipping</span><p className="font-medium">{formatCurrency(Number(sale.shipping_cost || 0))}</p></div>
                  <div><span className="text-muted-foreground">Tax</span><p className="font-medium">{formatCurrency(Number(sale.tax_amount || 0))}</p></div>
                  <div><span className="text-muted-foreground">Profit</span><p className={`font-medium ${Number(sale.profit || 0) >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{formatCurrency(Number(sale.profit || 0))}</p></div>
                  <div><span className="text-muted-foreground">Customer</span><p className="font-medium">{sale.customer_name || '—'}</p></div>
                </CardContent>
              </Card>

              {/* Device Details */}
              {device ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" /> Linked Device
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Device</span><p className="font-medium">{device.brand} {device.model}</p></div>
                    <div><span className="text-muted-foreground">IMEI/SKU</span><p className="font-mono text-xs">{device.imei || device.sku || '—'}</p></div>
                    <div><span className="text-muted-foreground">Cost Price</span><p className="font-medium">{formatCurrency(device.cost_price)}</p></div>
                    <div><span className="text-muted-foreground">Status</span><Badge variant="outline" className="capitalize">{String(device.status).replace(/_/g, ' ')}</Badge></div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardContent className="pt-4">
                    <p className="text-sm text-destructive font-medium">⚠ No device linked to this sale — COGS cannot be determined</p>
                  </CardContent>
                </Card>
              )}

              {/* Purchase Order */}
              {purchaseOrder && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" /> Purchase Order
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><span className="text-muted-foreground">PO #</span><p className="font-mono">{purchaseOrder.po_number}</p></div>
                    <div><span className="text-muted-foreground">Supplier</span><p className="font-medium">{purchaseOrder.supplier_name}</p></div>
                    <div><span className="text-muted-foreground">Date</span><p>{format(new Date(purchaseOrder.po_date), 'MMM dd, yyyy')}</p></div>
                    <div><span className="text-muted-foreground">Total</span><p className="font-medium">{formatCurrency(Number(purchaseOrder.total_amount))}</p></div>
                  </CardContent>
                </Card>
              )}

              {/* GRN */}
              {grn && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Truck className="h-4 w-4 text-primary" /> Goods Received Note
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-muted-foreground">GRN #</span><p className="font-mono">{grn.grn_number}</p></div>
                    <div><span className="text-muted-foreground">Received</span><p>{format(new Date(grn.received_date), 'MMM dd, yyyy')}</p></div>
                  </CardContent>
                </Card>
              )}

              {/* Journal Entries */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" /> Journal Entries ({journalEntries.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {journalEntries.length === 0 ? (
                    <p className="text-sm text-destructive">⚠ No journal entries found for this transaction</p>
                  ) : (
                    journalEntries.map(je => (
                      <div key={je.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-mono text-sm font-medium">{je.entry_number}</p>
                            <p className="text-xs text-muted-foreground">{je.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {je.is_auto_generated && <Badge variant="secondary" className="text-xs">Auto</Badge>}
                            <Badge variant="outline" className="text-xs">{je.status}</Badge>
                          </div>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Account</TableHead>
                              <TableHead className="text-xs text-right">Debit</TableHead>
                              <TableHead className="text-xs text-right">Credit</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {je.lines.map((line, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">
                                  <span className="font-mono text-muted-foreground">{line.account_code}</span>{' '}
                                  {line.account_name}
                                </TableCell>
                                <TableCell className="text-xs text-right">
                                  {line.debit_amount > 0 ? formatCurrency(line.debit_amount) : ''}
                                </TableCell>
                                <TableCell className="text-xs text-right">
                                  {line.credit_amount > 0 ? formatCurrency(line.credit_amount) : ''}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Transaction not found</p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
