import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ProfitLossReport } from '@/components/accounting/ProfitLossReport';

export default function ProfitLoss() {
  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold gradient-text">Profit & Loss</h1>
          <p className="text-muted-foreground mt-1">Revenue, expenses, and net income summary</p>
        </div>
        <ProfitLossReport />
      </div>
    </DashboardLayout>
  );
}
