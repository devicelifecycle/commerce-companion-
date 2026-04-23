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
  const { processSaleAccounting } = useSaleAccounting();
  const [deviceId, setDeviceId] = useState<string>(currentDeviceId || '');
  const [availableDevices, setAvailableDevices] = useState<AvailableDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [imeiSearch, setImeiSearch] = useState('');

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

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
