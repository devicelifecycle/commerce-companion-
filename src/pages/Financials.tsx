import { useState } from 'react';
import { FinancialsGuide } from '@/components/guides/FinancialsGuide';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCompany } from '@/contexts/CompanyContext';

// Statements
import { ProfitLossReport } from '@/components/accounting/ProfitLossReport';
import { BalanceSheetReport } from '@/components/accounting/BalanceSheetReport';

// Reports
import { ExecutiveDashboard } from '@/components/reports/ExecutiveDashboard';
import { MarketplaceAccounting } from '@/components/reports/MarketplaceAccounting';
import { MarketplaceReconciliation } from '@/components/reports/MarketplaceReconciliation';
import { MarketplaceFeeAnalytics } from '@/components/reports/MarketplaceFeeAnalytics';

// AP & AR
import { AccountsPayable } from '@/components/accounting/AccountsPayable';
import { AccountsReceivable } from '@/components/accounting/AccountsReceivable';

// Taxes
import { TaxDashboard } from '@/components/taxes/TaxDashboard';
import { TaxCollectedReport } from '@/components/taxes/TaxCollectedReport';
import { InputTaxCredits } from '@/components/taxes/InputTaxCredits';
import { TaxFilingReport } from '@/components/taxes/TaxFilingReport';

import {
  TrendingUp, BarChart3, ArrowLeftRight, Receipt, Building2, Search,
  Scale, Store, CheckSquare, Calculator, FileText, LayoutDashboard,
} from 'lucide-react';

type SubView =
  | 'pl' | 'balance-sheet'
  | 'executive' | 'marketplace' | 'fees' | 'reconciliation'
  | 'ap' | 'ar'
  | 'tax-dashboard' | 'tax-collected' | 'tax-itc' | 'tax-filing';

const SUB_VIEWS: Record<string, { label: string; icon: React.ElementType; views: { value: SubView; label: string; icon: React.ElementType }[] }> = {
  statements: {
    label: 'Statements',
    icon: TrendingUp,
    views: [
      { value: 'pl', label: 'Profit & Loss', icon: TrendingUp },
      { value: 'balance-sheet', label: 'Balance Sheet', icon: Scale },
    ],
  },
  reports: {
    label: 'Reports',
    icon: BarChart3,
    views: [
      { value: 'executive', label: 'Executive', icon: LayoutDashboard },
      { value: 'marketplace', label: 'Marketplace', icon: Store },
      { value: 'fees', label: 'Fees & Commissions', icon: Receipt },
      { value: 'reconciliation', label: 'Reconciliation', icon: CheckSquare },
    ],
  },
  'ap-ar': {
    label: 'AP & AR',
    icon: ArrowLeftRight,
    views: [
      { value: 'ap', label: 'Accounts Payable', icon: ArrowLeftRight },
      { value: 'ar', label: 'Accounts Receivable', icon: ArrowLeftRight },
    ],
  },
  taxes: {
    label: 'Taxes',
    icon: Receipt,
    views: [
      { value: 'tax-dashboard', label: 'Overview', icon: LayoutDashboard },
      { value: 'tax-collected', label: 'Tax Collected', icon: Receipt },
      { value: 'tax-itc', label: 'Input Tax Credits', icon: Calculator },
      { value: 'tax-filing', label: 'Filing', icon: FileText },
    ],
  },
};

export default function Financials() {
  const { companies } = useCompany();
  const [activeTab, setActiveTab] = useState('statements');
  const [subView, setSubView] = useState<SubView>('pl');
  const [companyView, setCompanyView] = useState<'consolidated' | string>('consolidated');

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    // Auto-select first sub-view of the tab
    const firstView = SUB_VIEWS[tab]?.views[0]?.value;
    if (firstView) setSubView(firstView);
  };

  const currentGroup = SUB_VIEWS[activeTab];

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold gradient-text">Financials</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Statements, reports, payables, receivables & tax compliance
            </p>
          </div>

          {/* Company View Toggle */}
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <ToggleGroup
              type="single"
              value={companyView}
              onValueChange={(v) => { if (v) setCompanyView(v); }}
              className="bg-muted rounded-lg p-0.5"
            >
              <ToggleGroupItem value="consolidated" className="text-xs px-2.5 py-1 data-[state=on]:bg-background data-[state=on]:shadow-sm">
                All
              </ToggleGroupItem>
              {companies.map(c => (
                <ToggleGroupItem key={c.id} value={c.id} className="text-xs px-2.5 py-1 data-[state=on]:bg-background data-[state=on]:shadow-sm">
                  {c.code}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>

        <FinancialsGuide />

        {/* Primary Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="w-full justify-start">
            {Object.entries(SUB_VIEWS).map(([key, group]) => (
              <TabsTrigger key={key} value={key} className="flex items-center gap-1.5 text-xs">
                <group.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{group.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Sub-view selector */}
        {currentGroup && currentGroup.views.length > 1 && (
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              value={subView}
              onValueChange={(v) => { if (v) setSubView(v as SubView); }}
              className="bg-muted/50 rounded-lg p-0.5 border border-border/40"
            >
              {currentGroup.views.map(v => (
                <ToggleGroupItem key={v.value} value={v.value} className="text-xs px-3 py-1.5 gap-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm">
                  <v.icon className="h-3 w-3" />
                  {v.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}

        {/* Content */}
        <div className="min-h-[400px]">
          {/* Statements */}
          {subView === 'pl' && <ProfitLossReport />}
          {subView === 'balance-sheet' && <BalanceSheetReport />}

          {/* Reports */}
          {subView === 'executive' && <ExecutiveDashboard companyView={companyView} />}
          {subView === 'marketplace' && <MarketplaceAccounting companyView={companyView} />}
          {subView === 'fees' && <MarketplaceFeeAnalytics companyView={companyView} />}
          {subView === 'reconciliation' && <MarketplaceReconciliation companyView={companyView} />}

          {/* AP & AR */}
          {subView === 'ap' && <AccountsPayable />}
          {subView === 'ar' && <AccountsReceivable />}

          {/* Taxes */}
          {subView === 'tax-dashboard' && <TaxDashboard />}
          {subView === 'tax-collected' && <TaxCollectedReport />}
          {subView === 'tax-itc' && <InputTaxCredits />}
          {subView === 'tax-filing' && <TaxFilingReport />}
        </div>
      </div>
    </DashboardLayout>
  );
}
