import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Progress } from '@/components/ui/progress';
import { Target, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { startOfMonth, format } from 'date-fns';

interface GoalData {
  revenueGoal: number; profitGoal: number; expenseLimit: number | null;
  currentRevenue: number; currentProfit: number; currentExpenses: number;
}

export function GoalProgress() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GoalData>({
    revenueGoal: 0, profitGoal: 0, expenseLimit: null,
    currentRevenue: 0, currentProfit: 0, currentExpenses: 0,
  });

  useEffect(() => { fetchGoalData(); }, [selectedCompany]);

  const fetchGoalData = async () => {
    setLoading(true);
    try {
      const monthStart = startOfMonth(new Date());
      const monthKey = format(monthStart, 'yyyy-MM-01');

      let goalsQuery = supabase.from('profit_goals').select('revenue_goal, profit_goal, expense_limit').eq('month', monthKey);
      if (selectedCompany) goalsQuery = goalsQuery.eq('company_id', selectedCompany.id);
      const { data: goals } = await goalsQuery.maybeSingle();

      let salesQuery = supabase.from('sales').select('sale_price, profit').gte('sale_date', monthStart.toISOString());
      if (selectedCompany) salesQuery = salesQuery.eq('company_id', selectedCompany.id);
      const { data: sales } = await salesQuery;

      let expQuery = supabase.from('expenses').select('amount, gst_hst_amount, pst_amount').gte('expense_date', monthStart.toISOString().split('T')[0]);
      if (selectedCompany) expQuery = expQuery.eq('company_id', selectedCompany.id);
      const { data: expenses } = await expQuery;

      setData({
        revenueGoal: Number(goals?.revenue_goal) || 50000,
        profitGoal: Number(goals?.profit_goal) || 10000,
        expenseLimit: goals?.expense_limit ? Number(goals.expense_limit) : null,
        currentRevenue: sales?.reduce((sum, s) => sum + Number(s.sale_price), 0) || 0,
        currentProfit: sales?.reduce((sum, s) => sum + Number(s.profit || 0), 0) || 0,
        currentExpenses: expenses?.reduce((sum, e) => sum + Number(e.amount) + Number(e.gst_hst_amount || 0) + Number(e.pst_amount || 0), 0) || 0,
      });
    } catch (error) { console.error('Error:', error); } finally { setLoading(false); }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  const getProgress = (current: number, goal: number) => goal <= 0 ? 0 : Math.min((current / goal) * 100, 100);

  if (loading) return <div className="bg-card border border-border/60 rounded-lg h-36 animate-pulse" />;

  const goals = [
    { icon: TrendingUp, label: 'Revenue', current: data.currentRevenue, goal: data.revenueGoal, color: 'bg-primary' },
    { icon: DollarSign, label: 'Profit', current: data.currentProfit, goal: data.profitGoal, color: 'bg-success' },
    ...(data.expenseLimit ? [{ icon: TrendingDown, label: 'Expenses', current: data.currentExpenses, goal: data.expenseLimit, color: getProgress(data.currentExpenses, data.expenseLimit) > 90 ? 'bg-destructive' : 'bg-info' }] : []),
  ];

  return (
    <div className="bg-card border border-border/60 rounded-lg p-3 h-full">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-6 w-6 rounded-md bg-accent/15 flex items-center justify-center">
          <Target className="h-3 w-3 text-accent" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monthly Goals</span>
      </div>

      <div className="space-y-3">
        {goals.map(({ icon: Icon, label, current, goal, color }) => {
          const progress = getProgress(current, goal);
          return (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{formatCurrency(current)} / {formatCurrency(goal)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground text-right">{progress.toFixed(0)}%</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
