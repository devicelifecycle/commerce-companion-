import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Search, Edit2, Trash2, Wrench, Loader2, AlertTriangle } from 'lucide-react';

interface CatalogEntry {
  id: string;
  name: string;
  normalized_key: string;
  category: string | null;
  compatible_devices: string | null;
  default_cost: number | null;
  sku_prefix: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

const PART_CATEGORIES = ['screen', 'battery', 'housing', 'camera', 'charging_port', 'speaker', 'button', 'connector', 'adhesive', 'general'];

const emptyForm = {
  name: '', category: 'general', compatible_devices: '',
  default_cost: '', sku_prefix: '', notes: '',
};

function normalizePartKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function RepairPartsCatalog() {
  const { isSuperAdmin } = useCompany();
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  useEffect(() => { fetchEntries(); }, []);

  const fetchEntries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('repair_parts_catalog' as any)
      .select('*')
      .order('name', { ascending: true });
    if (!error) setEntries((data as any) || []);
    setLoading(false);
  };

  // Duplicate check
  useEffect(() => {
    if (!form.name) { setDuplicateWarning(null); return; }
    const key = normalizePartKey(form.name);
    if (key.length < 4) { setDuplicateWarning(null); return; }
    const existing = entries.find(e => e.normalized_key === key && e.id !== editingId);
    if (existing) {
      setDuplicateWarning(`"${existing.name}" already exists with key: ${key}`);
    } else {
      // Fuzzy check
      const fuzzy = entries.find(e => {
        if (e.id === editingId) return false;
        const ek = e.normalized_key;
        return (key.length > 5 && ek.length > 5 && 
          (ek.includes(key.slice(0, 6)) || key.includes(ek.slice(0, 6))));
      });
      setDuplicateWarning(fuzzy
        ? `Similar part "${fuzzy.name}" exists — are you sure this is different?`
        : null);
    }
  }, [form.name, entries, editingId]);

  const handleOpenAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDuplicateWarning(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (entry: CatalogEntry) => {
    setForm({
      name: entry.name,
      category: entry.category || 'general',
      compatible_devices: entry.compatible_devices || '',
      default_cost: entry.default_cost?.toString() || '',
      sku_prefix: entry.sku_prefix || '',
      notes: entry.notes || '',
    });
    setEditingId(entry.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }

    const key = normalizePartKey(form.name);
    const exactDup = entries.find(e => e.normalized_key === key && e.id !== editingId);
    if (exactDup && !editingId) {
      toast.error('A part with this name already exists in the catalog');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        normalized_key: key,
        category: form.category,
        compatible_devices: form.compatible_devices || null,
        default_cost: form.default_cost ? parseFloat(form.default_cost) : null,
        sku_prefix: form.sku_prefix || null,
        notes: form.notes || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from('repair_parts_catalog' as any)
          .update(payload as any)
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Part updated');
      } else {
        const { error } = await supabase
          .from('repair_parts_catalog' as any)
          .insert(payload as any);
        if (error) {
          if (error.code === '23505') {
            toast.error('This part already exists in the catalog');
          } else throw error;
          return;
        }
        toast.success('Part added to catalog');
      }

      setDialogOpen(false);
      fetchEntries();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase
        .from('repair_parts_catalog' as any)
        .delete()
        .eq('id', deleteId);
      if (error) throw error;
      toast.success('Part removed from catalog');
      setDeleteId(null);
      fetchEntries();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  const filtered = entries.filter(e => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return e.name.toLowerCase().includes(s) ||
      (e.category && e.category.includes(s)) ||
      (e.sku_prefix && e.sku_prefix.toLowerCase().includes(s)) ||
      (e.compatible_devices && e.compatible_devices.toLowerCase().includes(s));
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Repair Parts Catalog
              </CardTitle>
              <CardDescription>
                Master list of approved repair parts. When creating POs with repair parts, users must select from this catalog to prevent naming inconsistencies and duplicates.
              </CardDescription>
            </div>
            {isSuperAdmin && (
              <Button onClick={handleOpenAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Add Part
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, category, or SKU prefix..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="secondary">{entries.length} parts</Badge>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wrench className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">
                {searchTerm ? 'No matching parts' : 'No parts in catalog yet'}
              </h3>
              <p className="text-muted-foreground text-sm mt-1">
                {searchTerm ? 'Try adjusting your search' : 'Add your first part to enforce naming consistency'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Compatible Devices</TableHead>
                    <TableHead>SKU Prefix</TableHead>
                    <TableHead className="text-right">Default Cost</TableHead>
                    {isSuperAdmin && <TableHead className="w-[100px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(entry => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{entry.name}</p>
                          <code className="text-[10px] text-muted-foreground">{entry.normalized_key}</code>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-[10px]">{entry.category?.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {entry.compatible_devices || '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.sku_prefix || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.default_cost != null && entry.default_cost > 0
                          ? `$${Number(entry.default_cost).toFixed(2)}`
                          : '—'}
                      </TableCell>
                      {isSuperAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(entry)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteId(entry.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit' : 'Add'} Catalog Part</DialogTitle>
            <DialogDescription>
              Define a canonical repair part. Users will select from this list when creating POs.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {form.name && (
              <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                Key: <code className="text-[10px]">{normalizePartKey(form.name)}</code>
              </div>
            )}

            {duplicateWarning && (
              <div className="rounded-md border border-[hsl(var(--warning))]/50 bg-[hsl(var(--warning))]/10 p-2 text-xs text-[hsl(var(--warning))] flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {duplicateWarning}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Part Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. iPhone 12 Rear Camera" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PART_CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c.replace('_', ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>SKU Prefix</Label>
                <Input value={form.sku_prefix} onChange={e => setForm(f => ({ ...f, sku_prefix: e.target.value }))} placeholder="PRT-CAM-IP12" className="font-mono text-sm" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Compatible Devices</Label>
              <Input value={form.compatible_devices} onChange={e => setForm(f => ({ ...f, compatible_devices: e.target.value }))} placeholder="e.g. iPhone 12, iPhone 12 Pro" />
            </div>

            <div className="space-y-1.5">
              <Label>Default Cost</Label>
              <Input type="number" value={form.default_cost} onChange={e => setForm(f => ({ ...f, default_cost: e.target.value }))} placeholder="0.00" />
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional details..." rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingId ? 'Save Changes' : 'Add to Catalog'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from catalog?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the part definition. Existing repair parts in inventory will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
