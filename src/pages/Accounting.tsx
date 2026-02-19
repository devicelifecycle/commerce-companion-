import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PermissionGuard } from '@/components/layout/PermissionGuard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartOfAccounts } from '@/components/accounting/ChartOfAccounts';
import { AccountsReceivable } from '@/components/accounting/AccountsReceivable';
import { AccountsPayable } from '@/components/accounting/AccountsPayable';
import { JournalEntries } from '@/components/accounting/JournalEntries';
import { TrialBalance } from '@/components/accounting/TrialBalance';
import { ProfitLossReport } from '@/components/accounting/ProfitLossReport';
import { BalanceSheetReport } from '@/components/accounting/BalanceSheetReport';
import { 
  Wallet, ArrowUpRight, ArrowDownRight, BookOpen, Scale, TrendingUp, Building2
} from 'lucide-react';

export default function Accounting() {
  const [activeTab, setActiveTab] = useState('chart');

  return (
    <PermissionGuard permission="accounting_view" title="Accounting">
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold gradient-text">Accounting</h1>
          <p className="text-muted-foreground mt-1">Cash-Basis Accounting System | FIFO Inventory | IFRS Compliant</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-7 lg:w-auto lg:inline-grid">
            <TabsTrigger value="chart" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Accounts</span>
            </TabsTrigger>
            <TabsTrigger value="journal" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Journal</span>
            </TabsTrigger>
            <TabsTrigger value="trial" className="flex items-center gap-2">
              <Scale className="h-4 w-4" />
              <span className="hidden sm:inline">Trial Balance</span>
            </TabsTrigger>
            <TabsTrigger value="pl" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">P&L</span>
            </TabsTrigger>
            <TabsTrigger value="balance" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Balance Sheet</span>
            </TabsTrigger>
            <TabsTrigger value="ar" className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" />
              <span className="hidden sm:inline">AR</span>
            </TabsTrigger>
            <TabsTrigger value="ap" className="flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4" />
              <span className="hidden sm:inline">AP</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chart" className="space-y-6">
            <ChartOfAccounts />
          </TabsContent>

          <TabsContent value="journal" className="space-y-6">
            <JournalEntries />
          </TabsContent>

          <TabsContent value="trial" className="space-y-6">
            <TrialBalance />
          </TabsContent>

          <TabsContent value="pl" className="space-y-6">
            <ProfitLossReport />
          </TabsContent>

          <TabsContent value="balance" className="space-y-6">
            <BalanceSheetReport />
          </TabsContent>

          <TabsContent value="ar" className="space-y-6">
            <AccountsReceivable />
          </TabsContent>

          <TabsContent value="ap" className="space-y-6">
            <AccountsPayable />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
    </PermissionGuard>
  );
}
