import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ArrowRightLeft, Plus, Trash2, Settings } from 'lucide-react';

interface PricingRule {
  id: string;
  fromCompanyId: string;
  toCompanyId: string;
  markupType: 'percentage' | 'fixed';
  markupValue: number;
  category: string;
  isActive: boolean;
}

const STORAGE_KEY = 'transfer-pricing-rules';

export function TransferPricingRules() {
  const { companies, isSuperAdmin } = useCompany();
  const [rules, setRules] = useState<PricingRule[]>([]);

  const [newRule, setNewRule] = useState({
    fromCompanyId: '',
    toCompanyId: '',
    markupType: 'percentage' as 'percentage' | 'fixed',
    markupValue: '10',
    category: 'all',
  });

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setRules(JSON.parse(stored)); } catch { /* ignore corrupt storage */ }
    }
  }, []);

  const saveRules = (updated: PricingRule[]) => {
    setRules(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const handleAddRule = () => {
    if (!newRule.fromCompanyId || !newRule.toCompanyId) {
      toast.error('Select both companies');
      return;
    }
    if (newRule.fromCompanyId === newRule.toCompanyId) {
      toast.error('Source and destination must differ');
      return;
    }
    const rule: PricingRule = {
      id: crypto.randomUUID(),
      fromCompanyId: newRule.fromCompanyId,
      toCompanyId: newRule.toCompanyId,
      markupType: newRule.markupType,
      markupValue: parseFloat(newRule.markupValue) || 0,
      category: newRule.category,
      isActive: true,
    };
    saveRules([...rules, rule]);
    setNewRule({ fromCompanyId: '', toCompanyId: '', markupType: 'percentage', markupValue: '10', category: 'all' });
    toast.success('Pricing rule added');
  };

  const handleDeleteRule = (id: string) => {
    saveRules(rules.filter(r => r.id !== id));
    toast.success('Rule removed');
  };

  const toggleRule = (id: string) => {
    saveRules(rules.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
  };

  const getCompanyCode = (id: string) => companies.find(c => c.id === id)?.code || '?';

  if (!isSuperAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" /> Inter-company Transfer Pricing Rules
        </CardTitle>
        <CardDescription>
          Define markup rules that auto-apply when transferring devices between companies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Markup</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map(rule => (
                <TableRow key={rule.id} className={!rule.isActive ? 'opacity-50' : ''}>
                  <TableCell><Badge variant="outline">{getCompanyCode(rule.fromCompanyId)}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                      <Badge variant="outline">{getCompanyCode(rule.toCompanyId)}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{rule.category}</TableCell>
                  <TableCell>
                    {rule.markupType === 'percentage'
                      ? <Badge>{rule.markupValue}%</Badge>
                      : <Badge>${rule.markupValue}</Badge>
                    }
                  </TableCell>
                  <TableCell>
                    <Switch checked={rule.isActive} onCheckedChange={() => toggleRule(rule.id)} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteRule(rule.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="border border-dashed border-border rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium">Add New Rule</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Select value={newRule.fromCompanyId} onValueChange={(v) => setNewRule(p => ({ ...p, fromCompanyId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Select value={newRule.toCompanyId} onValueChange={(v) => setNewRule(p => ({ ...p, toCompanyId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={newRule.markupType} onValueChange={(v: any) => setNewRule(p => ({ ...p, markupType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Value</Label>
              <Input
                type="number"
                value={newRule.markupValue}
                onChange={(e) => setNewRule(p => ({ ...p, markupValue: e.target.value }))}
                placeholder="10"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleAddRule} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Add Rule
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function getTransferPriceFromRules(costPrice: number, fromCompanyId: string, toCompanyId: string, category: string = 'all'): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return costPrice;
    const rules: PricingRule[] = JSON.parse(stored);
    const rule = rules.find(r =>
      r.isActive &&
      r.fromCompanyId === fromCompanyId &&
      r.toCompanyId === toCompanyId &&
      (r.category === 'all' || r.category === category)
    );
    if (!rule) return costPrice;
    if (rule.markupType === 'percentage') {
      return Math.round(costPrice * (1 + rule.markupValue / 100) * 100) / 100;
    }
    return costPrice + rule.markupValue;
  } catch {
    return costPrice;
  }
}
