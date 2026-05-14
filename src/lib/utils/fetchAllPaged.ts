/**
 * Fetch all rows from a Supabase query by paginating through .range().
 * Replaces silent .limit(5000) caps in reports.
 *
 * Usage:
 *   const rows = await fetchAllPaged((from, to) =>
 *     supabase.from('sales').select('*').gte('sale_date', start).range(from, to)
 *   );
 *
 * The builder MUST be re-created on each call (Supabase query builders are
 * single-use), so pass a function that returns a fresh builder.
 */
export async function fetchAllPaged<T = any>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  options: { pageSize?: number; hardCap?: number } = {}
): Promise<T[]> {
  const pageSize = options.pageSize ?? 1000;
  const hardCap = options.hardCap ?? 50_000;

  const all: T[] = [];
  let from = 0;

  while (all.length < hardCap) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  if (all.length >= hardCap) {
    console.warn(`[fetchAllPaged] hard cap of ${hardCap} rows reached — result may be truncated`);
  }

  return all;
}
