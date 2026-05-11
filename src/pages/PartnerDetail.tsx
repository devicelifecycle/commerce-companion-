import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, ArrowLeft, Handshake, Download, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { fmtMoney, STATUS_COLORS, STATUS_LABELS, logPartnerEvent } from '@/lib/partnerEvents';
import { PartnerSettleDialog, PartnerBulkIntakeDialog } from '@/components/partners/PartnerActions';

interface Partner {
  id: string; name: string; commission_pct: number; company_id: string;
  contact_name: string | null; email: string | null; phone: string | null; is_active: boolean;
}
interface PartnerDevice {
  id: string; brand: string | null; model: string; identifier: string | null;
  storage: string | null; color: string | null; status: string; disposition: string | null;
  partner_cost: number; refurb_fee: number; refurb_fee_status: string;
  intake_date: string; category: string | null; created_at: string;
}
interface PartnerSale {
  id: string; sale_date: string; channel: string | null; sale_amount: number;
  partner_cost: number; marketplace_fees: number; shipping: number; tax: number;
  refurb_fee: number; net_profit: number; commission_pct: number;
  commission_amount: number; partner_proceeds: number; status: string; partner_device_id: string | null;
}
interface Receivable { id: string; amount: number; billed_date: string; status: string; partner_device_id: string | null; fee_type: string; }
interface Payable { id: string; amount: number; status: string; created_at: string; partner_sale_id: string | null; }

export default function PartnerDetail() {
  const { id } = useParams<{ id: string }>();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [devices, setDevices] = useState<PartnerDevice[]>([]);
  const [sales, setSales] = useState<PartnerSale[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intake, setIntake] = useState({
    brand: '', model: '', identifier: '', storage: '', color: '',
    category: 'phone', partner_cost: 0, notes: '',
  });

  // Date filter for sales tab
  const ytdStart = `${new Date().getFullYear()}-01-01`;
  const today = new Date().toISOString().split('T')[0];
  const [salesFrom, setSalesFrom] = useState(ytdStart);
  const [salesTo, setSalesTo] = useState(today);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: p }, { data: ds }, { data: ss }, { data: pays }, { data: recs }] = await Promise.all([
      supabase.from('partners').select('*').eq('id', id).maybeSingle(),
      supabase.from('partner_devices').select('*').eq('partner_id', id).order('created_at', { ascending: false }),
      supabase.from('partner_sales').select('*').eq('partner_id', id).order('sale_date', { ascending: false }),
      supabase.from('partner_payables').select('*').eq('partner_id', id).order('created_at', { ascending: false }),
      supabase.from('partner_receivables').select('*').eq('partner_id', id).order('billed_date', { ascending: false }),
    ]);
    setPartner(p as any);
    setDevices(ds as any || []);
    setSales(ss as any || []);
    setPayables(pays as any || []);
    setReceivables(recs as any || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const addDevice = async () => {
    if (!partner || !intake.model.trim()) { toast.error('Model is required'); return; }
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('partner_devices').insert({
      partner_id: partner.id,
      company_id: partner.company_id,
      brand: intake.brand || null,
      model: intake.model.trim(),
      identifier: intake.identifier || null,
      storage: intake.storage || null,
      color: intake.color || null,
      category: intake.category || 'phone',
      partner_cost: Number(intake.partner_cost) || 0,
      notes: intake.notes || null,
      status: 'received',
      created_by: u.user?.id,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    if (data) {
      await logPartnerEvent({
        partner_device_id: data.id, partner_id: partner.id, company_id: partner.company_id,
        event_type: 'received',
        payload: { brand: data.brand, model: data.model, identifier: data.identifier, partner_cost: data.partner_cost },
      });
    }
    toast.success('Device received');
    setIntakeOpen(false);
    setIntake({ brand: '', model: '', identifier: '', storage: '', color: '', category: 'phone', partner_cost: 0, notes: '' });
    load();
  };

  if (loading) return <DashboardLayout><div className="text-muted-foreground">Loading…</div></DashboardLayout>;
  if (!partner) return <DashboardLayout><div>Partner not found.</div></DashboardLayout>;

  // KPIs
  const inStock = devices.filter(d => !['sold', 'returned_to_partner', 'written_off'].includes(d.status)).length;
  const soldCount = devices.filter(d => d.status === 'sold').length;
  const lifetimeSales = sales.reduce((s, x) => s + Number(x.sale_amount), 0);
  const lifetimeCommission = sales.reduce((s, x) => s + Number(x.commission_amount), 0);
  const lifetimeRefurbFees = sales.reduce((s, x) => s + Number(x.refurb_fee), 0)
    + receivables.reduce((s, x) => s + Number(x.amount), 0);
  const openPayable = payables.filter(p => p.status === 'accrued').reduce((s, x) => s + Number(x.amount), 0);
  const openReceivable = receivables.filter(r => ['pending', 'invoiced'].includes(r.status)).reduce((s, x) => s + Number(x.amount), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/partners" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4 mr-1" /> All partners
            </Link>
            <h1 className="text-3xl font-bold flex items-center gap-2 mt-1">
              <Handshake className="h-7 w-7 text-primary" /> {partner.name}
              {!partner.is_active && <Badge variant="secondary">Inactive</Badge>}
            </h1>
            <p className="text-muted-foreground mt-1">
              Commission: <span className="text-foreground font-semibold tabular-nums">{Number(partner.commission_pct).toFixed(2)}%</span> of net profit · {partner.contact_name || '—'}{partner.email ? ` · ${partner.email}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PartnerBulkIntakeDialog partnerId={partner.id} companyId={partner.company_id} onDone={load} />
            <PartnerSettleDialog
              partnerId={partner.id}
              companyId={partner.company_id}
              openPayable={openPayable}
              openReceivable={openReceivable}
              onSettled={load}
            />
            <Dialog open={intakeOpen} onOpenChange={setIntakeOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Receive Device</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Receive Partner Device</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Category</Label><Input value={intake.category} onChange={e => setIntake({ ...intake, category: e.target.value })} /></div>
                    <div><Label>Brand</Label><Input value={intake.brand} onChange={e => setIntake({ ...intake, brand: e.target.value })} /></div>
                  </div>
                  <div><Label>Model *</Label><Input value={intake.model} onChange={e => setIntake({ ...intake, model: e.target.value })} /></div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>IMEI / SN</Label><Input value={intake.identifier} onChange={e => setIntake({ ...intake, identifier: e.target.value })} /></div>
                    <div><Label>Storage</Label><Input value={intake.storage} onChange={e => setIntake({ ...intake, storage: e.target.value })} /></div>
                    <div><Label>Color</Label><Input value={intake.color} onChange={e => setIntake({ ...intake, color: e.target.value })} /></div>
                  </div>
                  <div><Label>Partner cost (informational)</Label><Input type="number" step="0.01" value={intake.partner_cost} onChange={e => setIntake({ ...intake, partner_cost: Number(e.target.value) })} /></div>
                  <div><Label>Notes</Label><Textarea value={intake.notes} onChange={e => setIntake({ ...intake, notes: e.target.value })} /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIntakeOpen(false)}>Cancel</Button>
                  <Button onClick={addDevice}>Receive</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Kpi label="Devices" value={devices.length} />
          <Kpi label="In stock" value={inStock} />
          <Kpi label="Sold" value={soldCount} />
          <Kpi label="Lifetime sales" value={fmtMoney(lifetimeSales)} />
          <Kpi label="Our commission" value={fmtMoney(lifetimeCommission)} accent="emerald" />
          <Kpi label="Refurb fees" value={fmtMoney(lifetimeRefurbFees)} accent="emerald" />
          <Kpi label="Net owing" value={fmtMoney(openPayable - openReceivable)} accent={openPayable > openReceivable ? 'amber' : 'emerald'} />
        </div>

        <Tabs defaultValue="inventory">
          <TabsList>
            <TabsTrigger value="inventory">Inventory ({devices.length})</TabsTrigger>
            <TabsTrigger value="sales">Sales & Profit ({sales.length})</TabsTrigger>
            <TabsTrigger value="fees">Refurb Fees ({receivables.length})</TabsTrigger>
            <TabsTrigger value="payables">Payables ({payables.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="inventory">
            <Card>
              <CardHeader><CardTitle>Inventory</CardTitle></CardHeader>
              <CardContent>
                {devices.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center">No devices yet. Click "Receive Device" to start.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Intake</TableHead>
                        <TableHead>Device</TableHead>
                        <TableHead>Identifier</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Disposition</TableHead>
                        <TableHead className="text-right tabular-nums">Partner cost</TableHead>
                        <TableHead className="text-right tabular-nums">Refurb fee</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {devices.map(d => (
                        <TableRow key={d.id} className="hover:bg-muted/40">
                          <TableCell className="text-muted-foreground text-sm">{d.intake_date}</TableCell>
                          <TableCell>
                            <Link to={`/partners/${id}/devices/${d.id}`} className="font-medium hover:text-primary">
                              {[d.brand, d.model, d.storage, d.color].filter(Boolean).join(' · ')}
                            </Link>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{d.identifier || '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_COLORS[d.status]}>
                              {STATUS_LABELS[d.status] || d.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{d.disposition === 'list_for_sale' ? 'List' : d.disposition === 'return_to_partner' ? 'Return' : '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(d.partner_cost)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(d.refurb_fee)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sales">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle>Order-by-order profit breakdown</CardTitle>
                <div className="flex items-center gap-2 text-sm">
                  <Input type="date" className="w-auto h-8" value={salesFrom} onChange={e => setSalesFrom(e.target.value)} />
                  <span className="text-muted-foreground">to</span>
                  <Input type="date" className="w-auto h-8" value={salesTo} onChange={e => setSalesTo(e.target.value)} />
                  <Button size="sm" variant="outline" onClick={() => exportSalesCsv(filteredSales, partner.name, salesFrom, salesTo)}>
                    <Download className="h-3 w-3 mr-1" />CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => printStatement(partner, filteredSales, openPayable, openReceivable, salesFrom, salesTo)}>
                    <Printer className="h-3 w-3 mr-1" />Print
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {filteredSales.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center">No sales in range.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                      <Kpi label="Sales" value={fmtMoney(periodTotals.sales)} />
                      <Kpi label="Net profit" value={fmtMoney(periodTotals.netProfit)} />
                      <Kpi label="Our commission" value={fmtMoney(periodTotals.commission)} accent="emerald" />
                      <Kpi label="Refurb fees" value={fmtMoney(periodTotals.refurb)} accent="emerald" />
                      <Kpi label="Owed to partner" value={fmtMoney(periodTotals.proceeds)} accent="amber" />
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Channel</TableHead>
                            <TableHead className="text-right tabular-nums">Sale</TableHead>
                            <TableHead className="text-right tabular-nums">Fees</TableHead>
                            <TableHead className="text-right tabular-nums">Shipping</TableHead>
                            <TableHead className="text-right tabular-nums">Tax</TableHead>
                            <TableHead className="text-right tabular-nums">Refurb fee</TableHead>
                            <TableHead className="text-right tabular-nums">Partner cost</TableHead>
                            <TableHead className="text-right tabular-nums">Net profit</TableHead>
                            <TableHead className="text-right tabular-nums">Comm %</TableHead>
                            <TableHead className="text-right tabular-nums text-emerald-400">Our cut</TableHead>
                            <TableHead className="text-right tabular-nums text-amber-400">Owed partner</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSales.map(s => (
                            <TableRow key={s.id}>
                              <TableCell>{s.sale_date}</TableCell>
                              <TableCell><Badge variant="outline">{s.channel || 'manual'}</Badge></TableCell>
                              <TableCell className="text-right tabular-nums">{fmtMoney(s.sale_amount)}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMoney(s.marketplace_fees)}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMoney(s.shipping)}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMoney(s.tax)}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMoney(s.refurb_fee)}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMoney(s.partner_cost)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{fmtMoney(s.net_profit)}</TableCell>
                              <TableCell className="text-right tabular-nums">{Number(s.commission_pct).toFixed(2)}%</TableCell>
                              <TableCell className="text-right tabular-nums text-emerald-400 font-semibold">{fmtMoney(s.commission_amount)}</TableCell>
                              <TableCell className="text-right tabular-nums text-amber-400 font-semibold">{fmtMoney(s.partner_proceeds)}</TableCell>
                              <TableCell><Badge variant="outline">{s.status}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fees">
            <Card>
              <CardHeader><CardTitle>Refurb fees billed to partner</CardTitle></CardHeader>
              <CardContent>
                {receivables.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center">No refurb-fee receivables yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right tabular-nums">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receivables.map(r => (
                        <TableRow key={r.id}>
                          <TableCell>{r.billed_date}</TableCell>
                          <TableCell>{r.fee_type}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(r.amount)}</TableCell>
                          <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payables">
            <Card>
              <CardHeader><CardTitle>What we owe the partner</CardTitle></CardHeader>
              <CardContent>
                {payables.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center">No payables yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right tabular-nums">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payables.map(p => (
                        <TableRow key={p.id}>
                          <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(p.amount)}</TableCell>
                          <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: 'emerald' | 'amber' }) {
  const color = accent === 'emerald' ? 'text-emerald-400' : accent === 'amber' ? 'text-amber-400' : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={`text-2xl font-bold tabular-nums mt-1 ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
