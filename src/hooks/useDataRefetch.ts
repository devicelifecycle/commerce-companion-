import { useEffect, useCallback, useRef } from 'react';

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
 *
 * Uses a string key derived from the channel list so callers can safely pass
 * inline array literals (e.g. ['financials', 'sales']) without causing
 * subscribe/unsubscribe on every render due to new array references.
 */
export function useDataRefetch(channels: string | string[], handler: RefetchHandler) {
  // Stable string key — array reference changes are ignored; only content changes matter.
  const channelsKey = Array.isArray(channels) ? channels.join(',') : channels;

  // Keep the latest handler in a ref so we never need to re-subscribe when it changes.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const stableHandler = useCallback(() => handlerRef.current(), []);

  useEffect(() => {
    const channelList = channelsKey.split(',');
    const unsubscribes = channelList.map(ch => subscribe(ch, stableHandler));
    return () => unsubscribes.forEach(unsub => unsub());
  }, [channelsKey, stableHandler]);
}
