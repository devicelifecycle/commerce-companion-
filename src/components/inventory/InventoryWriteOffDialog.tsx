import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { emitRefetch } from '@/hooks/useDataRefetch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface Device {
  id: string;
  brand: string;
  model: string;
  imei?: string | null;
  cost_price: number;
  company_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: Device[];
  onSuccess: () => void;
}

const WRITE_OFF_REASONS = [
  { value: 'damaged', label: 'Damaged / Defective' },
  { value: 'lost', label: 'Lost / Missing' },
  { value: 'obsolete', label: 'Obsolete / End of Life' },
  { value: 'stolen', label: 'Stolen' },
  { value: 'shrinkage', label: 'Inventory Shrinkage' },
  { value: 'other', label: 'Other' },
];

export function InventoryWriteOffDialog({ open, onOpenChange, devices, onSuccess }: Props) {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const totalCost = devices.reduce((sum, d) => sum + d.cost_price, 0);
  const companyId = devices[0]?.company_id || selectedCompany?.id;

  const handleSubmit = async () => {
    if (!reason) { toast.error('Please select a reason'); return; }
    if (!companyId) { toast.error('No company context'); return; }

    setLoading(true);
    try {
      // 1. Look up write-off expense account (7200) and inventory account
      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code')
        .eq('company_id', companyId)
        .in('account_code', ['7200', '1100', '1101']);

      let writeOffAccountId = accounts?.find(a => a.account_code === '7200')?.id;
      const inventoryAccountId = accounts?.find(a => ['1100', '1101'].includes(a.account_code))?.id;

      // Create write-off account if it doesn't exist
      if (!writeOffAccountId) {
        const { data: newAcct } = await supabase.from('chart_of_accounts').insert({
          company_id: companyId,
          account_code: '7200',
          account_name: 'Inventory Write-Offs',
          account_type: 'expense',
          account_subtype: 'write_off',
          normal_balance: 'debit',
          is_system_account: true,
          description: 'Losses from damaged, lost, or obsolete inventory',
        }).select('id').single();
        writeOffAccountId = newAcct?.id;
      }

      if (!writeOffAccountId || !inventoryAccountId) {
        throw new Error('Missing required accounts for write-off');
      }

      // 2. Create journal entry: Dr. Write-Off Expense / Cr. Inventory
      const entryNumber = `WO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      const deviceDescs = devices.map(d => `${d.brand} ${d.model}`).join(', ');

      const { data: entry, error: entryErr } = await supabase.from('journal_entries').insert({
        company_id: companyId,
        entry_number: entryNumber,
        entry_date: new Date().toISOString().split('T')[0],
        description: `Inventory write-off (${reason}) — ${deviceDescs}`,
        reference_type: 'write_off',
        reference_id: devices[0].id, // Primary reference
        total_debit: totalCost,
        total_credit: totalCost,
        is_auto_generated: true,
        status: 'posted',
        posted_at: new Date().toISOString(),
      }).select('id').single();

      if (entryErr) throw entryErr;

      await supabase.from('journal_entry_lines').insert([
        {
          journal_entry_id: entry.id,
          account_id: writeOffAccountId,
          description: `Write-off: ${deviceDescs} — ${reason}`,
          debit_amount: totalCost,
          credit_amount: 0,
        },
        {
          journal_entry_id: entry.id,
          account_id: inventoryAccountId,
          description: `Inventory removed: ${deviceDescs}`,
          debit_amount: 0,
          credit_amount: totalCost,
        },
      ]);

      // 3. Update account balances
      // Write-off expense (debit normal) increases
      const { data: woAcct } = await supabase.from('chart_of_accounts').select('current_balance').eq('id', writeOffAccountId).single();
      await supabase.from('chart_of_accounts').update({
        current_balance: Number(woAcct?.current_balance || 0) + totalCost
      }).eq('id', writeOffAccountId);

      // Inventory (debit normal) decreases
      const { data: invAcct } = await supabase.from('chart_of_accounts').select('current_balance').eq('id', inventoryAccountId).single();
      await supabase.from('chart_of_accounts').update({
        current_balance: Number(invAcct?.current_balance || 0) - totalCost
      }).eq('id', inventoryAccountId);

      // 4. Mark devices as written off
      const deviceIds = devices.map(d => d.id);
      await supabase.from('devices').update({
        status: 'written_off' as any,
        notes: `Written off: ${reason}. ${notes}`.trim(),
      }).in('id', deviceIds);

      toast.success(`${devices.length} device(s) written off — $${totalCost.toFixed(2)} expensed`);
      emitRefetch('inventory');
      emitRefetch('financials');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Write-off error:', error);
      toast.error(error.message || 'Failed to process write-off');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Write Off Inventory</DialogTitle>
          <DialogDescription>
            Remove {devices.length} device(s) from inventory and record the loss.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border p-3 bg-muted/50 space-y-1">
            {devices.slice(0, 5).map(d => (
              <div key={d.id} className="flex justify-between text-sm">
                <span>{d.brand} {d.model}{d.imei ? ` (${d.imei})` : ''}</span>
                <span className="font-medium">${d.cost_price.toFixed(2)}</span>
              </div>
            ))}
            {devices.length > 5 && (
              <p className="text-xs text-muted-foreground">...and {devices.length - 5} more</p>
            )}
            <div className="border-t pt-2 mt-2 flex justify-between font-bold">
              <span>Total Write-Off</span>
              <span className="text-destructive">${totalCost.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>
                {WRITE_OFF_REASONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional details..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Processing...' : `Write Off $${totalCost.toFixed(2)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
