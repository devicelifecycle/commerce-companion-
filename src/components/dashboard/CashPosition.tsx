import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Wallet, Building2 } from 'lucide-react';

interface BankBalance {
  companyId: string;
  companyCode: string;
  companyName: string;
  balance: number;
}

export function CashPosition() {
  const { selectedCompany, companies } = useCompany();
  const [balances, setBalances] = useState<BankBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchBalances(); }, [selectedCompany]);

  const fetchBalances = async () => {
    setLoading(true);
    try {
      let query = supabase.from('bank_accounts').select('company_id, current_balance, is_active').eq('is_active', true);
      if (selectedCompany) query = query.eq('company_id', selectedCompany.id);
      const { data } = await query;

      const companyBalances: Record<string, number> = {};
      data?.forEach(account => {
        if (account.company_id) companyBalances[account.company_id] = (companyBalances[account.company_id] || 0) + Number(account.current_balance || 0);
      });

      setBalances(companies.filter(c => !selectedCompany || c.id === selectedCompany.id).map(c => ({
        companyId: c.id, companyCode: c.code, companyName: c.name, balance: companyBalances[c.id] || 0,
      })));
    } catch (error) { console.error('Error:', error); } finally { setLoading(false); }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0);

  if (loading) return <div className="bg-card border border-border/60 rounded-lg h-36 animate-pulse" />;

  return (
    <div className="bg-card border border-border/60 rounded-lg p-3 h-full">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
          <Wallet className="h-3 w-3 text-primary" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cash Position</span>
      </div>

      <div className="p-2.5 rounded-lg bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 border border-primary/20 mb-2">
        <p className="text-[10px] text-muted-foreground">Combined</p>
        <p className="text-2xl font-bold font-display gradient-text">{formatCurrency(totalBalance)}</p>
      </div>

      {balances.length > 1 && (
        <div className="grid grid-cols-2 gap-1.5">
          {balances.map((b) => (
            <div key={b.companyId} className="p-2 rounded-md bg-muted/30 border border-border/40">
              <div className="flex items-center gap-1 mb-0.5">
                <Building2 className="h-2.5 w-2.5 text-muted-foreground" />
                <span className="text-[9px] font-medium text-muted-foreground">{b.companyCode}</span>
              </div>
              <p className={`text-sm font-semibold ${b.balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatCurrency(b.balance)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
