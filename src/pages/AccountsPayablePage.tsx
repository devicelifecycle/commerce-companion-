import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PermissionGuard } from '@/components/layout/PermissionGuard';
import { AccountsPayable } from '@/components/accounting/AccountsPayable';

export default function AccountsPayablePage() {
  return (
    <PermissionGuard permission="accounting_view" title="Accounts Payable">
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold gradient-text">Accounts Payable</h1>
          <p className="text-muted-foreground mt-1">Track bills, vendor payments, and outstanding balances</p>
        </div>
        <AccountsPayable />
      </div>
    </DashboardLayout>
    </PermissionGuard>
  );
}
