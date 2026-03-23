import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { toast } from 'sonner';
import { Plus, Search, Package, AlertTriangle } from 'lucide-react';

interface RepairPartsManagementProps {
  canManage: boolean;
}

const PART_CATEGORIES = ['screen', 'battery', 'housing', 'camera', 'charging_port', 'speaker', 'button', 'connector', 'adhesive', 'general'];

export function RepairPartsManagement({ canManage }: RepairPartsManagementProps) {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editPart, setEditPart] = useState<any>(null);

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
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TableSkeleton columns={6} rows={5} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Qty on Hand</TableHead>
                <TableHead className="text-right">Reorder Point</TableHead>
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No repair parts found. Add your first part to get started.
                  </TableCell>
                </TableRow>
              ) : filtered.map((part: any) => (
                <TableRow key={part.id}>
                  <TableCell className="font-medium">{part.name}</TableCell>
                  <TableCell className="text-muted-foreground">{part.sku || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{part.category?.replace('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell className="text-right">${Number(part.unit_cost).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <span className="flex items-center justify-end gap-1">
                      {part.quantity_on_hand <= part.reorder_point && (
                        <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))]" />
                      )}
                      {part.quantity_on_hand}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{part.reorder_point}</TableCell>
                  {canManage && (
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => { setEditPart(part); setShowAddDialog(true); }}>
                        Edit
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

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
    </Card>
  );
}

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

  // Reset form when dialog opens
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
