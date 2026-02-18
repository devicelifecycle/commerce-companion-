import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ReturnsManagement } from '@/components/inventory/ReturnsManagement';
import { ReturnsGuide } from '@/components/guides/ReturnsGuide';

export default function Returns() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <ReturnsGuide />
        <ReturnsManagement />
      </div>
    </DashboardLayout>
  );
}
