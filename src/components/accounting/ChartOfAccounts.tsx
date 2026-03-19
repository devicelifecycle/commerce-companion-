import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Plus, ChevronRight, ChevronDown, Edit2, Trash2, FileText, Download, Wallet, Eye } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  account_subtype: string | null;
  parent_account_id: string | null;
  description: string | null;
  is_active: boolean;
  current_balance: number;
  normal_balance: string;
  is_system_account: boolean;
  company_id: string | null;
}

const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Assets', color: 'bg-blue-500' },
  { value: 'liability', label: 'Liabilities', color: 'bg-amber-500' },
  { value: 'equity', label: 'Equity', color: 'bg-purple-500' },
  { value: 'revenue', label: 'Revenue', color: 'bg-emerald-500' },
  { value: 'expense', label: 'Expenses', color: 'bg-destructive' },
  { value: 'tax_paid', label: 'Tax Paid (ITC)', color: 'bg-violet-500' },
];

const SUBTYPES: Record<string, string[]> = {
  asset: ['Current Assets', 'Fixed Assets', 'Other Assets'],
  liability: ['Current Liabilities', 'Long-term Liabilities'],
  equity: ["Owner's Equity", 'Retained Earnings'],
  revenue: ['Sales Revenue', 'Tax Revenue', 'Other Income'],
  expense: ['COGS', 'Operating Expenses', 'Other Expenses'],
  tax_paid: ['Input Tax Credits'],
};

// Cash-Basis Chart of Accounts for VES and TGW
const DEFAULT_ACCOUNTS = [
  // ASSETS (1xxx)
  { code: '1000', name: 'Cash - VES', type: 'asset', subtype: 'Current Assets', normal: 'debit' },
  { code: '1001', name: 'Cash - TGW', type: 'asset', subtype: 'Current Assets', normal: 'debit' },
  { code: '1100', name: 'Inventory - VES (FIFO)', type: 'asset', subtype: 'Current Assets', normal: 'debit' },
  { code: '1101', name: 'Inventory - TGW (FIFO)', type: 'asset', subtype: 'Current Assets', normal: 'debit' },
  { code: '1200', name: 'Prepaid Expenses - VES', type: 'asset', subtype: 'Current Assets', normal: 'debit' },
  { code: '1201', name: 'Prepaid Expenses - TGW', type: 'asset', subtype: 'Current Assets', normal: 'debit' },
  
  // LIABILITIES (2xxx)
  { code: '2000', name: 'GST/HST Payable - VES', type: 'liability', subtype: 'Current Liabilities', normal: 'credit' },
  { code: '2001', name: 'GST/HST Payable - TGW', type: 'liability', subtype: 'Current Liabilities', normal: 'credit' },
  { code: '2100', name: 'QST Payable - VES', type: 'liability', subtype: 'Current Liabilities', normal: 'credit' },
  { code: '2101', name: 'QST Payable - TGW', type: 'liability', subtype: 'Current Liabilities', normal: 'credit' },
  { code: '2200', name: 'Inter-company Payable - VES to TGW', type: 'liability', subtype: 'Current Liabilities', normal: 'credit' },
  { code: '2201', name: 'Inter-company Receivable - TGW from VES', type: 'asset', subtype: 'Current Assets', normal: 'debit' },
  
  // EQUITY (3xxx)
  { code: '3000', name: "Owner's Equity - VES", type: 'equity', subtype: "Owner's Equity", normal: 'credit' },
  { code: '3001', name: "Owner's Equity - TGW", type: 'equity', subtype: "Owner's Equity", normal: 'credit' },
  { code: '3100', name: 'Retained Earnings - VES', type: 'equity', subtype: 'Retained Earnings', normal: 'credit' },
  { code: '3101', name: 'Retained Earnings - TGW', type: 'equity', subtype: 'Retained Earnings', normal: 'credit' },
  { code: '3200', name: 'Current Year Profit/Loss - VES', type: 'equity', subtype: 'Retained Earnings', normal: 'credit' },
  { code: '3201', name: 'Current Year Profit/Loss - TGW', type: 'equity', subtype: 'Retained Earnings', normal: 'credit' },
  
  // REVENUE (4xxx)
  { code: '4000', name: 'Sales Revenue - Amazon - VES', type: 'revenue', subtype: 'Sales Revenue', normal: 'credit' },
  { code: '4100', name: 'Sales Revenue - BestBuy - TGW', type: 'revenue', subtype: 'Sales Revenue', normal: 'credit' },
  { code: '4101', name: 'Sales Revenue - Shopify - TGW', type: 'revenue', subtype: 'Sales Revenue', normal: 'credit' },
  { code: '4200', name: 'Tax Collected on Sales - VES', type: 'revenue', subtype: 'Tax Revenue', normal: 'credit' },
  { code: '4201', name: 'Tax Collected on Sales - TGW', type: 'revenue', subtype: 'Tax Revenue', normal: 'credit' },
  { code: '4300', name: 'Inter-company Revenue', type: 'revenue', subtype: 'Other Income', normal: 'credit' },
  { code: '4400', name: 'Direct Sales Revenue - VES', type: 'revenue', subtype: 'Sales Revenue', normal: 'credit' },
  { code: '4401', name: 'Direct Sales Revenue - TGW', type: 'revenue', subtype: 'Sales Revenue', normal: 'credit' },
  
  // COGS (5xxx)
  { code: '5000', name: 'COGS - VES', type: 'expense', subtype: 'COGS', normal: 'debit' },
  { code: '5001', name: 'COGS - TGW', type: 'expense', subtype: 'COGS', normal: 'debit' },
  
  // EXPENSES (6xxx-7xxx)
  { code: '6000', name: 'Marketplace Fees - VES', type: 'expense', subtype: 'Operating Expenses', normal: 'debit' },
  { code: '6001', name: 'Marketplace Fees - TGW', type: 'expense', subtype: 'Operating Expenses', normal: 'debit' },
  { code: '6100', name: 'Shipping Costs - VES', type: 'expense', subtype: 'Operating Expenses', normal: 'debit' },
  { code: '6101', name: 'Shipping Costs - TGW', type: 'expense', subtype: 'Operating Expenses', normal: 'debit' },
  { code: '6200', name: 'Rent and Utilities', type: 'expense', subtype: 'Operating Expenses', normal: 'debit' },
  { code: '6300', name: 'Salaries and Wages', type: 'expense', subtype: 'Operating Expenses', normal: 'debit' },
  { code: '6400', name: 'Marketing and Advertising', type: 'expense', subtype: 'Operating Expenses', normal: 'debit' },
  { code: '6500', name: 'Office and Supplies', type: 'expense', subtype: 'Operating Expenses', normal: 'debit' },
  { code: '6600', name: 'Professional Fees', type: 'expense', subtype: 'Operating Expenses', normal: 'debit' },
  { code: '6700', name: 'Insurance', type: 'expense', subtype: 'Operating Expenses', normal: 'debit' },
  { code: '6800', name: 'Bank Fees', type: 'expense', subtype: 'Operating Expenses', normal: 'debit' },
  { code: '6900', name: 'Software and Subscriptions', type: 'expense', subtype: 'Operating Expenses', normal: 'debit' },
  { code: '7000', name: 'Telecommunications', type: 'expense', subtype: 'Operating Expenses', normal: 'debit' },
  { code: '7100', name: 'Other Operating Expenses', type: 'expense', subtype: 'Operating Expenses', normal: 'debit' },
  
  // TAX PAID / ITC (8xxx)
  { code: '8000', name: 'GST/HST Paid on Purchases - VES', type: 'tax_paid', subtype: 'Input Tax Credits', normal: 'debit' },
  { code: '8001', name: 'GST/HST Paid on Purchases - TGW', type: 'tax_paid', subtype: 'Input Tax Credits', normal: 'debit' },
  { code: '8100', name: 'QST Paid on Purchases - VES', type: 'tax_paid', subtype: 'Input Tax Credits', normal: 'debit' },
  { code: '8101', name: 'QST Paid on Purchases - TGW', type: 'tax_paid', subtype: 'Input Tax Credits', normal: 'debit' },
];

export function ChartOfAccounts() {
  const { selectedCompany } = useCompany();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [subLedgerAccount, setSubLedgerAccount] = useState<Account | null>(null);
  const [subLedgerLines, setSubLedgerLines] = useState<any[]>([]);
  const [subLedgerLoading, setSubLedgerLoading] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<string[]>(['asset', 'liability', 'equity', 'revenue', 'expense']);
  const [formData, setFormData] = useState({
    account_code: '',
    account_name: '',
    account_type: 'asset',
    account_subtype: '',
    description: '',
    normal_balance: 'debit',
  });

  useEffect(() => {
    fetchAccounts();
  }, [selectedCompany]);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('chart_of_accounts')
        .select('*')
        .order('account_code');

      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      setAccounts((data || []) as Account[]);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const openSubLedger = async (account: Account) => {
    setSubLedgerAccount(account);
    setSubLedgerLoading(true);
    try {
      const { data, error } = await supabase
        .from('journal_entry_lines')
        .select('*, journal_entries!inner(entry_number, entry_date, description, status)')
        .eq('account_id', account.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setSubLedgerLines(data || []);
    } catch (err) {
      console.error('Sub-ledger fetch error:', err);
      setSubLedgerLines([]);
    } finally {
      setSubLedgerLoading(false);
    }
  };


    if (!selectedCompany) {
      toast.error('Please select a company first');
      return;
    }

    try {
      const accountsToInsert = DEFAULT_ACCOUNTS.map(acc => ({
        company_id: selectedCompany.id,
        account_code: acc.code,
        account_name: acc.name,
        account_type: acc.type,
        account_subtype: acc.subtype,
        normal_balance: acc.normal,
        is_system_account: true,
      }));

      const { error } = await supabase
        .from('chart_of_accounts')
        .insert(accountsToInsert);

      if (error) throw error;
      toast.success('Default chart of accounts created');
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create accounts');
    }
  };

  const handleSubmit = async () => {
    if (!formData.account_code || !formData.account_name) {
      toast.error('Account code and name are required');
      return;
    }

    try {
      const payload = {
        company_id: selectedCompany?.id,
        account_code: formData.account_code,
        account_name: formData.account_name,
        account_type: formData.account_type,
        account_subtype: formData.account_subtype || null,
        description: formData.description || null,
        normal_balance: formData.normal_balance,
      };

      if (editingAccount) {
        const { error } = await supabase
          .from('chart_of_accounts')
          .update(payload)
          .eq('id', editingAccount.id);
        if (error) throw error;
        toast.success('Account updated');
      } else {
        const { error } = await supabase
          .from('chart_of_accounts')
          .insert(payload);
        if (error) throw error;
        toast.success('Account created');
      }

      setDialogOpen(false);
      resetForm();
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save account');
    }
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setFormData({
      account_code: account.account_code,
      account_name: account.account_name,
      account_type: account.account_type,
      account_subtype: account.account_subtype || '',
      description: account.description || '',
      normal_balance: account.normal_balance,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this account? This cannot be undone.')) return;
    try {
      const { error } = await supabase
        .from('chart_of_accounts')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Account deleted');
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete account');
    }
  };

  const resetForm = () => {
    setFormData({
      account_code: '',
      account_name: '',
      account_type: 'asset',
      account_subtype: '',
      description: '',
      normal_balance: 'debit',
    });
    setEditingAccount(null);
  };

  const toggleType = (type: string) => {
    setExpandedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const getAccountsByType = (type: string) =>
    accounts.filter(a => a.account_type === type);

  const getTotalByType = (type: string) =>
    getAccountsByType(type).reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

  const handleExport = () => {
    const headers = ['Code', 'Name', 'Type', 'Subtype', 'Normal Balance', 'Current Balance'];
    const rows = accounts.map(a => [
      a.account_code,
      a.account_name,
      a.account_type,
      a.account_subtype || '',
      a.normal_balance,
      a.current_balance,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chart-of-accounts.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Chart of Accounts</h2>
          <Badge variant="outline">{accounts.length} accounts</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          {accounts.length === 0 && (
            <Button variant="outline" onClick={initializeDefaultAccounts}>
              <FileText className="h-4 w-4 mr-2" />
              Initialize Defaults
            </Button>
          )}
          <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No Accounts Found</h3>
            <p className="text-muted-foreground mb-4">
              Start by initializing the default Canadian GAAP chart of accounts
            </p>
            <Button onClick={initializeDefaultAccounts}>
              Initialize Default Accounts
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {ACCOUNT_TYPES.map(type => (
            <Card key={type.value}>
              <Collapsible open={expandedTypes.includes(type.value)} onOpenChange={() => toggleType(type.value)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedTypes.includes(type.value) ? (
                          <ChevronDown className="h-5 w-5" />
                        ) : (
                          <ChevronRight className="h-5 w-5" />
                        )}
                        <div className={`w-3 h-3 rounded-full ${type.color}`} />
                        <CardTitle>{type.label}</CardTitle>
                        <Badge variant="outline">{getAccountsByType(type.value).length}</Badge>
                      </div>
                      <span className="font-semibold">
                        {formatCurrency(getTotalByType(type.value))}
                      </span>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Code</TableHead>
                          <TableHead>Account Name</TableHead>
                          <TableHead>Subtype</TableHead>
                          <TableHead>Normal</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead className="w-[80px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getAccountsByType(type.value).map(account => (
                          <TableRow key={account.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openSubLedger(account)}>
                            <TableCell className="font-mono">{account.account_code}</TableCell>
                            <TableCell className="font-medium">{account.account_name}</TableCell>
                            <TableCell>{account.account_subtype || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {account.normal_balance}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(account.current_balance)}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openSubLedger(account); }}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleEdit(account); }}>
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                {!account.is_system_account && (
                                  <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDelete(account.id); }}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAccount ? 'Edit Account' : 'Add Account'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Account Code *</Label>
                <Input
                  value={formData.account_code}
                  onChange={(e) => setFormData({ ...formData, account_code: e.target.value })}
                  placeholder="e.g., 1000"
                />
              </div>
              <div className="space-y-2">
                <Label>Account Type *</Label>
                <Select
                  value={formData.account_type}
                  onValueChange={(v) => setFormData({ ...formData, account_type: v, account_subtype: '' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Account Name *</Label>
              <Input
                value={formData.account_name}
                onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                placeholder="Account name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subtype</Label>
                <Select
                  value={formData.account_subtype}
                  onValueChange={(v) => setFormData({ ...formData, account_subtype: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subtype" />
                  </SelectTrigger>
                  <SelectContent>
                    {(SUBTYPES[formData.account_type] || []).map(st => (
                      <SelectItem key={st} value={st}>{st}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Normal Balance</Label>
                <Select
                  value={formData.normal_balance}
                  onValueChange={(v) => setFormData({ ...formData, normal_balance: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Debit</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{editingAccount ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
