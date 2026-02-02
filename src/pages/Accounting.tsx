import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartOfAccounts } from '@/components/accounting/ChartOfAccounts';
import { AccountsReceivable } from '@/components/accounting/AccountsReceivable';
import { AccountsPayable } from '@/components/accounting/AccountsPayable';
import { JournalEntries } from '@/components/accounting/JournalEntries';
import { TrialBalance } from '@/components/accounting/TrialBalance';
import { 
  Wallet, ArrowUpRight, ArrowDownRight, BookOpen, Scale
} from 'lucide-react';

export default function Accounting() {
  const [activeTab, setActiveTab] = useState('chart');

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold gradient-text">Accounting</h1>
          <p className="text-muted-foreground mt-1">Canadian GAAP compliant accounting system</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
            <TabsTrigger value="chart" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Chart of Accounts</span>
            </TabsTrigger>
            <TabsTrigger value="ar" className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" />
              <span className="hidden sm:inline">Receivables</span>
            </TabsTrigger>
            <TabsTrigger value="ap" className="flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4" />
              <span className="hidden sm:inline">Payables</span>
            </TabsTrigger>
            <TabsTrigger value="journal" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Journal</span>
            </TabsTrigger>
            <TabsTrigger value="trial" className="flex items-center gap-2">
              <Scale className="h-4 w-4" />
              <span className="hidden sm:inline">Trial Balance</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chart" className="space-y-6">
            <ChartOfAccounts />
          </TabsContent>

          <TabsContent value="ar" className="space-y-6">
            <AccountsReceivable />
          </TabsContent>

          <TabsContent value="ap" className="space-y-6">
            <AccountsPayable />
          </TabsContent>

          <TabsContent value="journal" className="space-y-6">
            <JournalEntries />
          </TabsContent>

          <TabsContent value="trial" className="space-y-6">
            <TrialBalance />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
