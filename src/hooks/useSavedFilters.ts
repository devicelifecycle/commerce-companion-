import { useState, useEffect, useCallback } from 'react';

/**
 * Persist a filter/state object to localStorage, scoped per user (auth ID) and per key.
 *
 * Use case: keep Reports/Financials filter selections (date range, entity, view mode)
 * across navigation and reloads without round-tripping the DB.
 *
 * Returns [value, setValue, reset] like useState plus an explicit reset to defaults.
 *
 * Example:
 *   const [filters, setFilters, reset] = useSavedFilters('pl-statement', {
 *     range: 'mtd', view: 'accounting',
 *   });
 */
export function useSavedFilters<T extends Record<string, unknown>>(
  key: string,
  defaults: T,
): [T, (next: Partial<T> | ((prev: T) => T)) => void, () => void] {
  const storageKey = `lov:filters:${key}`;

  const [value, setValueState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      // Merge defaults so newly-added fields appear on next load
      return { ...defaults, ...parsed } as T;
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // localStorage may be unavailable (private mode); ignore
    }
  }, [storageKey, value]);

  const setValue = useCallback((next: Partial<T> | ((prev: T) => T)) => {
    setValueState(prev => {
      const updated = typeof next === 'function'
        ? (next as (p: T) => T)(prev)
        : { ...prev, ...next };
      return updated;
    });
  }, []);

  const reset = useCallback(() => {
    setValueState(defaults);
    try { localStorage.removeItem(storageKey); } catch { /* noop */ }
  }, [defaults, storageKey]);

  return [value, setValue, reset];
}
