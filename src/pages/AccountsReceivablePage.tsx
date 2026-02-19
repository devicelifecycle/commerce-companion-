import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PermissionGuard } from '@/components/layout/PermissionGuard';
import { AccountsReceivable } from '@/components/accounting/AccountsReceivable';

export default function AccountsReceivablePage() {
  return (
    <PermissionGuard permission="accounting_view" title="Accounts Receivable">
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold gradient-text">Accounts Receivable</h1>
          <p className="text-muted-foreground mt-1">Track customer invoices and incoming payments</p>
        </div>
        <AccountsReceivable />
      </div>
    </DashboardLayout>
    </PermissionGuard>
  );
}
