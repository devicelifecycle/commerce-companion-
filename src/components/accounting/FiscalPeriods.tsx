import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Lock, LockOpen, Plus, CalendarRange } from 'lucide-react';
import { format } from 'date-fns';

type Period = {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  status: 'open' | 'closed';
  closed_at: string | null;
  notes: string | null;
};

export function FiscalPeriods() {
  const { companies } = useCompany();
  const [companyId, setCompanyId] = useState<string>('');
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!companyId && companies.length > 0) setCompanyId(companies[0].id);
  }, [companies, companyId]);

  const load = async (cid: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('fiscal_periods' as any)
      .select('*')
      .eq('company_id', cid)
      .order('period_start', { ascending: false });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setPeriods((data ?? []) as unknown as Period[]);
  };

  useEffect(() => { if (companyId) load(companyId); }, [companyId]);

  const createPeriod = async () => {
    if (!companyId || !start || !end) { toast.error('Pick a company and date range'); return; }
    if (end < start) { toast.error('End date must be on or after start date'); return; }
    const { error } = await supabase.from('fiscal_periods' as any).insert({
      company_id: companyId,
      period_start: start,
      period_end: end,
      notes: notes || null,
      status: 'open',
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Fiscal period created');
    setStart(''); setEnd(''); setNotes('');
    load(companyId);
  };

  const close = async (id: string) => {
    const { error } = await supabase.rpc('close_fiscal_period' as any, { _period_id: id, _notes: null });
    if (error) { toast.error(error.message); return; }
    toast.success('Period closed — journal entries in this range are now locked');
    load(companyId);
  };

  const reopen = async (id: string) => {
    const { error } = await supabase.rpc('reopen_fiscal_period' as any, { _period_id: id, _notes: null });
    if (error) { toast.error(error.message); return; }
    toast.success('Period reopened');
    load(companyId);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarRange className="h-5 w-5" /> Fiscal Periods</CardTitle>
          <CardDescription>
            Lock past months, quarters, or years. While a period is closed, journal entries inside its range
            cannot be posted, edited, or deleted — even by automated processors.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="space-y-2">
              <Label>Company</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period start</Label>
              <Input type="date" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Period end</Label>
              <Input type="date" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-1">
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Q1 2026" />
            </div>
            <Button onClick={createPeriod} className="gap-2">
              <Plus className="h-4 w-4" /> Add period
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Closed at</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
                )}
                {!loading && periods.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No periods defined yet.</TableCell></TableRow>
                )}
                {periods.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium tabular-nums">
                      {format(new Date(p.period_start), 'yyyy-MM-dd')} → {format(new Date(p.period_end), 'yyyy-MM-dd')}
                    </TableCell>
                    <TableCell>
                      {p.status === 'closed'
                        ? <Badge variant="destructive" className="gap-1"><Lock className="h-3 w-3" /> Closed</Badge>
                        : <Badge variant="secondary" className="gap-1"><LockOpen className="h-3 w-3" /> Open</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {p.closed_at ? format(new Date(p.closed_at), 'yyyy-MM-dd HH:mm') : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.notes ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {p.status === 'open' ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="default" className="gap-1"><Lock className="h-3 w-3" /> Close</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Close this fiscal period?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Once closed, no journal entries with a date inside <b>{p.period_start} → {p.period_end}</b> can be posted, edited, or deleted by anyone (including automated marketplace sync, returns, and reversals). You can reopen it later.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => close(p.id)}>Close period</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1"><LockOpen className="h-3 w-3" /> Reopen</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reopen this period?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Reopening will allow new postings and edits to entries dated in this range. Use sparingly — only for authorized adjusting entries.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => reopen(p.id)}>Reopen</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
