import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { emitRefetch } from '@/hooks/useDataRefetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  ArrowLeft, CheckCircle2, Plus, Trash2, Wrench, Package, DollarSign, Info, Save,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const DEFAULT_CHECKLIST = [
  'Back Glass Replacement',
  'Battery Boosting',
  'Battery Replacement',
  'Button / Switch Replacement',
  'Charging Port Replacement',
  'Cosmetic Cleaning & Polishing',
  'Data Wipe & Factory Reset',
  'Ear Speaker Replacement',
  'Face ID / Touch ID Calibration',
  'Frame / Bezel Straightening',
  'Front Camera Replacement',
  'LCD Refurbishing',
  'LCD / Screen Replacement',
  'Loud Speaker Replacement',
  'Microphone Replacement',
  'Motherboard Repair / Reball',
  'Network / Signal Test',
  'Power Button Flex Replacement',
  'Proximity Sensor Replacement',
  'Rear Camera Replacement',
  'SIM Tray / Card Reader Repair',
  'Software Update & Activation',
  'Vibration Motor Replacement',
  'Volume Button Flex Replacement',
  'Water Damage Treatment',
  'Wireless Charging Test',
];

interface RefurbishmentDetailProps {
  deviceId: string;
  onBack: () => void;
  canManage: boolean;
}

export function RefurbishmentDetail({ deviceId, onBack, canManage }: RefurbishmentDetailProps) {
  const { user } = useAuth();
  const { logEvent } = useAuditLog();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [laborCost, setLaborCost] = useState('');
  const [notes, setNotes] = useState('');
  const [completeConfirm, setCompleteConfirm] = useState(false);
  const [customTaskName, setCustomTaskName] = useState('');
  const [cosmeticGrade, setCosmeticGrade] = useState('');

  // Parts state
  const [selectedPartId, setSelectedPartId] = useState('');
  const [partQty, setPartQty] = useState(1);

  // Fetch device
  const { data: device, isLoading: deviceLoading } = useQuery({
    queryKey: ['refurb-device', deviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('devices')
        .select('*, suppliers(name)')
        .eq('id', deviceId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch checklist tasks
  const { data: tasks = [], refetch: refetchTasks } = useQuery({
    queryKey: ['refurb-tasks', deviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('device_refurbishment_tasks')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!deviceId,
  });

  // Fetch parts used
  const { data: usedParts = [], refetch: refetchParts } = useQuery({
    queryKey: ['refurb-parts', deviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('device_refurbishment_parts')
        .select('*, repair_parts(name, sku)')
        .eq('device_id', deviceId)
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!deviceId,
  });

  // Fetch available repair parts
  const { data: availableParts = [] } = useQuery({
    queryKey: ['repair-parts-available', device?.company_id],
    queryFn: async () => {
      let query = supabase.from('repair_parts').select('*').eq('is_active', true).gt('quantity_on_hand', 0).order('name');
      if (device?.company_id) query = query.eq('company_id', device.company_id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!device,
  });

  // Initialize checklist on first visit
  useEffect(() => {
    if (!device || tasks.length > 0 || !canManage) return;
    if (device.refurbishment_status && device.refurbishment_status !== 'pending') return;

    const initChecklist = async () => {
      const rows = DEFAULT_CHECKLIST.map(name => ({
        device_id: deviceId,
        company_id: device.company_id,
        task_name: name,
        is_completed: false,
        is_custom: false,
      }));
      await supabase.from('device_refurbishment_tasks').insert(rows);

      // Mark device as in_progress
      if (!device.refurbishment_status || device.refurbishment_status === 'pending') {
        await supabase.from('devices').update({
          refurbishment_status: 'in_progress',
          refurbishment_started_at: new Date().toISOString(),
        }).eq('id', deviceId);
      }
      refetchTasks();
    };
    initChecklist();
  }, [device, tasks.length, deviceId, canManage]);

  // Sync labor cost / notes from device
  useEffect(() => {
    if (device) {
      setLaborCost(device.refurbishment_labor_cost?.toString() || '');
      setNotes(device.refurbishment_notes || '');
    }
  }, [device]);

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    await supabase.from('device_refurbishment_tasks').update({
      is_completed: completed,
      completed_at: completed ? new Date().toISOString() : null,
      completed_by: completed ? user?.id : null,
    }).eq('id', taskId);
    refetchTasks();
  };

  const handleAddCustomTask = async () => {
    if (!customTaskName.trim()) return;
    await supabase.from('device_refurbishment_tasks').insert({
      device_id: deviceId,
      company_id: device?.company_id,
      task_name: customTaskName.trim(),
      is_custom: true,
    });
    setCustomTaskName('');
    refetchTasks();
  };

  const handleDeleteTask = async (taskId: string) => {
    await supabase.from('device_refurbishment_tasks').delete().eq('id', taskId);
    refetchTasks();
  };

  const handleAddPart = async () => {
    if (!selectedPartId) return;
    const part = availableParts.find((p: any) => p.id === selectedPartId);
    if (!part) return;
    if (partQty > part.quantity_on_hand) {
      toast.error(`Only ${part.quantity_on_hand} available`);
      return;
    }

    // Insert refurbishment part record
    await supabase.from('device_refurbishment_parts').insert({
      device_id: deviceId,
      repair_part_id: selectedPartId,
      company_id: device?.company_id,
      quantity_used: partQty,
      unit_cost: part.unit_cost,
      total_cost: part.unit_cost * partQty,
      created_by: user?.id,
    });

    // Deduct from repair_parts inventory
    await supabase.from('repair_parts').update({
      quantity_on_hand: part.quantity_on_hand - partQty,
    }).eq('id', selectedPartId);

    setSelectedPartId('');
    setPartQty(1);
    refetchParts();
    queryClient.invalidateQueries({ queryKey: ['repair-parts-available'] });
    toast.success(`${part.name} added`);
  };

  const handleRemovePart = async (partRecord: any) => {
    // Restore inventory
    const { data: rp } = await supabase.from('repair_parts').select('quantity_on_hand').eq('id', partRecord.repair_part_id).single();
    if (rp) {
      await supabase.from('repair_parts').update({
        quantity_on_hand: rp.quantity_on_hand + partRecord.quantity_used,
      }).eq('id', partRecord.repair_part_id);
    }
    await supabase.from('device_refurbishment_parts').delete().eq('id', partRecord.id);
    refetchParts();
    queryClient.invalidateQueries({ queryKey: ['repair-parts-available'] });
    toast.success('Part removed and inventory restored');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabase.from('devices').update({
        refurbishment_labor_cost: laborCost ? parseFloat(laborCost) : 0,
        refurbishment_notes: notes || null,
        management_labor_cost: laborCost ? parseFloat(laborCost) : null,
      }).eq('id', deviceId);
      toast.success('Saved');
    } finally {
      setSaving(false);
    }
  };

  const totalPartsCost = usedParts.reduce((sum: number, p: any) => sum + Number(p.total_cost), 0);
  const totalLaborCost = laborCost ? parseFloat(laborCost) : 0;

  const handleComplete = async () => {
    setSaving(true);
    try {
      // Capitalize parts cost into device cost_price
      const newCostPrice = Number(device.cost_price) + totalPartsCost;

      await supabase.from('devices').update({
        status: 'in_stock',
        refurbishment_status: 'completed',
        refurbishment_completed_at: new Date().toISOString(),
        refurbishment_labor_cost: totalLaborCost,
        refurbishment_notes: notes || null,
        cost_price: newCostPrice,
        original_cost_price: device.original_cost_price || device.cost_price,
        management_labor_cost: totalLaborCost || null,
      }).eq('id', deviceId);

      // Create accounting entries: Dr. Inventory (device cost) / Cr. Repair Parts Inventory
      if (totalPartsCost > 0) {
        const companyId = device.company_id;
        // Look up chart accounts
        const { data: accounts } = await supabase
          .from('chart_of_accounts')
          .select('id, account_code')
          .eq('company_id', companyId)
          .in('account_code', ['1200', '1201', '1110', '1111']);

        const inventoryAcct = accounts?.find((a: any) => ['1200', '1201'].includes(a.account_code));
        const partsAcct = accounts?.find((a: any) => ['1110', '1111'].includes(a.account_code));

        if (inventoryAcct && partsAcct) {
          const entryNumber = `JE-REFURB-${Date.now()}`;
          const { data: je } = await supabase.from('journal_entries').insert({
            company_id: companyId,
            entry_number: entryNumber,
            entry_date: new Date().toISOString().split('T')[0],
            description: `Refurbishment parts capitalized: ${device.brand} ${device.model}${device.imei ? ` (${device.imei})` : ''}`,
            status: 'posted',
            posted_at: new Date().toISOString(),
            posted_by: user?.id,
            created_by: user?.id,
            is_auto_generated: true,
            reference_type: 'refurbishment',
            reference_id: deviceId,
            total_debit: totalPartsCost,
            total_credit: totalPartsCost,
          }).select().single();

          if (je) {
            await supabase.from('journal_entry_lines').insert([
              {
                journal_entry_id: je.id,
                account_id: inventoryAcct.id,
                debit_amount: totalPartsCost,
                credit_amount: 0,
                description: 'Repair parts capitalized into device inventory',
              },
              {
                journal_entry_id: je.id,
                account_id: partsAcct.id,
                debit_amount: 0,
                credit_amount: totalPartsCost,
                description: 'Repair parts consumed in refurbishment',
              },
            ]);
          }
        }
      }

      logEvent({
        action: 'UPDATE',
        tableName: 'devices',
        recordId: deviceId,
        module: 'Refurbishment',
        notes: `Refurbishment completed. Parts cost: $${totalPartsCost.toFixed(2)}, Labor: $${totalLaborCost.toFixed(2)}`,
      });

      emitRefetch('inventory');
      toast.success('Refurbishment completed — device moved to inventory');
      onBack();
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete refurbishment');
    } finally {
      setSaving(false);
    }
  };

  if (deviceLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading device...</div>;
  }

  if (!device) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Device not found</div>;
  }

  const isCompleted = device.refurbishment_status === 'completed';
  const completedCount = tasks.filter((t: any) => t.is_completed).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Queue
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{device.brand} {device.model} {device.storage && `(${device.storage})`}</h1>
          <p className="text-sm text-muted-foreground">
            {device.imei && <span className="font-mono mr-3">IMEI: {device.imei}</span>}
            Condition: {device.condition} · Cost: ${Number(device.cost_price).toFixed(2)}
            {device.suppliers?.name && ` · Supplier: ${device.suppliers.name}`}
          </p>
        </div>
        {isCompleted ? (
          <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-emerald-600/20"><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Completed</Badge>
        ) : (
          <Badge variant="secondary"><Wrench className="h-3.5 w-3.5 mr-1" /> In Progress</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Checklist */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" /> Refurbishment Checklist
              <Badge variant="outline" className="ml-auto">{completedCount}/{tasks.length}</Badge>
            </CardTitle>
            <CardDescription>Check off each item as inspection/repair is completed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {tasks.map((task: any) => (
              <div key={task.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 group">
                <Checkbox
                  checked={task.is_completed}
                  disabled={!canManage || isCompleted}
                  onCheckedChange={(checked) => handleToggleTask(task.id, !!checked)}
                />
                <span className={`flex-1 ${task.is_completed ? 'line-through text-muted-foreground' : ''}`}>
                  {task.task_name}
                  {task.is_custom && <Badge variant="outline" className="ml-2 text-xs">Custom</Badge>}
                </span>
                {task.is_custom && canManage && !isCompleted && (
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100" onClick={() => handleDeleteTask(task.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}

            {canManage && !isCompleted && (
              <>
                <Separator className="my-3" />
                <div className="flex gap-2">
                  <Input
                    placeholder="Add custom task..."
                    value={customTaskName}
                    onChange={(e) => setCustomTaskName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomTask()}
                  />
                  <Button variant="outline" size="sm" onClick={handleAddCustomTask} disabled={!customTaskName.trim()}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Labor & Summary */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" /> Labor Cost
                <Tooltip>
                  <TooltipTrigger><Info className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Estimated labor cost for management profit reporting. Does not affect accounting books directly — only used for management P&L calculations.
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Management Labor Cost ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={laborCost}
                  onChange={(e) => setLaborCost(e.target.value)}
                  disabled={!canManage || isCompleted}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!canManage || isCompleted}
                  placeholder="Refurbishment notes..."
                  rows={3}
                />
              </div>
              {canManage && !isCompleted && (
                <Button variant="outline" size="sm" className="w-full" onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-1" /> Save
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Cost Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Original Cost</span>
                <span>${Number(device.original_cost_price || device.cost_price).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Parts Used</span>
                <span>${totalPartsCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Labor (Mgmt)</span>
                <span>${totalLaborCost.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total Cost (Acct)</span>
                <span>${(Number(device.original_cost_price || device.cost_price) + totalPartsCost).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-muted-foreground">
                <span>Total Cost (Mgmt)</span>
                <span>${(Number(device.original_cost_price || device.cost_price) + totalPartsCost + totalLaborCost).toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Parts Used */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" /> Parts Used
          </CardTitle>
          <CardDescription>Select repair parts from inventory — stock will be deducted and cost capitalized into the device</CardDescription>
        </CardHeader>
        <CardContent>
          {canManage && !isCompleted && (
            <div className="flex gap-2 mb-4">
              <Select value={selectedPartId} onValueChange={setSelectedPartId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a repair part..." />
                </SelectTrigger>
                <SelectContent>
                  {availableParts.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.sku && `(${p.sku})`} — ${Number(p.unit_cost).toFixed(2)} · {p.quantity_on_hand} avail
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={1}
                value={partQty}
                onChange={(e) => setPartQty(parseInt(e.target.value) || 1)}
                className="w-20"
              />
              <Button onClick={handleAddPart} disabled={!selectedPartId}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          )}

          {usedParts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  {canManage && !isCompleted && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {usedParts.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.repair_parts?.name || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{p.repair_parts?.sku || '—'}</TableCell>
                    <TableCell className="text-right">{p.quantity_used}</TableCell>
                    <TableCell className="text-right">${Number(p.unit_cost).toFixed(2)}</TableCell>
                    <TableCell className="text-right">${Number(p.total_cost).toFixed(2)}</TableCell>
                    {canManage && !isCompleted && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleRemovePart(p)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-semibold">Total Parts Cost</TableCell>
                  <TableCell className="text-right font-semibold">${totalPartsCost.toFixed(2)}</TableCell>
                  {canManage && !isCompleted && <TableCell />}
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No parts used yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Complete Button */}
      {canManage && !isCompleted && (
        <div className="flex justify-end">
          <Button size="lg" onClick={() => setCompleteConfirm(true)} disabled={saving}>
            <CheckCircle2 className="h-5 w-5 mr-2" /> Complete Refurbishment & Move to Inventory
          </Button>
        </div>
      )}

      {/* Complete Confirmation */}
      <AlertDialog open={completeConfirm} onOpenChange={setCompleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Refurbishment</AlertDialogTitle>
            <AlertDialogDescription>
              This will:
              <ul className="list-disc ml-4 mt-2 space-y-1">
                <li>Capitalize ${totalPartsCost.toFixed(2)} in parts cost into the device's cost price</li>
                <li>Set management labor cost to ${totalLaborCost.toFixed(2)}</li>
                <li>Move the device status to "In Stock" (ready for sale)</li>
                <li>Create the appropriate accounting journal entries</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setCompleteConfirm(false); handleComplete(); }}>
              Complete & Move to Inventory
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
