import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PermissionGuard } from '@/components/layout/PermissionGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Users, Plus, Search, Edit2, Trash2, Mail, DollarSign, X, Calendar } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { useTableSelection } from '@/hooks/useTableSelection';
import { BatchActionBar } from '@/components/ui/batch-action-bar';

const CHANNELS = ['Shopify', 'Amazon', 'Walmart', 'BestBuy', 'Temu', 'eBay', 'In-Store', 'Other'] as const;

const PROVINCES = [
  { code: 'AB', name: 'Alberta' },
  { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' },
  { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' },
  { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
];

const CHANNEL_COLORS: Record<string, string> = {
  shopify: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  amazon: 'bg-orange-500/15 text-orange-700 border-orange-500/30',
  walmart: 'bg-indigo-500/15 text-indigo-700 border-indigo-500/30',
  bestbuy: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  temu: 'bg-red-500/15 text-red-700 border-red-500/30',
  ebay: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30',
  'in-store': 'bg-muted text-muted-foreground border-border',
  other: 'bg-secondary text-secondary-foreground border-border',
  manual: 'bg-secondary text-secondary-foreground border-border',
  invoice: 'bg-violet-500/15 text-violet-700 border-violet-500/30',
};

function getChannelBadge(channel: string | null, source: string | null) {
  const label = channel || source || 'Manual';
  const key = label.toLowerCase().replace(/\s/g, '-');
  const colors = CHANNEL_COLORS[key] || CHANNEL_COLORS.other;
  return (
    <Badge variant="outline" className={`text-[10px] font-medium ${colors}`}>
      {label.charAt(0).toUpperCase() + label.slice(1).replace(/bestbuy/i, 'Best Buy')}
    </Badge>
  );
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  street_address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  channel: string | null;
  notes: string | null;
  marketplace_source: string | null;
  total_purchases: number | null;
  total_spent: number | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SaleRecord {
  id: string;
  order_number: string | null;
  sale_date: string;
  marketplace: string | null;
  product_title: string | null;
  sale_price: number;
  status: string | null;
}

export default function Customers() {
  const { selectedCompany } = useCompany();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  // Detail panel
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<SaleRecord[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    street_address: '',
    city: '',
    province: '',
    postal_code: '',
    country: 'Canada',
    channel: '',
    notes: '',
  });

  useEffect(() => {
    fetchCustomers();
  }, [selectedCompany]);

  const fetchCustomers = async () => {
    setLoading(true);
    let q = supabase
      .from('customers')
      .select('*')
      .order('name');
    if (selectedCompany) q = q.eq('company_id', selectedCompany.id);
    const { data, error } = await q;
    if (error) {
      toast.error('Failed to load customers');
    } else {
      setCustomers((data || []) as Customer[]);
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return customers.filter(c => {
      const matchSearch = !search.trim() ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.toLowerCase().includes(search.toLowerCase());
      const matchSource = sourceFilter === 'all' ||
        (sourceFilter === 'manual' ? (!c.channel && !c.marketplace_source) :
          (c.channel?.toLowerCase() === sourceFilter.toLowerCase() ||
            c.marketplace_source?.toLowerCase() === sourceFilter.toLowerCase()));
      return matchSearch && matchSource;
    });
  }, [customers, search, sourceFilter]);

  const selection = useTableSelection(filtered);

  const stats = useMemo(() => ({
    total: customers.length,
    withEmail: customers.filter(c => c.email).length,
    totalSpent: customers.reduce((sum, c) => sum + (c.total_spent || 0), 0),
  }), [customers]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', street_address: '', city: '', province: '', postal_code: '', country: 'Canada', channel: '', notes: '' });
    setDialogOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name,
      email: c.email || '',
      phone: c.phone || '',
      street_address: c.street_address || '',
      city: c.city || '',
      province: c.province || '',
      postal_code: c.postal_code || '',
      country: c.country || 'Canada',
      channel: c.channel || '',
      notes: c.notes || '',
    });
    setDialogOpen(true);
  };

  const composeAddress = () => {
    return [form.street_address, form.city, form.province, form.postal_code, form.country]
      .filter(Boolean).join(', ') || null;
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      street_address: form.street_address.trim() || null,
      city: form.city.trim() || null,
      province: form.province || null,
      postal_code: form.postal_code.trim() || null,
      country: form.country || 'Canada',
      channel: form.channel || null,
      address: composeAddress(),
      notes: form.notes.trim() || null,
      company_id: selectedCompany?.id || null,
    };

    if (editing) {
      const { error } = await supabase.from('customers').update(payload as any).eq('id', editing.id);
      if (error) { toast.error('Failed to update customer'); return; }
      toast.success('Customer updated');
    } else {
      const { error } = await supabase.from('customers').insert(payload as any);
      if (error) { toast.error('Failed to create customer'); return; }
      toast.success('Customer created');
    }

    setDialogOpen(false);
    fetchCustomers();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from('customers').delete().eq('id', deleting.id);
    if (error) { toast.error('Failed to delete customer'); return; }
    toast.success('Customer deleted');
    setDeleting(null);
    fetchCustomers();
  };

  const handleBulkDelete = async () => {
    const ids = [...selection.selectedIds];
    const { error } = await supabase.from('customers').delete().in('id', ids);
    if (error) { toast.error('Failed to delete customers'); return; }
    toast.success(`${ids.length} customer(s) deleted`);
    selection.clear();
    fetchCustomers();
  };

  const openDetail = async (c: Customer) => {
    setDetailCustomer(c);
    setOrdersLoading(true);
    const { data } = await supabase
      .from('sales')
      .select('id, order_number, sale_date, marketplace, product_title, sale_price, status')
      .eq('customer_id', c.id)
      .order('sale_date', { ascending: false })
      .limit(50);
    setOrders((data || []) as SaleRecord[]);
    setOrdersLoading(false);
  };

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  return (
    <PermissionGuard permission="invoices_view" title="Customers">
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold">Customer Directory</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Manage your customer contacts and view purchase history
              </p>
            </div>
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 mr-1.5" /> Add Customer
            </Button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Users className="h-3.5 w-3.5" /> Total Customers
                </div>
                <p className="text-2xl font-bold">{stats.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Mail className="h-3.5 w-3.5" /> With Email
                </div>
                <p className="text-2xl font-bold">{stats.withEmail}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <DollarSign className="h-3.5 w-3.5" /> Lifetime Revenue
                </div>
                <p className="text-2xl font-bold">{fmtCurrency(stats.totalSpent)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Search & Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3 flex-1">
                <CardTitle className="text-base">All Customers</CardTitle>
                <div className="flex-1" />
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue placeholder="Channel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Channels</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                    {CHANNELS.map(ch => (
                      <SelectItem key={ch} value={ch.toLowerCase()}>{ch}</SelectItem>
                    ))}
                    <SelectItem value="invoice">Invoice</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-9 text-sm"
                    placeholder="Search name, email, phone…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                {(sourceFilter !== 'all' || search) && (
                  <Button variant="ghost" size="sm" onClick={() => { setSourceFilter('all'); setSearch(''); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  {search ? 'No customers match your search.' : 'No customers yet. Add one to get started.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={selection.isAllSelected}
                            onCheckedChange={() => selection.toggleAll()}
                            aria-label="Select all"
                          />
                        </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Added</TableHead>
                        <TableHead className="text-right">Total Spent</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(c => (
                        <TableRow key={c.id} data-state={selection.selectedIds.has(c.id) ? 'selected' : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={selection.selectedIds.has(c.id)}
                              onCheckedChange={() => selection.toggle(c.id)}
                              aria-label={`Select ${c.name}`}
                            />
                          </TableCell>
                          <TableCell>
                            <button
                              type="button"
                              className="font-medium text-sm text-primary hover:underline text-left"
                              onClick={() => openDetail(c)}
                            >
                              {c.name}
                            </button>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{c.email || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{c.phone || '—'}</TableCell>
                          <TableCell>{getChannelBadge(c.channel, c.marketplace_source)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(c.created_at), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="text-right text-sm">{fmtCurrency(c.total_spent || 0)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleting(c)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Batch Action Bar */}
          <BatchActionBar
            count={selection.count}
            onClear={selection.clear}
            actions={[
              {
                label: 'Delete',
                icon: <Trash2 className="h-4 w-4 mr-1.5" />,
                variant: 'destructive',
                onClick: handleBulkDelete,
              },
            ]}
          />
        </div>

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">Name *</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Customer name" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
                </div>
              </div>

              {/* Channel */}
              <div className="space-y-1.5">
                <Label className="text-xs">Channel</Label>
                <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map(ch => (
                      <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Structured Address */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold">Address</Label>
                <div className="space-y-1.5">
                  <Input value={form.street_address} onChange={e => setForm(f => ({ ...f, street_address: e.target.value }))} placeholder="Street address" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">City</Label>
                    <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="City" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Province</Label>
                    <Select value={form.province} onValueChange={v => setForm(f => ({ ...f, province: v }))}>
                      <SelectTrigger><SelectValue placeholder="Province" /></SelectTrigger>
                      <SelectContent>
                        {PROVINCES.map(p => (
                          <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Postal Code</Label>
                    <Input value={form.postal_code} onChange={e => setForm(f => ({ ...f, postal_code: e.target.value.toUpperCase() }))} placeholder="A1A 1A1" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Country</Label>
                    <Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="Canada" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes" rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>{editing ? 'Save Changes' : 'Add Customer'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <Dialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Customer</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <strong>{deleting?.name}</strong>? This cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Customer Detail Sheet */}
        <Sheet open={!!detailCustomer} onOpenChange={open => { if (!open) setDetailCustomer(null); }}>
          <SheetContent className="sm:max-w-lg overflow-y-auto">
            {detailCustomer && (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    {detailCustomer.name}
                    {getChannelBadge(detailCustomer.channel, detailCustomer.marketplace_source)}
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-4">
                  {/* Contact Info */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {detailCustomer.email && (
                      <div>
                        <p className="text-muted-foreground text-xs">Email</p>
                        <p>{detailCustomer.email}</p>
                      </div>
                    )}
                    {detailCustomer.phone && (
                      <div>
                        <p className="text-muted-foreground text-xs">Phone</p>
                        <p>{detailCustomer.phone}</p>
                      </div>
                    )}
                  </div>
                  {/* Address */}
                  {(detailCustomer.street_address || detailCustomer.city) && (
                    <div className="text-sm">
                      <p className="text-muted-foreground text-xs mb-0.5">Address</p>
                      <p>
                        {[detailCustomer.street_address, detailCustomer.city, detailCustomer.province, detailCustomer.postal_code, detailCustomer.country]
                          .filter(Boolean).join(', ')}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    Customer since {format(new Date(detailCustomer.created_at), 'MMMM d, yyyy')}
                  </div>

                  {/* Order History */}
                  <div className="pt-3 border-t">
                    <h3 className="text-sm font-semibold mb-2">Order History</h3>
                    {ordersLoading ? (
                      <div className="flex justify-center py-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                      </div>
                    ) : orders.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No orders found for this customer.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Order</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Channel</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orders.map(o => (
                            <TableRow key={o.id}>
                              <TableCell className="text-sm font-medium">{o.order_number || '—'}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(o.sale_date), 'MMM d, yyyy')}
                              </TableCell>
                              <TableCell>{getChannelBadge(null, o.marketplace)}</TableCell>
                              <TableCell className="text-right text-sm">{fmtCurrency(o.sale_price)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </DashboardLayout>
    </PermissionGuard>
  );
}
