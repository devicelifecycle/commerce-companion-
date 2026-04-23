import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown, Truck, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SupplierOption {
  id: string;
  name: string;
  supplier_code: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  company_id: string | null;
}

interface Props {
  value?: string | null;
  onSelect: (supplier: SupplierOption | null) => void;
  /** Restrict to a single company. When omitted, falls back to selected company in context, or all companies. */
  companyId?: string | null;
  /** Also include suppliers with no company assignment (shared suppliers). Default true. */
  includeShared?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SupplierSearchCombobox({
  value,
  onSelect,
  companyId,
  includeShared = true,
  placeholder = 'Search supplier by name, code, contact, email…',
  disabled = false,
  className,
}: Props) {
  const { selectedCompany } = useCompany();
  const [open, setOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<SupplierOption | null>(null);

  const effectiveCompanyId = companyId || selectedCompany?.id || null;

  const load = useCallback(async (term: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let query = supabase
        .from('suppliers')
        .select('id, name, supplier_code, contact_name, email, phone, company_id');

      if (effectiveCompanyId) {
        query = includeShared
          ? query.or(`company_id.eq.${effectiveCompanyId},company_id.is.null`)
          : query.eq('company_id', effectiveCompanyId);
      }

      const t = term.trim();
      if (t.length > 0) {
        const like = `%${t}%`;
        query = query.or(
          `name.ilike.${like},supplier_code.ilike.${like},contact_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`
        ).limit(50);
      } else {
        query = query.order('name').limit(50);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[SupplierSearchCombobox] query failed:', error);
        setErrorMsg(error.message);
        setSuppliers([]);
      } else {
        setSuppliers((data || []) as SupplierOption[]);
      }
    } finally {
      setLoading(false);
    }
  }, [effectiveCompanyId, includeShared]);

  useEffect(() => {
    if (!open) return;
    const h = setTimeout(() => load(search), 200);
    return () => clearTimeout(h);
  }, [open, search, load]);

  // Resolve label for selected even if not in current page
  useEffect(() => {
    if (!value) { setSelected(null); return; }
    const fromList = suppliers.find(s => s.id === value);
    if (fromList) { setSelected(fromList); return; }
    (async () => {
      const { data } = await supabase
        .from('suppliers')
        .select('id, name, supplier_code, contact_name, email, phone, company_id')
        .eq('id', value)
        .maybeSingle();
      if (data) setSelected(data as SupplierOption);
    })();
  }, [value, suppliers]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal h-9',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          {selected ? (
            <div className="flex items-center gap-2 text-left flex-1 min-w-0">
              <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="font-medium truncate text-sm">{selected.name}</span>
              {selected.supplier_code && (
                <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                  #{selected.supplier_code}
                </Badge>
              )}
            </div>
          ) : (
            <span className="truncate text-sm">{placeholder}</span>
          )}
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {selected && (
              <X
                className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onSelect(null); }}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Name, code, contact, email, phone…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {loading
                ? 'Loading suppliers…'
                : errorMsg
                  ? `Search error: ${errorMsg}`
                  : 'No suppliers found. Add one in Suppliers.'}
            </CommandEmpty>
            <CommandGroup heading={`${suppliers.length} supplier${suppliers.length !== 1 ? 's' : ''}`}>
              {suppliers.map((sup) => (
                <CommandItem
                  key={sup.id}
                  value={sup.id}
                  onSelect={() => {
                    onSelect(sup.id === value ? null : sup);
                    setOpen(false);
                    setSearch('');
                  }}
                  className="flex items-center gap-2 py-2"
                >
                  <Check className={cn('h-4 w-4 shrink-0', value === sup.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{sup.name}</span>
                      {sup.supplier_code && (
                        <Badge variant="outline" className="text-[10px] shrink-0">#{sup.supplier_code}</Badge>
                      )}
                    </div>
                    {(sup.contact_name || sup.email) && (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {sup.contact_name && <span>{sup.contact_name}</span>}
                        {sup.email && <span>{sup.email}</span>}
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
