import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowRightLeft, Building2, Package } from 'lucide-react';

interface Device {
  id: string;
  brand: string;
  model: string;
  imei: string | null;
  cost_price: number;
  company_id: string;
}

interface InventoryTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  preselectedDevice?: Device | null;
}

export function InventoryTransferDialog({ 
  open, 
  onOpenChange, 
  onSuccess,
  preselectedDevice 
}: InventoryTransferDialogProps) {
  const { user } = useAuth();
  const { companies, selectedCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [toCompanyId, setToCompanyId] = useState<string>('');
  const [transferPrice, setTransferPrice] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (open) {
      if (preselectedDevice) {
        setSelectedDeviceId(preselectedDevice.id);
        setTransferPrice(preselectedDevice.cost_price.toString());
      } else {
        loadDevices();
      }
    }
  }, [open, preselectedDevice]);

  const loadDevices = async () => {
    let query = supabase
      .from('devices')
      .select('id, brand, model, imei, cost_price, company_id')
      .eq('status', 'in_stock')
      .order('brand');

    if (selectedCompany) {
      query = query.eq('company_id', selectedCompany.id);
    }

    const { data, error } = await query;
    if (!error && data) {
      setDevices(data as Device[]);
    }
  };

  const selectedDevice = preselectedDevice || devices.find(d => d.id === selectedDeviceId);
  const fromCompany = selectedDevice 
    ? companies.find(c => c.id === selectedDevice.company_id)
    : null;
  const availableTargetCompanies = companies.filter(c => c.id !== selectedDevice?.company_id);

  const handleTransfer = async () => {
    if (!selectedDevice || !toCompanyId) {
      toast.error('Please select a device and target company');
      return;
    }

    setLoading(true);
    try {
      const price = transferPrice ? parseFloat(transferPrice) : selectedDevice.cost_price;

      // Call the intercompany accounting edge function which:
      // 1. Creates the inventory_transfers record
      // 2. Updates the device company_id
      // 3. Creates journal entries for both sides (seller AR/Revenue, buyer Inventory/AP)
      // 4. Creates AR for seller and AP for buyer
      const { data, error } = await supabase.functions.invoke('process-intercompany-accounting', {
        body: {
          device_id: selectedDevice.id,
          from_company_id: selectedDevice.company_id,
          to_company_id: toCompanyId,
          transfer_price: price,
          reason: reason || notes || 'Manual inventory transfer',
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Transfer failed');

      const toCompany = companies.find(c => c.id === toCompanyId);
      toast.success(`Device transferred to ${toCompany?.code || 'new company'} — accounting entries created`);
      
      resetForm();
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error transferring device:', error);
      toast.error(error.message || 'Failed to transfer device');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedDeviceId('');
    setToCompanyId('');
    setTransferPrice('');
    setReason('');
    setNotes('');
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Transfer Inventory
          </DialogTitle>
          <DialogDescription>
            Transfer a device between Virtual eShop and Tech Genius Warehouse
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Device Selection */}
          {!preselectedDevice && (
            <div className="space-y-2">
              <Label>Select Device</Label>
              <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a device to transfer" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map(device => {
                    const company = companies.find(c => c.id === device.company_id);
                    return (
                      <SelectItem key={device.id} value={device.id}>
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          {device.brand} {device.model}
                          {device.imei && <span className="text-muted-foreground">({device.imei})</span>}
                          <span className="text-xs bg-muted px-1 rounded">{company?.code}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Selected Device Info */}
          {selectedDevice && (
            <div className="rounded-lg border p-3 bg-muted/30 space-y-2">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{selectedDevice.brand} {selectedDevice.model}</span>
              </div>
              {selectedDevice.imei && (
                <p className="text-sm text-muted-foreground">IMEI: {selectedDevice.imei}</p>
              )}
              <p className="text-sm">Current Value: {formatCurrency(selectedDevice.cost_price)}</p>
            </div>
          )}

          {/* From/To Companies */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From Company</Label>
              <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{fromCompany?.code || 'Select device'}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>To Company</Label>
              <Select value={toCompanyId} onValueChange={setToCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {availableTargetCompanies.map(company => (
                    <SelectItem key={company.id} value={company.id}>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {company.code} - {company.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Transfer Price */}
          <div className="space-y-2">
            <Label>Transfer Price (Optional)</Label>
            <Input
              type="number"
              step="0.01"
              value={transferPrice}
              onChange={(e) => setTransferPrice(e.target.value)}
              placeholder={selectedDevice ? selectedDevice.cost_price.toString() : 'Same as cost'}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use current cost price
            </p>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label>Reason for Transfer</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reallocation">Stock Reallocation</SelectItem>
                <SelectItem value="intercompany_sale">Intercompany Sale</SelectItem>
                <SelectItem value="fulfillment">Order Fulfillment</SelectItem>
                <SelectItem value="consolidation">Inventory Consolidation</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about this transfer..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleTransfer} 
            disabled={loading || !selectedDevice || !toCompanyId}
          >
            {loading ? 'Transferring...' : 'Transfer Device'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
