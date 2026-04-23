import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown, Building2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VendorRow {
  id: string;
  name: string;
  category: string | null;
}

interface Props {
  /** Free-text vendor name (the value persisted on the expense). */
  value: string;
  onChange: (vendorName: string) => void;
  companyId?: string | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Combobox for entering or selecting a vendor on an expense.
 * Persists a free-text vendor name (matches `expenses.vendor` column),
 * but offers autocomplete from the `vendors` table and also from
 * historical expense entries so users can quickly reuse names.
 */
export function VendorSearchCombobox({
  value,
  onChange,
  companyId,
  placeholder = 'Search or type vendor name',
  disabled = false,
  className,
}: Props) {
  const { selectedCompany } = useCompany();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value || '');
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const effectiveCompanyId = companyId || selectedCompany?.id || null;

  // Keep search in sync if parent updates value externally (e.g. edit mode)
  useEffect(() => { setSearch(value || ''); }, [value]);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let vq = supabase.from('vendors').select('id, name, category').eq('is_active', true);
      if (effectiveCompanyId) {
        vq = vq.or(`company_id.eq.${effectiveCompanyId},company_id.is.null`);
      }
      const t = term.trim();
      if (t.length > 0) {
        const like = `%${t}%`;
        vq = vq.or(`name.ilike.${like},category.ilike.${like}`).limit(25);
      } else {
        vq = vq.order('name').limit(25);
      }
      const { data: vData, error: vErr } = await vq;
      if (vErr) {
        console.error('[VendorSearchCombobox] vendors query failed:', vErr);
        setErrorMsg(vErr.message);
        setVendors([]);
      } else {
        setVendors((vData || []) as VendorRow[]);
      }

      // Also fetch distinct vendor names from recent expenses for quick reuse
      let eq = supabase.from('expenses').select('vendor').not('vendor', 'is', null);
      if (effectiveCompanyId) eq = eq.eq('company_id', effectiveCompanyId);
      if (t.length > 0) eq = eq.ilike('vendor', `%${t}%`);
      eq = eq.order('expense_date', { ascending: false }).limit(50);
      const { data: eData } = await eq;
      const seen = new Set<string>();
      const names: string[] = [];
      for (const row of (eData || []) as { vendor: string | null }[]) {
        const n = (row.vendor || '').trim();
        if (n && !seen.has(n.toLowerCase())) {
          seen.add(n.toLowerCase());
          names.push(n);
          if (names.length >= 15) break;
        }
      }
      setRecentNames(names);
    } finally {
      setLoading(false);
    }
  }, [effectiveCompanyId]);

  useEffect(() => {
    if (!open) return;
    const h = setTimeout(() => load(search), 200);
    return () => clearTimeout(h);
  }, [open, search, load]);

  const commit = (name: string) => {
    onChange(name);
    setSearch(name);
    setOpen(false);
  };

  // Recent names that aren't already in the vendors list
  const vendorNamesLower = new Set(vendors.map(v => v.name.toLowerCase()));
  const extraRecent = recentNames.filter(n => !vendorNamesLower.has(n.toLowerCase()));

  const trimmed = search.trim();
  const exactMatch = vendors.some(v => v.name.toLowerCase() === trimmed.toLowerCase())
    || recentNames.some(n => n.toLowerCase() === trimmed.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal h-10',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          {value ? (
            <div className="flex items-center gap-2 text-left flex-1 min-w-0">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="font-medium truncate text-sm">{value}</span>
            </div>
          ) : (
            <span className="truncate text-sm">{placeholder}</span>
          )}
          <ChevronsUpDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type a vendor name…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {loading
                ? 'Searching…'
                : errorMsg
                  ? `Search error: ${errorMsg}`
                  : trimmed
                    ? 'No matches — press the option below to use this name as new vendor.'
                    : 'Start typing to search vendors.'}
            </CommandEmpty>

            {trimmed && !exactMatch && (
              <CommandGroup heading="New vendor">
                <CommandItem value={`__new__:${trimmed}`} onSelect={() => commit(trimmed)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Use "{trimmed}" as vendor
                </CommandItem>
              </CommandGroup>
            )}

            {vendors.length > 0 && (
              <CommandGroup heading="Vendors">
                {vendors.map((v) => (
                  <CommandItem
                    key={v.id}
                    value={`v:${v.id}`}
                    onSelect={() => commit(v.name)}
                    className="flex items-center gap-2"
                  >
                    <Check className={cn('h-4 w-4 shrink-0', value.toLowerCase() === v.name.toLowerCase() ? 'opacity-100' : 'opacity-0')} />
                    <span className="font-medium text-sm truncate flex-1">{v.name}</span>
                    {v.category && (
                      <Badge variant="secondary" className="text-[10px] capitalize">{v.category}</Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {extraRecent.length > 0 && (
              <CommandGroup heading="Recently used">
                {extraRecent.map((n) => (
                  <CommandItem
                    key={`r:${n}`}
                    value={`r:${n}`}
                    onSelect={() => commit(n)}
                    className="flex items-center gap-2"
                  >
                    <Check className={cn('h-4 w-4 shrink-0', value.toLowerCase() === n.toLowerCase() ? 'opacity-100' : 'opacity-0')} />
                    <span className="text-sm truncate">{n}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
