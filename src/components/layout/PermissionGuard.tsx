import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from './DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, Loader2 } from 'lucide-react';

interface PermissionGuardProps {
  /** Permission code to check (e.g. 'invoices_view') */
  permission: string;
  /** Action to check (default: 'view') */
  action?: 'view' | 'create' | 'edit' | 'delete';
  /** Page title shown in access denied */
  title: string;
  children: React.ReactNode;
}

/**
 * Wraps a page with permission + loading checks.
 * Super admins always pass. Associates must have the specified permission.
 */
export function PermissionGuard({ permission, action = 'view', title, children }: PermissionGuardProps) {
  const { isSuperAdmin, hasPermission, loading } = useCompany();

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  const allowed = isSuperAdmin || hasPermission(permission, action);

  if (!allowed) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
          </div>
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Access Restricted</h3>
                <p className="text-muted-foreground max-w-md">
                  You don't have permission to view this page. Contact your administrator for access.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return <>{children}</>;
}
