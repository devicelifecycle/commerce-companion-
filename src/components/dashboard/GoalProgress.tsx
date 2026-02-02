import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Target, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { startOfMonth, format } from 'date-fns';

interface GoalData {
  revenueGoal: number;
  profitGoal: number;
  expenseLimit: number | null;
  currentRevenue: number;
  currentProfit: number;
  currentExpenses: number;
}

export function GoalProgress() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GoalData>({
    revenueGoal: 0,
    profitGoal: 0,
    expenseLimit: null,
    currentRevenue: 0,
    currentProfit: 0,
    currentExpenses: 0,
  });

  useEffect(() => {
    fetchGoalData();
  }, [selectedCompany]);

  const fetchGoalData = async () => {
    setLoading(true);
    try {
      const monthStart = startOfMonth(new Date());
      const monthKey = format(monthStart, 'yyyy-MM-01');

      // Fetch goals
      let goalsQuery = supabase
        .from('profit_goals')
        .select('revenue_goal, profit_goal, expense_limit')
        .eq('month', monthKey);

      if (selectedCompany) {
        goalsQuery = goalsQuery.eq('company_id', selectedCompany.id);
      }

      const { data: goals } = await goalsQuery.maybeSingle();

      // Fetch current MTD sales
      let salesQuery = supabase
        .from('sales')
        .select('sale_price, profit')
        .gte('sale_date', monthStart.toISOString());

      if (selectedCompany) {
        salesQuery = salesQuery.eq('company_id', selectedCompany.id);
      }

      const { data: sales } = await salesQuery;

      // Fetch current MTD expenses
      let expQuery = supabase
        .from('expenses')
        .select('amount, gst_hst_amount, pst_amount')
        .gte('expense_date', monthStart.toISOString().split('T')[0]);

      if (selectedCompany) {
        expQuery = expQuery.eq('company_id', selectedCompany.id);
      }

      const { data: expenses } = await expQuery;

      const currentRevenue = sales?.reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;
      const currentProfit = sales?.reduce((sum, s) => sum + Number(s.profit || 0), 0) || 0;
      const currentExpenses = expenses?.reduce((sum, e) => 
        sum + Number(e.amount) + Number(e.gst_hst_amount || 0) + Number(e.pst_amount || 0), 0) || 0;

      setData({
        revenueGoal: Number(goals?.revenue_goal) || 50000,
        profitGoal: Number(goals?.profit_goal) || 10000,
        expenseLimit: goals?.expense_limit ? Number(goals.expense_limit) : null,
        currentRevenue,
        currentProfit,
        currentExpenses,
      });
    } catch (error) {
      console.error('Error fetching goal data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  const getProgress = (current: number, goal: number) => {
    if (goal <= 0) return 0;
    return Math.min((current / goal) * 100, 100);
  };

  const revenueProgress = getProgress(data.currentRevenue, data.revenueGoal);
  const profitProgress = getProgress(data.currentProfit, data.profitGoal);
  const expenseProgress = data.expenseLimit ? getProgress(data.currentExpenses, data.expenseLimit) : 0;

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
          <div className="h-8 w-8 rounded-lg bg-accent/15 flex items-center justify-center">
            <Target className="h-4 w-4 text-accent" />
          </div>
          Monthly Goals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Revenue Goal */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="font-medium">Revenue</span>
            </div>
            <span className="text-muted-foreground">
              {formatCurrency(data.currentRevenue)} / {formatCurrency(data.revenueGoal)}
            </span>
          </div>
          <Progress value={revenueProgress} className="h-2" />
          <p className="text-xs text-muted-foreground text-right">
            {revenueProgress.toFixed(0)}% of goal
          </p>
        </div>

        {/* Profit Goal */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-success" />
              <span className="font-medium">Profit</span>
            </div>
            <span className="text-muted-foreground">
              {formatCurrency(data.currentProfit)} / {formatCurrency(data.profitGoal)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-success transition-all duration-500"
              style={{ width: `${profitProgress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">
            {profitProgress.toFixed(0)}% of goal
          </p>
        </div>

        {/* Expense Limit */}
        {data.expenseLimit && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-destructive" />
                <span className="font-medium">Expenses</span>
              </div>
              <span className="text-muted-foreground">
                {formatCurrency(data.currentExpenses)} / {formatCurrency(data.expenseLimit)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  expenseProgress > 90 ? 'bg-destructive' : expenseProgress > 75 ? 'bg-warning' : 'bg-info'
                }`}
                style={{ width: `${expenseProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-right">
              {expenseProgress > 100 ? 'Over budget!' : `${expenseProgress.toFixed(0)}% of limit`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
