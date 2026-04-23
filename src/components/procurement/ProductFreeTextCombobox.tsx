import { useState, useEffect, useCallback, useRef } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PopoverContent } from '@/components/ui/popover';
import { AlertTriangle, Package, Wrench, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Free-text combobox for the Create PO dialog.
 *
 * The user freely types an item name or SKU. As they type we look up matching
 * rows in the corresponding inventory table (`products` for product lines,
 * `repair_parts` for repair-part lines) and show suggestions so the user can:
 *   1. See that this item already exists (and reuse the SKU), preventing duplicates.
 *   2. Or proceed as a NEW item — a fresh SKU will be generated at receive-time.
 *
 * Uses `PopoverAnchor` (not `PopoverTrigger`) so typing in the input does NOT
 * toggle the popover or steal focus. Suggestions appear automatically when the
 * search returns matches and disappear when the input is cleared/blurred.
 */

export type FreeTextSource = 'product' | 'repair_part';

export interface FreeTextMatch {
  id: string;
  name: string;
  sku: string | null;
  cost: number | null;
  quantity_on_hand: number | null;
}

interface Props {
  value: string;
  matchedId: string | null;
  matchedSku?: string | null;
  source: FreeTextSource;
  companyId: string | null;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onChange: (next: { description: string; matchedId: string | null; cost?: number | null; sku?: string | null }) => void;
}

export function ProductFreeTextCombobox({
  value,
  matchedId,
  matchedSku,
  source,
  companyId,
  disabled,
  placeholder,
  className,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<FreeTextMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const Icon = source === 'product' ? Package : Wrench;

  const runLookup = useCallback(async (term: string) => {
    const t = term.trim();
    if (t.length < 2) { setMatches([]); return; }
    setLoading(true);
    try {
      const table = source === 'product' ? 'products' : 'repair_parts';
      const costCol = source === 'product' ? 'cost_price' : 'unit_cost';

      let query: any = supabase
        .from(table as any)
        .select(`id, name, sku, ${costCol}, quantity_on_hand, company_id`)
        .limit(8);

      if (companyId) query = query.eq('company_id', companyId);
      const like = `%${t}%`;
      query = query.or(`name.ilike.${like},sku.ilike.${like}`);

      const { data, error } = await query;
      if (!error && data) {
        const mapped: FreeTextMatch[] = (data as any[]).map(r => ({
          id: r.id,
          name: r.name,
          sku: r.sku ?? null,
          cost: r[costCol] ?? null,
          quantity_on_hand: r.quantity_on_hand ?? null,
        }));
        setMatches(mapped);
      } else {
        setMatches([]);
      }
    } finally {
      setLoading(false);
    }
  }, [source, companyId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runLookup(value), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, runLookup]);

  // Show suggestions when: input focused AND user typed >=2 chars AND we have results AND no current match
  useEffect(() => {
    setOpen(hasFocus && value.trim().length >= 2 && !matchedId);
  }, [hasFocus, value, matchedId]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setHasFocus(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className={cn('space-y-1', className)}>
      <PopoverPrimitive.Root open={open && matches.length > 0} onOpenChange={() => { /* controlled */ }}>
        <PopoverPrimitive.Anchor asChild>
          <Input
            disabled={disabled}
            placeholder={placeholder || 'Type item name or SKU...'}
            value={value}
            className="h-8 text-xs"
            onChange={(e) => {
              const next = e.target.value;
              // Typing breaks the existing match (the user is editing the name)
              onChange({
                description: next,
                matchedId: null,
              });
            }}
            onFocus={() => setHasFocus(true)}
          />
        </PopoverPrimitive.Anchor>
        <PopoverContent
          className="w-[460px] p-0"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="px-3 py-2 border-b text-[11px] text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-[hsl(var(--warning))]" />
            <span>
              {matches.length} existing {source === 'product' ? 'product' : 'repair part'}
              {matches.length !== 1 ? 's' : ''} match. Click one to reuse its SKU, or keep typing for a new item.
            </span>
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {matches.map((m) => (
              <button
                key={m.id}
                type="button"
                className={cn(
                  'w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 text-xs border-b border-border/40 last:border-0',
                )}
                onMouseDown={(e) => e.preventDefault()} // keep input focus during click
                onClick={() => {
                  onChange({
                    description: m.name,
                    matchedId: m.id,
                    cost: m.cost,
                    sku: m.sku,
                  });
                  setHasFocus(false);
                }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{m.name}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                    {m.sku && <Badge variant="outline" className="text-[9px] px-1 py-0">SKU {m.sku}</Badge>}
                    {m.quantity_on_hand != null && <span>Qty {m.quantity_on_hand}</span>}
                    {m.cost != null && m.cost > 0 && <span>${Number(m.cost).toFixed(2)}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t bg-muted/30 text-[10px] text-muted-foreground flex items-center gap-1.5">
            <Plus className="h-3 w-3" />
            Or just keep your typed name — a new {source === 'product' ? 'product' : 'repair part'} with a fresh SKU will be created on receive.
          </div>
        </PopoverContent>
      </PopoverPrimitive.Root>

      {/* Status line below the input */}
      {matchedId ? (
        <div className="text-[10px] text-[hsl(var(--success))] flex items-center gap-1">
          <Package className="h-2.5 w-2.5" />
          Linked to existing {source === 'product' ? 'product' : 'part'}
          {matchedSku && <> · SKU <span className="font-mono">{matchedSku}</span></>}
          {' '}— receiving will add to existing stock.
        </div>
      ) : value.trim().length >= 2 && !loading && matches.length === 0 ? (
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Plus className="h-2.5 w-2.5" />
          New {source === 'product' ? 'product' : 'repair part'} — fresh SKU will be generated on receive.
        </div>
      ) : null}
    </div>
  );
}
