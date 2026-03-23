import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { modelFuzzyKey } from '@/lib/modelNormalization';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown, Wrench, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RepairPartCatalogOption {
  id: string;
  name: string;
  normalized_key: string;
  category: string | null;
  compatible_devices: string | null;
  default_cost: number | null;
  sku_prefix: string | null;
}

interface RepairPartSearchComboboxProps {
  value?: string | null;
  onSelect: (part: RepairPartCatalogOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** If provided, show fuzzy match warning for free-text that matches existing parts */
  freeTextValue?: string;
  onFreeTextChange?: (text: string) => void;
  allowFreeText?: boolean;
}

export function RepairPartSearchCombobox({
  value,
  onSelect,
  placeholder = 'Search repair parts catalog...',
  disabled = false,
  className,
  freeTextValue,
  onFreeTextChange,
  allowFreeText = false,
}: RepairPartSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<RepairPartCatalogOption[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [fuzzyWarning, setFuzzyWarning] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('repair_parts_catalog' as any)
        .select('*')
        .eq('is_active', true)
        .order('name')
        .limit(500);

      if (!error && data) {
        setCatalog(data as any);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadCatalog();
  }, [open, loadCatalog]);

  // Fuzzy match check for free text input
  useEffect(() => {
    if (!freeTextValue || !allowFreeText || catalog.length === 0) {
      setFuzzyWarning(null);
      return;
    }
    const inputKey = freeTextValue.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (inputKey.length < 4) { setFuzzyWarning(null); return; }

    const match = catalog.find(c => {
      const catKey = c.normalized_key;
      // Check if keys are very similar (one contains the other or Levenshtein-like)
      return catKey.includes(inputKey) || inputKey.includes(catKey) ||
        (inputKey.length > 5 && catKey.length > 5 && 
         (inputKey.slice(0, 6) === catKey.slice(0, 6)));
    });

    setFuzzyWarning(match ? `Similar part exists: "${match.name}". Did you mean to select it?` : null);
  }, [freeTextValue, catalog, allowFreeText]);

  const filtered = useMemo(() => {
    if (!search.trim()) return catalog;
    const s = search.toLowerCase();
    return catalog.filter(p =>
      p.name.toLowerCase().includes(s) ||
      p.category?.toLowerCase().includes(s) ||
      p.sku_prefix?.toLowerCase().includes(s) ||
      p.compatible_devices?.toLowerCase().includes(s)
    );
  }, [catalog, search]);

  const selectedPart = catalog.find(p => p.id === value);

  return (
    <div className="space-y-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn('w-full justify-between font-normal h-auto min-h-8', !selectedPart && 'text-muted-foreground', className)}
          >
            {selectedPart ? (
              <div className="flex items-center gap-2 text-left flex-1 min-w-0">
                <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="font-medium truncate text-xs">{selectedPart.name}</span>
              </div>
            ) : (
              <span className="truncate text-xs">{placeholder}</span>
            )}
            <div className="flex items-center gap-1 ml-2 shrink-0">
              {selectedPart && (
                <X
                  className="h-3 w-3 text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); onSelect(null); }}
                />
              )}
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search parts catalog..." value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{loading ? 'Loading...' : 'No parts in catalog. Add parts via Settings → Repair Parts Catalog.'}</CommandEmpty>
              <CommandGroup heading={`${filtered.length} cataloged part${filtered.length !== 1 ? 's' : ''}`}>
                {filtered.slice(0, 50).map((part) => (
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
                      <span className="font-medium text-sm">{part.name}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {part.category && <Badge variant="outline" className="text-[10px] capitalize">{part.category}</Badge>}
                        {part.compatible_devices && <span>{part.compatible_devices}</span>}
                      </div>
                    </div>
                    {part.default_cost != null && part.default_cost > 0 && (
                      <span className="text-xs font-mono text-muted-foreground shrink-0">
                        ${Number(part.default_cost).toFixed(2)}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {fuzzyWarning && (
        <div className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--warning))]">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{fuzzyWarning}</span>
        </div>
      )}
    </div>
  );
}
