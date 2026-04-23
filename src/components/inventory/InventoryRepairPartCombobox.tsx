import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown, Wrench, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveLookupCompanyId } from '@/lib/inventoryLookup';

export interface InventoryRepairPart {
  id: string;
  name: string;
  sku: string | null;
  unit_cost: number;
  quantity_on_hand: number;
  category: string | null;
  company_id: string | null;
}

interface Props {
  value?: string | null;
  onSelect: (part: InventoryRepairPart | null) => void;
  companyId?: string | null;
  /** Only show parts with quantity > 0 */
  inStockOnly?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function InventoryRepairPartCombobox({
  value,
  onSelect,
  companyId,
  inStockOnly = false,
  placeholder = 'Search repair parts by name, SKU…',
  disabled = false,
  className,
}: Props) {
  const { selectedCompany } = useCompany();
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<InventoryRepairPart[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Unified company-scope rule: prop > context > all companies. See
  // src/lib/inventoryLookup.ts.
  const effectiveCompanyId = resolveLookupCompanyId(companyId, selectedCompany?.id);

  const loadParts = useCallback(async (term: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let query = supabase
        .from('repair_parts')
        .select('id, name, sku, unit_cost, quantity_on_hand, category, company_id')
        .eq('is_active', true);

      if (effectiveCompanyId) query = query.eq('company_id', effectiveCompanyId);
      if (inStockOnly) query = query.gt('quantity_on_hand', 0);

      const t = term.trim();
      if (t.length > 0) {
        const like = `%${t}%`;
        query = query.or(`name.ilike.${like},sku.ilike.${like},category.ilike.${like}`).limit(50);
      } else {
        query = query.order('name').limit(50);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[InventoryRepairPartCombobox] query failed:', error);
        setErrorMsg(error.message);
        setParts([]);
      } else {
        setParts((data || []) as InventoryRepairPart[]);
      }
    } finally {
      setLoading(false);
    }
  }, [effectiveCompanyId, inStockOnly]);

  // Debounced server-side search whenever popover is open or search changes
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => loadParts(search), 200);
    return () => clearTimeout(handle);
  }, [open, search, loadParts]);

  // Also fetch the currently-selected part separately so the trigger label
  // works even when it's not in the current search result set.
  const [selectedPart, setSelectedPart] = useState<InventoryRepairPart | null>(null);
  useEffect(() => {
    if (!value) { setSelectedPart(null); return; }
    const fromList = parts.find(p => p.id === value);
    if (fromList) { setSelectedPart(fromList); return; }
    (async () => {
      const { data } = await supabase
        .from('repair_parts')
        .select('id, name, sku, unit_cost, quantity_on_hand, category, company_id')
        .eq('id', value)
        .maybeSingle();
      if (data) setSelectedPart(data as InventoryRepairPart);
    })();
  }, [value, parts]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const visible = useMemo(() => parts.slice(0, 50), [parts]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal h-auto min-h-9',
            !selectedPart && 'text-muted-foreground',
            className,
          )}
        >
          {selectedPart ? (
            <div className="flex items-center gap-2 text-left flex-1 min-w-0">
              <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="truncate">
                <span className="font-medium text-sm">{selectedPart.name}</span>
                {selectedPart.sku && (
                  <span className="text-xs text-muted-foreground ml-2">SKU: {selectedPart.sku}</span>
                )}
              </div>
              <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                {selectedPart.quantity_on_hand} left
              </Badge>
            </div>
          ) : (
            <span className="truncate text-sm">{placeholder}</span>
          )}
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {selectedPart && (
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
            placeholder="Search name, SKU, category…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {loading
                ? 'Loading parts…'
                : errorMsg
                  ? `Search error: ${errorMsg}`
                  : inStockOnly
                    ? 'No in-stock parts found. Try a broader search or receive stock first.'
                    : 'No parts found. Add parts in Inventory → Repair Parts.'}
            </CommandEmpty>
            <CommandGroup heading={`${visible.length} part${visible.length !== 1 ? 's' : ''}`}>
              {visible.map((part) => (
                <CommandItem
                  key={part.id}
                  value={part.id}
                  onSelect={() => {
                    onSelect(part.id === value ? null : part);
                    setOpen(false);
                    setSearch('');
                  }}
                  className="flex items-center gap-2 py-2"
                >
                  <Check className={cn('h-4 w-4 shrink-0', value === part.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{part.name}</span>
                      {part.category && (
                        <Badge variant="secondary" className="text-[10px] shrink-0 capitalize">
                          {part.category}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {part.sku && <span>SKU: {part.sku}</span>}
                      <span>Qty: {part.quantity_on_hand}</span>
                    </div>
                  </div>
                  <span className="text-sm font-mono text-muted-foreground shrink-0">
                    {formatCurrency(part.unit_cost)}
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
