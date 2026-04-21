// Maps marketplace + marketplace_account to human-friendly labels.
// Used everywhere we need to differentiate multiple seller accounts on
// the same marketplace (e.g., two Best Buy Canada accounts).

export type MarketplaceAccount =
  | 'bestbuy_tgw'
  | 'bestbuy_ves'
  | null
  | undefined;

const ACCOUNT_LABELS: Record<string, string> = {
  bestbuy_tgw: 'Best Buy — TGW',
  bestbuy_ves: 'Best Buy — VES',
};

const ACCOUNT_SHORT_LABELS: Record<string, string> = {
  bestbuy_tgw: 'BBY · TGW',
  bestbuy_ves: 'BBY · VES',
};

const MARKETPLACE_LABELS: Record<string, string> = {
  shopify: 'Shopify',
  amazon: 'Amazon',
  bestbuy: 'Best Buy',
  other: 'Other',
};

/** Full label e.g. "Best Buy — TGW" or "Shopify" */
export function getMarketplaceAccountLabel(
  marketplace: string,
  account?: MarketplaceAccount
): string {
  if (account && ACCOUNT_LABELS[account]) return ACCOUNT_LABELS[account];
  return MARKETPLACE_LABELS[marketplace] || marketplace;
}

/** Compact label for tight badges */
export function getMarketplaceAccountShortLabel(
  marketplace: string,
  account?: MarketplaceAccount
): string {
  if (account && ACCOUNT_SHORT_LABELS[account]) return ACCOUNT_SHORT_LABELS[account];
  return MARKETPLACE_LABELS[marketplace] || marketplace;
}

/**
 * Filter options for marketplace dropdowns. Best Buy is split into two
 * entries (TGW and VES). Values use a colon convention: `bestbuy:tgw`,
 * `bestbuy:ves`. Plain values like `amazon` mean "match any account".
 */
export interface MarketplaceFilterOption {
  value: string; // e.g. 'amazon', 'bestbuy:tgw'
  label: string;
  marketplace: 'amazon' | 'shopify' | 'bestbuy' | 'other';
  account?: 'bestbuy_tgw' | 'bestbuy_ves';
}

export function parseMarketplaceFilter(value: string): {
  marketplace: string;
  account?: string;
} {
  if (value.includes(':')) {
    const [marketplace, suffix] = value.split(':');
    return { marketplace, account: `${marketplace}_${suffix}` };
  }
  return { marketplace: value };
}
