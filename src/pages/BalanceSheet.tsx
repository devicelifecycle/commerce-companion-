import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BalanceSheetReport } from '@/components/accounting/BalanceSheetReport';

export default function BalanceSheet() {
  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold gradient-text">Balance Sheet</h1>
          <p className="text-muted-foreground mt-1">Assets, liabilities, and equity overview</p>
        </div>
        <BalanceSheetReport />
      </div>
    </DashboardLayout>
  );
}
