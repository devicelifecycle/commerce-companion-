import { useToast } from '@/hooks/use-toast';
import { useCallback } from 'react';
import { edgeFunctions } from '@/lib/api';

/**
 * Hook to trigger sale accounting via the process-sale-accounting edge function.
 */
export function useSaleAccounting() {
  const { toast } = useToast();

  const processSaleAccounting = useCallback(async (saleIds: string[]) => {
    if (saleIds.length === 0) return;
    try {
      const data = await edgeFunctions.processSaleAccounting(saleIds) as { processed?: number } | null;
      if (data?.processed && data.processed > 0) {
        toast({
          title: 'Accounting Updated',
          description: `Created journal entries for ${data.processed} sale(s) — revenue, COGS, and inventory updated.`,
        });
      }
      return data;
    } catch (err) {
      console.error('Sale accounting error:', err);
      toast({
        title: 'Accounting Warning',
        description: 'Sale saved but journal entries could not be created automatically.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const processAllUnaccounted = useCallback(async () => {
    try {
      const data = await edgeFunctions.processSaleAccounting([]) as { processed?: number } | null;
      if (data?.processed && data.processed > 0) {
        toast({
          title: 'Bulk Accounting Complete',
          description: `Created journal entries for ${data.processed} previously unaccounted sale(s).`,
        });
      }
      return data;
    } catch (err) {
      console.error('Bulk accounting error:', err);
    }
  }, [toast]);

  return { processSaleAccounting, processAllUnaccounted };
}
