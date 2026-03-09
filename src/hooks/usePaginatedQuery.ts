import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PaginationState {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

export interface UsePaginatedQueryOptions {
  /** Default page size */
  pageSize?: number;
  /** Default sort column */
  defaultSort?: string;
  /** Default sort direction */
  defaultDirection?: 'asc' | 'desc';
}

export function usePaginatedQuery(options: UsePaginatedQueryOptions = {}) {
  const { pageSize = 25, defaultSort = 'created_at', defaultDirection = 'desc' } = options;

  const [pagination, setPagination] = useState<PaginationState>({
    page: 0,
    pageSize,
    totalCount: 0,
    totalPages: 0,
  });

  const [sort, setSort] = useState<SortState>({
    column: defaultSort,
    direction: defaultDirection,
  });

  const [search, setSearch] = useState('');

  const range = useMemo(() => {
    const from = pagination.page * pagination.pageSize;
    const to = from + pagination.pageSize - 1;
    return { from, to };
  }, [pagination.page, pagination.pageSize]);

  const setPage = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPagination(prev => ({ ...prev, pageSize: size, page: 0 }));
  }, []);

  const setTotalCount = useCallback((count: number) => {
    setPagination(prev => ({
      ...prev,
      totalCount: count,
      totalPages: Math.ceil(count / prev.pageSize),
    }));
  }, []);

  const toggleSort = useCallback((column: string) => {
    setSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
    setPagination(prev => ({ ...prev, page: 0 }));
  }, []);

  const nextPage = useCallback(() => {
    setPagination(prev => ({
      ...prev,
      page: Math.min(prev.page + 1, prev.totalPages - 1),
    }));
  }, []);

  const prevPage = useCallback(() => {
    setPagination(prev => ({
      ...prev,
      page: Math.max(prev.page - 1, 0),
    }));
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPagination(prev => ({ ...prev, page: 0 }));
  }, []);

  return {
    pagination,
    sort,
    search,
    range,
    setPage,
    setPageSize,
    setTotalCount,
    toggleSort,
    nextPage,
    prevPage,
    setSearch: handleSearch,
  };
}
