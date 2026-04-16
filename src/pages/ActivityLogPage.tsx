import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ActivityLog } from '@/components/activity/ActivityLog';
import { Activity } from 'lucide-react';

export default function ActivityLogPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Activity Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Complete audit trail of who did what across the entire system.
          </p>
        </div>
        <ActivityLog showFilters showHeader title="All Activity" />
      </div>
    </DashboardLayout>
  );
}
