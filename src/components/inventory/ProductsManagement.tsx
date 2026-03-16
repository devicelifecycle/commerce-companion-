import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BatchActionBar, exportToCsv } from '@/components/ui/batch-action-bar';
import { useTableSelection } from '@/hooks/useTableSelection';
import { toast } from 'sonner';
import { Search, Plus, Trash2, Edit2, MoreHorizontal, Package, Download, Filter, Upload } from 'lucide-react';
import { ProductImportDialog } from './ProductImportDialog';

interface Product {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  unit_of_measure: string;
  cost_price: number;
  sale_price: number | null;
  quantity_on_hand: number;
  reorder_point: number;
  status: string;
  notes: string | null;
  company_id: string | null;
  category_id: string | null;
  supplier_id: string | null;
  created_at: string;
  product_categories?: { name: string } | null;
  suppliers?: { name: string } | null;
}

interface ProductCategory {
  id: string;
  name: string;
  company_id: string | null;
}

interface Supplier {
  id: string;
  name: string;
}

interface ProductsManagementProps {
  canManage: boolean;
}

const UNITS = ['unit', 'piece', 'box', 'case', 'kg', 'lb', 'oz', 'g', 'liter', 'bottle', 'pack', 'dozen'];

export function ProductsManagement({ canManage }: ProductsManagementProps) {
  const { user } = useAuth();
  const { selectedCompany, companies } = useCompany();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [form, setForm] = useState({
    name: '',
    description: '',
    sku: '',
    barcode: '',
    unit_of_measure: 'unit',
    cost_price: '',
    sale_price: '',
    quantity_on_hand: '',
    reorder_point: '0',
    category_id: '',
    supplier_id: '',
    notes: '',
  });

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchSuppliers();
  }, [selectedCompany]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('products')
        .select('*, product_categories(name), suppliers(name)')
        .order('created_at', { ascending: false });

      if (selectedCompany) query = query.eq('company_id', selectedCompany.id);

      const { data, error } = await query;
      if (error) throw error;
      setProducts((data || []) as Product[]);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    let query = supabase.from('product_categories').select('id, name, company_id').eq('is_active', true).order('name');
    if (selectedCompany) query = query.eq('company_id', selectedCompany.id);
    const { data } = await query;
    setCategories(data || []);
  };

  const fetchSuppliers = async () => {
    let query = supabase.from('suppliers').select('id, name').order('name');
    if (selectedCompany) query = query.eq('company_id', selectedCompany.id);
    const { data } = await query;
    setSuppliers(data || []);
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = !searchTerm.trim() ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCategory = categoryFilter === 'all' || p.category_id === categoryFilter;
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchSearch && matchCategory && matchStatus;
    });
  }, [products, searchTerm, categoryFilter, statusFilter]);

  const selection = useTableSelection(filteredProducts);

  const resetForm = () => {
    setForm({
      name: '', description: '', sku: '', barcode: '', unit_of_measure: 'unit',
      cost_price: '', sale_price: '', quantity_on_hand: '', reorder_point: '0',
      category_id: '', supplier_id: '', notes: '',
    });
    setEditingProduct(null);
    setNewCategoryName('');
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      description: product.description || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      unit_of_measure: product.unit_of_measure,
      cost_price: product.cost_price.toString(),
      sale_price: product.sale_price?.toString() || '',
      quantity_on_hand: product.quantity_on_hand.toString(),
      reorder_point: product.reorder_point.toString(),
      category_id: product.category_id || '',
      supplier_id: product.supplier_id || '',
      notes: product.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim() || !selectedCompany) return;
    try {
      const { data, error } = await supabase.from('product_categories').insert({
        company_id: selectedCompany.id,
        name: newCategoryName.trim(),
      }).select('id, name, company_id').single();
      if (error) throw error;
      setCategories(prev => [...prev, data as ProductCategory]);
      setForm(prev => ({ ...prev, category_id: data.id }));
      setNewCategoryName('');
      toast.success(`Category "${data.name}" created`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create category');
    }
  };

  const handleSave = async () => {
    if (!selectedCompany) { toast.error('Select a company'); return; }
    if (!form.name.trim()) { toast.error('Product name is required'); return; }
    if (!form.cost_price) { toast.error('Cost price is required'); return; }

    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      sku: form.sku || null,
      barcode: form.barcode || null,
      unit_of_measure: form.unit_of_measure,
      cost_price: parseFloat(form.cost_price),
      sale_price: form.sale_price ? parseFloat(form.sale_price) : null,
      quantity_on_hand: parseInt(form.quantity_on_hand) || 0,
      reorder_point: parseInt(form.reorder_point) || 0,
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      notes: form.notes || null,
      company_id: selectedCompany.id,
      created_by: user?.id,
    };

    try {
      if (editingProduct) {
        const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id);
        if (error) throw error;
        toast.success('Product updated');
      } else {
        const { error } = await supabase.from('products').insert(payload);
        if (error) throw error;
        toast.success('Product added to inventory');
      }
      setIsDialogOpen(false);
      resetForm();
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save product');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      toast.success('Product deleted');
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete product');
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selection.count} selected product(s)?`)) return;
    try {
      const { error } = await supabase.from('products').delete().in('id', Array.from(selection.selectedIds));
      if (error) throw error;
      toast.success(`${selection.count} product(s) deleted`);
      selection.clear();
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  const handleExport = () => {
    const items = selection.count > 0 ? selection.selectedItems : filteredProducts;
    const headers = ['Name', 'SKU', 'Barcode', 'Category', 'Unit', 'Qty', 'Cost', 'Sale Price', 'Reorder Point', 'Status', 'Supplier'];
    const rows = items.map(p => [
      p.name, p.sku || '', p.barcode || '', p.product_categories?.name || '', p.unit_of_measure,
      p.quantity_on_hand, p.cost_price, p.sale_price || '', p.reorder_point, p.status, p.suppliers?.name || '',
    ]);
    exportToCsv(headers, rows, `products-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  // Summary metrics
  const metrics = useMemo(() => {
    const active = products.filter(p => p.status === 'active');
    return {
      totalProducts: active.length,
      totalValue: active.reduce((s, p) => s + p.cost_price * p.quantity_on_hand, 0),
      totalUnits: active.reduce((s, p) => s + p.quantity_on_hand, 0),
      lowStock: active.filter(p => p.quantity_on_hand <= p.reorder_point && p.reorder_point > 0).length,
    };
  }, [products]);

  return (
    <>
      {/* Metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Products</p>
          <p className="text-xl font-bold">{metrics.totalProducts}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total Units</p>
          <p className="text-xl font-bold">{metrics.totalUnits.toLocaleString()}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Inventory Value</p>
          <p className="text-xl font-bold">{formatCurrency(metrics.totalValue)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Low Stock</p>
          <p className={`text-xl font-bold ${metrics.lowStock > 0 ? 'text-amber-600' : ''}`}>{metrics.lowStock}</p>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search products..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="discontinued">Discontinued</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => { resetForm(); setIsDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Add Product
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No products found</h3>
              <p className="text-muted-foreground">
                {searchTerm ? 'Try adjusting your search' : 'Add your first product to get started'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={selection.isAllSelected} onCheckedChange={selection.toggleAll} />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU / Barcode</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Sale Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Supplier</TableHead>
                  {canManage && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map(product => (
                  <TableRow key={product.id} data-state={selection.selectedIds.has(product.id) ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox checked={selection.selectedIds.has(product.id)} onCheckedChange={() => selection.toggle(product.id)} />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{product.name}</p>
                        {product.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{product.description}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      <div>
                        {product.sku && <span>{product.sku}</span>}
                        {product.barcode && <span className="text-xs text-muted-foreground block">{product.barcode}</span>}
                        {!product.sku && !product.barcode && '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {product.product_categories?.name ? (
                        <Badge variant="outline">{product.product_categories.name}</Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={product.reorder_point > 0 && product.quantity_on_hand <= product.reorder_point ? 'text-amber-600 font-medium' : ''}>
                        {product.quantity_on_hand}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">{product.unit_of_measure}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(product.cost_price)}</TableCell>
                    <TableCell className="text-right font-mono">{product.sale_price ? formatCurrency(product.sale_price) : '-'}</TableCell>
                    <TableCell>
                      <Badge variant={product.status === 'active' ? 'default' : 'secondary'} className="capitalize text-xs">
                        {product.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{product.suppliers?.name || '-'}</TableCell>
                    {canManage && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(product)}>
                              <Edit2 className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(product.id)}>
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
          )}
        </CardContent>
      </Card>

      {/* Batch Actions */}
      <BatchActionBar
        count={selection.count}
        onClear={selection.clear}
        actions={[
          { label: 'Export', icon: <Download className="h-4 w-4 mr-1" />, onClick: handleExport },
          ...(canManage ? [
            { label: 'Delete', icon: <Trash2 className="h-4 w-4 mr-1" />, onClick: handleBulkDelete, variant: 'destructive' as const },
          ] : []),
        ]}
      />

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(v) => { if (!v) resetForm(); setIsDialogOpen(v); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {editingProduct ? 'Edit Product' : 'Add Product'}
            </DialogTitle>
            <DialogDescription>
              {editingProduct ? 'Update product details' : 'Add a new product to your inventory'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Product Name *</Label>
              <Input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Protein Bar, HDMI Cable" />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Optional description" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>SKU</Label>
                <Input value={form.sku} onChange={e => setForm(prev => ({ ...prev, sku: e.target.value }))} placeholder="SKU-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Barcode / UPC</Label>
                <Input value={form.barcode} onChange={e => setForm(prev => ({ ...prev, barcode: e.target.value }))} placeholder="123456789" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category_id} onValueChange={v => setForm(prev => ({ ...prev, category_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {/* Inline add category */}
                <div className="flex gap-1 mt-1">
                  <Input
                    placeholder="New category..."
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    className="text-xs h-7"
                  />
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={handleCreateCategory} disabled={!newCategoryName.trim()}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Unit of Measure</Label>
                <Select value={form.unit_of_measure} onValueChange={v => setForm(prev => ({ ...prev, unit_of_measure: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Cost Price *</Label>
                <Input type="number" step="0.01" value={form.cost_price} onChange={e => setForm(prev => ({ ...prev, cost_price: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Sale Price</Label>
                <Input type="number" step="0.01" value={form.sale_price} onChange={e => setForm(prev => ({ ...prev, sale_price: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" min="0" value={form.quantity_on_hand} onChange={e => setForm(prev => ({ ...prev, quantity_on_hand: e.target.value }))} placeholder="0" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Reorder Point</Label>
                <Input type="number" min="0" value={form.reorder_point} onChange={e => setForm(prev => ({ ...prev, reorder_point: e.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Select value={form.supplier_id} onValueChange={v => setForm(prev => ({ ...prev, supplier_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Additional notes..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setIsDialogOpen(false); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.cost_price}>
              {editingProduct ? 'Save Changes' : 'Add Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
