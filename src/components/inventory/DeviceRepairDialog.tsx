import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Trash2, Wrench, Clock, Package } from 'lucide-react';

interface DeviceRepairDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  device: any;
  onSuccess: () => void;
}

export function DeviceRepairDialog({ open, onOpenChange, device, onSuccess }: DeviceRepairDialogProps) {
  const { user } = useAuth();
  const { logEvent } = useAuditLog();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<RepairLineItem[]>([]);
  const [existingRepair, setExistingRepair] = useState<any>(null);

  // Fetch available repair parts
  const { data: availableParts = [] } = useQuery({
    queryKey: ['repair-parts', device?.company_id],
    queryFn: async () => {
      let query = supabase.from('repair_parts').select('*').eq('is_active', true).order('name');
      if (device?.company_id) query = query.eq('company_id', device.company_id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!device,
  });

  // Load existing repair if any
  useEffect(() => {
    if (!open || !device) return;
    const loadRepair = async () => {
      const { data: repairs } = await supabase
        .from('device_repairs')
        .select('*')
        .eq('device_id', device.id)
        .eq('status', 'in_progress')
        .limit(1);
      
      if (repairs && repairs.length > 0) {
        const repair = repairs[0];
        setExistingRepair(repair);
        setNotes(repair.notes || '');
        // Load existing items
        const { data: existingItems } = await supabase
          .from('repair_items')
          .select('*')
          .eq('repair_id', repair.id);
        if (existingItems) {
          setItems(existingItems.map((i: any) => ({
            id: i.id,
            item_type: i.item_type,
            repair_part_id: i.repair_part_id,
            description: i.description,
            quantity: i.quantity,
            unit_cost: i.unit_cost,
            total_cost: i.total_cost,
            labor_hours: i.labor_hours,
            labor_rate: i.labor_rate,
            isNew: false,
          })));
        }
      } else {
        setExistingRepair(null);
        setNotes('');
        setItems([]);
      }
    };
    loadRepair();
  }, [open, device]);

  const addPartLine = () => {
    setItems([...items, {
      item_type: 'part', repair_part_id: null, description: '', quantity: 1,
      unit_cost: 0, total_cost: 0, labor_hours: null, labor_rate: null, isNew: true,
    }]);
  };

  const addLaborLine = (mode: 'hourly' | 'flat') => {
    setItems([...items, {
      item_type: 'labor', repair_part_id: null,
      description: mode === 'hourly' ? 'Labor — hourly' : 'Labor — flat rate',
      quantity: 1, unit_cost: 0, total_cost: 0,
      labor_hours: mode === 'hourly' ? 0 : null,
      labor_rate: mode === 'hourly' ? 0 : null,
      isNew: true,
    }]);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items];
    const item = { ...updated[idx], [field]: value };

    if (item.item_type === 'part') {
      // Auto-fill from selected part
      if (field === 'repair_part_id' && value) {
        const part = availableParts.find((p: any) => p.id === value);
        if (part) {
          item.description = part.name;
          item.unit_cost = part.unit_cost;
          item.total_cost = part.unit_cost * item.quantity;
        }
      }
      if (field === 'quantity' || field === 'unit_cost') {
        item.total_cost = (item.unit_cost || 0) * (item.quantity || 0);
      }
    } else {
      // Labor
      if (item.labor_hours !== null && item.labor_rate !== null) {
        item.total_cost = (item.labor_hours || 0) * (item.labor_rate || 0);
      } else {
        // Flat rate
        if (field === 'total_cost') item.total_cost = value;
        else if (field === 'unit_cost') {
          item.unit_cost = value;
          item.total_cost = value * (item.quantity || 1);
        }
      }
    }

    updated[idx] = item;
    setItems(updated);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const totalPartsCost = items.filter(i => i.item_type === 'part').reduce((s, i) => s + (i.total_cost || 0), 0);
  const totalLaborCost = items.filter(i => i.item_type === 'labor').reduce((s, i) => s + (i.total_cost || 0), 0);
  const totalRepairCost = totalPartsCost + totalLaborCost;

  const handleSave = async (complete: boolean) => {
    if (items.length === 0) {
      toast.error('Add at least one part or labor entry');
      return;
    }
    setSaving(true);
    try {
      let repairId = existingRepair?.id;

      // Create or update repair record
      if (!repairId) {
        const { data: newRepair, error } = await supabase.from('device_repairs').insert({
          device_id: device.id,
          company_id: device.company_id,
          status: complete ? 'completed' : 'in_progress',
          completed_at: complete ? new Date().toISOString() : null,
          total_parts_cost: totalPartsCost,
          total_labor_cost: totalLaborCost,
          notes,
          created_by: user?.id,
        }).select().single();
        if (error) throw error;
        repairId = newRepair.id;
      } else {
        const { error } = await supabase.from('device_repairs').update({
          status: complete ? 'completed' : 'in_progress',
          completed_at: complete ? new Date().toISOString() : null,
          total_parts_cost: totalPartsCost,
          total_labor_cost: totalLaborCost,
          notes,
        }).eq('id', repairId);
        if (error) throw error;

        // Delete old items and re-insert
        await supabase.from('repair_items').delete().eq('repair_id', repairId);
      }

      // Insert all items
      const itemRows = items.map(i => ({
        repair_id: repairId,
        item_type: i.item_type,
        repair_part_id: i.repair_part_id || null,
        description: i.description,
        quantity: i.quantity,
        unit_cost: i.unit_cost,
        total_cost: i.total_cost,
        labor_hours: i.labor_hours,
        labor_rate: i.labor_rate,
      }));
      const { error: itemErr } = await supabase.from('repair_items').insert(itemRows);
      if (itemErr) throw itemErr;

      // Deduct parts from inventory and create accounting entries on complete
      if (complete) {
        for (const item of items) {
          if (item.item_type === 'part' && item.repair_part_id) {
            const part = availableParts.find((p: any) => p.id === item.repair_part_id);
            if (part) {
              const newQty = Math.max(0, part.quantity_on_hand - item.quantity);
              await supabase.from('repair_parts').update({ quantity_on_hand: newQty }).eq('id', item.repair_part_id);
            }
          }
        }

        // Preserve original cost if not already set, then add PARTS cost only (not labor)
        const originalCost = device.original_cost_price ?? device.cost_price;
        const newCostPrice = Number(device.cost_price) + totalPartsCost;
        await supabase.from('devices').update({
          cost_price: newCostPrice,
          original_cost_price: originalCost,
        }).eq('id', device.id);

        logEvent({
          action: 'UPDATE' as any,
          tableName: 'devices',
          module: 'Inventory',
          recordId: device.id,
          notes: `Repair completed: parts cost $${totalPartsCost.toFixed(2)} added to device cost. Labor $${totalLaborCost.toFixed(2)} tracked for management reporting. Original cost: $${Number(originalCost).toFixed(2)}, new cost: $${newCostPrice.toFixed(2)}.`,
        });

        toast.success(`Repair completed — $${totalRepairCost.toFixed(2)} added to device cost`);
      } else {
        toast.success('Repair saved as in progress');
      }

      queryClient.invalidateQueries({ queryKey: ['repair-parts'] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['device-repairs'] });
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save repair');
    } finally {
      setSaving(false);
    }
  };

  if (!device) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" /> Repair — {device.brand} {device.model}
          </DialogTitle>
          <DialogDescription>
            {device.imei ? `IMEI: ${device.imei}` : device.sku ? `SKU: ${device.sku}` : ''} • Current cost: ${Number(device.cost_price).toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Repair Items</Label>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={addPartLine}>
                  <Package className="h-3.5 w-3.5 mr-1" /> Part
                </Button>
                <Button variant="outline" size="sm" onClick={() => addLaborLine('hourly')}>
                  <Clock className="h-3.5 w-3.5 mr-1" /> Hourly Labor
                </Button>
                <Button variant="outline" size="sm" onClick={() => addLaborLine('flat')}>
                  <Wrench className="h-3.5 w-3.5 mr-1" /> Flat Labor
                </Button>
              </div>
            </div>

            {items.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty / Hours</TableHead>
                    <TableHead className="text-right">Rate / Unit Cost</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Badge variant={item.item_type === 'part' ? 'default' : 'secondary'}>
                          {item.item_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.item_type === 'part' ? (
                          <Select
                            value={item.repair_part_id || ''}
                            onValueChange={(v) => updateItem(idx, 'repair_part_id', v)}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Select part" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableParts.map((p: any) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} (${Number(p.unit_cost).toFixed(2)}) — {p.quantity_on_hand} left
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={item.description}
                            onChange={(e) => updateItem(idx, 'description', e.target.value)}
                            className="w-[200px]"
                            placeholder="Labor description"
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.item_type === 'part' ? (
                          <Input
                            type="number" min={1} className="w-16 text-right"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                          />
                        ) : item.labor_hours !== null ? (
                          <Input
                            type="number" step="0.25" min={0} className="w-16 text-right"
                            value={item.labor_hours || ''}
                            onChange={(e) => updateItem(idx, 'labor_hours', parseFloat(e.target.value) || 0)}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.item_type === 'part' ? (
                          <span>${Number(item.unit_cost).toFixed(2)}</span>
                        ) : item.labor_rate !== null ? (
                          <Input
                            type="number" step="0.01" min={0} className="w-20 text-right"
                            value={item.labor_rate || ''}
                            onChange={(e) => updateItem(idx, 'labor_rate', parseFloat(e.target.value) || 0)}
                            placeholder="$/hr"
                          />
                        ) : (
                          <Input
                            type="number" step="0.01" min={0} className="w-20 text-right"
                            value={item.total_cost || ''}
                            onChange={(e) => updateItem(idx, 'total_cost', parseFloat(e.target.value) || 0)}
                            placeholder="Flat $"
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${(item.total_cost || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {items.length === 0 && (
              <div className="text-center py-8 text-muted-foreground border rounded-md">
                No items added yet. Add parts or labor entries above.
              </div>
            )}
          </div>

          {/* Totals */}
          {items.length > 0 && (
            <div className="flex justify-end">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm min-w-[220px]">
                <div className="flex justify-between"><span>Parts:</span><span>${totalPartsCost.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Labor:</span><span>${totalLaborCost.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Total Repair Cost:</span><span>${totalRepairCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground text-xs pt-1 border-t">
                  <span>New device cost:</span>
                  <span>${(Number(device.cost_price) + totalRepairCost).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Repair Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Describe the repair work..." rows={2} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="secondary" onClick={() => handleSave(false)} disabled={saving}>
            Save as In Progress
          </Button>
          <Button onClick={() => handleSave(true)} disabled={saving}>
            Complete Repair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RepairLineItem {
  id?: string;
  item_type: 'part' | 'labor';
  repair_part_id: string | null;
  description: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  labor_hours: number | null;
  labor_rate: number | null;
  isNew?: boolean;
}
