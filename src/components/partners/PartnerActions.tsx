import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { fmtMoney } from '@/lib/partnerEvents';

export function PartnerSettleDialog({
  partnerId, companyId, openPayable, openReceivable, onSettled,
}: {
  partnerId: string; companyId: string;
  openPayable: number; openReceivable: number;
  onSettled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [cashAccount, setCashAccount] = useState('1000');

  const net = openPayable - openReceivable;

  const settle = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('settle-partner', {
        body: { partner_id: partnerId, company_id: companyId, payment_method: paymentMethod, reference, cash_account_code: cashAccount },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Settled. Net ${fmtMoney(Math.abs((data as any).net))}`);
      setOpen(false);
      onSettled();
    } catch (e: any) {
      toast.error(e.message || 'Failed to settle');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={openPayable === 0 && openReceivable === 0}>
          <Banknote className="h-4 w-4 mr-2" />Settle
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Settle partner balance</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="p-3 rounded bg-muted/40"><div className="text-muted-foreground text-xs">Payable</div><div className="font-bold tabular-nums text-amber-400">{fmtMoney(openPayable)}</div></div>
            <div className="p-3 rounded bg-muted/40"><div className="text-muted-foreground text-xs">Receivable</div><div className="font-bold tabular-nums text-emerald-400">{fmtMoney(openReceivable)}</div></div>
            <div className="p-3 rounded bg-primary/10"><div className="text-muted-foreground text-xs">Net to {net >= 0 ? 'pay' : 'collect'}</div><div className="font-bold tabular-nums">{fmtMoney(Math.abs(net))}</div></div>
          </div>
          <div>
            <Label>Cash account code</Label>
            <Input value={cashAccount} onChange={e => setCashAccount(e.target.value)} placeholder="1000" />
          </div>
          <div>
            <Label>Payment method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="e_transfer">E-transfer</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reference / memo</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Check #, wire ref…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={settle} disabled={busy}>{busy ? 'Settling…' : `Settle ${fmtMoney(Math.abs(net))}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PartnerBulkIntakeDialog({
  partnerId, companyId, onDone,
}: { partnerId: string; companyId: string; onDone: () => void; }) {
  const [open, setOpen] = useState(false);
  const [batchNumber, setBatchNumber] = useState(`BATCH-${new Date().toISOString().split('T')[0]}`);
  const [text, setText] = useState('');
  const [defaultDisposition, setDefaultDisposition] = useState<'list_for_sale' | 'return_to_partner'>('list_for_sale');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { toast.error('Paste at least one device'); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data: batch, error: bErr } = await supabase.from('partner_intake_batches').insert({
        partner_id: partnerId, company_id: companyId,
        batch_number: batchNumber, total_units: lines.length,
        created_by: u.user?.id,
      }).select().single();
      if (bErr) throw bErr;

      const rows = lines.map(line => {
        // Format: Brand,Model,IMEI,Storage,Color,PartnerCost[,Disposition]
        const parts = line.split(/[,;\t]/).map(p => p.trim());
        const [brand, model, identifier, storage, color, cost, dispOverride] = parts;
        const dispRaw = (dispOverride || '').toLowerCase();
        const rowDisposition =
          dispRaw === 'return' || dispRaw === 'return_to_partner' ? 'return_to_partner'
          : dispRaw === 'list' || dispRaw === 'list_for_sale' ? 'list_for_sale'
          : defaultDisposition;
        return {
          partner_id: partnerId, company_id: companyId,
          intake_batch_id: batch.id,
          brand: brand || null,
          model: model || parts[0] || 'Unknown',
          identifier: identifier || null,
          storage: storage || null,
          color: color || null,
          partner_cost: Number(cost) || 0,
          status: 'received',
          disposition: rowDisposition,
          created_by: u.user?.id,
        };
      });

      const { data: inserted, error: iErr } = await supabase.from('partner_devices').insert(rows).select('id, partner_id, company_id, brand, model, identifier, partner_cost');
      if (iErr) throw iErr;

      // Log events
      if (inserted && inserted.length > 0) {
        await supabase.from('partner_device_events').insert(inserted.map(d => ({
          partner_device_id: d.id, partner_id: d.partner_id, company_id: d.company_id,
          event_type: 'received',
          payload: { batch_id: batch.id, brand: d.brand, model: d.model, identifier: d.identifier, partner_cost: d.partner_cost },
        })));
      }

      toast.success(`Received ${rows.length} device(s) in batch ${batchNumber}`);
      setOpen(false); setText('');
      onDone();
    } catch (e: any) {
      toast.error(e.message || 'Bulk intake failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Bulk Intake</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Bulk intake from partner</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Batch number</Label>
            <Input value={batchNumber} onChange={e => setBatchNumber(e.target.value)} />
          </div>
          <div>
            <Label>Devices (one per line — Brand, Model, IMEI/SN, Storage, Color, PartnerCost)</Label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              className="w-full min-h-[200px] rounded-md border bg-background p-3 font-mono text-sm"
              placeholder={`Apple, iPhone 14 Pro, 358888888888888, 256GB, Black, 600\nSamsung, Galaxy S23, 359000000000000, 128GB, Gray, 400`}
            />
            <p className="text-xs text-muted-foreground mt-1">Comma, semicolon or tab-separated. Only Model is required.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Importing…' : 'Receive batch'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
