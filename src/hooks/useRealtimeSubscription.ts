import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type TableName = 'sales' | 'devices' | 'expenses' | 'purchase_orders';

interface UseRealtimeOptions {
  table: TableName;
  schema?: string;
  /** Called on any change — typically used to refetch data */
  onChanged: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  enabled?: boolean;
}

/**
 * Subscribe to realtime changes on a Supabase table.
 * Automatically unsubscribes on unmount.
 */
export function useRealtimeSubscription({ table, schema = 'public', onChanged, enabled = true }: UseRealtimeOptions) {
  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel(`realtime-${table}`)
      .on(
        'postgres_changes',
        { event: '*', schema, table },
        (payload) => onChanged(payload)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, schema, enabled]); // intentionally exclude onChanged to avoid reconnections
}
