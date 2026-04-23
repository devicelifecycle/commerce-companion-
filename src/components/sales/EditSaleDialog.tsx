import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { emitRefetch } from '@/hooks/useDataRefetch';
import { useSaleAccounting } from '@/hooks/useSaleAccounting';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { Search, Stethoscope, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface AvailableDevice {
  id: string;
  brand: string;
  model: string;
  imei: string | null;
  cost_price: number;
  storage: string | null;
}

interface EditSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  currentDeviceId: string | null;
  orderNumber: string;
  onSaved: () => void;
}

export function EditSaleDialog({
  open, onOpenChange, saleId, currentDeviceId, orderNumber, onSaved,
}: EditSaleDialogProps) {
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const { processSaleAccounting } = useSaleAccounting();
  const [deviceId, setDeviceId] = useState<string>(currentDeviceId || '');
  const [availableDevices, setAvailableDevices] = useState<AvailableDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [imeiSearch, setImeiSearch] = useState('');
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Array<{ label: string; count: number; ok: boolean; note?: string }> | null>(null);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const runDiagnostic = async () => {
    setDiagnosing(true);
    setDiagnostics(null);
    const results: Array<{ label: string; count: number; ok: boolean; note?: string }> = [];
    try {
      // Test 1: total devices in DB (no filter)
      const r1 = await supabase.from('devices').select('id', { count: 'exact', head: true });
      results.push({
        label: 'Total devices in database (no filter)',
        count: r1.count || 0,
        ok: !r1.error && (r1.count || 0) > 0,
        note: r1.error?.message,
      });

      // Test 2: devices in selected company
      if (selectedCompany?.id) {
        const r2 = await supabase.from('devices').select('id', { count: 'exact', head: true })
          .eq('company_id', selectedCompany.id);
        results.push({
          label: `Devices in company "${selectedCompany.name}"`,
          count: r2.count || 0,
          ok: !r2.error && (r2.count || 0) > 0,
          note: r2.error?.message,
        });
      } else {
        results.push({ label: 'Company scope', count: 0, ok: false, note: 'No company selected — searching all companies' });
      }

      // Test 3: in_stock devices
      const r3 = await supabase.from('devices').select('id', { count: 'exact', head: true })
        .eq('status', 'in_stock');
      results.push({
        label: 'Devices with status = in_stock',
        count: r3.count || 0,
        ok: !r3.error && (r3.count || 0) > 0,
        note: r3.error?.message,
      });

      // Test 4: broadened status filter (matches Edit dialog default)
      const r4 = await supabase.from('devices').select('id', { count: 'exact', head: true })
        .in('status', ['in_stock', 'reserved', 'hold_for_refurbishment', 'in_repair', 'refurbished'] as any);
      results.push({
        label: 'Devices in linkable statuses (in_stock, reserved, hold, in_repair, refurbished)',
        count: r4.count || 0,
        ok: !r4.error && (r4.count || 0) > 0,
        note: r4.error?.message,
      });

      // Test 5: sample SKU search using top device's SKU
      const sample = await supabase.from('devices').select('sku, imei').not('sku', 'is', null).limit(1).maybeSingle();
      if (sample.data?.sku) {
        const term = sample.data.sku.slice(0, 4);
        const r5 = await supabase.from('devices').select('id', { count: 'exact', head: true })
          .ilike('sku', `%${term}%`);
        results.push({
          label: `Sample SKU search "${term}" (from existing device)`,
          count: r5.count || 0,
          ok: !r5.error && (r5.count || 0) > 0,
          note: r5.error?.message,
        });
      } else {
        results.push({ label: 'Sample SKU search', count: 0, ok: false, note: 'No devices with SKU found to sample' });
      }

      // Test 6: combined filter (company + status) — what the dialog actually runs
      let q6 = supabase.from('devices').select('id', { count: 'exact', head: true })
        .in('status', ['in_stock', 'reserved', 'hold_for_refurbishment', 'in_repair', 'refurbished'] as any);
      if (selectedCompany?.id) q6 = q6.eq('company_id', selectedCompany.id);
      const r6 = await q6;
      results.push({
        label: 'Combined filter (company + linkable statuses) — what this dialog uses',
        count: r6.count || 0,
        ok: !r6.error && (r6.count || 0) > 0,
        note: r6.error?.message,
      });

      setDiagnostics(results);

      const firstZero = results.find(r => !r.ok);
      if (firstZero) {
        toast({
          title: 'Diagnostic complete — issue found',
          description: `Bottleneck: ${firstZero.label}`,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Diagnostic complete', description: 'All filters return results — search should work.' });
      }
    } catch (err: any) {
      toast({ title: 'Diagnostic failed', description: err.message, variant: 'destructive' });
    } finally {
      setDiagnosing(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchAvailableDevices();
      setDeviceId(currentDeviceId || '');
      setImeiSearch('');
    }
  }, [open, currentDeviceId]);

  const fetchAvailableDevices = async () => {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('id, brand, model, imei, cost_price, storage')
        .or(`status.eq.in_stock,id.eq.${currentDeviceId || '00000000-0000-0000-0000-000000000000'}`)
        .order('brand');
      if (error) throw error;
      setAvailableDevices(data || []);
    } catch (error) {
      console.error('Error fetching devices:', error);
    }
  };

  // Filter devices by IMEI search
  const filteredDevices = imeiSearch
    ? availableDevices.filter(d =>
        d.imei?.toLowerCase().includes(imeiSearch.toLowerCase()) ||
        `${d.brand} ${d.model}`.toLowerCase().includes(imeiSearch.toLowerCase())
      )
    : availableDevices;

  // Auto-select if exact IMEI match
  useEffect(() => {
    if (imeiSearch && filteredDevices.length === 1) {
      setDeviceId(filteredDevices[0].id);
    }
  }, [imeiSearch, filteredDevices]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('sales')
        .update({ device_id: deviceId || null })
        .eq('id', saleId);
      if (error) throw error;

      if (deviceId) {
        await processSaleAccounting([saleId]);
      }

      toast({
        title: 'Sale updated',
        description: deviceId
          ? 'Device linked — profit recalculated and journal entries created.'
          : 'Device unlinked from sale.',
      });

      emitRefetch('sales');
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      console.error('Error updating sale:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update sale', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const selectedDevice = availableDevices.find(d => d.id === deviceId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link Device to Sale</DialogTitle>
          <DialogDescription>
            Link a device from inventory to order {orderNumber} to calculate profit/loss.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* IMEI Search */}
          <div className="space-y-2">
            <Label>Scan or search IMEI</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Scan IMEI barcode or type to search..."
                value={imeiSearch}
                onChange={(e) => setImeiSearch(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>
            {imeiSearch && (
              <p className="text-xs text-muted-foreground">
                {filteredDevices.length} device(s) found
              </p>
            )}
          </div>

          {/* Device selector */}
          <div className="space-y-2">
            <Label htmlFor="device">Device</Label>
            <Select value={deviceId || 'none'} onValueChange={(val) => setDeviceId(val === 'none' ? '' : val)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a device from inventory" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No device linked</SelectItem>
                {filteredDevices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.brand} {device.model} {device.storage || ''} {device.imei ? `(${device.imei})` : ''} - {formatCurrency(device.cost_price)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selected device preview */}
          {selectedDevice && (
            <div className="bg-muted/30 border border-border/40 rounded-lg p-3 text-sm">
              <p className="font-medium">{selectedDevice.brand} {selectedDevice.model}</p>
              <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                {selectedDevice.imei && <span className="font-mono">IMEI: {selectedDevice.imei}</span>}
                <span>Cost: {formatCurrency(selectedDevice.cost_price)}</span>
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Linking a device will automatically calculate profit based on cost price.
          </p>

          {/* Diagnostic panel */}
          <div className="border-t border-border/40 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Search not working?</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={runDiagnostic}
                disabled={diagnosing}
              >
                <Stethoscope className="h-3.5 w-3.5" />
                {diagnosing ? 'Running…' : 'Run search diagnostic'}
              </Button>
            </div>
            {diagnostics && (
              <div className="space-y-1 bg-muted/30 border border-border/40 rounded-md p-2 text-xs">
                {diagnostics.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    {r.ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
                    ) : r.count === 0 ? (
                      <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2">
                        <span className="text-foreground">{r.label}</span>
                        <span className="font-mono text-muted-foreground shrink-0">{r.count}</span>
                      </div>
                      {r.note && <div className="text-muted-foreground mt-0.5">{r.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
