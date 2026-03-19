import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wallet, TrendingDown, Receipt, Building2, PieChart, CreditCard } from 'lucide-react';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

interface Expense {
  id: string;
  amount: number;
  gst_hst_amount: number;
  pst_amount: number;
  category: string;
  subcategory: string | null;
  expense_date: string;
  company_id: string | null;
  is_shared: boolean;
  allocation_ves: number;
  allocation_tgw: number;
  is_tax_deductible: boolean;
  payment_method: string | null;
}

const COLORS = ['hsl(var(--primary))', 'hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)', 'hsl(280, 65%, 60%)', 'hsl(25, 95%, 53%)', 'hsl(340, 82%, 52%)'];

const CATEGORY_LABELS: Record<string, string> = {
  inventory: 'Inventory',
  shipping: 'Shipping',
  marketing: 'Marketing',
  software: 'Software',
  equipment: 'Equipment',
  office: 'Office',
  utilities: 'Utilities',
  telecommunications: 'Telecom',
  travel: 'Travel',
  professional_services: 'Professional Services',
  insurance: 'Insurance',
  payroll: 'Payroll',
  rent: 'Rent',
  bank_fees: 'Bank Fees',
  marketplace_fees: 'Marketplace Fees',
  genovation_ai: 'GenovationAI',
  other: 'Other',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  bank_transfer: 'Bank Transfer',
  interac_etransfer: 'Interac E-Transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  paypal: 'PayPal',
  other: 'Other',
};

interface RefundSummary {
  [expenseId: string]: number;
}

export function ExpenseDashboard() {
  const { selectedCompany, isSuperAdmin, companies } = useCompany();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [refundMap, setRefundMap] = useState<RefundSummary>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExpenses();
  }, [selectedCompany]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('expenses')
        .select('id, amount, gst_hst_amount, pst_amount, category, subcategory, expense_date, company_id, is_shared, allocation_ves, allocation_tgw, is_tax_deductible, payment_method');

      if (selectedCompany && !isSuperAdmin) {
        query = query.or(`company_id.eq.${selectedCompany.id},is_shared.eq.true`);
      }

      const [expResult, refundResult] = await Promise.all([
        query,
        supabase.from('expense_refunds').select('expense_id, refund_amount'),
      ]);

      if (expResult.error) throw expResult.error;
      setExpenses((expResult.data || []) as Expense[]);

      // Build refund map: expense_id → total refunded
      const map: RefundSummary = {};
      (refundResult.data || []).forEach((r: any) => {
        map[r.expense_id] = (map[r.expense_id] || 0) + Number(r.refund_amount || 0);
      });
      setRefundMap(map);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const metrics = useMemo(() => {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    // Calculate effective amount for company (net of refunds)
    const getEffectiveAmount = (expense: Expense) => {
      const gross = (expense.amount || 0) + (expense.gst_hst_amount || 0) + (expense.pst_amount || 0);
      const refunded = refundMap[expense.id] || 0;
      const total = gross - refunded;
      if (!expense.is_shared) return total;
      
      if (selectedCompany) {
        const vesCompany = companies.find(c => c.code === 'VES');
        if (selectedCompany.id === vesCompany?.id) {
          return total * ((expense.allocation_ves || 0) / 100);
        } else {
          return total * ((expense.allocation_tgw || 0) / 100);
        }
      }
      return total;
    };

    // Total expenses
    const totalExpenses = expenses.reduce((sum, e) => sum + getEffectiveAmount(e), 0);

    // This month
    const thisMonthExpenses = expenses
      .filter(e => {
        const date = new Date(e.expense_date);
        return date >= thisMonthStart && date <= thisMonthEnd;
      })
      .reduce((sum, e) => sum + getEffectiveAmount(e), 0);

    // Last month
    const lastMonthExpenses = expenses
      .filter(e => {
        const date = new Date(e.expense_date);
        return date >= lastMonthStart && date <= lastMonthEnd;
      })
      .reduce((sum, e) => sum + getEffectiveAmount(e), 0);

    // Tax deductible
    const taxDeductible = expenses
      .filter(e => e.is_tax_deductible)
      .reduce((sum, e) => sum + getEffectiveAmount(e), 0);

    // GST/HST paid
    const gstHstPaid = expenses.reduce((sum, e) => {
      if (!e.is_shared) return sum + (e.gst_hst_amount || 0);
      if (selectedCompany) {
        const vesCompany = companies.find(c => c.code === 'VES');
        const allocation = selectedCompany.id === vesCompany?.id 
          ? (e.allocation_ves || 0) / 100 
          : (e.allocation_tgw || 0) / 100;
        return sum + ((e.gst_hst_amount || 0) * allocation);
      }
      return sum + (e.gst_hst_amount || 0);
    }, 0);

    // By category
    const byCategory: Record<string, number> = {};
    expenses.forEach(e => {
      const cat = e.category || 'other';
      byCategory[cat] = (byCategory[cat] || 0) + getEffectiveAmount(e);
    });

    // By payment method
    const byPaymentMethod: Record<string, number> = {};
    expenses.forEach(e => {
      const pm = e.payment_method || 'other';
      byPaymentMethod[pm] = (byPaymentMethod[pm] || 0) + getEffectiveAmount(e);
    });

    // Monthly trend (last 6 months)
    const monthlyTrend: { month: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(now, i));
      const monthEnd = endOfMonth(subMonths(now, i));
      const monthExpenses = expenses
        .filter(e => {
          const date = new Date(e.expense_date);
          return date >= monthStart && date <= monthEnd;
        })
        .reduce((sum, e) => sum + getEffectiveAmount(e), 0);
      monthlyTrend.push({
        month: format(monthStart, 'MMM'),
        amount: monthExpenses,
      });
    }

    // Shared expense allocation
    const sharedExpenses = expenses.filter(e => e.is_shared);
    const vesAllocation = sharedExpenses.reduce((sum, e) => {
      const total = (e.amount || 0) + (e.gst_hst_amount || 0) + (e.pst_amount || 0);
      return sum + (total * ((e.allocation_ves || 0) / 100));
    }, 0);
    const tgwAllocation = sharedExpenses.reduce((sum, e) => {
      const total = (e.amount || 0) + (e.gst_hst_amount || 0) + (e.pst_amount || 0);
      return sum + (total * ((e.allocation_tgw || 0) / 100));
    }, 0);

    const monthChange = lastMonthExpenses > 0
      ? ((thisMonthExpenses - lastMonthExpenses) / lastMonthExpenses) * 100
      : 0;

    return {
      totalExpenses,
      thisMonthExpenses,
      lastMonthExpenses,
      monthChange,
      taxDeductible,
      gstHstPaid,
      byCategory: Object.entries(byCategory)
        .map(([name, value]) => ({ name: CATEGORY_LABELS[name] || name, value }))
        .sort((a, b) => b.value - a.value),
      monthlyTrend,
      byPaymentMethod: Object.entries(byPaymentMethod)
        .map(([name, value]) => ({ name: PAYMENT_METHOD_LABELS[name] || name, value }))
        .sort((a, b) => b.value - a.value),
      sharedTotal: vesAllocation + tgwAllocation,
      vesAllocation,
      tgwAllocation,
    };
  }, [expenses, selectedCompany, companies]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="animate-pulse">
            <CardContent className="h-24" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Expenses</p>
                <p className="text-2xl font-bold">{formatCurrency(metrics.totalExpenses)}</p>
              </div>
              <div className="p-3 rounded-xl bg-destructive/10">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">{formatCurrency(metrics.thisMonthExpenses)}</p>
                {metrics.monthChange !== 0 && (
                  <p className={`text-xs ${metrics.monthChange > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {metrics.monthChange > 0 ? '+' : ''}{metrics.monthChange.toFixed(1)}% vs last month
                  </p>
                )}
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10">
                <Wallet className="h-5 w-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tax Deductible</p>
                <p className="text-2xl font-bold">{formatCurrency(metrics.taxDeductible)}</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10">
                <Receipt className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">GST/HST Paid</p>
                <p className="text-2xl font-bold">{formatCurrency(metrics.gstHstPaid)}</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10">
                <Receipt className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Expenses</CardTitle>
            <CardDescription>Last 6 months trend</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* By Category */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              By Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={metrics.byCategory.slice(0, 6)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    nameKey="name"
                  >
                    {metrics.byCategory.slice(0, 6).map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </RePieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* By Payment Method */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              By Payment Method
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={metrics.byPaymentMethod.slice(0, 6)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    nameKey="name"
                  >
                    {metrics.byPaymentMethod.slice(0, 6).map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </RePieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Shared Expense Allocation */}
      {isSuperAdmin && metrics.sharedTotal > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Shared Expense Allocation
            </CardTitle>
            <CardDescription>How shared expenses are split between companies</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <p className="text-3xl font-bold">{formatCurrency(metrics.sharedTotal)}</p>
                <p className="text-sm text-muted-foreground mt-1">Total Shared Expenses</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-primary/10">
                <p className="text-3xl font-bold">{formatCurrency(metrics.vesAllocation)}</p>
                <p className="text-sm text-muted-foreground mt-1">Virtual eShop Allocation</p>
                <Badge variant="outline" className="mt-2">
                  {metrics.sharedTotal > 0 ? ((metrics.vesAllocation / metrics.sharedTotal) * 100).toFixed(0) : 0}%
                </Badge>
              </div>
              <div className="text-center p-4 rounded-lg bg-secondary/10">
                <p className="text-3xl font-bold">{formatCurrency(metrics.tgwAllocation)}</p>
                <p className="text-sm text-muted-foreground mt-1">Tech Genius Warehouse Allocation</p>
                <Badge variant="outline" className="mt-2">
                  {metrics.sharedTotal > 0 ? ((metrics.tgwAllocation / metrics.sharedTotal) * 100).toFixed(0) : 0}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {metrics.byCategory.map((cat, idx) => {
              const percentage = metrics.totalExpenses > 0 
                ? (cat.value / metrics.totalExpenses) * 100 
                : 0;
              return (
                <div key={cat.name} className="flex items-center gap-4">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }} 
                  />
                  <span className="flex-1 min-w-[120px]">{cat.name}</span>
                  <div className="flex-1 bg-muted rounded-full h-2 max-w-[200px]">
                    <div
                      className="h-2 rounded-full"
                      style={{ 
                        width: `${percentage}%`,
                        backgroundColor: COLORS[idx % COLORS.length]
                      }}
                    />
                  </div>
                  <span className="font-medium w-24 text-right">{formatCurrency(cat.value)}</span>
                  <span className="text-muted-foreground w-12 text-right">{percentage.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
