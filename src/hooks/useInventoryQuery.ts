import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { toast } from 'sonner';
import { useCallback } from 'react';

interface UseInventoryQueryOptions {
  statusFilter: string;
  categoryFilter: string;
  channelFilter: string;
  searchTerm: string;
}

export function useInventoryQuery({ statusFilter, categoryFilter, channelFilter, searchTerm }: UseInventoryQueryOptions) {
  const { selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const pq = usePaginatedQuery({ pageSize: 25, defaultSort: 'created_at', defaultDirection: 'desc' });

  const queryKey = ['devices', statusFilter, categoryFilter, channelFilter, searchTerm, selectedCompany?.id, pq.pagination.page, pq.pagination.pageSize, pq.sort];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from('devices')
        .select(`*, suppliers (name)`, { count: 'exact' })
        .eq('is_partner_owned', false)
        .order(pq.sort.column, { ascending: pq.sort.direction === 'asc' })
        .range(pq.range.from, pq.range.to);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as any);
      }
      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }
      if (channelFilter !== 'all') {
        if (channelFilter === 'local') {
          query = query.or('fulfillment_channel.eq.local,fulfillment_channel.is.null');
        } else {
          query = query.eq('fulfillment_channel', channelFilter);
        }
      } else {
        // Default: exclude FBA devices from main inventory — they live in FBA Management
        query = query.or('fulfillment_channel.eq.local,fulfillment_channel.is.null');
      }
      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

      // Server-side search
      if (searchTerm) {
        const term = `%${searchTerm}%`;
        query = query.or(`brand.ilike.${term},model.ilike.${term},imei.ilike.${term},sku.ilike.${term}`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return { devices: data || [], totalCount: count || 0 };
    },
    staleTime: 30_000,
  });

  if (data?.totalCount !== undefined && data.totalCount !== pq.pagination.totalCount) {
    pq.setTotalCount(data.totalCount);
  }

  const handleRealtimeChange = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['devices'] });
    toast.info('Inventory updated', { duration: 2000, id: 'devices-realtime' });
  }, [queryClient]);

  useRealtimeSubscription({ table: 'devices', onChanged: handleRealtimeChange });

  return {
    devices: data?.devices || [],
    totalCount: data?.totalCount || 0,
    isLoading,
    error,
    refetch,
    pagination: pq.pagination,
    sort: pq.sort,
    setPage: pq.setPage,
    setPageSize: pq.setPageSize,
    toggleSort: pq.toggleSort,
  };
}
