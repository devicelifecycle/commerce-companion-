import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, TrendingUp, TrendingDown, Building2 } from 'lucide-react';

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

  useEffect(() => {
    fetchBalances();
  }, [selectedCompany]);

  const fetchBalances = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('bank_accounts')
        .select('company_id, current_balance, is_active')
        .eq('is_active', true);

      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data } = await query;

      // Group by company
      const companyBalances: Record<string, number> = {};
      data?.forEach(account => {
        if (account.company_id) {
          companyBalances[account.company_id] = (companyBalances[account.company_id] || 0) + Number(account.current_balance || 0);
        }
      });

      const result: BankBalance[] = companies
        .filter(c => !selectedCompany || c.id === selectedCompany.id)
        .map(c => ({
          companyId: c.id,
          companyCode: c.code,
          companyName: c.name,
          balance: companyBalances[c.id] || 0,
        }));

      setBalances(result);
    } catch (error) {
      console.error('Error fetching balances:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0);

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="h-36" />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          Cash Position
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 border border-primary/20">
          <p className="text-sm text-muted-foreground mb-1">Combined Cash</p>
          <p className="text-3xl font-bold font-display gradient-text">
            {formatCurrency(totalBalance)}
          </p>
        </div>

        {/* Per Company */}
        {balances.length > 1 && (
          <div className="grid grid-cols-2 gap-3">
            {balances.map((b) => (
              <div
                key={b.companyId}
                className="p-3 rounded-lg bg-muted/30 border border-border/40"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">{b.companyCode}</span>
                </div>
                <p className={`text-lg font-semibold ${b.balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(b.balance)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
