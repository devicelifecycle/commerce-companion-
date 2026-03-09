import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PermissionGuard } from '@/components/layout/PermissionGuard';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { GoodsReceivedGuide } from '@/components/guides/GoodsReceivedGuide';
import { useTableSelection } from '@/hooks/useTableSelection';
import { BatchActionBar } from '@/components/ui/batch-action-bar';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface GRN {
  id: string;
  grn_number: string;
  received_date: string;
  status: string;
  notes: string | null;
  supplier_id: string | null;
  purchase_order_id: string | null;
}

interface GRNItem {
  id: string;
  grn_id: string;
  quantity_received: number;
  condition_status: string | null;
  notes: string | null;
  device_id: string | null;
}

export default function GoodsReceived() {
  const { selectedCompany } = useCompany();
  const [grns, setGrns] = useState<GRN[]>([]);
  const [grnItems, setGrnItems] = useState<Record<string, GRNItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = grns.filter(g =>
    g.grn_number.toLowerCase().includes(search.toLowerCase())
  );

  const { selectedIds, toggle, toggleAll, isAllSelected, clear, selectedItems } = useTableSelection(filtered);

  useEffect(() => {
    loadGrns();
  }, [selectedCompany?.id]);

  const loadGrns = async () => {
    setLoading(true);
    let query = supabase.from('goods_received_notes').select('*').order('received_date', { ascending: false });
    if (selectedCompany?.id) query = query.eq('company_id', selectedCompany.id);
    const { data } = await query;
    if (data) setGrns(data as GRN[]);
    setLoading(false);
  };

  const loadItems = async (grnId: string) => {
    if (grnItems[grnId]) return;
    const { data } = await supabase.from('grn_items').select('*').eq('grn_id', grnId);
    if (data) setGrnItems(prev => ({ ...prev, [grnId]: data as GRNItem[] }));
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadItems(id);
    }
  };

  const exportCsv = () => {
    const rows = selectedItems.length > 0 ? selectedItems : filtered;
    const csv = [
      ['GRN #', 'Date', 'Status'].join(','),
      ...rows.map(g => [g.grn_number, g.received_date, g.status].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'goods-received.csv'; a.click();
  };

  return (
    <PermissionGuard permission="inventory_view" title="Goods Received Notes">
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Goods Received Notes</h1>
          <p className="text-sm text-muted-foreground">Track received shipments and inspect items</p>
        </div>

        <GoodsReceivedGuide />

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search GRN #..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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
                  <TableHead className="w-10" />
                  <TableHead>GRN #</TableHead>
                  <TableHead>Received Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No GRNs found</TableCell></TableRow>
                ) : filtered.map(g => (
                  <Collapsible key={g.id} asChild open={expandedId === g.id} onOpenChange={() => toggleExpand(g.id)}>
                    <>
                      <TableRow className="cursor-pointer hover:bg-muted/50">
                        <TableCell><Checkbox checked={selectedIds.has(g.id)} onCheckedChange={() => toggle(g.id)} /></TableCell>
                        <TableCell>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              {expandedId === g.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </CollapsibleTrigger>
                        </TableCell>
                        <TableCell className="font-medium">{g.grn_number}</TableCell>
                        <TableCell>{format(new Date(g.received_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell><Badge variant={g.status === 'completed' ? 'default' : 'secondary'} className="capitalize">{g.status}</Badge></TableCell>
                        <TableCell className="text-muted-foreground text-sm truncate max-w-[200px]">{g.notes || '—'}</TableCell>
                      </TableRow>
                      <CollapsibleContent asChild>
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={6} className="p-4">
                            <div className="text-sm font-medium mb-2">Received Items</div>
                            {!grnItems[g.id] ? (
                              <p className="text-muted-foreground text-sm">Loading items...</p>
                            ) : grnItems[g.id].length === 0 ? (
                              <p className="text-muted-foreground text-sm">No items recorded</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Qty</TableHead>
                                    <TableHead>Condition</TableHead>
                                    <TableHead>Notes</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {grnItems[g.id].map(item => (
                                    <TableRow key={item.id}>
                                      <TableCell>{item.quantity_received}</TableCell>
                                      <TableCell>
                                        <Badge variant={item.condition_status === 'passed' ? 'default' : 'destructive'}>
                                          {item.condition_status || 'N/A'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-muted-foreground">{item.notes || '—'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <BatchActionBar count={selectedIds.size} onClear={clear}
          actions={[{ label: 'Export Selected', icon: <Download className="h-4 w-4" />, onClick: exportCsv }]}
        />
      </div>
    </DashboardLayout>
    </PermissionGuard>
  );
}
