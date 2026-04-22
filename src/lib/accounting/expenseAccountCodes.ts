const NORMALIZED_EXPENSE_PREFIXES = new Set([
  '600',
  '610',
  '620',
  '630',
  '640',
  '650',
  '660',
  '670',
  '680',
  '690',
  '700',
  '710',
]);

/**
 * Shared/allocated operating expenses can be posted to company-specific variants
 * such as 6602 for TGW while reports still bucket by the base account family.
 */
export function normalizeExpenseAccountCode(accountCode: string | null | undefined) {
  if (!accountCode) return '';

  const prefix3 = accountCode.substring(0, 3);
  if (!NORMALIZED_EXPENSE_PREFIXES.has(prefix3)) return accountCode;

  return `${prefix3}0`;
}