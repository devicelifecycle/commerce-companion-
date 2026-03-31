import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PermissionGuard } from '@/components/layout/PermissionGuard';
import { ReturnsManagement } from '@/components/inventory/ReturnsManagement';


export default function Returns() {
  return (
    <PermissionGuard permission="inventory_view" title="Returns">
    <DashboardLayout>
      <div className="space-y-6">
        <ReturnsGuide />
        <ReturnsManagement />
      </div>
    </DashboardLayout>
    </PermissionGuard>
  );
}
