import { supabase } from '@/integrations/supabase/client';
import { useAuditLog } from '@/hooks/useAuditLog';
import { checkDeviceDeletable, reverseJournalEntries } from '@/lib/accounting/reversalUtils';
import { StatusBadge, ConditionBadge } from '@/components/ui/status-badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  MoreHorizontal, Edit2, QrCode, FileText, Clock, ArrowRightLeft,
  Send, Trash2, Smartphone, Wrench,
} from 'lucide-react';
import { useState } from 'react';

type DeviceStatus = 'in_stock' | 'reserved' | 'sold' | 'returned' | 'hold_for_refurbishment';

interface Device {
  id: string;
  imei: string | null;
  sku: string | null;
  category: string;
  model: string;
  brand: string;
  storage: string | null;
  color: string | null;
  condition: string;
  status: string;
  cost_price: number;
  sale_price: number | null;
  supplier_id: string | null;
  purchase_date: string | null;
  warehouse_location: string | null;
  notes: string | null;
  company_id: string | null;
  created_at: string;
  fulfillment_channel: string | null;
  suppliers?: { name: string } | null;
}

interface Company {
  id: string;
  code: string;
  name: string;
}

interface DeviceTableProps {
  devices: Device[];
  companies: Company[];
  selectedCompany: Company | null;
  canManage: boolean;
  isSuperAdmin: boolean;
  selection: {
    selectedIds: Set<string>;
    isAllSelected: boolean;
    toggle: (id: string) => void;
    toggleAll: () => void;
  };
  onEdit: (device: Device) => void;
  onLabel: (device: Device) => void;
  onProcurement: (device: { id: string; label: string }) => void;
  onTimeline: (device: Device) => void;
  onTransfer: (device: Device) => void;
  onRepair?: (device: Device) => void;
  onRefresh: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

export function DeviceTable({
  devices, companies, selectedCompany, canManage, isSuperAdmin,
  selection, onEdit, onLabel, onProcurement, onTimeline, onTransfer, onRepair, onRefresh,
}: DeviceTableProps) {
  const { logEvent } = useAuditLog();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const handleDeleteDevice = async (id: string) => {
    try {
      const { canDelete, reason } = await checkDeviceDeletable(id);
      if (!canDelete) {
        toast.error(reason);
        return;
      }
      // Clean up any linked journal entries (e.g. from repairs)
      await reverseJournalEntries(id);
      // Clean up repair records
      const { data: repairs } = await supabase.from('device_repairs').select('id').eq('device_id', id);
      if (repairs && repairs.length > 0) {
        const repairIds = repairs.map(r => r.id);
        await supabase.from('repair_items').delete().in('repair_id', repairIds);
        await supabase.from('device_repairs').delete().in('id', repairIds);
      }
      // Clean up transfers
      await supabase.from('inventory_transfers').delete().eq('device_id', id);
      const { error } = await supabase.from('devices').delete().eq('id', id);
      if (error) throw error;
      logEvent({ action: 'DELETE' as any, tableName: 'devices', recordId: id, module: 'Inventory', notes: 'Device deleted with full cleanup' });
      toast.success('Device deleted');
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete device');
    }
  };

  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Smartphone className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No devices found</h3>
        <p className="text-muted-foreground">Try adjusting your filters or search</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={selection.isAllSelected}
                  onCheckedChange={selection.toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Device</TableHead>
              <TableHead>IMEI/SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              {!selectedCompany && <TableHead>Company</TableHead>}
              {canManage && <TableHead className="w-[50px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map((device) => {
              const company = companies.find(c => c.id === device.company_id);
              return (
                <TableRow
                  key={device.id}
                  data-state={selection.selectedIds.has(device.id) ? 'selected' : undefined}
                  className="cursor-pointer"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button, [role="checkbox"], [role="menuitem"]')) return;
                    onTimeline(device);
                  }}
                >
                  <TableCell>
                    <Checkbox
                      checked={selection.selectedIds.has(device.id)}
                      onCheckedChange={() => selection.toggle(device.id)}
                      aria-label={`Select ${device.brand} ${device.model}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{device.brand} {device.model}</p>
                      <p className="text-sm text-muted-foreground">
                        {[device.storage, device.color].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {device.imei || device.sku || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{device.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <ConditionBadge condition={device.condition as any} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={device.status as any} />
                  </TableCell>
                  <TableCell>
                    {device.fulfillment_channel === 'fba' ? (
                      <Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30 text-[10px]">FBA</Badge>
                    ) : device.fulfillment_channel === 'in_transit_fba' ? (
                      <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-[10px]">In Transit</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Local</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(device.cost_price)}
                  </TableCell>
                  {!selectedCompany && (
                    <TableCell>
                      <Badge variant="secondary">{company?.code || '-'}</Badge>
                    </TableCell>
                  )}
                  {canManage && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(device)}>
                            <Edit2 className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onLabel(device)}>
                            <QrCode className="h-4 w-4 mr-2" /> Print Label
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onProcurement({ id: device.id, label: `${device.brand} ${device.model}` })}>
                            <FileText className="h-4 w-4 mr-2" /> View PO / GRN
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onTimeline(device)}>
                            <Clock className="h-4 w-4 mr-2" /> View Timeline
                          </DropdownMenuItem>
                          {onRepair && (device.status === 'in_stock' || device.status === 'hold_for_refurbishment') && (
                            <DropdownMenuItem onClick={() => onRepair(device)}>
                              <Wrench className="h-4 w-4 mr-2" /> Repair
                            </DropdownMenuItem>
                          )}
                          {device.status === 'in_stock' && (
                            <>
                              {isSuperAdmin && (
                                <DropdownMenuItem onClick={() => onTransfer(device)}>
                                  <ArrowRightLeft className="h-4 w-4 mr-2" /> Transfer
                                </DropdownMenuItem>
                              )}
                              {companies.find(c => c.id === device.company_id)?.code === 'VES' && (
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    await supabase.from('devices').update({ fulfillment_channel: 'in_transit_fba' }).eq('id', device.id);
                                    logEvent({ action: 'UPDATE' as any, tableName: 'devices', recordId: device.id, module: 'Inventory', notes: 'Sent to FBA' });
                                    toast.success('Device marked as in transit to FBA');
                                    onRefresh();
                                  } catch (e: any) { toast.error(e.message); }
                                }}>
                                  <Send className="h-4 w-4 mr-2" /> Send to FBA
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteTarget({ id: device.id, label: `${device.brand} ${device.model}` })}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Device</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.label}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) handleDeleteDevice(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
