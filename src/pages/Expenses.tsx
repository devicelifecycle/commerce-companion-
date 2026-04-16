import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDataRefetch, emitRefetch } from '@/hooks/useDataRefetch';
import { supabase } from '@/integrations/supabase/client';
import { cleanupBeforeExpenseDelete } from '@/lib/accounting/reversalUtils';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PermissionGuard } from '@/components/layout/PermissionGuard';
import { useQuickActionListener } from '@/hooks/useGlobalShortcuts';
import { useAuditLog } from '@/hooks/useAuditLog';

import { ExpenseDashboard } from '@/components/expenses/ExpenseDashboard';
import { AddExpenseDialog } from '@/components/expenses/AddExpenseDialog';
import { ExpenseRefundDialog } from '@/components/expenses/ExpenseRefundDialog';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { 
  Plus, Search, Filter, Download, LayoutDashboard, List, 
  MoreHorizontal, Edit2, Trash2, Receipt, Repeat, ExternalLink, Info, Undo2
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { BatchActionBar, exportToCsv } from '@/components/ui/batch-action-bar';
import { useTableSelection } from '@/hooks/useTableSelection';
import { format } from 'date-fns';
import { ActivityFooter } from '@/components/activity/ActivityFooter';

interface Expense {
  id: string;
  description: string;
  amount: number;
  gst_hst_amount: number;
  pst_amount: number;
  total_amount: number;
  category: string;
  subcategory: string | null;
  expense_date: string;
  vendor: string | null;
  notes: string | null;
  payment_method: string;
  is_tax_deductible: boolean;
  is_shared: boolean;
  allocation_ves: number;
  allocation_tgw: number;
  is_recurring: boolean;
  recurring_frequency: string | null;
  company_id: string | null;
  receipt_url: string | null;
  created_at: string;
}

const EXPENSE_CATEGORIES = [
  { value: 'inventory', label: 'Inventory Purchase' },
  { value: 'shipping', label: 'Shipping & Logistics' },
  { value: 'rent', label: 'Rent & Lease' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'telecommunications', label: 'Telecommunications' },
  { value: 'office', label: 'Office Supplies' },
  { value: 'software', label: 'Software & Subscriptions' },
  { value: 'equipment', label: 'Equipment & Tools' },
  { value: 'professional_services', label: 'Professional Services' },
  { value: 'marketing', label: 'Marketing & Advertising' },
  { value: 'travel', label: 'Travel & Transportation' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'payroll', label: 'Payroll & Benefits' },
  { value: 'bank_fees', label: 'Bank Fees & Charges' },
  { value: 'marketplace_fees', label: 'Marketplace Fees' },
  { value: 'other', label: 'Other' },
];

export default function Expenses() {
  const { selectedCompany, isSuperAdmin, companies } = useCompany();
  const { logEvent } = useAuditLog();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [refundMap, setRefundMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [refundExpense, setRefundExpense] = useState<Expense | null>(null);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);

  // Quick action: open "Add Expense" dialog via Alt+E
  useQuickActionListener('add-expense', useCallback(() => setDialogOpen(true), []));

  useEffect(() => {
    fetchExpenses();
  }, [filterCategory, selectedCompany]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (filterCategory !== 'all') {
        query = query.eq('category', filterCategory as any);
      }

      if (selectedCompany && !isSuperAdmin) {
        query = query.or(`company_id.eq.${selectedCompany.id},is_shared.eq.true`);
      }

      const [expResult, refundResult] = await Promise.all([
        query,
        supabase.from('expense_refunds').select('expense_id, refund_amount'),
      ]);

      if (expResult.error) throw expResult.error;
      setExpenses((expResult.data || []) as Expense[]);

      const map: Record<string, number> = {};
      (refundResult.data || []).forEach((r: any) => {
        map[r.expense_id] = (map[r.expense_id] || 0) + Number(r.refund_amount || 0);
      });
      setRefundMap(map);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  useDataRefetch('expenses', fetchExpenses);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense? Associated journal entries, ITCs, and refunds will also be reversed.')) return;
    try {
      const { journalCount } = await cleanupBeforeExpenseDelete(id);
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
      logEvent({ action: 'DELETE' as any, tableName: 'expenses', recordId: id, module: 'Expenses', notes: `Expense deleted. ${journalCount} journal entries reversed.` });
      toast.success(`Expense deleted${journalCount > 0 ? ` — ${journalCount} journal entries reversed` : ''}`);
      fetchExpenses();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete expense');
    }
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setDialogOpen(true);
  };

  const handleExport = () => {
    const headers = ['Date', 'Description', 'Category', 'Vendor', 'Amount', 'GST/HST', 'PST', 'Total', 'Company', 'Tax Deductible'];
    const rows = expenses.map(e => {
      const company = e.is_shared 
        ? 'Shared' 
        : companies.find(c => c.id === e.company_id)?.code || '-';
      return [
        e.expense_date,
        e.description,
        e.category,
        e.vendor || '-',
        e.amount.toFixed(2),
        (e.gst_hst_amount || 0).toFixed(2),
        (e.pst_amount || 0).toFixed(2),
        (e.total_amount || e.amount).toFixed(2),
        company,
        e.is_tax_deductible ? 'Yes' : 'No',
      ];
    });

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredExpenses = expenses.filter((expense) =>
    expense.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    expense.vendor?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selection = useTableSelection(filteredExpenses);

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selection.count} selected expense(s)? All associated journal entries and ITCs will be reversed.`)) return;
    try {
      const ids = Array.from(selection.selectedIds);
      let totalJE = 0;
      for (const id of ids) {
        const { journalCount } = await cleanupBeforeExpenseDelete(id);
        totalJE += journalCount;
      }
      const { error } = await supabase.from('expenses').delete().in('id', ids);
      if (error) throw error;
      toast.success(`${selection.count} expense(s) deleted${totalJE > 0 ? ` — ${totalJE} journal entries reversed` : ''}`);
      selection.clear();
      fetchExpenses();
      emitRefetch('financials');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete expenses');
    }
  };

  const handleExportSelected = () => {
    const items = selection.count > 0 ? selection.selectedItems : filteredExpenses;
    const headers = ['Date', 'Description', 'Category', 'Vendor', 'Amount', 'GST/HST', 'PST', 'Total', 'Company', 'Tax Deductible'];
    const rows = items.map(e => {
      const company = e.is_shared ? 'Shared' : companies.find(c => c.id === e.company_id)?.code || '-';
      return [e.expense_date, e.description, e.category, e.vendor || '-', e.amount, (e.gst_hst_amount || 0), (e.pst_amount || 0), (e.total_amount || e.amount), company, e.is_tax_deductible ? 'Yes' : 'No'];
    });
    exportToCsv(headers, rows, `expenses-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    toast.success(`${items.length} expense(s) exported`);
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const getCategoryLabel = (value: string) =>
    EXPENSE_CATEGORIES.find(c => c.value === value)?.label || value;

  const getCompanyBadge = (expense: Expense) => {
    if (expense.is_shared) {
      return (
        <Badge variant="outline" className="text-xs">
          Virtual eShop {expense.allocation_ves}% / Tech Genius Warehouse {expense.allocation_tgw}%
        </Badge>
      );
    }
    const company = companies.find(c => c.id === expense.company_id);
    return company ? (
      <Badge variant="secondary" className="text-xs">{company.code}</Badge>
    ) : null;
  };

  return (
    <PermissionGuard permission="expenses_view" title="Expense Management">
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Expense Management</h1>
            <p className="text-muted-foreground">Track and categorize business expenses</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button onClick={() => { setEditingExpense(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Expense
            </Button>
          </div>
        </div>

        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="list" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              All Expenses
            </TabsTrigger>


          </TabsList>

          <TabsContent value="dashboard">
            <ExpenseDashboard />
          </TabsContent>

          <TabsContent value="list">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search expenses..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="w-[180px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : filteredExpenses.length === 0 ? (
                  <div className="text-center py-12">
                    <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No expenses found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]">
                            <Checkbox
                              checked={selection.isAllSelected}
                              onCheckedChange={selection.toggleAll}
                            />
                          </TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Category</TableHead>
                          
                          <TableHead>Company</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="w-[50px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredExpenses.map((expense) => (
                          <TableRow key={expense.id} data-state={selection.selectedIds.has(expense.id) ? 'selected' : undefined}>
                            <TableCell>
                              <Checkbox
                                checked={selection.selectedIds.has(expense.id)}
                                onCheckedChange={() => selection.toggle(expense.id)}
                              />
                            </TableCell>
                            <TableCell>{format(new Date(expense.expense_date), 'MMM d, yyyy')}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div>
                                  <p className="font-medium">{expense.description}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    {expense.is_tax_deductible && (
                                      <span className="text-xs text-emerald-600">Tax deductible</span>
                                    )}
                                    {expense.is_recurring && (
                                      <Badge variant="outline" className="text-xs">
                                        <Repeat className="h-3 w-3 mr-1" />
                                        {expense.recurring_frequency}
                                      </Badge>
                                    )}
                                    {(refundMap[expense.id] || 0) > 0 && (
                                      <Badge variant="outline" className="text-xs border-[hsl(var(--success))] text-[hsl(var(--success))]">
                                        <Undo2 className="h-3 w-3 mr-1" />
                                        {refundMap[expense.id] >= (expense.total_amount || expense.amount) ? 'Fully Refunded' : 'Partial Refund'}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="capitalize">
                                {getCategoryLabel(expense.category)}
                              </Badge>
                            </TableCell>
                            <TableCell>{getCompanyBadge(expense)}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(expense.amount)}
                              {(expense.gst_hst_amount > 0 || expense.pst_amount > 0) && (
                                <p className="text-xs text-muted-foreground">
                                  +${((expense.gst_hst_amount || 0) + (expense.pst_amount || 0)).toFixed(2)} tax
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              <span className={`${(refundMap[expense.id] || 0) > 0 ? 'line-through text-muted-foreground' : 'text-destructive'}`}>
                                -{formatCurrency(expense.total_amount || expense.amount)}
                              </span>
                              {(refundMap[expense.id] || 0) > 0 && (
                                <p className="text-xs font-medium text-destructive">
                                  Net: -{formatCurrency((expense.total_amount || expense.amount) - refundMap[expense.id])}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleEdit(expense)}>
                                    <Edit2 className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  {expense.receipt_url && (
                                     <DropdownMenuItem onClick={async () => {
                                        const { data } = await supabase.storage
                                          .from('receipts')
                                          .createSignedUrl(expense.receipt_url, 3600);
                                        if (data?.signedUrl) {
                                          window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
                                        }
                                      }}>
                                        <ExternalLink className="h-4 w-4 mr-2" />
                                        View Receipt
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => {
                                    setRefundExpense(expense);
                                    setRefundDialogOpen(true);
                                  }}>
                                    <Undo2 className="h-4 w-4 mr-2" />
                                    Record Refund
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => handleDelete(expense.id)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>



        </Tabs>


        <AddExpenseDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={fetchExpenses}
          editExpense={editingExpense}
        />
        <ExpenseRefundDialog
          open={refundDialogOpen}
          onOpenChange={setRefundDialogOpen}
          expense={refundExpense}
          onSuccess={fetchExpenses}
        />
        <BatchActionBar
          count={selection.count}
          onClear={selection.clear}
          actions={[
            { label: 'Export', icon: <Download className="h-4 w-4 mr-1" />, onClick: handleExportSelected },
            { label: 'Delete', icon: <Trash2 className="h-4 w-4 mr-1" />, onClick: handleBulkDelete, variant: 'destructive' as const },
          ]}
        />

        <ActivityFooter module="Expenses" tableNames={['expenses', 'expense_refunds']} />
      </div>
    </DashboardLayout>
    </PermissionGuard>
  );
}
