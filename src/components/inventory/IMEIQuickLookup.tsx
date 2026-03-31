import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, X, Smartphone, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface LookupResult {
  id: string;
  brand: string;
  model: string;
  imei: string | null;
  sku: string | null;
  status: string;
  condition: string;
  cosmetic_grade: string | null;
  cost_price: number;
  sale_price: number | null;
  storage: string | null;
  color: string | null;
  fulfillment_channel: string | null;
  company_id: string | null;
  suppliers?: { name: string } | null;
}

interface IMEIQuickLookupProps {
  onSelectDevice?: (device: LookupResult) => void;
}

export function IMEIQuickLookup({ onSelectDevice }: IMEIQuickLookupProps) {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query || query.length < 3) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        let q = supabase
          .from('devices')
          .select('id, brand, model, imei, sku, status, condition, cosmetic_grade, cost_price, sale_price, storage, color, fulfillment_channel, company_id, suppliers(name)')
          .or(`imei.ilike.%${query}%,sku.ilike.%${query}%,model.ilike.%${query}%`)
          .limit(8);
        if (selectedCompany) q = q.eq('company_id', selectedCompany.id);
        const { data } = await q;
        setResults((data as any) || []);
        setIsOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, selectedCompany]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Quick lookup: IMEI, SKU, or model..."
          className="pl-9 pr-8"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setIsOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && (
        <Card className="absolute z-50 top-full mt-1 w-full shadow-lg border">
          <CardContent className="p-1">
            {loading && <p className="text-xs text-muted-foreground text-center py-3">Searching...</p>}
            {!loading && results.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">No devices found</p>
            )}
            {results.map((device) => (
              <button
                key={device.id}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-muted/60 transition-colors flex items-center gap-3"
                onClick={() => {
                  if (onSelectDevice) onSelectDevice(device);
                  setIsOpen(false);
                  setQuery('');
                }}
              >
                <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{device.brand} {device.model} {device.storage && `(${device.storage})`}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {device.imei || device.sku || 'No IMEI/SKU'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {device.cosmetic_grade && (
                    <Badge variant="outline" className="text-[10px] px-1">{device.cosmetic_grade}</Badge>
                  )}
                  <StatusBadge status={device.status as any} />
                  <span className="text-xs font-medium">{formatCurrency(device.cost_price)}</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
