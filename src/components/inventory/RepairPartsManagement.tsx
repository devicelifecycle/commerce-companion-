import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/lib/auth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { toast } from 'sonner';
import {
  Package, Search, AlertTriangle, MoreHorizontal, Trash2, Edit2,
  History, DollarSign, X, Download,
} from 'lucide-react';
import { format } from 'date-fns';

interface RepairPartsManagementProps {
  canManage: boolean;
}

const PART_CATEGORIES = ['screen', 'battery', 'housing', 'camera', 'charging_port', 'speaker', 'button', 'connector', 'adhesive', 'general'];

export function RepairPartsManagement({ canManage }: RepairPartsManagementProps) {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const { logEvent } = useAuditLog();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editPart, setEditPart] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkCostDialog, setBulkCostDialog] = useState(false);
  const [bulkCostValue, setBulkCostValue] = useState('');
  const [historyPart, setHistoryPart] = useState<any>(null);

  const { data: parts = [], isLoading } = useQuery({
    queryKey: ['repair-parts', selectedCompany?.id],
    queryFn: async () => {
      let query = supabase
        .from('repair_parts')
        .select('*, suppliers(name)')
        .eq('is_active', true)
        .order('name');
      if (selectedCompany) query = query.eq('company_id', selectedCompany.id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = parts.filter((p: any) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((p: any) => p.id)));
  };

  const handleBulkDelete = async () => {
    try {
      const ids = Array.from(selectedIds);
      // Soft delete (deactivate)
      const { error } = await supabase.from('repair_parts').update({ is_active: false }).in('id', ids);
      if (error) throw error;
      logEvent({ action: 'DELETE' as any, tableName: 'repair_parts', module: 'Inventory', notes: `Deactivated ${ids.length} repair part(s)` });
      toast.success(`${ids.length} part(s) removed`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['repair-parts'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  const handleSingleDelete = async (id: string, name: string) => {
    try {
      const { error } = await supabase.from('repair_parts').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      logEvent({ action: 'DELETE' as any, tableName: 'repair_parts', recordId: id, module: 'Inventory', notes: `Deactivated part: ${name}` });
      toast.success(`${name} removed`);
      queryClient.invalidateQueries({ queryKey: ['repair-parts'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  const handleBulkCostUpdate = async () => {
    const newCost = parseFloat(bulkCostValue);
    if (isNaN(newCost) || newCost < 0) { toast.error('Enter a valid cost'); return; }
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from('repair_parts').update({ unit_cost: newCost }).in('id', ids);
      if (error) throw error;
      logEvent({ action: 'UPDATE' as any, tableName: 'repair_parts', module: 'Inventory', notes: `Bulk updated cost to $${newCost} for ${ids.length} part(s)` });
      toast.success(`${ids.length} part(s) cost updated to $${newCost.toFixed(2)}`);
      setSelectedIds(new Set());
      setBulkCostDialog(false);
      setBulkCostValue('');
      queryClient.invalidateQueries({ queryKey: ['repair-parts'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    }
  };

  const handleExport = () => {
    const items = selectedIds.size > 0 ? filtered.filter((p: any) => selectedIds.has(p.id)) : filtered;
    const headers = ['Name', 'SKU', 'Category', 'Unit Cost', 'Qty on Hand', 'Reorder Point', 'Supplier'];
    const rows = items.map((p: any) => [
      p.name, p.sku || '', p.category || '', p.unit_cost, p.quantity_on_hand, p.reorder_point, p.suppliers?.name || '',
    ]);
    const csv = [headers.join(','), ...rows.map((r: any) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `repair-parts-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${items.length} part(s) exported`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" /> Repair Parts Inventory
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search parts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-[200px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TableSkeleton columns={7} rows={5} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {canManage && (
                    <TableHead className="w-10">
                      <Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                    </TableHead>
                  )}
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Qty on Hand</TableHead>
                  <TableHead className="text-right">Reorder Point</TableHead>
                  {canManage && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManage ? 9 : 7} className="text-center text-muted-foreground py-8">
                      No repair parts found. Import parts via Purchase Orders to get started.
                    </TableCell>
                  </TableRow>
                ) : filtered.map((part: any) => (
                  <TableRow key={part.id} data-state={selectedIds.has(part.id) ? 'selected' : undefined}>
                    {canManage && (
                      <TableCell>
                        <Checkbox checked={selectedIds.has(part.id)} onCheckedChange={() => toggleSelection(part.id)} />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{part.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{part.sku || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-[10px]">{part.category?.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell className="text-right">${Number(part.unit_cost).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <span className="flex items-center justify-end gap-1">
                        {part.quantity_on_hand <= (part.reorder_point || 0) && (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        )}
                        {part.quantity_on_hand}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{part.reorder_point}</TableCell>
                    {canManage && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditPart(part); setShowAddDialog(true); }}>
                              <Edit2 className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setHistoryPart(part)}>
                              <History className="h-4 w-4 mr-2" /> View History
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => handleSingleDelete(part.id, part.name)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Batch action bar */}
            {selectedIds.size > 0 && canManage && (
              <div className="sticky bottom-4 z-50 flex items-center justify-between gap-3 rounded-lg border bg-background/95 backdrop-blur px-4 py-3 shadow-lg mx-auto max-w-2xl mt-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{selectedIds.size} selected</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedIds(new Set())}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleExport}>
                    <Download className="h-4 w-4 mr-1" /> Export
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setBulkCostDialog(true)}>
                    <DollarSign className="h-4 w-4 mr-1" /> Update Cost
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setBulkDeleteConfirm(true)}>
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Edit/Add Dialog */}
      <RepairPartDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        part={editPart}
        companyId={selectedCompany?.id || null}
        userId={user?.id}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['repair-parts'] });
          setShowAddDialog(false);
          setEditPart(null);
        }}
      />

      {/* Part History Dialog */}
      <RepairPartHistoryDialog
        open={!!historyPart}
        onOpenChange={(open) => !open && setHistoryPart(null)}
        part={historyPart}
      />

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Part(s)</AlertDialogTitle>
            <AlertDialogDescription>
              These parts will be deactivated and hidden from the inventory list. This can be reversed by re-importing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { handleBulkDelete(); setBulkDeleteConfirm(false); }}
            >Delete All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Cost Update Dialog */}
      <Dialog open={bulkCostDialog} onOpenChange={setBulkCostDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bulk Update Unit Cost</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Set the same unit cost for {selectedIds.size} selected part(s).
            </p>
            <div className="space-y-2">
              <Label>New Unit Cost ($)</Label>
              <Input type="number" step="0.01" value={bulkCostValue} onChange={(e) => setBulkCostValue(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkCostDialog(false)}>Cancel</Button>
            <Button onClick={handleBulkCostUpdate}>Update Cost</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ───────────── Part History Dialog ─────────────

function RepairPartHistoryDialog({ open, onOpenChange, part }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  part: any;
}) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['repair-part-history', part?.id],
    enabled: !!part?.id && open,
    queryFn: async () => {
      // Get device refurbishment usage
      const { data: usageItems } = await supabase
        .from('device_refurbishment_parts')
        .select('quantity_used, unit_cost, total_cost, created_at, devices(brand, model)')
        .eq('repair_part_id', part.id)
        .order('created_at', { ascending: false }) as any;

      // Get audit log entries for this part
      const { data: auditItems } = await supabase
        .from('audit_logs')
        .select('action, created_at, notes, new_data')
        .eq('table_name', 'repair_parts')
        .eq('record_id', part.id)
        .order('created_at', { ascending: false })
        .limit(50);

      const events: any[] = [];

      (auditItems || []).forEach((item: any) => {
        events.push({
          type: item.action === 'CREATE' ? 'received' : 'update',
          date: item.created_at,
          description: item.notes || item.action,
          quantity: null,
          unitCost: null,
        });
      });

      (usageItems || []).forEach((item: any) => {
        events.push({
          type: 'used',
          date: item.created_at || '',
          description: `Used on ${item.devices?.brand || ''} ${item.devices?.model || ''}`.trim(),
          quantity: -item.quantity_used,
          unitCost: item.unit_cost,
        });
      });

      events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return events;
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            History: {part?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No history found for this part.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((event: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground">
                      {event.date ? format(new Date(event.date), 'MMM d, yyyy') : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={event.type === 'used' ? 'secondary' : 'default'} className="text-[10px]">
                          {event.type === 'used' ? 'Used' : event.type === 'received' ? 'Received' : 'Updated'}
                        </Badge>
                        <span className="text-sm">{event.description}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {event.quantity != null ? (
                        <span className={event.quantity > 0 ? 'text-emerald-600' : 'text-destructive'}>
                          {event.quantity > 0 ? '+' : ''}{event.quantity}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {event.unitCost != null ? `$${Number(event.unitCost).toFixed(2)}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── Add/Edit Part Dialog ─────────────

function RepairPartDialog({ open, onOpenChange, part, companyId, userId, onSuccess }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  part: any;
  companyId: string | null;
  userId?: string;
  onSuccess: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', sku: '', description: '', category: 'general',
    unit_cost: '', quantity_on_hand: '', reorder_point: '5',
  });

  const handleOpenChange = (v: boolean) => {
    if (v && part) {
      setForm({
        name: part.name, sku: part.sku || '', description: part.description || '',
        category: part.category || 'general', unit_cost: String(part.unit_cost),
        quantity_on_hand: String(part.quantity_on_hand), reorder_point: String(part.reorder_point),
      });
    } else if (v) {
      setForm({ name: '', sku: '', description: '', category: 'general', unit_cost: '', quantity_on_hand: '', reorder_point: '5' });
    }
    onOpenChange(v);
  };

  const handleSave = async () => {
    if (!form.name || !form.unit_cost) {
      toast.error('Name and unit cost are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        sku: form.sku || null,
        description: form.description || null,
        category: form.category,
        unit_cost: parseFloat(form.unit_cost),
        quantity_on_hand: parseInt(form.quantity_on_hand) || 0,
        reorder_point: parseInt(form.reorder_point) || 5,
        company_id: companyId,
        created_by: userId,
      };

      if (part) {
        const { error } = await supabase.from('repair_parts').update(payload).eq('id', part.id);
        if (error) throw error;
        toast.success('Part updated');
      } else {
        const { error } = await supabase.from('repair_parts').insert(payload);
        if (error) throw error;
        toast.success('Part added');
      }
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save part');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{part ? 'Edit Repair Part' : 'Add Repair Part'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. iPhone 15 Screen" />
            </div>
            <div className="space-y-2">
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="e.g. PRT-SCR-IP15" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PART_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unit Cost ($) *</Label>
              <Input type="number" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantity on Hand</Label>
              <Input type="number" value={form.quantity_on_hand} onChange={(e) => setForm({ ...form, quantity_on_hand: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Reorder Point</Label>
              <Input type="number" value={form.reorder_point} onChange={(e) => setForm({ ...form, reorder_point: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
