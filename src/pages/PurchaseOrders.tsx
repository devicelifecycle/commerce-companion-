import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, Download, ClipboardList } from 'lucide-react';
import { useTableSelection } from '@/hooks/useTableSelection';
import { BatchActionBar } from '@/components/ui/batch-action-bar';
import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_name: string;
  po_date: string;
  status: string;
  payment_status: string;
  subtotal: number;
  gst_hst_amount: number;
  pst_qst_amount: number;
  total_amount: number;
  notes: string | null;
  expected_delivery_date: string | null;
}

export default function PurchaseOrders() {
  const { selectedCompany } = useCompany();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const filtered = orders.filter(o =>
    o.po_number.toLowerCase().includes(search.toLowerCase()) ||
    o.supplier_name.toLowerCase().includes(search.toLowerCase())
  );

  const { selectedIds, toggle, toggleAll, isAllSelected, clear, selectedItems } = useTableSelection(filtered);

  useEffect(() => {
    loadOrders();
  }, [selectedCompany?.id]);

  const loadOrders = async () => {
    setLoading(true);
    let query = supabase.from('purchase_orders').select('*').order('po_date', { ascending: false });
    if (selectedCompany?.id) query = query.eq('company_id', selectedCompany.id);
    const { data } = await query;
    if (data) setOrders(data as PurchaseOrder[]);
    setLoading(false);
  };

  const exportCsv = () => {
    const rows = selectedItems.length > 0 ? selectedItems : filtered;
    const csv = [
      ['PO #', 'Supplier', 'Date', 'Status', 'Payment', 'Total'].join(','),
      ...rows.map(o => [o.po_number, o.supplier_name, o.po_date, o.status, o.payment_status, o.total_amount].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'purchase-orders.csv'; a.click();
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'completed': case 'received': return 'default';
      case 'pending': return 'secondary';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Purchase Orders</h1>
            <p className="text-sm text-muted-foreground">Track and manage supplier purchase orders</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search PO # or supplier..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={isAllSelected} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead>PO #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Expected Delivery</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No purchase orders found</TableCell></TableRow>
                ) : filtered.map(o => (
                  <TableRow key={o.id}>
                    <TableCell><Checkbox checked={selectedIds.has(o.id)} onCheckedChange={() => toggle(o.id)} /></TableCell>
                    <TableCell className="font-medium">{o.po_number}</TableCell>
                    <TableCell>{o.supplier_name}</TableCell>
                    <TableCell>{format(new Date(o.po_date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{o.expected_delivery_date ? format(new Date(o.expected_delivery_date), 'MMM d, yyyy') : '—'}</TableCell>
                    <TableCell><Badge variant={statusColor(o.status)}>{o.status}</Badge></TableCell>
                    <TableCell><Badge variant={o.payment_status === 'paid' ? 'default' : 'secondary'}>{o.payment_status}</Badge></TableCell>
                    <TableCell className="text-right font-mono">${o.total_amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <BatchActionBar count={selectedIds.size} onClear={clear}
          actions={[
            { label: 'Export Selected', icon: <Download className="h-4 w-4" />, onClick: exportCsv },
          ]}
        />
      </div>
    </DashboardLayout>
  );
}
