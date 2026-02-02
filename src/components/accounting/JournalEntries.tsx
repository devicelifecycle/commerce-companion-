import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Download, BookOpen, Trash2, Check, X } from 'lucide-react';
import { format } from 'date-fns';

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
}

interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  status: string;
  total_debit: number;
  total_credit: number;
  is_auto_generated: boolean;
  created_at: string;
}

interface JournalLine {
  id?: string;
  account_id: string;
  account?: Account;
  description: string;
  debit_amount: number;
  credit_amount: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted',
  pending: 'bg-amber-500',
  approved: 'bg-blue-500',
  posted: 'bg-emerald-500',
  void: 'bg-destructive',
};

export function JournalEntries() {
  const { selectedCompany } = useCompany();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    entry_date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
  });
  const [lines, setLines] = useState<JournalLine[]>([
    { account_id: '', description: '', debit_amount: 0, credit_amount: 0 },
    { account_id: '', description: '', debit_amount: 0, credit_amount: 0 },
  ]);

  useEffect(() => {
    fetchData();
  }, [selectedCompany]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch journal entries
      let query = supabase
        .from('journal_entries')
        .select('*')
        .order('entry_date', { ascending: false });

      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data: entriesData, error: entriesError } = await query;
      if (entriesError) throw entriesError;

      setEntries((entriesData || []) as JournalEntry[]);

      // Fetch accounts
      let accountsQuery = supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type')
        .eq('is_active', true)
        .order('account_code');

      if (selectedCompany) {
        accountsQuery = accountsQuery.eq('company_id', selectedCompany.id);
      }

      const { data: accountsData } = await accountsQuery;
      setAccounts((accountsData || []) as Account[]);
    } catch (error) {
      console.error('Error fetching journal entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateEntryNumber = () => {
    const prefix = 'JE';
    const date = format(new Date(), 'yyyyMMdd');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${date}-${random}`;
  };

  const handleSubmit = async () => {
    if (!formData.description) {
      toast.error('Description is required');
      return;
    }

    // Validate lines
    const validLines = lines.filter(l => l.account_id && (l.debit_amount > 0 || l.credit_amount > 0));
    if (validLines.length < 2) {
      toast.error('At least 2 lines with amounts are required');
      return;
    }

    const totalDebit = validLines.reduce((sum, l) => sum + l.debit_amount, 0);
    const totalCredit = validLines.reduce((sum, l) => sum + l.credit_amount, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      toast.error('Debits must equal credits');
      return;
    }

    try {
      // Create journal entry
      const { data: entryData, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          company_id: selectedCompany?.id,
          entry_number: generateEntryNumber(),
          entry_date: formData.entry_date,
          description: formData.description,
          total_debit: totalDebit,
          total_credit: totalCredit,
          status: 'draft',
        })
        .select()
        .single();

      if (entryError) throw entryError;

      // Create lines
      const linesToInsert = validLines.map(l => ({
        journal_entry_id: entryData.id,
        account_id: l.account_id,
        description: l.description || null,
        debit_amount: l.debit_amount,
        credit_amount: l.credit_amount,
      }));

      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(linesToInsert);

      if (linesError) throw linesError;

      toast.success('Journal entry created');
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create entry');
    }
  };

  const handleStatusChange = async (entryId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('journal_entries')
        .update({ status: newStatus })
        .eq('id', entryId);

      if (error) throw error;
      toast.success(`Entry ${newStatus}`);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status');
    }
  };

  const resetForm = () => {
    setFormData({
      entry_date: format(new Date(), 'yyyy-MM-dd'),
      description: '',
    });
    setLines([
      { account_id: '', description: '', debit_amount: 0, credit_amount: 0 },
      { account_id: '', description: '', debit_amount: 0, credit_amount: 0 },
    ]);
  };

  const addLine = () => {
    setLines([...lines, { account_id: '', description: '', debit_amount: 0, credit_amount: 0 }]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 2) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const updateLine = (index: number, field: keyof JournalLine, value: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const totalDebit = lines.reduce((sum, l) => sum + (l.debit_amount || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (l.credit_amount || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const getFilteredEntries = () => {
    switch (activeTab) {
      case 'draft':
        return entries.filter(e => e.status === 'draft');
      case 'posted':
        return entries.filter(e => e.status === 'posted');
      default:
        return entries;
    }
  };

  const handleExport = () => {
    const headers = ['Entry #', 'Date', 'Description', 'Debit', 'Credit', 'Status'];
    const rows = entries.map(e => [
      e.entry_number,
      e.entry_date,
      e.description,
      e.total_debit,
      e.total_credit,
      e.status,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-entries-${format(new Date(), 'yyyy-MM-dd')}.csv`;
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Journal Entries
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                New Entry
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All ({entries.length})</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="posted">Posted</TabsTrigger>
            </TabsList>
            <TabsContent value={activeTab} className="mt-4">
              {getFilteredEntries().length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No journal entries found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entry #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[150px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredEntries().map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono">{entry.entry_number}</TableCell>
                        <TableCell>{format(new Date(entry.entry_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell>{entry.description}</TableCell>
                        <TableCell className="text-right">{formatCurrency(entry.total_debit)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(entry.total_credit)}</TableCell>
                        <TableCell>
                          <Badge className={`${STATUS_COLORS[entry.status]} text-white capitalize`}>
                            {entry.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {entry.status === 'draft' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStatusChange(entry.id, 'posted')}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStatusChange(entry.id, 'void')}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* New Entry Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              New Journal Entry
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Entry Date *</Label>
                <Input
                  type="date"
                  value={formData.entry_date}
                  onChange={(e) => setFormData({ ...formData, entry_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description *</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Entry description"
                />
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium">Entry Lines</h4>
                <Button size="sm" variant="outline" onClick={addLine}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Line
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Account</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[150px] text-right">Debit</TableHead>
                    <TableHead className="w-[150px] text-right">Credit</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Select
                          value={line.account_id}
                          onValueChange={(v) => updateLine(index, 'account_id', v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map(a => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.account_code} - {a.account_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(index, 'description', e.target.value)}
                          placeholder="Line description"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={line.debit_amount || ''}
                          onChange={(e) => updateLine(index, 'debit_amount', parseFloat(e.target.value) || 0)}
                          className="text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={line.credit_amount || ''}
                          onChange={(e) => updateLine(index, 'credit_amount', parseFloat(e.target.value) || 0)}
                          className="text-right"
                        />
                      </TableCell>
                      <TableCell>
                        {lines.length > 2 && (
                          <Button size="icon" variant="ghost" onClick={() => removeLine(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold bg-muted/50">
                    <TableCell colSpan={2}>Totals</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalDebit)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalCredit)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
              {!isBalanced && totalDebit > 0 && (
                <p className="text-destructive text-sm mt-2">
                  Entry is unbalanced. Difference: {formatCurrency(Math.abs(totalDebit - totalCredit))}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!isBalanced || totalDebit === 0}>
              Create Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
