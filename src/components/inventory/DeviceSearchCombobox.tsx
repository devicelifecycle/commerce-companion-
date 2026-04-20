import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown, Smartphone, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DeviceOption {
  id: string;
  brand: string;
  model: string;
  imei: string | null;
  sku: string | null;
  storage: string | null;
  color: string | null;
  cost_price: number;
  status: string;
  company_id: string | null;
  supplier_invoice_number: string | null;
  condition: string;
}

interface DeviceSearchComboboxProps {
  value?: string | null;
  onSelect: (device: DeviceOption | null) => void;
  companyId?: string;
  /** Single status, array of statuses, or null/'all' to disable status filter. */
  statusFilter?: string | string[] | null;
  excludeIds?: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function DeviceSearchCombobox({
  value,
  onSelect,
  companyId,
  statusFilter = 'in_stock',
  excludeIds = [],
  placeholder = 'Search by IMEI, SKU, brand, model...',
  disabled = false,
  className,
}: DeviceSearchComboboxProps) {
  const { selectedCompany } = useCompany();
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const effectiveCompanyId = companyId || selectedCompany?.id;

  const loadDevices = useCallback(async () => {
    if (!effectiveCompanyId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('devices')
        .select('id, brand, model, imei, sku, storage, color, cost_price, status, company_id, supplier_invoice_number, condition')
        .eq('company_id', effectiveCompanyId)
        .order('brand');

      if (statusFilter && statusFilter !== 'all') {
        if (Array.isArray(statusFilter)) {
          if (statusFilter.length > 0) {
            query = query.in('status', statusFilter as any);
          }
        } else {
          query = query.eq('status', statusFilter as any);
        }
      }

      const { data, error } = await query.limit(500);
      if (!error && data) {
        setDevices(data as DeviceOption[]);
      }
    } finally {
      setLoading(false);
    }
  }, [effectiveCompanyId, statusFilter]);

  useEffect(() => {
    if (open) {
      loadDevices();
    }
  }, [open, loadDevices]);

  const filtered = useMemo(() => {
    if (!search.trim()) return devices.filter(d => !excludeIds.includes(d.id));
    const s = search.toLowerCase();
    return devices.filter(d => {
      if (excludeIds.includes(d.id)) return false;
      return (
        d.imei?.toLowerCase().includes(s) ||
        d.sku?.toLowerCase().includes(s) ||
        d.brand.toLowerCase().includes(s) ||
        d.model.toLowerCase().includes(s) ||
        `${d.brand} ${d.model}`.toLowerCase().includes(s) ||
        d.supplier_invoice_number?.toLowerCase().includes(s) ||
        d.storage?.toLowerCase().includes(s) ||
        d.color?.toLowerCase().includes(s)
      );
    });
  }, [devices, search, excludeIds]);

  const selectedDevice = devices.find(d => d.id === value);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const formatDeviceLabel = (d: DeviceOption) => {
    const parts = [`${d.brand} ${d.model}`];
    if (d.storage) parts[0] += ` ${d.storage}`;
    if (d.color) parts[0] += ` (${d.color})`;
    return parts[0];
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal h-auto min-h-10',
            !selectedDevice && 'text-muted-foreground',
            className
          )}
        >
          {selectedDevice ? (
            <div className="flex items-center gap-2 text-left flex-1 min-w-0">
              <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="truncate">
                <span className="font-medium">{formatDeviceLabel(selectedDevice)}</span>
                {selectedDevice.imei && (
                  <span className="text-xs text-muted-foreground ml-2">
                    IMEI: {selectedDevice.imei}
                  </span>
                )}
              </div>
              <Badge variant="outline" className="ml-auto shrink-0 text-xs">
                {formatCurrency(selectedDevice.cost_price)}
              </Badge>
            </div>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {selectedDevice && (
              <X
                className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(null);
                }}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[460px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search IMEI, SKU, brand, model, invoice #..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? 'Loading devices...' : 'No devices found.'}
            </CommandEmpty>
            <CommandGroup heading={`${filtered.length} device${filtered.length !== 1 ? 's' : ''} available`}>
              {filtered.slice(0, 50).map((device) => (
                <CommandItem
                  key={device.id}
                  value={device.id}
                  onSelect={() => {
                    onSelect(device.id === value ? null : device);
                    setOpen(false);
                    setSearch('');
                  }}
                  className="flex items-center gap-2 py-2"
                >
                  <Check
                    className={cn(
                      'h-4 w-4 shrink-0',
                      value === device.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {formatDeviceLabel(device)}
                      </span>
                      <Badge variant="secondary" className="text-[10px] shrink-0 capitalize">
                        {device.condition}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {device.imei && <span>IMEI: {device.imei}</span>}
                      {device.sku && <span>SKU: {device.sku}</span>}
                      {device.supplier_invoice_number && (
                        <span>Inv: {device.supplier_invoice_number}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-mono text-muted-foreground shrink-0">
                    {formatCurrency(device.cost_price)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
