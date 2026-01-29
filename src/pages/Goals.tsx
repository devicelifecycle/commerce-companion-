import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Plus, Target, TrendingUp, DollarSign, Wallet, CheckCircle, AlertTriangle } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';

interface ProfitGoal {
  id: string;
  month: string;
  revenue_goal: number;
  profit_goal: number;
  expense_limit: number | null;
  notes: string | null;
}

interface MonthlyActual {
  revenue: number;
  profit: number;
  expenses: number;
}

export default function Goals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<ProfitGoal[]>([]);
  const [currentMonthActuals, setCurrentMonthActuals] = useState<MonthlyActual>({ revenue: 0, profit: 0, expenses: 0 });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const currentMonth = format(new Date(), 'yyyy-MM');
  const currentGoal = goals.find(g => g.month.startsWith(currentMonth));

  const [formData, setFormData] = useState({
    month: format(new Date(), 'yyyy-MM'),
    revenue_goal: '',
    profit_goal: '',
    expense_limit: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch goals
      const { data: goalsData, error: goalsError } = await supabase
        .from('profit_goals')
        .select('*')
        .order('month', { ascending: false });

      if (goalsError) throw goalsError;
      setGoals(goalsData || []);

      // Fetch current month actuals
      const monthStart = startOfMonth(new Date());
      const monthEnd = endOfMonth(new Date());

      const [salesRes, expensesRes] = await Promise.all([
        supabase
          .from('sales')
          .select('sale_price, profit')
          .gte('sale_date', monthStart.toISOString())
          .lte('sale_date', monthEnd.toISOString()),
        supabase
          .from('expenses')
          .select('amount')
          .gte('expense_date', monthStart.toISOString().split('T')[0])
          .lte('expense_date', monthEnd.toISOString().split('T')[0]),
      ]);

      const revenue = salesRes.data?.reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;
      const profit = salesRes.data?.reduce((sum, s) => sum + Number(s.profit || 0), 0) || 0;
      const expenses = expensesRes.data?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

      setCurrentMonthActuals({ revenue, profit, expenses });
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load goals');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { error } = await supabase.from('profit_goals').upsert([{
        month: `${formData.month}-01`,
        revenue_goal: parseFloat(formData.revenue_goal),
        profit_goal: parseFloat(formData.profit_goal),
        expense_limit: formData.expense_limit ? parseFloat(formData.expense_limit) : null,
        created_by: user?.id,
      }], { onConflict: 'month' });

      if (error) throw error;
      
      toast.success('Goal saved successfully');
      setDialogOpen(false);
      setFormData({
        month: format(new Date(), 'yyyy-MM'),
        revenue_goal: '',
        profit_goal: '',
        expense_limit: '',
      });
      fetchData();
    } catch (error) {
      console.error('Error saving goal:', error);
      toast.error('Failed to save goal');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);
  };

  const calculateProgress = (actual: number, goal: number) => {
    if (goal <= 0) return 0;
    return Math.min((actual / goal) * 100, 100);
  };

  const getProgressColor = (progress: number, isExpense: boolean = false) => {
    if (isExpense) {
      return progress > 100 ? 'bg-destructive' : progress > 80 ? 'bg-warning' : 'bg-success';
    }
    return progress >= 100 ? 'bg-success' : progress >= 70 ? 'bg-primary' : 'bg-warning';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-48 bg-muted rounded-xl" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const revenueProgress = currentGoal ? calculateProgress(currentMonthActuals.revenue, currentGoal.revenue_goal) : 0;
  const profitProgress = currentGoal ? calculateProgress(currentMonthActuals.profit, currentGoal.profit_goal) : 0;
  const expenseProgress = currentGoal?.expense_limit ? calculateProgress(currentMonthActuals.expenses, currentGoal.expense_limit) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text flex items-center gap-3">
              <Target className="h-8 w-8" />
              Profit Goals & Budgets
            </h1>
            <p className="text-muted-foreground mt-1">Set monthly targets and track your progress</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="h-4 w-4 mr-2" />
                Set Goal
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display">Set Monthly Goal</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Input
                    type="month"
                    value={formData.month}
                    onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Revenue Goal ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.revenue_goal}
                      onChange={(e) => setFormData({ ...formData, revenue_goal: e.target.value })}
                      placeholder="10000"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Profit Goal ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.profit_goal}
                      onChange={(e) => setFormData({ ...formData, profit_goal: e.target.value })}
                      placeholder="3000"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Expense Limit (optional)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.expense_limit}
                    onChange={(e) => setFormData({ ...formData, expense_limit: e.target.value })}
                    placeholder="2000"
                  />
                </div>
                <Button type="submit" className="w-full gradient-primary">Save Goal</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Current Month Progress */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="metric-card">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Revenue Goal</p>
                  <p className="text-2xl font-bold font-display">
                    {formatCurrency(currentMonthActuals.revenue)}
                    <span className="text-sm text-muted-foreground font-normal">
                      {' '}/ {currentGoal ? formatCurrency(currentGoal.revenue_goal) : '-'}
                    </span>
                  </p>
                </div>
                <div className="p-3 rounded-xl gradient-primary">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
              </div>
              {currentGoal && (
                <>
                  <Progress value={revenueProgress} className="h-3" />
                  <div className="flex justify-between text-sm">
                    <span className={revenueProgress >= 100 ? 'text-success' : 'text-muted-foreground'}>
                      {revenueProgress.toFixed(0)}% achieved
                    </span>
                    {revenueProgress >= 100 && <CheckCircle className="h-4 w-4 text-success" />}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="metric-card">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Profit Goal</p>
                  <p className="text-2xl font-bold font-display text-success">
                    {formatCurrency(currentMonthActuals.profit)}
                    <span className="text-sm text-muted-foreground font-normal">
                      {' '}/ {currentGoal ? formatCurrency(currentGoal.profit_goal) : '-'}
                    </span>
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-success/20">
                  <DollarSign className="h-5 w-5 text-success" />
                </div>
              </div>
              {currentGoal && (
                <>
                  <Progress value={profitProgress} className="h-3" />
                  <div className="flex justify-between text-sm">
                    <span className={profitProgress >= 100 ? 'text-success' : 'text-muted-foreground'}>
                      {profitProgress.toFixed(0)}% achieved
                    </span>
                    {profitProgress >= 100 && <CheckCircle className="h-4 w-4 text-success" />}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="metric-card">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Expense Limit</p>
                  <p className={`text-2xl font-bold font-display ${expenseProgress > 100 ? 'text-destructive' : ''}`}>
                    {formatCurrency(currentMonthActuals.expenses)}
                    <span className="text-sm text-muted-foreground font-normal">
                      {' '}/ {currentGoal?.expense_limit ? formatCurrency(currentGoal.expense_limit) : '-'}
                    </span>
                  </p>
                </div>
                <div className={`p-3 rounded-xl ${expenseProgress > 100 ? 'bg-destructive/20' : 'bg-warning/20'}`}>
                  <Wallet className={`h-5 w-5 ${expenseProgress > 100 ? 'text-destructive' : 'text-warning'}`} />
                </div>
              </div>
              {currentGoal?.expense_limit && (
                <>
                  <Progress value={Math.min(expenseProgress, 100)} className={`h-3 ${getProgressColor(expenseProgress, true)}`} />
                  <div className="flex justify-between text-sm">
                    <span className={expenseProgress > 100 ? 'text-destructive' : 'text-muted-foreground'}>
                      {expenseProgress.toFixed(0)}% used
                    </span>
                    {expenseProgress > 100 && <AlertTriangle className="h-4 w-4 text-destructive" />}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* No goal set message */}
        {!currentGoal && (
          <Card className="border-border/50 border-dashed">
            <CardContent className="py-12 text-center">
              <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Goal Set for {format(new Date(), 'MMMM yyyy')}</h3>
              <p className="text-muted-foreground mb-4">
                Set monthly revenue and profit targets to track your progress
              </p>
              <Button onClick={() => setDialogOpen(true)} className="gradient-primary">
                <Plus className="h-4 w-4 mr-2" />
                Set Your First Goal
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Historical Goals */}
        {goals.length > 0 && (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-display">Goal History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {goals.map((goal) => {
                  const isCurrentMonth = goal.month.startsWith(currentMonth);
                  return (
                    <div
                      key={goal.id}
                      className={`p-4 rounded-xl ${isCurrentMonth ? 'bg-primary/10 border border-primary/30' : 'bg-muted/30'}`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold">
                          {format(new Date(goal.month), 'MMMM yyyy')}
                          {isCurrentMonth && (
                            <span className="ml-2 text-xs text-primary">(Current)</span>
                          )}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Revenue Target</p>
                          <p className="font-medium">{formatCurrency(goal.revenue_goal)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Profit Target</p>
                          <p className="font-medium text-success">{formatCurrency(goal.profit_goal)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Expense Limit</p>
                          <p className="font-medium">
                            {goal.expense_limit ? formatCurrency(goal.expense_limit) : '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
