import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Download, TrendingDown, Building2, Wallet, PieChart as PieChartIcon } from 'lucide-react';
import { format, subMonths, startOfMonth } from 'date-fns';

const COLORS = ['hsl(var(--primary))', 'hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)', 'hsl(280, 65%, 60%)', 'hsl(25, 95%, 53%)', 'hsl(340, 82%, 52%)'];

const CATEGORY_LABELS: Record<string, string> = {
  inventory: 'Inventory',
  shipping: 'Shipping',
  marketing: 'Marketing',
  software: 'Software',
  equipment: 'Equipment',
  office: 'Office',
  utilities: 'Utilities',
  travel: 'Travel',
  professional_services: 'Professional Services',
  other: 'Other',
};

interface Expense {
  id: string;
  amount: number;
  gst_hst_amount: number;
  pst_amount: number;
  category: string;
  vendor: string | null;
  expense_date: string;
  company_id: string | null;
  is_shared: boolean;
  allocation_ves: number;
  allocation_tgw: number;
}

interface ExpenseReportsProps {
  companyView?: 'consolidated' | string;
}

export function ExpenseReports({ companyView = 'consolidated' }: ExpenseReportsProps) {
  const { selectedCompany, companies, isSuperAdmin } = useCompany();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('6');
  const [viewType, setViewType] = useState<'category' | 'vendor' | 'trend' | 'allocation'>('category');
  const [expenses, setExpenses] = useState<Expense[]>([]);

  useEffect(() => {
    fetchExpenses();
  }, [dateRange, companyView]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const months = parseInt(dateRange);
      const startDate = startOfMonth(subMonths(new Date(), months - 1));

      let query = supabase
        .from('expenses')
        .select('id, amount, gst_hst_amount, pst_amount, category, vendor, expense_date, company_id, is_shared, allocation_ves, allocation_tgw')
        .gte('expense_date', startDate.toISOString().split('T')[0])
        .limit(5000);

      if (companyView !== 'consolidated') {
        query = query.or(`company_id.eq.${companyView},is_shared.eq.true`);
      }

      const { data, error } = await query;
      if (error) throw error;

      setExpenses((data || []) as Expense[]);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  // Get effective expense amount for current view
  const getEffectiveAmount = (exp: Expense) => {
    const total = (exp.amount || 0) + (exp.gst_hst_amount || 0) + (exp.pst_amount || 0);
    if (!exp.is_shared) return total;
    if (companyView !== 'consolidated') {
      const vesCompany = companies.find(c => c.code === 'VES');
      return companyView === vesCompany?.id
        ? total * ((exp.allocation_ves || 0) / 100)
        : total * ((exp.allocation_tgw || 0) / 100);
    }
    return total;
  };

  // Calculations
  const totalExpenses = expenses.reduce((sum, e) => sum + getEffectiveAmount(e), 0);

  // By Category
  const byCategory = expenses.reduce((acc, e) => {
    const cat = e.category;
    acc[cat] = (acc[cat] || 0) + getEffectiveAmount(e);
    return acc;
  }, {} as Record<string, number>);

  // By Vendor
  const byVendor = expenses.reduce((acc, e) => {
    const vendor = e.vendor || 'Unknown';
    acc[vendor] = (acc[vendor] || 0) + getEffectiveAmount(e);
    return acc;
  }, {} as Record<string, number>);

  // Monthly trend
  const months = parseInt(dateRange);
  const monthlyTrend: Record<string, number> = {};
  for (let i = 0; i < months; i++) {
    const date = subMonths(new Date(), months - 1 - i);
    monthlyTrend[format(date, 'MMM')] = 0;
  }
  expenses.forEach(e => {
    const key = format(new Date(e.expense_date), 'MMM');
    if (monthlyTrend[key] !== undefined) {
      monthlyTrend[key] += getEffectiveAmount(e);
    }
  });

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
  const totalShared = vesAllocation + tgwAllocation;

  const handleExport = () => {
    const headers = ['Date', 'Category', 'Vendor', 'Amount', 'GST/HST', 'PST', 'Total', 'Shared', 'Virtual eShop %', 'Tech Genius Warehouse %'];
    const rows = expenses.map(e => [
      e.expense_date,
      e.category,
      e.vendor || '-',
      e.amount,
      e.gst_hst_amount || 0,
      e.pst_amount || 0,
      getEffectiveAmount(e).toFixed(2),
      e.is_shared ? 'Yes' : 'No',
      e.allocation_ves || 0,
      e.allocation_tgw || 0,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map(i => (
          <Card key={i} className="animate-pulse"><CardContent className="h-64" /></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Last 3 months</SelectItem>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
          </SelectContent>
        </Select>

        <Select value={viewType} onValueChange={(v) => setViewType(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="category">By Category</SelectItem>
            <SelectItem value="vendor">By Vendor</SelectItem>
            <SelectItem value="trend">Trend Analysis</SelectItem>
            <SelectItem value="allocation">Shared Allocation</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={handleExport} className="ml-auto">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Expenses</p>
                <p className="text-xl font-bold">{formatCurrency(totalExpenses)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <PieChartIcon className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Categories</p>
                <p className="text-xl font-bold">{Object.keys(byCategory).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Building2 className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Shared Expenses</p>
                <p className="text-xl font-bold">{formatCurrency(totalShared)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content based on view type */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {viewType === 'category' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Expenses by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={Object.entries(byCategory).map(([name, value], i) => ({
                          name: CATEGORY_LABELS[name] || name,
                          value,
                          fill: COLORS[i % COLORS.length],
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {Object.entries(byCategory).map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Category Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(byCategory)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, value]) => (
                        <TableRow key={cat}>
                          <TableCell className="font-medium">{CATEGORY_LABELS[cat] || cat}</TableCell>
                          <TableCell className="text-right">{formatCurrency(value)}</TableCell>
                          <TableCell className="text-right">
                            {totalExpenses > 0 ? ((value / totalExpenses) * 100).toFixed(1) : 0}%
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {viewType === 'vendor' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Top Vendors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={Object.entries(byVendor)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 10)
                        .map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }))}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" width={100} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {Object.entries(byVendor).slice(0, 10).map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Vendor Details</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Total Spent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(byVendor)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 15)
                      .map(([vendor, value]) => (
                        <TableRow key={vendor}>
                          <TableCell className="font-medium">{vendor}</TableCell>
                          <TableCell className="text-right">{formatCurrency(value)}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {viewType === 'trend' && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Expense Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={Object.entries(monthlyTrend).map(([month, amount]) => ({ month, amount }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      stroke="hsl(var(--destructive))"
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--destructive))' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {viewType === 'allocation' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Shared Expense Allocation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Virtual eShop', value: vesAllocation, fill: COLORS[0] },
                          { name: 'Tech Genius Warehouse', value: tgwAllocation, fill: COLORS[1] },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        <Cell fill={COLORS[0]} />
                        <Cell fill={COLORS[1]} />
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Allocation Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-3xl font-bold">{formatCurrency(totalShared)}</p>
                    <p className="text-sm text-muted-foreground">Total Shared Expenses</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 rounded-lg bg-primary/10">
                      <p className="text-2xl font-bold">{formatCurrency(vesAllocation)}</p>
                      <p className="text-sm text-muted-foreground">Virtual eShop Allocation</p>
                      <Badge variant="outline" className="mt-2">
                        {totalShared > 0 ? ((vesAllocation / totalShared) * 100).toFixed(0) : 0}%
                      </Badge>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-secondary/10">
                      <p className="text-2xl font-bold">{formatCurrency(tgwAllocation)}</p>
                      <p className="text-sm text-muted-foreground">Tech Genius Warehouse Allocation</p>
                      <Badge variant="outline" className="mt-2">
                        {totalShared > 0 ? ((tgwAllocation / totalShared) * 100).toFixed(0) : 0}%
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
