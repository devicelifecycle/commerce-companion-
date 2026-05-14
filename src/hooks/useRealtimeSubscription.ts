import { useEffect, useRef } from 'react';
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
 * Each call gets a unique channel name so multiple subscribers to the same table
 * don't share or stomp each other's Supabase channel lifecycle.
 * Automatically unsubscribes on unmount.
 */
export function useRealtimeSubscription({ table, schema = 'public', onChanged, enabled = true }: UseRealtimeOptions) {
  // Stable unique ID per hook instance — prevents channel name collisions
  const channelId = useRef(`realtime-${table}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel(channelId.current)
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
