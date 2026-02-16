import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCallback } from 'react';

/**
 * Hook to trigger COGS journal entry creation when a device is linked to a sale.
 * Calls the process-sale-accounting edge function for specific sale IDs.
 */
export function useSaleAccounting() {
  const { toast } = useToast();

  const processSaleAccounting = useCallback(async (saleIds: string[]) => {
    if (saleIds.length === 0) return;

    try {
      const { data, error } = await supabase.functions.invoke('process-sale-accounting', {
        body: { sale_ids: saleIds },
      });

      if (error) {
        console.error('Error processing sale accounting:', error);
        toast({
          title: 'Accounting Warning',
          description: 'Sale saved but journal entries could not be created automatically.',
          variant: 'destructive',
        });
        return;
      }

      if (data?.processed > 0) {
        toast({
          title: 'Accounting Updated',
          description: `Created journal entries for ${data.processed} sale(s) — revenue, COGS, and inventory updated.`,
        });
      }

      return data;
    } catch (err) {
      console.error('Sale accounting error:', err);
    }
  }, [toast]);

  const processAllUnaccounted = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('process-sale-accounting', {
        body: {},
      });

      if (error) {
        console.error('Error processing unaccounted sales:', error);
        return;
      }

      if (data?.processed > 0) {
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
