import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown, Package, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProductOption {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  unit_of_measure: string;
  cost_price: number;
  sale_price: number | null;
  quantity_on_hand: number;
  company_id: string | null;
  category_name?: string;
}

interface ProductSearchComboboxProps {
  value?: string | null;
  onSelect: (product: ProductOption | null) => void;
  companyId?: string;
  excludeIds?: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ProductSearchCombobox({
  value,
  onSelect,
  companyId,
  excludeIds = [],
  placeholder = 'Search by name, SKU, barcode...',
  disabled = false,
  className,
}: ProductSearchComboboxProps) {
  const { selectedCompany } = useCompany();
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const effectiveCompanyId = companyId || selectedCompany?.id || null;

  const loadProducts = useCallback(async (term: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let query = supabase
        .from('products')
        .select('id, name, description, sku, barcode, unit_of_measure, cost_price, sale_price, quantity_on_hand, company_id, product_categories(name)')
        .eq('status', 'active');

      if (effectiveCompanyId) {
        query = query.eq('company_id', effectiveCompanyId);
      }

      const t = term.trim();
      if (t.length > 0) {
        const like = `%${t}%`;
        query = query.or(`name.ilike.${like},sku.ilike.${like},barcode.ilike.${like},description.ilike.${like}`);
        query = query.limit(50);
      } else {
        query = query.order('name').limit(25);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[ProductSearchCombobox] query failed:', error);
        setErrorMsg(error.message);
        setProducts([]);
      } else {
        setProducts((data || []).map((p: any) => ({
          ...p,
          category_name: p.product_categories?.name || null,
        })));
      }
    } finally {
      setLoading(false);
    }
  }, [effectiveCompanyId]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => loadProducts(search), 200);
    return () => clearTimeout(handle);
  }, [open, search, loadProducts]);

  const filtered = useMemo(
    () => products.filter(p => !excludeIds.includes(p.id)),
    [products, excludeIds]
  );

  const selectedProduct = products.find(p => p.id === value);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal h-auto min-h-10', !selectedProduct && 'text-muted-foreground', className)}
        >
          {selectedProduct ? (
            <div className="flex items-center gap-2 text-left flex-1 min-w-0">
              <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="truncate">
                <span className="font-medium">{selectedProduct.name}</span>
                {selectedProduct.sku && (
                  <span className="text-xs text-muted-foreground ml-2">SKU: {selectedProduct.sku}</span>
                )}
              </div>
              <Badge variant="outline" className="ml-auto shrink-0 text-xs">
                {selectedProduct.quantity_on_hand} {selectedProduct.unit_of_measure}s
              </Badge>
            </div>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {selectedProduct && (
              <X
                className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onSelect(null); }}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[460px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search name, SKU, barcode..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>
              {loading
                ? 'Loading products…'
                : errorMsg
                  ? `Search error: ${errorMsg}`
                  : 'No products found. Try a different search term.'}
            </CommandEmpty>
            <CommandGroup heading={`${filtered.length} product${filtered.length !== 1 ? 's' : ''} available`}>
              {filtered.slice(0, 50).map((product) => (
                <CommandItem
                  key={product.id}
                  value={product.id}
                  onSelect={() => {
                    onSelect(product.id === value ? null : product);
                    setOpen(false);
                    setSearch('');
                  }}
                  className="flex items-center gap-2 py-2"
                >
                  <Check className={cn('h-4 w-4 shrink-0', value === product.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{product.name}</span>
                      {product.category_name && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">{product.category_name}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {product.sku && <span>SKU: {product.sku}</span>}
                      <span>Qty: {product.quantity_on_hand}</span>
                      <span>{product.unit_of_measure}</span>
                    </div>
                  </div>
                  <span className="text-sm font-mono text-muted-foreground shrink-0">
                    {formatCurrency(product.cost_price)}
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
