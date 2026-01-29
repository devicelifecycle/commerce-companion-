import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface AvailableDevice {
  id: string;
  brand: string;
  model: string;
  imei: string | null;
  cost_price: number;
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
  open,
  onOpenChange,
  saleId,
  currentDeviceId,
  orderNumber,
  onSaved,
}: EditSaleDialogProps) {
  const { toast } = useToast();
  const [deviceId, setDeviceId] = useState<string>(currentDeviceId || '');
  const [availableDevices, setAvailableDevices] = useState<AvailableDevice[]>([]);
  const [loading, setLoading] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  useEffect(() => {
    if (open) {
      fetchAvailableDevices();
      setDeviceId(currentDeviceId || '');
    }
  }, [open, currentDeviceId]);

  const fetchAvailableDevices = async () => {
    try {
      // Fetch devices that are in_stock OR already linked to this sale
      const { data, error } = await supabase
        .from('devices')
        .select('id, brand, model, imei, cost_price')
        .or(`status.eq.in_stock,id.eq.${currentDeviceId || '00000000-0000-0000-0000-000000000000'}`)
        .order('brand');
      if (error) throw error;
      setAvailableDevices(data || []);
    } catch (error) {
      console.error('Error fetching devices:', error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('sales')
        .update({ device_id: deviceId || null })
        .eq('id', saleId);

      if (error) throw error;

      toast({
        title: 'Sale updated',
        description: deviceId 
          ? 'Device linked and profit recalculated.' 
          : 'Device unlinked from sale.',
      });

      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      console.error('Error updating sale:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update sale',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

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
          <div className="space-y-2">
            <Label htmlFor="device">Device</Label>
            <Select value={deviceId || 'none'} onValueChange={(val) => setDeviceId(val === 'none' ? '' : val)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a device from inventory" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No device linked</SelectItem>
                {availableDevices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.brand} {device.model} {device.imei ? `(${device.imei})` : ''} - {formatCurrency(device.cost_price)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Linking a device will automatically calculate profit based on cost price.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
