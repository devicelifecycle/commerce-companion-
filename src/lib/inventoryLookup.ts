/**
 * Unified rules for any UI that searches inventory (devices, products, repair
 * parts). Centralizing these constants prevents the recurring "no results"
 * problem caused by combobox call sites silently disagreeing about which
 * statuses count as "available" or how company scope is resolved.
 */





/**
 * Canonical list of device statuses that represent a unit physically in
 * inventory and therefore eligible to appear in any lookup (sales linking,
 * returns, repairs, refurbishment, intercompany, supplier returns, etc).
 *
 * IMPORTANT: These MUST match the actual `device_status` Postgres enum
 * values exactly. The current enum only contains:
 *   in_stock, reserved, sold, returned, hold_for_refurbishment
 *
 * Repair / refurbishment progress is tracked on separate columns
 * (`refurbishment_status`) and tables (`device_repairs`), NOT on the main
 * status enum. Adding values that don't exist in the enum (e.g. `in_repair`,
 * `refurbished`) causes Postgres to reject the entire `.in('status', […])`
 * query with `invalid input value for enum device_status`, breaking every
 * combobox at once.
 *
 * "sold" and "returned" are intentionally excluded — those units are not
 * on the floor for normal selection.
 */
export const INVENTORY_LOOKUP_STATUSES: string[] = [
  'in_stock',
  'reserved',
  'hold_for_refurbishment',
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
