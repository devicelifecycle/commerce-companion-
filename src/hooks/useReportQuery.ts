/**
 * useReportQuery — Wraps report data fetching with React Query
 * for caching, deduplication, and stale-while-revalidate.
 */
import { useQuery } from '@tanstack/react-query';

interface UseReportQueryOptions<T> {
  queryKey: (string | number | undefined | null)[];
  queryFn: () => Promise<T>;
  staleTime?: number;
  enabled?: boolean;
}

export function useReportQuery<T>({
  queryKey,
  queryFn,
  staleTime = 60_000, // 1 minute cache for reports
  enabled = true,
}: UseReportQueryOptions<T>) {
  const query = useQuery({
    queryKey: ['report', ...queryKey],
    queryFn,
    staleTime,
    enabled,
    refetchOnWindowFocus: false,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
