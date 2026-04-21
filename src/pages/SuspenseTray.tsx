import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, AlertTriangle, Clock, RefreshCw, Send, Link2, ExternalLink, ScrollText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SuspenseSale {
  id: string;
  order_number: string;
  marketplace: string;
  sale_price: number;
  sale_date: string;
  device_id: string | null;
  manual_cost: number | null;
  shipping_province: string | null;
  province_inferred: boolean | null;
  marketplace_fees: number | null;
  accounting_status: string;
  review_reason: string | null;
  customer_name: string | null;
  company_id: string;
}

const STATUS_TABS = [
  { value: 'ready_to_post', label: 'Ready to Post', icon: CheckCircle2, tone: 'text-emerald-500' },
  { value: 'pending_review', label: 'Pending Review', icon: Clock, tone: 'text-amber-500' },
  { value: 'needs_review', label: 'Needs Action', icon: AlertTriangle, tone: 'text-red-500' },
] as const;

export default function SuspenseTray() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const selectedCompanyId = selectedCompany?.id || null;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<string>('ready_to_post');
  const [sales, setSales] = useState<SuspenseSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [posting, setPosting] = useState(false);
  const [resolving, setResolving] = useState(false);

  const loadSales = async () => {
    setLoading(true);
    let q = supabase
      .from('sales')
      .select('id, order_number, marketplace, sale_price, sale_date, device_id, manual_cost, shipping_province, province_inferred, marketplace_fees, accounting_status, review_reason, customer_name, company_id')
      .in('accounting_status', ['ready_to_post', 'pending_review', 'needs_review'])
      .order('sale_date', { ascending: false })
      .limit(500);
    if (selectedCompanyId) q = q.eq('company_id', selectedCompanyId);
    const { data, error } = await q;
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setSales((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSales();
    setSelected(new Set());
  }, [selectedCompanyId]);

  const counts = useMemo(() => ({
    ready_to_post: sales.filter(s => s.accounting_status === 'ready_to_post').length,
    pending_review: sales.filter(s => s.accounting_status === 'pending_review').length,
    needs_review: sales.filter(s => s.accounting_status === 'needs_review').length,
  }), [sales]);

  const visibleSales = useMemo(
    () => sales.filter(s => s.accounting_status === activeTab),
    [sales, activeTab]
  );

  const allSelected = visibleSales.length > 0 && visibleSales.every(s => selected.has(s.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) visibleSales.forEach(s => next.delete(s.id));
    else visibleSales.forEach(s => next.add(s.id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const handlePost = async () => {
    if (selected.size === 0) {
      toast({ title: 'Select orders', description: 'Pick orders from "Ready to Post" first.' });
      return;
    }
    setPosting(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-sale-accounting', {
        body: { mode: 'post', sale_ids: Array.from(selected) },
      });
      if (error) throw error;
      toast({
        title: 'Posted to GL',
        description: `${data?.processed ?? 0} orders posted, ${data?.errors ?? 0} errors.`,
      });
      setSelected(new Set());
      await loadSales();
    } catch (e: any) {
      toast({ title: 'Posting failed', description: e.message, variant: 'destructive' });
    }
    setPosting(false);
  };

  const handleAutoResolve = async () => {
    setResolving(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-resolve-sales', { body: {} });
      if (error) throw error;
      toast({
        title: 'Auto-resolve complete',
        description: `Scanned ${data?.scanned ?? 0} • Province fixed: ${data?.province_fixed ?? 0} • Devices linked: ${data?.device_linked ?? 0}`,
      });
      await loadSales();
    } catch (e: any) {
      toast({ title: 'Auto-resolve failed', description: e.message, variant: 'destructive' });
    }
    setResolving(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Suspense Tray</h1>
            <p className="text-muted-foreground text-sm max-w-2xl">
              Imported orders sit here until gates pass and you click Post. Nothing here affects the P&amp;L,
              dashboard, or financial reports until posted.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleAutoResolve} disabled={resolving}>
              <RefreshCw className={`h-4 w-4 mr-2 ${resolving ? 'animate-spin' : ''}`} />
              Auto-resolve
            </Button>
            <Button onClick={handlePost} disabled={posting || selected.size === 0 || activeTab !== 'ready_to_post'}>
              <Send className={`h-4 w-4 mr-2 ${posting ? 'animate-pulse' : ''}`} />
              Post {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STATUS_TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <Card
                key={tab.value}
                className={`cursor-pointer transition-colors ${activeTab === tab.value ? 'border-primary' : ''}`}
                onClick={() => setActiveTab(tab.value)}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Icon className={`h-8 w-8 ${tab.tone}`} />
                  <div>
                    <p className="text-2xl font-bold">{counts[tab.value]}</p>
                    <p className="text-xs text-muted-foreground">{tab.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {STATUS_TABS.find(t => t.value === activeTab)?.label} ({visibleSales.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : visibleSales.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No orders in this state.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                      </TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Marketplace</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Province</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleSales.map(s => (
                      <TableRow key={s.id} className={selected.has(s.id) ? 'bg-muted/50' : ''}>
                        <TableCell>
                          <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleOne(s.id)} />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{s.order_number}</TableCell>
                        <TableCell className="text-xs">{new Date(s.sale_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{s.marketplace}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${Number(s.sale_price).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {s.shipping_province ? (
                            <Badge variant={s.province_inferred ? 'secondary' : 'outline'} className="text-xs">
                              {s.shipping_province}{s.province_inferred ? ' *' : ''}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {s.device_id ? (
                            <Badge className="text-xs"><Link2 className="h-3 w-3 mr-1" />Linked</Badge>
                          ) : s.manual_cost ? (
                            <Badge variant="secondary" className="text-xs">Manual cost</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">Unlinked</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                          {s.review_reason || (s.accounting_status === 'ready_to_post' ? 'All gates passed' : '—')}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => navigate(`/orders?order=${s.order_number}`)}
                            title="Open order"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
