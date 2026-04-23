/**
 * Unified rules for any UI that searches inventory (devices, products, repair
 * parts). Centralizing these constants prevents the recurring "no results"
 * problem caused by combobox call sites silently disagreeing about which
 * statuses count as "available" or how company scope is resolved.
 */

import type { Database } from '@/integrations/supabase/types';

type DeviceStatus = Database['public']['Enums']['device_status'];

/**
 * Canonical list of device statuses that represent a unit physically in
 * inventory and therefore eligible to appear in any lookup (sales linking,
 * returns, repairs, refurbishment, intercompany, supplier returns, etc).
 *
 * "sold", "written_off", "returned", and "shipped_to_fba" are intentionally
 * excluded — those units are not on the floor for normal selection. Callers
 * that genuinely need a tighter list (e.g. only `in_stock` for a brand-new
 * sale) can still pass an explicit `statusFilter` prop, but the default is
 * deliberately broad so users don't get confused by an empty dropdown when
 * the device is sitting in repair or refurbishment.
 *
 * Typed as `string[]` rather than the device_status enum because the enum in
 * generated types lags actual DB values (`in_repair`, `refurbished` exist in
 * the DB but aren't in the generated union); the Supabase client casts these
 * at the call site.
 */
export const INVENTORY_LOOKUP_STATUSES: string[] = [
  'in_stock',
  'reserved',
  'hold_for_refurbishment',
  'in_repair',
  'refurbished',
];

/**
 * Resolve which company to scope an inventory lookup to.
 *
 * Rule (must be identical across every combobox):
 *   1. If the caller explicitly passed a company id, use it.
 *   2. Else if a company is selected in context, use it.
 *   3. Else return null → search across all companies the user can see (RLS
 *      still filters). Falling back to "all" prevents super-admins viewing
 *      "Consolidated" from hitting an empty-state silently.
 */
export function resolveLookupCompanyId(
  propCompanyId: string | null | undefined,
  contextCompanyId: string | null | undefined,
): string | null {
  return propCompanyId || contextCompanyId || null;
}
