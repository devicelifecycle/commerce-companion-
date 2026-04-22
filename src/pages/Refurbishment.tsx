import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useDataRefetch } from '@/hooks/useDataRefetch';

import { RefurbishmentQueue } from '@/components/refurbishment/RefurbishmentQueue';
import { RefurbishmentDetail } from '@/components/refurbishment/RefurbishmentDetail';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Wrench, CheckCircle2, Clock } from 'lucide-react';

export default function Refurbishment() {
  const { selectedCompany, isSuperAdmin, hasPermission } = useCompany();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const canManage = hasPermission('inventory_manage', 'edit') || isSuperAdmin;

  // Fetch devices in refurbishment
  const { data: pendingDevices = [], isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ['refurbishment-pending', selectedCompany?.id],
    queryFn: async () => {
      let query = supabase
        .from('devices')
        .select('*, suppliers(name)')
        .eq('status', 'hold_for_refurbishment')
        .in('refurbishment_status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false });
      if (selectedCompany) query = query.eq('company_id', selectedCompany.id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: completedDevices = [], isLoading: completedLoading, refetch: refetchCompleted } = useQuery({
    queryKey: ['refurbishment-completed', selectedCompany?.id],
    queryFn: async () => {
      let query = supabase
        .from('devices')
        .select('*, suppliers(name)')
        .eq('refurbishment_status', 'completed')
        .order('refurbishment_completed_at', { ascending: false })
        .limit(50);
      if (selectedCompany) query = query.eq('company_id', selectedCompany.id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const refetchAll = () => { refetchPending(); refetchCompleted(); };

  useDataRefetch(['refurbishment', 'inventory'], refetchAll);

  const pendingCount = pendingDevices.length;
  const inProgressCount = pendingDevices.filter((d: any) => d.refurbishment_status === 'in_progress').length;

  if (!hasPermission('inventory_view', 'view') && !isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">You don't have permission to view refurbishment.</p>
        </div>
      </DashboardLayout>
    );
  }

  if (selectedDeviceId) {
    return (
      <DashboardLayout>
        <RefurbishmentDetail
          deviceId={selectedDeviceId}
          onBack={() => { setSelectedDeviceId(null); refetchAll(); }}
          canManage={canManage}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Wrench className="h-6 w-6" /> Refurbishment Queue
              </h1>
              <p className="text-muted-foreground">
                Devices awaiting inspection, repair, and quality check before entering inventory
              </p>
            </div>
            
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-sm px-3 py-1">
              <Clock className="h-3.5 w-3.5 mr-1" /> {pendingCount} Pending
            </Badge>
            <Badge variant="secondary" className="text-sm px-3 py-1">
              <Wrench className="h-3.5 w-3.5 mr-1" /> {inProgressCount} In Progress
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="queue" className="space-y-4">
          <TabsList>
            <TabsTrigger value="queue" className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Queue
              {pendingCount > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{pendingCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Completed
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue">
            <RefurbishmentQueue
              devices={pendingDevices}
              isLoading={pendingLoading}
              onSelect={setSelectedDeviceId}
              canManage={canManage}
            />
          </TabsContent>

          <TabsContent value="completed">
            <RefurbishmentQueue
              devices={completedDevices}
              isLoading={completedLoading}
              onSelect={setSelectedDeviceId}
              canManage={canManage}
              isCompletedView
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
