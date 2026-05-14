import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { emitRefetch } from '@/hooks/useDataRefetch';
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
  shipping_province: string | null;
  notes: string | null;
  company_id: string | null;
  fulfillment_status: string | null;
  marketplace_status: string | null;
  marketplace_account?: string | null;
  is_marketplace_remitted?: boolean;
  accounting_status?: string | null;
  product_title?: string | null;
  marketplace_sku?: string | null;
  manual_cost?: number | null;
  manual_cost_description?: string | null;
  created_at: string;
  devices?: {
    brand: string;
    model: string;
    cost_price: number;
    imei: string | null;
    storage?: string | null;
    color?: string | null;
    condition?: string | null;
    original_cost_price?: number | null;
    management_labor_cost?: number | null;
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
        .select(`*, devices (brand, model, cost_price, imei, storage, color, condition, original_cost_price, management_labor_cost)`, { count: 'exact' })
        .order(pq.sort.column, { ascending: pq.sort.direction === 'asc' })
        .range(pq.range.from, pq.range.to);

      if (companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      } else if (selectedCompany && !isSuperAdmin) {
        query = query.eq('company_id', selectedCompany.id);
      }

      if (marketplaceFilter !== 'all') {
        // Supports composite values like 'bestbuy:tgw' (marketplace + account)
        if (marketplaceFilter.includes(':')) {
          const [mp, suffix] = marketplaceFilter.split(':');
          query = query.eq('marketplace', mp as any).eq('marketplace_account', `${mp}_${suffix}`);
        } else {
          query = query.eq('marketplace', marketplaceFilter as any);
        }
      }

      if (statusFilter !== 'all') {
        query = query.eq('fulfillment_status', statusFilter);
      }

      // Posted tab excludes the suspense pipeline (pending_review / ready_to_post / needs_review).
      // Those orders live in the Pending tab until a human clicks "Complete & Post".
      query = query.not(
        'accounting_status',
        'in',
        '(pending_review,ready_to_post,needs_review)'
      );

      const { data: salesData, error, count } = await query;
      if (error) throw error;

      // Fetch return status for this page (latest RMA per sale)
      const saleIds = (salesData || []).map((s: any) => s.id);
      const returnStatusMap = new Map<string, { status: string; resolution_type: string | null; rma_number: string }>();
      if (saleIds.length > 0) {
        const { data: returnData } = await supabase
          .from('return_authorizations')
          .select('sale_id, status, resolution_type, rma_number, created_at')
          .in('sale_id', saleIds)
          .not('sale_id', 'is', null)
          .order('created_at', { ascending: false });
        for (const r of (returnData || []) as any[]) {
          if (r.sale_id && !returnStatusMap.has(r.sale_id)) {
            returnStatusMap.set(r.sale_id, {
              status: r.status,
              resolution_type: r.resolution_type,
              rma_number: r.rma_number,
            });
          }
        }
      }
      const returnSaleIds = new Set(returnStatusMap.keys());

      return {
        sales: (salesData || []) as SaleRecord[],
        totalCount: count || 0,
        returnSaleIds,
        returnStatusMap,
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
    // Cascade: keep financial reports and dashboard fresh when orders change
    emitRefetch('financials');
    emitRefetch('dashboard');
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
      s.product_title?.toLowerCase().includes(term) ||
      s.marketplace_sku?.toLowerCase().includes(term) ||
      s.devices?.brand?.toLowerCase().includes(term) ||
      s.devices?.model?.toLowerCase().includes(term) ||
      s.devices?.imei?.toLowerCase().includes(term)
    );
  }) || [];

  return {
    sales: filteredSales,
    allSales: data?.sales || [],
    returnSaleIds: data?.returnSaleIds || new Set<string>(),
    returnStatusMap: data?.returnStatusMap || new Map<string, { status: string; resolution_type: string | null; rma_number: string }>(),
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
