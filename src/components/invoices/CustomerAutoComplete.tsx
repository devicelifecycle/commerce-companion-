import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Search, UserPlus } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  street_address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  channel: string | null;
}

interface Props {
  companyId: string | null;
  value: string;
  onChange: (name: string) => void;
  onSelect: (customer: Customer) => void;
}

export function CustomerAutoComplete({ companyId, value, onChange, onSelect }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Initial load (recent customers) when company changes
  useEffect(() => {
    fetchCustomers('');
  }, [companyId]);

  // Debounced server-side search whenever the user types
  useEffect(() => {
    const t = setTimeout(() => {
      fetchCustomers(query.trim());
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, companyId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchCustomers = async (term: string) => {
    setErrorMsg(null);
    let q = supabase
      .from('customers')
      .select('id, name, email, phone, address, street_address, city, province, postal_code, country, channel')
      .order('name')
      .limit(50);
    // If a company is supplied, filter by it; otherwise search across all companies
    // so the picker isn't silently empty for super-admins or unscoped contexts.
    if (companyId) q = q.eq('company_id', companyId);
    if (term) {
      const t = `%${term}%`;
      q = q.or(`name.ilike.${t},email.ilike.${t},phone.ilike.${t},city.ilike.${t},channel.ilike.${t}`);
    }
    const { data, error } = await q;
    if (error) {
      console.error('[CustomerAutoComplete] query failed:', error);
      setErrorMsg(error.message);
      setCustomers([]);
    } else {
      setCustomers((data || []) as Customer[]);
    }
  };

  // Server already filtered — just cap display
  const filtered = customers.slice(0, 8);

  const handleInputChange = (val: string) => {
    setQuery(val);
    onChange(val);
    setShowDropdown(true);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        className="pl-8"
        value={value}
        onChange={e => handleInputChange(e.target.value)}
        onFocus={() => setShowDropdown(true)}
        placeholder="Search or enter customer name"
      />
      {showDropdown && (value.length > 0 || customers.length > 0 || errorMsg) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {errorMsg ? (
            <div className="p-3 text-xs text-destructive text-center">
              Search error: {errorMsg}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5" /> New customer — fill details below
            </div>
          ) : (
            filtered.map(c => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                onClick={() => {
                  onSelect(c);
                  setQuery(c.name);
                  setShowDropdown(false);
                }}
              >
                <span className="font-medium">{c.name}</span>
                {c.email && <span className="text-muted-foreground ml-2">{c.email}</span>}
                {c.city && <span className="text-muted-foreground ml-2">· {c.city}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
