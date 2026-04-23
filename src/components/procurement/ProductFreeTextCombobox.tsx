import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertTriangle, Package, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Free-text combobox used in the Create Purchase Order dialog. The user types
 * the item name freely (this is the source of truth for the PO line), but as
 * they type we look up matching rows in the corresponding inventory table
 * (`products` for product lines, `repair_parts` for repair-part lines) and
 * show them as suggestions so the user can:
 *   1. See that this item already exists (and therefore an SKU already exists),
 *      preventing duplicate SKUs.
 *   2. Optionally accept the match, which fills in the existing id + SKU +
 *      cost so receiving will roll into the same row instead of a duplicate.
 *
 * If there is no match, the typed text is kept as-is and a brand-new
 * inventory row will be created at receive-time.
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const Icon = source === 'product' ? Package : Wrench;

  const runLookup = useCallback(async (term: string) => {
    const t = term.trim();
    if (t.length < 2) { setMatches([]); return; }
    setLoading(true);
    try {
      const table = source === 'product' ? 'products' : 'repair_parts';
      let query = supabase
        .from(table as any)
        .select('id, name, sku, cost_price:unit_cost, quantity_on_hand, company_id')
        .limit(8);

      // products has `cost_price`, repair_parts has `unit_cost` — alias above
      // doesn't actually rewrite for products. Re-issue with correct column:
      if (source === 'product') {
        query = supabase
          .from('products')
          .select('id, name, sku, cost_price, quantity_on_hand, company_id')
          .limit(8) as any;
      }

      if (companyId) {
        query = (query as any).eq('company_id', companyId);
      }
      const like = `%${t}%`;
      query = (query as any).or(`name.ilike.${like},sku.ilike.${like}`);

      const { data, error } = await query;
      if (!error && data) {
        const mapped: FreeTextMatch[] = (data as any[]).map(r => ({
          id: r.id,
          name: r.name,
          sku: r.sku ?? null,
          cost: source === 'product' ? (r.cost_price ?? null) : (r.unit_cost ?? null),
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

  // Re-open suggestion list when user is typing and we have new matches
  useEffect(() => {
    if (matches.length > 0 && value.trim().length >= 2 && !matchedId) setOpen(true);
  }, [matches, value, matchedId]);

  const matchedRow = matchedId ? matches.find(m => m.id === matchedId) : null;

  return (
    <div className={cn('space-y-1', className)}>
      <Popover open={open && matches.length > 0} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Input
            disabled={disabled}
            placeholder={placeholder || 'Type item name...'}
            value={value}
            className="h-8 text-xs"
            onChange={(e) => {
              const next = e.target.value;
              // Typing breaks an existing match unless the text still equals it
              const stillMatches = matchedRow && next === matchedRow.name;
              onChange({
                description: next,
                matchedId: stillMatches ? matchedId : null,
              });
            }}
            onFocus={() => { if (matches.length > 0) setOpen(true); }}
          />
        </PopoverTrigger>
        <PopoverContent
          className="w-[420px] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="px-3 py-2 border-b text-[11px] text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-[hsl(var(--warning))]" />
            <span>
              {matches.length} existing {source === 'product' ? 'product' : 'repair part'}
              {matches.length !== 1 ? 's' : ''} match. Click to reuse and avoid duplicate SKU.
            </span>
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {matches.map((m) => (
              <button
                key={m.id}
                type="button"
                className={cn(
                  'w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 text-xs border-b border-border/40 last:border-0',
                  matchedId === m.id && 'bg-accent',
                )}
                onClick={() => {
                  onChange({
                    description: m.name,
                    matchedId: m.id,
                    cost: m.cost,
                    sku: m.sku,
                  });
                  setOpen(false);
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
        </PopoverContent>
      </Popover>
      {matchedRow && (
        <div className="text-[10px] text-[hsl(var(--success))] flex items-center gap-1">
          <Package className="h-2.5 w-2.5" />
          Linked to existing {source === 'product' ? 'product' : 'part'}: SKU {matchedRow.sku || '—'} (qty {matchedRow.quantity_on_hand ?? 0}). Receiving will add to this stock.
        </div>
      )}
      {!matchedRow && value.trim().length >= 2 && !loading && matches.length === 0 && (
        <div className="text-[10px] text-muted-foreground">
          New {source === 'product' ? 'product' : 'repair part'} — a fresh SKU will be generated when received.
        </div>
      )}
    </div>
  );
}
