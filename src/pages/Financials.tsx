import { useState } from 'react';

import { HSTReconciliation } from '@/components/taxes/HSTReconciliation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PermissionGuard } from '@/components/layout/PermissionGuard';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCompany } from '@/contexts/CompanyContext';
import { getCompanyDisplayName } from '@/lib/companyNames';

// Statements
import { ProfitLossReport } from '@/components/accounting/ProfitLossReport';
import { BalanceSheetReport } from '@/components/accounting/BalanceSheetReport';

// Ledger & Accounts
import { ChartOfAccounts } from '@/components/accounting/ChartOfAccounts';
import { JournalEntries } from '@/components/accounting/JournalEntries';
import { TrialBalance } from '@/components/accounting/TrialBalance';

// Reconciliation
import { MarketplaceReconciliation } from '@/components/reports/MarketplaceReconciliation';
import { PayoutReconciliation } from '@/components/reports/PayoutReconciliation';
import { FBAReconciliation } from '@/components/reports/FBAReconciliation';

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

// Accounting Audit Trail
import { AccountingAuditTrail } from '@/components/financials/AccountingAuditTrail';

// Year-End Closing
import { YearEndClosing } from '@/components/accounting/YearEndClosing';

// Data Integrity (moved from Audit Logs)
import { UnaccountedMarketplaceData } from '@/components/audit/UnaccountedMarketplaceData';
import { EntityRelationshipMap } from '@/components/audit/EntityRelationshipMap';

import {
  TrendingUp, ArrowLeftRight, Receipt,
  Scale, CheckSquare, Calculator, FileText, LayoutDashboard,
  Warehouse, Banknote, Wallet, BookOpen, ClipboardCheck,
  Building2, Lock, Package, Link2, PackageSearch,
} from 'lucide-react';

type SubView =
  | 'pl' | 'balance-sheet'
  | 'chart-of-accounts' | 'journal-entries' | 'trial-balance'
  | 'reconciliation' | 'payouts' | 'fba-reconciliation'
  | 'ap' | 'ar'
  | 'tax-dashboard' | 'tax-collected' | 'tax-itc' | 'tax-filing' | 'tax-reconciliation'
  | 'cost-devices'
  | 'accounting-trail'
  | 'year-end-closing'
  | 'relationships' | 'unaccounted';

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
    key: 'ledger',
    label: 'Ledger',
    icon: Wallet,
    views: [
      { value: 'chart-of-accounts' as SubView, label: 'Chart of Accounts', icon: Wallet },
      { value: 'journal-entries' as SubView, label: 'Journal Entries', icon: BookOpen },
      { value: 'trial-balance' as SubView, label: 'Trial Balance', icon: Scale },
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
      { value: 'fba-reconciliation' as SubView, label: 'FBA Reconciliation', icon: Package },
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
      { value: 'tax-reconciliation' as SubView, label: 'Reconciliation', icon: Scale },
      { value: 'tax-filing' as SubView, label: 'Filing', icon: FileText },
    ],
  },
  {
    key: 'data-integrity',
    label: 'Data Integrity',
    icon: Link2,
    views: [
      { value: 'relationships' as SubView, label: 'Relationships', icon: Link2 },
      { value: 'unaccounted' as SubView, label: 'Unaccounted', icon: PackageSearch },
    ],
  },
  {
    key: 'audit-trail',
    label: 'Audit Trail',
    icon: ClipboardCheck,
    views: [
      { value: 'accounting-trail' as SubView, label: 'Accounting Trail', icon: ClipboardCheck },
    ],
  },
  {
    key: 'closing',
    label: 'Year-End',
    icon: Lock,
    views: [
      { value: 'year-end-closing' as SubView, label: 'Year-End Closing', icon: Lock },
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
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Financials</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Statements · Ledger · Cost Ledger · AP/AR · Reconciliation · Taxes · Audit Trail
            </p>
          </div>

          {/* Company Filter — Prominent */}
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <ToggleGroup
              type="single"
              value={companyView}
              onValueChange={(v) => { if (v) setCompanyView(v); }}
              className="bg-muted rounded-lg p-1 border border-border"
            >
              <ToggleGroupItem
                value="consolidated"
                className="text-sm px-4 py-2 font-medium"
              >
                All Companies
              </ToggleGroupItem>
              {companies.map(c => (
                <ToggleGroupItem
                  key={c.id}
                  value={c.id}
                  className="text-sm px-4 py-2 font-medium"
                >
                  {getCompanyDisplayName(c.code)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>



          {/* Section tabs */}
          <ToggleGroup
            type="single"
            value={activeSection}
            onValueChange={handleSectionChange}
            className="bg-muted rounded-lg p-0.5 w-fit flex-wrap"
          >
            {SECTIONS.map(s => (
              <ToggleGroupItem key={s.key} value={s.key} className="text-xs px-3 py-1.5 gap-1.5">
                <s.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{s.label}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/* Sub-view selector */}
          {currentSection && currentSection.views.length > 1 && (
            <ToggleGroup
              type="single"
              value={subView}
              onValueChange={(v) => { if (v) setSubView(v as SubView); }}
              className="bg-muted/50 rounded-lg p-0.5 border border-border/50 w-fit"
            >
              {currentSection.views.map(v => (
                <ToggleGroupItem key={v.value} value={v.value} className="text-xs px-3 py-1.5 gap-1.5">
                  <v.icon className="h-3 w-3" />
                  {v.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}

          {/* Content */}
          <div className="min-h-[400px]">
            {subView === 'pl' && <ProfitLossReport companyView={companyView} />}
            {subView === 'balance-sheet' && <BalanceSheetReport companyView={companyView} />}

            {subView === 'chart-of-accounts' && <ChartOfAccounts />}
            {subView === 'journal-entries' && <JournalEntries />}
            {subView === 'trial-balance' && <TrialBalance />}

            {subView === 'cost-devices' && <CostLedgerPanel companyView={companyView} />}

            {subView === 'reconciliation' && <MarketplaceReconciliation companyView={companyView} />}
            {subView === 'fba-reconciliation' && <FBAReconciliation />}
            {subView === 'payouts' && <PayoutReconciliation companyView={companyView} />}

            {subView === 'ap' && <AccountsPayable companyFilter={companyView} />}
            {subView === 'ar' && <AccountsReceivable companyFilter={companyView} />}

            {subView === 'tax-dashboard' && <TaxDashboard />}
            {subView === 'tax-collected' && <TaxCollectedReport />}
            {subView === 'tax-itc' && <InputTaxCredits />}
            {subView === 'tax-filing' && <TaxFilingReport />}
            {subView === 'tax-reconciliation' && <HSTReconciliation />}

            {subView === 'accounting-trail' && <AccountingAuditTrail companyView={companyView} />}
            {subView === 'year-end-closing' && <YearEndClosing />}
          </div>
        </div>
      </DashboardLayout>
    </PermissionGuard>
  );
}
