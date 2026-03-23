import { useEffect, useCallback } from 'react';

/**
 * Lightweight event bus for sitewide data refetch.
 * 
 * Dialogs/components call `emitRefetch('sales')` after a mutation.
 * Pages call `useDataRefetch('sales', fetchSales)` to auto-refresh.
 * Use `emitRefetch('all')` to refresh everything.
 */

type RefetchHandler = () => void;
const listeners = new Map<string, Set<RefetchHandler>>();

function subscribe(channel: string, handler: RefetchHandler) {
  if (!listeners.has(channel)) listeners.set(channel, new Set());
  listeners.get(channel)!.add(handler);
  return () => {
    listeners.get(channel)?.delete(handler);
    if (listeners.get(channel)?.size === 0) listeners.delete(channel);
  };
}

export function emitRefetch(channel: string) {
  // Fire specific channel listeners
  listeners.get(channel)?.forEach(fn => fn());
  // Fire 'all' listeners if channel isn't already 'all'
  if (channel !== 'all') {
    listeners.get('all')?.forEach(fn => fn());
  }
}

/**
 * Subscribe a page/component to refetch events on one or more channels.
 * @param channels - single channel name or array of channel names
 * @param handler - refetch callback (e.g. your fetchData function)
 */
export function useDataRefetch(channels: string | string[], handler: RefetchHandler) {
  const stableHandler = useCallback(handler, [handler]);

  useEffect(() => {
    const channelList = Array.isArray(channels) ? channels : [channels];
    const unsubscribes = channelList.map(ch => subscribe(ch, stableHandler));
    return () => unsubscribes.forEach(unsub => unsub());
  }, [channels, stableHandler]);
}
