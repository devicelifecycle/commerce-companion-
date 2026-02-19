import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Building, Search, Edit2, Trash2 } from 'lucide-react';

interface Vendor {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  category: string | null;
  total_spent: number;
}

export function VendorManagement() {
  const { selectedCompany } = useCompany();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    contact_name: '',
    email: '',
    phone: '',
    category: '',
  });

  useEffect(() => {
    fetchVendors();
  }, [selectedCompany]);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('vendors')
        .select('*')
        .order('name');
      
      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data: vendorsData, error } = await query;

      if (error) throw error;

      // Calculate total spent per vendor from expenses
      const { data: expenseData } = await supabase
        .from('expenses')
        .select('vendor, amount, gst_hst_amount, pst_amount')
        .not('vendor', 'is', null);

      const vendorTotals: Record<string, number> = {};
      (expenseData || []).forEach((e: any) => {
        if (e.vendor) {
          const total = (e.amount || 0) + (e.gst_hst_amount || 0) + (e.pst_amount || 0);
          vendorTotals[e.vendor.toLowerCase()] = (vendorTotals[e.vendor.toLowerCase()] || 0) + total;
        }
      });

      const enrichedVendors = (vendorsData || []).map(v => ({
        ...v,
        total_spent: vendorTotals[v.name.toLowerCase()] || v.total_spent || 0,
      }));

      setVendors(enrichedVendors as Vendor[]);
    } catch (error) {
      console.error('Error fetching vendors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Vendor name is required');
      return;
    }

    try {
      if (editingVendor) {
        const { error } = await supabase
          .from('vendors')
          .update({
            name: formData.name,
            contact_name: formData.contact_name || null,
            email: formData.email || null,
            phone: formData.phone || null,
            category: formData.category || null,
          })
          .eq('id', editingVendor.id);

        if (error) throw error;
        toast.success('Vendor updated');
      } else {
        const { error } = await supabase.from('vendors').insert({
          name: formData.name,
          contact_name: formData.contact_name || null,
          email: formData.email || null,
          phone: formData.phone || null,
          category: formData.category || null,
          company_id: selectedCompany?.id || null,
        });

        if (error) throw error;
        toast.success('Vendor added');
      }

      setDialogOpen(false);
      resetForm();
      fetchVendors();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save vendor');
    }
  };

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name,
      contact_name: vendor.contact_name || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      category: vendor.category || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this vendor?')) return;
    try {
      const { error } = await supabase.from('vendors').delete().eq('id', id);
      if (error) throw error;
      toast.success('Vendor deleted');
      fetchVendors();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete vendor');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', contact_name: '', email: '', phone: '', category: '' });
    setEditingVendor(null);
  };

  const filteredVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.contact_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Vendor
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Vendors ({filteredVendors.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredVendors.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No vendors found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Total Spent</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVendors.map((vendor) => (
                  <TableRow key={vendor.id}>
                    <TableCell className="font-medium">{vendor.name}</TableCell>
                    <TableCell>{vendor.contact_name || '-'}</TableCell>
                    <TableCell>{vendor.email || '-'}</TableCell>
                    <TableCell className="capitalize">{vendor.category || '-'}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(vendor.total_spent)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(vendor)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(vendor.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Vendor name"
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                placeholder="Contact person"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Phone number"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Supplies, Services"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{editingVendor ? 'Update' : 'Add'} Vendor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
