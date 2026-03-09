import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { toast } from 'sonner';
import { useCallback } from 'react';

type Marketplace = 'shopify' | 'amazon' | 'bestbuy' | 'other';

export interface SaleRecord {
  id: string;
  device_id: string | null;
  order_number: string;
  marketplace: Marketplace;
  sale_price: number;
  shipping_cost: number;
  marketplace_fees: number;
  tax_amount: number;
  profit: number | null;
  sale_date: string;
  customer_name: string | null;
  customer_email: string | null;
  shipping_address: string | null;
  notes: string | null;
  company_id: string | null;
  fulfillment_status: string | null;
  marketplace_status: string | null;
  is_marketplace_remitted?: boolean;
  accounting_status?: string | null;
  created_at: string;
  devices?: {
    brand: string;
    model: string;
    cost_price: number;
    imei: string | null;
    storage?: string | null;
    color?: string | null;
    condition?: string | null;
  } | null;
}

interface UseSalesQueryOptions {
  companyFilter: string;
  marketplaceFilter: string;
  statusFilter: string;
  searchTerm: string;
}

export function useSalesQuery({ companyFilter, marketplaceFilter, statusFilter, searchTerm }: UseSalesQueryOptions) {
  const { selectedCompany, isSuperAdmin } = useCompany();
  const queryClient = useQueryClient();
  const pq = usePaginatedQuery({ pageSize: 25, defaultSort: 'sale_date', defaultDirection: 'desc' });

  const queryKey = ['sales', companyFilter, marketplaceFilter, statusFilter, pq.pagination.page, pq.pagination.pageSize, pq.sort];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from('sales')
        .select(`*, devices (brand, model, cost_price, imei, storage, color, condition)`, { count: 'exact' })
        .order(pq.sort.column, { ascending: pq.sort.direction === 'asc' })
        .range(pq.range.from, pq.range.to);

      if (companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      } else if (selectedCompany && !isSuperAdmin) {
        query = query.eq('company_id', selectedCompany.id);
      }

      if (marketplaceFilter !== 'all') {
        query = query.eq('marketplace', marketplaceFilter as any);
      }

      if (statusFilter !== 'all') {
        query = query.eq('fulfillment_status', statusFilter);
      }

      const { data: salesData, error, count } = await query;
      if (error) throw error;

      // Fetch return IDs for this page
      const saleIds = (salesData || []).map((s: any) => s.id);
      let returnSaleIds = new Set<string>();
      if (saleIds.length > 0) {
        const { data: returnData } = await supabase
          .from('return_authorizations')
          .select('sale_id')
          .in('sale_id', saleIds)
          .not('sale_id', 'is', null);
        returnSaleIds = new Set((returnData || []).map((r: any) => r.sale_id));
      }

      return {
        sales: (salesData || []) as SaleRecord[],
        totalCount: count || 0,
        returnSaleIds,
      };
    },
    staleTime: 30_000, // 30s cache
  });

  // Update pagination total when data arrives
  if (data?.totalCount !== undefined && data.totalCount !== pq.pagination.totalCount) {
    pq.setTotalCount(data.totalCount);
  }

  // Realtime: invalidate query on any change
  const handleRealtimeChange = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['sales'] });
    toast.info('Orders updated', { duration: 2000, id: 'sales-realtime' });
  }, [queryClient]);

  useRealtimeSubscription({ table: 'sales', onChanged: handleRealtimeChange });

  // Client-side search within the current page
  const filteredSales = data?.sales.filter(s => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.order_number.toLowerCase().includes(term) ||
      s.customer_name?.toLowerCase().includes(term) ||
      s.devices?.brand.toLowerCase().includes(term) ||
      s.devices?.model.toLowerCase().includes(term) ||
      s.devices?.imei?.toLowerCase().includes(term)
    );
  }) || [];

  return {
    sales: filteredSales,
    allSales: data?.sales || [],
    returnSaleIds: data?.returnSaleIds || new Set<string>(),
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
