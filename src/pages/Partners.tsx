import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Handshake, Plus, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { fmtMoney } from '@/lib/partnerEvents';

interface Partner {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  commission_pct: number;
  is_active: boolean;
  agreement_start_date: string | null;
}

interface PartnerStats {
  devices: number;
  sold: number;
  in_stock: number;
  payable: number;
  receivable: number;
}

export default function Partners() {
  const { selectedCompany } = useCompany();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [stats, setStats] = useState<Record<string, PartnerStats>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', contact_name: '', email: '', phone: '',
    commission_pct: 15, agreement_start_date: '', notes: '',
  });

  const load = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    const { data: ps } = await supabase
      .from('partners')
      .select('*')
      .eq('company_id', selectedCompany.id)
      .order('created_at', { ascending: false });
    setPartners(ps || []);

    const next: Record<string, PartnerStats> = {};
    for (const p of ps || []) {
      const [{ data: devs }, { data: pay }, { data: rec }] = await Promise.all([
        supabase.from('partner_devices').select('id,status').eq('partner_id', p.id),
        supabase.from('partner_payables').select('amount,status').eq('partner_id', p.id).eq('status', 'accrued'),
        supabase.from('partner_receivables').select('amount,status').eq('partner_id', p.id).in('status', ['pending', 'invoiced']),
      ]);
      next[p.id] = {
        devices: devs?.length || 0,
        sold: devs?.filter(d => d.status === 'sold').length || 0,
        in_stock: devs?.filter(d => !['sold', 'returned_to_partner', 'written_off'].includes(d.status)).length || 0,
        payable: (pay || []).reduce((s, r) => s + Number(r.amount), 0),
        receivable: (rec || []).reduce((s, r) => s + Number(r.amount), 0),
      };
    }
    setStats(next);
    setLoading(false);
  };

  useEffect(() => { load(); }, [selectedCompany?.id]);

  const create = async () => {
    if (!selectedCompany || !form.name.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('partners').insert({
      company_id: selectedCompany.id,
      name: form.name.trim(),
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      commission_pct: Number(form.commission_pct) || 15,
      agreement_start_date: form.agreement_start_date || null,
      notes: form.notes || null,
      created_by: u.user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Partner created');
    setOpen(false);
    setForm({ name: '', contact_name: '', email: '', phone: '', commission_pct: 15, agreement_start_date: '', notes: '' });
    load();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Handshake className="h-7 w-7 text-primary" /> Partners
            </h1>
            <p className="text-muted-foreground mt-1">
              Investor consignment inventory — off-balance-sheet, full traceability.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Partner</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Partner</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Contact name</Label><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></div>
                  <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><Label>Commission % (we earn)</Label><Input type="number" step="0.01" value={form.commission_pct} onChange={e => setForm({ ...form, commission_pct: Number(e.target.value) })} /></div>
                </div>
                <div><Label>Agreement start date</Label><Input type="date" value={form.agreement_start_date} onChange={e => setForm({ ...form, agreement_start_date: e.target.value })} /></div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={create}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader><CardTitle>All Partners</CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-muted-foreground">Loading…</p> : partners.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No partners yet. Create one to start tracking consignment inventory.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Devices</TableHead>
                    <TableHead className="text-right">In stock</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right tabular-nums">Owed to partner</TableHead>
                    <TableHead className="text-right tabular-nums">Owed by partner</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map(p => {
                    const s = stats[p.id] || { devices: 0, sold: 0, in_stock: 0, payable: 0, receivable: 0 };
                    return (
                      <TableRow key={p.id} className="cursor-pointer hover:bg-muted/40">
                        <TableCell>
                          <Link to={`/partners/${p.id}`} className="font-medium hover:text-primary">
                            {p.name}
                          </Link>
                          {!p.is_active && <Badge variant="secondary" className="ml-2">Inactive</Badge>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {p.contact_name || '—'}{p.email ? ` · ${p.email}` : ''}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{Number(p.commission_pct).toFixed(2)}%</TableCell>
                        <TableCell className="text-right tabular-nums">{s.devices}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.in_stock}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.sold}</TableCell>
                        <TableCell className="text-right tabular-nums text-amber-400">{fmtMoney(s.payable)}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-400">{fmtMoney(s.receivable)}</TableCell>
                        <TableCell>
                          <Link to={`/partners/${p.id}`}><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
