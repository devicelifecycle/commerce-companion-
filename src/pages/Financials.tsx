import { useState } from 'react';
import { FinancialsGuide } from '@/components/guides/FinancialsGuide';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PermissionGuard } from '@/components/layout/PermissionGuard';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCompany } from '@/contexts/CompanyContext';

// Statements
import { ProfitLossReport } from '@/components/accounting/ProfitLossReport';
import { BalanceSheetReport } from '@/components/accounting/BalanceSheetReport';

// Reconciliation
import { MarketplaceReconciliation } from '@/components/reports/MarketplaceReconciliation';
import { PayoutReconciliation } from '@/components/reports/PayoutReconciliation';

// AP & AR
import { AccountsPayable } from '@/components/accounting/AccountsPayable';
import { AccountsReceivable } from '@/components/accounting/AccountsReceivable';

// Taxes
import { TaxDashboard } from '@/components/taxes/TaxDashboard';
import { TaxCollectedReport } from '@/components/taxes/TaxCollectedReport';
import { InputTaxCredits } from '@/components/taxes/InputTaxCredits';
import { TaxFilingReport } from '@/components/taxes/TaxFilingReport';

// Cost Ledger
import { CostLedgerPanel } from '@/components/financials/CostLedgerPanel';

import {
  TrendingUp, ArrowLeftRight, Receipt, Building2,
  Scale, CheckSquare, Calculator, FileText, LayoutDashboard,
  Warehouse, Banknote,
} from 'lucide-react';

type SubView =
  | 'pl' | 'balance-sheet'
  | 'reconciliation' | 'payouts'
  | 'ap' | 'ar'
  | 'tax-dashboard' | 'tax-collected' | 'tax-itc' | 'tax-filing'
  | 'cost-devices';

const SECTIONS = [
  {
    key: 'statements',
    label: 'Statements',
    icon: TrendingUp,
    views: [
      { value: 'pl' as SubView, label: 'Profit & Loss', icon: TrendingUp },
      { value: 'balance-sheet' as SubView, label: 'Balance Sheet', icon: Scale },
    ],
  },
  {
    key: 'cost-ledger',
    label: 'Cost Ledger',
    icon: Warehouse,
    views: [
      { value: 'cost-devices' as SubView, label: 'Cost Ledger', icon: Warehouse },
    ],
  },
  {
    key: 'ap-ar',
    label: 'AP & AR',
    icon: ArrowLeftRight,
    views: [
      { value: 'ap' as SubView, label: 'Payable', icon: ArrowLeftRight },
      { value: 'ar' as SubView, label: 'Receivable', icon: ArrowLeftRight },
    ],
  },
  {
    key: 'reconciliation',
    label: 'Reconciliation',
    icon: CheckSquare,
    views: [
      { value: 'reconciliation' as SubView, label: 'Marketplace', icon: CheckSquare },
      { value: 'payouts' as SubView, label: 'Payouts', icon: Banknote },
    ],
  },
  {
    key: 'taxes',
    label: 'Taxes',
    icon: Receipt,
    views: [
      { value: 'tax-dashboard' as SubView, label: 'Overview', icon: LayoutDashboard },
      { value: 'tax-collected' as SubView, label: 'Collected', icon: Receipt },
      { value: 'tax-itc' as SubView, label: 'ITC', icon: Calculator },
      { value: 'tax-filing' as SubView, label: 'Filing', icon: FileText },
    ],
  },
];

export default function Financials() {
  const { companies } = useCompany();
  const [activeSection, setActiveSection] = useState('statements');
  const [subView, setSubView] = useState<SubView>('pl');
  const [companyView, setCompanyView] = useState<'consolidated' | string>('consolidated');

  const handleSectionChange = (section: string) => {
    if (!section) return;
    setActiveSection(section);
    const firstView = SECTIONS.find(s => s.key === section)?.views[0]?.value;
    if (firstView) setSubView(firstView);
  };

  const currentSection = SECTIONS.find(s => s.key === activeSection);

  return (
    <PermissionGuard permission="accounting_view" title="Financial Hub">
      <DashboardLayout>
        <div className="space-y-4 animate-fade-in">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-display font-bold gradient-text">Financials</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Statements · Cost Ledger · AP/AR · Reconciliation · Taxes
              </p>
            </div>

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

          {/* Section tabs */}
          <ToggleGroup
            type="single"
            value={activeSection}
            onValueChange={handleSectionChange}
            className="bg-muted rounded-lg p-0.5 w-fit"
          >
            {SECTIONS.map(s => (
              <ToggleGroupItem key={s.key} value={s.key} className="text-xs px-3 py-1.5 gap-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm">
                <s.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{s.label}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/* Sub-view selector (only if section has multiple views) */}
          {currentSection && currentSection.views.length > 1 && (
            <ToggleGroup
              type="single"
              value={subView}
              onValueChange={(v) => { if (v) setSubView(v as SubView); }}
              className="bg-muted/50 rounded-lg p-0.5 border border-border/40 w-fit"
            >
              {currentSection.views.map(v => (
                <ToggleGroupItem key={v.value} value={v.value} className="text-xs px-3 py-1.5 gap-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm">
                  <v.icon className="h-3 w-3" />
                  {v.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}

          {/* Content */}
          <div className="min-h-[400px]">
            {subView === 'pl' && <ProfitLossReport />}
            {subView === 'balance-sheet' && <BalanceSheetReport />}

            {subView === 'cost-devices' && <CostLedgerPanel companyView={companyView} />}

            {subView === 'reconciliation' && <MarketplaceReconciliation companyView={companyView} />}

            {subView === 'ap' && <AccountsPayable companyFilter={companyView} />}
            {subView === 'ar' && <AccountsReceivable companyFilter={companyView} />}

            {subView === 'tax-dashboard' && <TaxDashboard />}
            {subView === 'tax-collected' && <TaxCollectedReport />}
            {subView === 'tax-itc' && <InputTaxCredits />}
            {subView === 'tax-filing' && <TaxFilingReport />}
          </div>
        </div>
      </DashboardLayout>
    </PermissionGuard>
  );
}
