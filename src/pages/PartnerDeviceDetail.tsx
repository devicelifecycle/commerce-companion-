import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Save, ListChecks, RefreshCw, LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { fmtMoney, STATUS_COLORS, STATUS_LABELS, PARTNER_STATUSES, logPartnerEvent } from '@/lib/partnerEvents';

export default function PartnerDeviceDetail() {
  const { partnerId, deviceId } = useParams<{ partnerId: string; deviceId: string }>();
  const [device, setDevice] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [parts, setParts] = useState<any[]>([]);
  const [labor, setLabor] = useState<any[]>([]);
  const [sale, setSale] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // editable fields
  const [status, setStatus] = useState<string>('received');
  const [disposition, setDisposition] = useState<string>('none');
  const [refurbFee, setRefurbFee] = useState<number>(0);
  const [partnerCost, setPartnerCost] = useState<number>(0);

  // new part / labor entry
  const [newPart, setNewPart] = useState({ name: '', qty: 1, unit_cost: 0 });
  const [newLabor, setNewLabor] = useState({ description: '', hours: 0, rate: 0 });

  const load = async () => {
    if (!deviceId) return;
    setLoading(true);
    const [{ data: d }, { data: ev }, { data: pp }, { data: ll }, { data: ss }] = await Promise.all([
      supabase.from('partner_devices').select('*').eq('id', deviceId).maybeSingle(),
      supabase.from('partner_device_events').select('*').eq('partner_device_id', deviceId).order('created_at', { ascending: false }),
      supabase.from('partner_device_parts').select('*').eq('partner_device_id', deviceId).order('used_at', { ascending: false }),
      supabase.from('partner_device_labor').select('*').eq('partner_device_id', deviceId).order('logged_at', { ascending: false }),
      supabase.from('partner_sales').select('*').eq('partner_device_id', deviceId).maybeSingle(),
    ]);
    setDevice(d);
    setEvents(ev || []);
    setParts(pp || []);
    setLabor(ll || []);
    setSale(ss);
    if (d) {
      setStatus(d.status);
      setDisposition(d.disposition || 'none');
      setRefurbFee(Number(d.refurb_fee) || 0);
      setPartnerCost(Number(d.partner_cost) || 0);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [deviceId]);

  const saveDevice = async () => {
    if (!device) return;
    const updates: any = {
      status,
      disposition: disposition === 'none' ? null : disposition,
      refurb_fee: Number(refurbFee) || 0,
      partner_cost: Number(partnerCost) || 0,
    };
    const { error } = await supabase.from('partner_devices').update(updates).eq('id', device.id);
    if (error) { toast.error(error.message); return; }

    // Event log entries for changes
    if (status !== device.status) {
      await logPartnerEvent({
        partner_device_id: device.id, partner_id: device.partner_id, company_id: device.company_id,
        event_type: `status_changed`, payload: { from: device.status, to: status },
      });
    }
    if ((disposition === 'none' ? null : disposition) !== device.disposition) {
      await logPartnerEvent({
        partner_device_id: device.id, partner_id: device.partner_id, company_id: device.company_id,
        event_type: 'disposition_set', payload: { disposition },
      });
    }
    if (Number(refurbFee) !== Number(device.refurb_fee)) {
      await logPartnerEvent({
        partner_device_id: device.id, partner_id: device.partner_id, company_id: device.company_id,
        event_type: 'refurb_fee_set', payload: { amount: refurbFee },
      });
    }
    toast.success('Saved');
    load();
  };

  const addPart = async () => {
    if (!device || !newPart.name) return;
    const { error } = await supabase.from('partner_device_parts').insert({
      partner_device_id: device.id, company_id: device.company_id,
      part_name: newPart.name, qty: Number(newPart.qty), unit_cost: Number(newPart.unit_cost),
    });
    if (error) { toast.error(error.message); return; }
    await logPartnerEvent({
      partner_device_id: device.id, partner_id: device.partner_id, company_id: device.company_id,
      event_type: 'parts_added', payload: { name: newPart.name, qty: newPart.qty, unit_cost: newPart.unit_cost },
    });
    setNewPart({ name: '', qty: 1, unit_cost: 0 });
    load();
  };

  const addLabor = async () => {
    if (!device || newLabor.hours <= 0) return;
    const { error } = await supabase.from('partner_device_labor').insert({
      partner_device_id: device.id, company_id: device.company_id,
      description: newLabor.description || null, hours: Number(newLabor.hours), rate: Number(newLabor.rate),
    });
    if (error) { toast.error(error.message); return; }
    await logPartnerEvent({
      partner_device_id: device.id, partner_id: device.partner_id, company_id: device.company_id,
      event_type: 'labor_logged', payload: { hours: newLabor.hours, rate: newLabor.rate },
    });
    setNewLabor({ description: '', hours: 0, rate: 0 });
    load();
  };

  if (loading) return <DashboardLayout><div className="text-muted-foreground">Loading…</div></DashboardLayout>;
  if (!device) return <DashboardLayout><div>Device not found.</div></DashboardLayout>;

  const totalParts = parts.reduce((s, p) => s + Number(p.total_cost), 0);
  const totalLabor = labor.reduce((s, l) => s + Number(l.total_cost), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <Link to={`/partners/${partnerId}`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to partner
          </Link>
          <h1 className="text-2xl font-bold mt-1">
            {[device.brand, device.model, device.storage, device.color].filter(Boolean).join(' · ')}
          </h1>
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            <Badge variant="outline" className={STATUS_COLORS[device.status]}>{STATUS_LABELS[device.status]}</Badge>
            {device.identifier && <span className="font-mono text-xs">{device.identifier}</span>}
            <span>· Intake {device.intake_date}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: edit panel */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" />Workflow</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PARTNER_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Disposition (after testing)</Label>
                <Select value={disposition} onValueChange={setDisposition}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Not decided —</SelectItem>
                    <SelectItem value="list_for_sale">List for sale</SelectItem>
                    <SelectItem value="return_to_partner">Return to partner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Refurb fee (manual, billed to partner)</Label>
                <Input type="number" step="0.01" value={refurbFee} onChange={e => setRefurbFee(Number(e.target.value))} />
                <p className="text-xs text-muted-foreground mt-1">
                  Parts {fmtMoney(totalParts)} + Labor {fmtMoney(totalLabor)} = {fmtMoney(totalParts + totalLabor)}
                </p>
              </div>
              <div>
                <Label>Partner cost (informational)</Label>
                <Input type="number" step="0.01" value={partnerCost} onChange={e => setPartnerCost(Number(e.target.value))} />
              </div>
              <Button onClick={saveDevice} className="w-full"><Save className="h-4 w-4 mr-2" />Save</Button>
            </CardContent>
          </Card>

          {/* Middle: parts + labor */}
          <Card>
            <CardHeader><CardTitle>Parts & Labor</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Parts used</Label>
                {parts.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : (
                  <div className="space-y-1 text-sm">
                    {parts.map(p => (
                      <div key={p.id} className="flex justify-between border-b border-border/50 py-1">
                        <span>{p.part_name} <span className="text-muted-foreground">× {p.qty}</span></span>
                        <span className="tabular-nums">{fmtMoney(p.total_cost)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <Input placeholder="Part name" value={newPart.name} onChange={e => setNewPart({ ...newPart, name: e.target.value })} />
                  <Input type="number" placeholder="Qty" value={newPart.qty} onChange={e => setNewPart({ ...newPart, qty: Number(e.target.value) })} />
                  <Input type="number" step="0.01" placeholder="Unit cost" value={newPart.unit_cost} onChange={e => setNewPart({ ...newPart, unit_cost: Number(e.target.value) })} />
                </div>
                <Button size="sm" variant="outline" className="w-full mt-2" onClick={addPart}>Add part</Button>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Labor</Label>
                {labor.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : (
                  <div className="space-y-1 text-sm">
                    {labor.map(l => (
                      <div key={l.id} className="flex justify-between border-b border-border/50 py-1">
                        <span>{l.description || 'Labor'} <span className="text-muted-foreground">{l.hours}h × {fmtMoney(l.rate)}</span></span>
                        <span className="tabular-nums">{fmtMoney(l.total_cost)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <Input placeholder="Description" value={newLabor.description} onChange={e => setNewLabor({ ...newLabor, description: e.target.value })} />
                  <Input type="number" step="0.25" placeholder="Hours" value={newLabor.hours} onChange={e => setNewLabor({ ...newLabor, hours: Number(e.target.value) })} />
                  <Input type="number" step="0.01" placeholder="Rate" value={newLabor.rate} onChange={e => setNewLabor({ ...newLabor, rate: Number(e.target.value) })} />
                </div>
                <Button size="sm" variant="outline" className="w-full mt-2" onClick={addLabor}>Log labor</Button>
              </div>
            </CardContent>
          </Card>

          {/* Right: linked sale */}
          <Card>
            <CardHeader><CardTitle>Sale</CardTitle></CardHeader>
            <CardContent>
              {!sale ? <p className="text-sm text-muted-foreground">Not yet sold.</p> : (
                <div className="space-y-2 text-sm">
                  <Row k="Date" v={sale.sale_date} />
                  <Row k="Channel" v={sale.channel || '—'} />
                  <Row k="Sale" v={fmtMoney(sale.sale_amount)} />
                  <Row k="− Marketplace fees" v={fmtMoney(sale.marketplace_fees)} />
                  <Row k="− Shipping" v={fmtMoney(sale.shipping)} />
                  <Row k="− Tax" v={fmtMoney(sale.tax)} />
                  <Row k="− Refurb fee" v={fmtMoney(sale.refurb_fee)} />
                  <Row k="− Partner cost" v={fmtMoney(sale.partner_cost)} />
                  <div className="border-t border-border pt-2">
                    <Row k="Net profit" v={fmtMoney(sale.net_profit)} bold />
                    <Row k={`× ${Number(sale.commission_pct).toFixed(2)}%`} v={fmtMoney(sale.commission_amount)} accent="emerald" bold />
                    <Row k="→ Owed to partner" v={fmtMoney(sale.partner_proceeds)} accent="amber" bold />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" /> Timeline ({events.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center">No events yet.</p>
            ) : (
              <div className="space-y-2">
                {events.map(e => (
                  <div key={e.id} className="flex gap-3 text-sm border-l-2 border-primary/40 pl-3 py-1">
                    <span className="text-muted-foreground tabular-nums w-40 shrink-0">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                    <span className="font-medium">{e.event_type}</span>
                    {e.payload && (
                      <span className="text-muted-foreground text-xs font-mono">
                        {JSON.stringify(e.payload)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Row({ k, v, accent, bold }: { k: string; v: string; accent?: 'emerald' | 'amber'; bold?: boolean }) {
  const color = accent === 'emerald' ? 'text-emerald-400' : accent === 'amber' ? 'text-amber-400' : '';
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className={`tabular-nums ${color} ${bold ? 'font-semibold' : ''}`}>{v}</span>
    </div>
  );
}
