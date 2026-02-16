import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { FileText, Package, ClipboardCheck } from 'lucide-react';
import { format } from 'date-fns';

interface DeviceProcurementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceId: string;
  deviceLabel: string;
}

interface POData {
  id: string;
  po_number: string;
  po_date: string;
  supplier_name: string;
  status: string;
  payment_status: string;
  subtotal: number;
  gst_hst_amount: number;
  pst_qst_amount: number;
  total_amount: number;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unit_cost: number;
    gst_hst_amount: number;
    pst_qst_amount: number;
    total_cost: number;
  }>;
}

interface GRNData {
  id: string;
  grn_number: string;
  received_date: string;
  status: string;
  notes: string | null;
  items: Array<{
    id: string;
    quantity_received: number;
    condition_status: string;
    notes: string | null;
  }>;
}

export function DeviceProcurementDialog({ open, onOpenChange, deviceId, deviceLabel }: DeviceProcurementDialogProps) {
  const [pos, setPOs] = useState<POData[]>([]);
  const [grns, setGRNs] = useState<GRNData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && deviceId) {
      fetchProcurementData();
    }
  }, [open, deviceId]);

  const fetchProcurementData = async () => {
    setLoading(true);
    try {
      // Find PO items linked to this device
      const { data: poItems } = await supabase
        .from('purchase_order_items')
        .select('*, purchase_orders (*)')
        .eq('device_id', deviceId);

      // Group by PO
      const poMap = new Map<string, POData>();
      for (const item of poItems || []) {
        const po = (item as any).purchase_orders;
        if (!po) continue;
        if (!poMap.has(po.id)) {
          poMap.set(po.id, {
            id: po.id,
            po_number: po.po_number,
            po_date: po.po_date,
            supplier_name: po.supplier_name,
            status: po.status,
            payment_status: po.payment_status,
            subtotal: po.subtotal,
            gst_hst_amount: po.gst_hst_amount,
            pst_qst_amount: po.pst_qst_amount,
            total_amount: po.total_amount,
            items: [],
          });
        }
        poMap.get(po.id)!.items.push({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          gst_hst_amount: item.gst_hst_amount || 0,
          pst_qst_amount: item.pst_qst_amount || 0,
          total_cost: item.total_cost,
        });
      }
      setPOs(Array.from(poMap.values()));

      // Find GRN items linked to this device
      const { data: grnItems } = await supabase
        .from('grn_items')
        .select('*, goods_received_notes (*)')
        .eq('device_id', deviceId);

      const grnMap = new Map<string, GRNData>();
      for (const item of grnItems || []) {
        const grn = (item as any).goods_received_notes;
        if (!grn) continue;
        if (!grnMap.has(grn.id)) {
          grnMap.set(grn.id, {
            id: grn.id,
            grn_number: grn.grn_number,
            received_date: grn.received_date,
            status: grn.status,
            notes: grn.notes,
            items: [],
          });
        }
        grnMap.get(grn.id)!.items.push({
          id: item.id,
          quantity_received: item.quantity_received,
          condition_status: item.condition_status || 'passed',
          notes: item.notes,
        });
      }
      setGRNs(Array.from(grnMap.values()));
    } catch (error) {
      console.error('Error fetching procurement data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-amber-500', received: 'bg-emerald-500', completed: 'bg-emerald-500',
      paid: 'bg-emerald-500', unpaid: 'bg-blue-500', partial: 'bg-amber-500',
      passed: 'bg-emerald-500', damaged: 'bg-destructive', rejected: 'bg-destructive',
    };
    return map[status] || 'bg-muted';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Procurement Details — {deviceLabel}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : pos.length === 0 && grns.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            No purchase orders or goods received notes linked to this device.
          </p>
        ) : (
          <div className="space-y-6">
            {/* Purchase Orders */}
            {pos.map(po => (
              <Card key={po.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      {po.po_number}
                    </CardTitle>
                    <div className="flex gap-2">
                      <Badge className={`${statusColor(po.status)} text-white capitalize`}>
                        {po.status}
                      </Badge>
                      <Badge className={`${statusColor(po.payment_status)} text-white capitalize`}>
                        {po.payment_status}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Supplier: {po.supplier_name} • Date: {format(new Date(po.po_date), 'MMM d, yyyy')}
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-right">GST/HST</TableHead>
                        <TableHead className="text-right">PST/QST</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {po.items.map(item => (
                        <TableRow key={item.id}>
                          <TableCell>{item.description}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.unit_cost)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.gst_hst_amount)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.pst_qst_amount)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.total_cost)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-medium">
                        <TableCell colSpan={5}>PO Total</TableCell>
                        <TableCell className="text-right">{formatCurrency(po.total_amount)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}

            {pos.length > 0 && grns.length > 0 && <Separator />}

            {/* GRNs */}
            {grns.map(grn => (
              <Card key={grn.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4" />
                      {grn.grn_number}
                    </CardTitle>
                    <Badge className={`${statusColor(grn.status)} text-white capitalize`}>
                      {grn.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Received: {format(new Date(grn.received_date), 'MMM d, yyyy')}
                    {grn.notes && ` • ${grn.notes}`}
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Qty Received</TableHead>
                        <TableHead>Condition</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grn.items.map(item => (
                        <TableRow key={item.id}>
                          <TableCell>{item.quantity_received}</TableCell>
                          <TableCell>
                            <Badge className={`${statusColor(item.condition_status)} text-white capitalize`}>
                              {item.condition_status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{item.notes || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
