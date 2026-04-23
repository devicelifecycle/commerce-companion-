import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PopoverContent } from '@/components/ui/popover';
import { AlertTriangle, Package, Wrench, Plus, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Free-text combobox for the Create PO dialog.
 *
 * Type-ahead with keyboard navigation:
 *   - ArrowDown / ArrowUp move the active suggestion
 *   - Enter selects the active suggestion (reuses its SKU)
 *   - Escape closes the suggestion list (keeps typed text as a new item)
 *   - Matched substrings inside name and SKU are visually highlighted
 *
 * Uses `PopoverAnchor` so typing in the input does NOT toggle focus.
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

/** Highlight occurrences of `term` inside `text` (case-insensitive). */
function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const t = term.trim();
  if (!t) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = t.toLowerCase();
  const parts: Array<{ s: string; hit: boolean }> = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(needle, i);
    if (idx === -1) {
      parts.push({ s: text.slice(i), hit: false });
      break;
    }
    if (idx > i) parts.push({ s: text.slice(i, idx), hit: false });
    parts.push({ s: text.slice(idx, idx + needle.length), hit: true });
    i = idx + needle.length;
  }
  return (
    <>
      {parts.map((p, idx) =>
        p.hit ? (
          <mark
            key={idx}
            className="bg-[hsl(var(--warning)/0.25)] text-foreground rounded-sm px-0.5"
          >
            {p.s}
          </mark>
        ) : (
          <span key={idx}>{p.s}</span>
        )
      )}
    </>
  );
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
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  // Reset active index when match list changes
  useEffect(() => {
    setActiveIndex(0);
  }, [matches]);

  // Keep active item visible inside the scroll container
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

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

  const selectMatch = useCallback((m: FreeTextMatch) => {
    onChange({
      description: m.name,
      matchedId: m.id,
      cost: m.cost,
      sku: m.sku,
    });
    setHasFocus(false);
  }, [onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const m = matches[activeIndex];
      if (m) selectMatch(m);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setHasFocus(false);
    }
  };

  const term = useMemo(() => value.trim(), [value]);

  return (
    <div ref={containerRef} className={cn('space-y-1', className)}>
      <PopoverPrimitive.Root open={open && matches.length > 0} onOpenChange={() => { /* controlled */ }}>
        <PopoverPrimitive.Anchor asChild>
          <Input
            disabled={disabled}
            placeholder={placeholder || 'Type item name or SKU...'}
            value={value}
            className="h-8 text-xs"
            role="combobox"
            aria-expanded={open && matches.length > 0}
            aria-autocomplete="list"
            aria-activedescendant={open && matches[activeIndex] ? `pfx-opt-${matches[activeIndex].id}` : undefined}
            onChange={(e) => {
              const next = e.target.value;
              // Typing breaks the existing match (the user is editing the name)
              onChange({
                description: next,
                matchedId: null,
              });
            }}
            onFocus={() => setHasFocus(true)}
            onKeyDown={handleKeyDown}
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
              {matches.length !== 1 ? 's' : ''} match. Use ↑ ↓ to navigate, Enter to select, Esc to keep typing.
            </span>
          </div>
          <div ref={listRef} className="max-h-[260px] overflow-y-auto" role="listbox">
            {matches.map((m, idx) => {
              const active = idx === activeIndex;
              return (
                <button
                  key={m.id}
                  id={`pfx-opt-${m.id}`}
                  data-idx={idx}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={cn(
                    'w-full text-left px-3 py-2 flex items-center gap-2 text-xs border-b border-border/40 last:border-0 transition-colors',
                    active ? 'bg-accent' : 'hover:bg-accent/60',
                  )}
                  onMouseDown={(e) => e.preventDefault()} // keep input focus during click
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => selectMatch(m)}
                >
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-foreground' : 'text-muted-foreground')} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      <Highlight text={m.name} term={term} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      {m.sku && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          SKU <Highlight text={m.sku} term={term} />
                        </Badge>
                      )}
                      {m.quantity_on_hand != null && <span>Qty {m.quantity_on_hand}</span>}
                      {m.cost != null && m.cost > 0 && <span>${Number(m.cost).toFixed(2)}</span>}
                    </div>
                  </div>
                  {active && (
                    <CornerDownLeft className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t bg-muted/30 text-[10px] text-muted-foreground flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Plus className="h-3 w-3" />
              Keep typing for a new {source === 'product' ? 'product' : 'repair part'} (fresh SKU on receive).
            </span>
            <span className="flex items-center gap-1 opacity-80">
              <ArrowUp className="h-2.5 w-2.5" /><ArrowDown className="h-2.5 w-2.5" />
              <span>·</span>
              <CornerDownLeft className="h-2.5 w-2.5" />
            </span>
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
