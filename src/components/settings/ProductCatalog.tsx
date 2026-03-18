import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeBrand, normalizeModel, modelFuzzyKey } from '@/lib/modelNormalization';
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
import {
  Plus, Search, Edit2, Trash2, Barcode, Package, Loader2, AlertTriangle,
} from 'lucide-react';

interface CatalogEntry {
  id: string;
  brand: string;
  model: string;
  storage: string | null;
  color: string | null;
  category: string | null;
  upc: string | null;
  ean: string | null;
  internal_sku_prefix: string | null;
  normalized_key: string;
  default_cost_price: number | null;
  default_sale_price: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

const CATEGORIES = ['phone', 'laptop', 'tablet', 'accessory', 'smartwatch', 'other'];

const emptyForm = {
  brand: '', model: '', storage: '', color: '', category: 'phone',
  upc: '', ean: '', internal_sku_prefix: '', default_cost_price: '',
  default_sale_price: '', notes: '',
};

export function ProductCatalog() {
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
      .from('product_catalog' as any)
      .select('*')
      .order('brand', { ascending: true });
    if (!error) setEntries((data as any) || []);
    setLoading(false);
  };

  // Check for duplicates as user types
  useEffect(() => {
    if (!form.brand || !form.model) { setDuplicateWarning(null); return; }
    const key = modelFuzzyKey(normalizeBrand(form.brand), normalizeModel(form.model));
    const existing = entries.find(e => e.normalized_key === key && e.id !== editingId);
    setDuplicateWarning(existing
      ? `"${existing.brand} ${existing.model}" already exists in catalog with key: ${key}`
      : null);
  }, [form.brand, form.model, entries, editingId]);

  const handleOpenAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDuplicateWarning(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (entry: CatalogEntry) => {
    setForm({
      brand: entry.brand,
      model: entry.model,
      storage: entry.storage || '',
      color: entry.color || '',
      category: entry.category || 'phone',
      upc: entry.upc || '',
      ean: entry.ean || '',
      internal_sku_prefix: entry.internal_sku_prefix || '',
      default_cost_price: entry.default_cost_price?.toString() || '',
      default_sale_price: entry.default_sale_price?.toString() || '',
      notes: entry.notes || '',
    });
    setEditingId(entry.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.brand || !form.model) {
      toast.error('Brand and Model are required');
      return;
    }

    const normalizedBrand = normalizeBrand(form.brand);
    const normalizedModel = normalizeModel(form.model);
    const key = modelFuzzyKey(normalizedBrand, normalizedModel);

    // Block if duplicate exists (different from what we're editing)
    if (duplicateWarning && !editingId) {
      toast.error('A product with this brand/model combination already exists');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        brand: normalizedBrand,
        model: normalizedModel,
        storage: form.storage || null,
        color: form.color || null,
        category: form.category,
        upc: form.upc || null,
        ean: form.ean || null,
        internal_sku_prefix: form.internal_sku_prefix || null,
        normalized_key: key,
        default_cost_price: form.default_cost_price ? parseFloat(form.default_cost_price) : null,
        default_sale_price: form.default_sale_price ? parseFloat(form.default_sale_price) : null,
        notes: form.notes || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from('product_catalog' as any)
          .update(payload as any)
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Product updated');
      } else {
        const { error } = await supabase
          .from('product_catalog' as any)
          .insert(payload as any);
        if (error) {
          if (error.code === '23505') {
            toast.error('This product already exists in the catalog');
          } else {
            throw error;
          }
          return;
        }
        toast.success('Product added to catalog');
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
        .from('product_catalog' as any)
        .delete()
        .eq('id', deleteId);
      if (error) throw error;
      toast.success('Product removed from catalog');
      setDeleteId(null);
      fetchEntries();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  const filtered = entries.filter(e => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      e.brand.toLowerCase().includes(s) ||
      e.model.toLowerCase().includes(s) ||
      (e.upc && e.upc.includes(s)) ||
      (e.ean && e.ean.includes(s)) ||
      (e.internal_sku_prefix && e.internal_sku_prefix.toLowerCase().includes(s))
    );
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Barcode className="h-5 w-5" />
                SKU / UPC Product Catalog
              </CardTitle>
              <CardDescription>
                Master list of known products — prevents duplicate entries during imports and manual device adds.
                Brand and model names are auto-normalized.
              </CardDescription>
            </div>
            {isSuperAdmin && (
              <Button onClick={handleOpenAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by brand, model, UPC, or SKU prefix..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="secondary">{entries.length} products</Badge>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">
                {searchTerm ? 'No matching products' : 'No products in catalog yet'}
              </h3>
              <p className="text-muted-foreground text-sm mt-1">
                {searchTerm
                  ? 'Try adjusting your search'
                  : 'Add your first product to start preventing duplicates'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>UPC / EAN</TableHead>
                    <TableHead>SKU Prefix</TableHead>
                    <TableHead>Normalized Key</TableHead>
                    <TableHead className="text-right">Default Cost</TableHead>
                    {isSuperAdmin && <TableHead className="w-[100px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(entry => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{entry.brand} {entry.model}</p>
                          <p className="text-xs text-muted-foreground">
                            {[entry.storage, entry.color].filter(Boolean).join(' • ') || '-'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-[10px]">{entry.category}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.upc || entry.ean || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.internal_sku_prefix || '-'}
                      </TableCell>
                      <TableCell>
                        <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {entry.normalized_key}
                        </code>
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.default_cost_price
                          ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(entry.default_cost_price)
                          : '-'}
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
            <DialogTitle>{editingId ? 'Edit' : 'Add'} Catalog Product</DialogTitle>
            <DialogDescription>
              Define a canonical product entry. Brand and model will be auto-normalized.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Normalized preview */}
            {form.brand && form.model && (
              <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                Will be saved as: <span className="font-medium text-foreground">
                  {normalizeBrand(form.brand)} {normalizeModel(form.model)}
                </span>
                <br />
                Key: <code className="text-[10px]">{modelFuzzyKey(normalizeBrand(form.brand), normalizeModel(form.model))}</code>
              </div>
            )}

            {duplicateWarning && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {duplicateWarning}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Brand *</Label>
                <Input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="Apple" />
              </div>
              <div className="space-y-1.5">
                <Label>Model *</Label>
                <Input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="iPhone 15 Pro" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Storage</Label>
                <Input value={form.storage} onChange={e => setForm(f => ({ ...f, storage: e.target.value }))} placeholder="256GB" />
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <Input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} placeholder="Space Black" />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>UPC</Label>
                <Input value={form.upc} onChange={e => setForm(f => ({ ...f, upc: e.target.value }))} placeholder="012345678901" className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label>EAN</Label>
                <Input value={form.ean} onChange={e => setForm(f => ({ ...f, ean: e.target.value }))} placeholder="0012345678905" className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label>SKU Prefix</Label>
                <Input value={form.internal_sku_prefix} onChange={e => setForm(f => ({ ...f, internal_sku_prefix: e.target.value }))} placeholder="APL-IP15P" className="font-mono text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Default Cost Price</Label>
                <Input type="number" value={form.default_cost_price} onChange={e => setForm(f => ({ ...f, default_cost_price: e.target.value }))} placeholder="500.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Default Sale Price</Label>
                <Input type="number" value={form.default_sale_price} onChange={e => setForm(f => ({ ...f, default_sale_price: e.target.value }))} placeholder="699.00" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional details..." rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.brand || !form.model || !!duplicateWarning}>
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
              This removes the product definition. Existing devices referencing this product will not be affected.
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
