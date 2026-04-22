import { useEffect, useCallback } from 'react';

/**
 * Lightweight event bus for sitewide data refetch.
 * 
 * Dialogs/components call `emitRefetch('sales')` after a mutation.
 * Pages call `useDataRefetch('sales', fetchSales)` to auto-refresh.
 * Use `emitRefetch('all')` to refresh everything.
 * 
 * CASCADING: Operational mutations automatically propagate to financial reports.
 * e.g. emitting 'sales' also fires 'financials' and 'dashboard' listeners.
 */

type RefetchHandler = () => void;
const listeners = new Map<string, Set<RefetchHandler>>();

/**
 * Dependency map: when a channel is emitted, these downstream channels also fire.
 * This ensures financial reports auto-update when operational data changes.
 */
const CASCADE_MAP: Record<string, string[]> = {
  sales: ['financials', 'dashboard'],
  expenses: ['financials', 'dashboard'],
  inventory: ['financials', 'dashboard'],
  invoices: ['financials', 'dashboard'],
  purchase_orders: ['financials', 'dashboard', 'inventory'],
  returns: ['financials', 'dashboard', 'sales', 'inventory'],
  vendors: ['expenses', 'purchase_orders'],
  products: ['inventory', 'financials'],
  repair_parts: ['inventory', 'financials'],
  refurbishment: ['inventory', 'financials'],
  customers: ['sales', 'invoices'],
  team: ['dashboard'],
  payouts: ['financials', 'dashboard', 'sales'],
};

function subscribe(channel: string, handler: RefetchHandler) {
  if (!listeners.has(channel)) listeners.set(channel, new Set());
  listeners.get(channel)!.add(handler);
  return () => {
    listeners.get(channel)?.delete(handler);
    if (listeners.get(channel)?.size === 0) listeners.delete(channel);
  };
}

export function emitRefetch(channel: string) {
  const fired = new Set<string>();

  function fireChannel(ch: string) {
    if (fired.has(ch)) return; // prevent infinite loops
    fired.add(ch);
    listeners.get(ch)?.forEach(fn => fn());
    // Cascade to downstream channels
    const downstream = CASCADE_MAP[ch];
    if (downstream) {
      downstream.forEach(d => fireChannel(d));
    }
  }

  fireChannel(channel);

  // Fire 'all' listeners if channel isn't already 'all'
  if (channel !== 'all') {
    listeners.get('all')?.forEach(fn => fn());
  }
}

/**
 * Subscribe a page/component to refetch events on one or more channels.
 */
export function useDataRefetch(channels: string | string[], handler: RefetchHandler) {
  const stableHandler = useCallback(handler, [handler]);

  useEffect(() => {
    const channelList = Array.isArray(channels) ? channels : [channels];
    const unsubscribes = channelList.map(ch => subscribe(ch, stableHandler));
    return () => unsubscribes.forEach(unsub => unsub());
  }, [channels, stableHandler]);
}
