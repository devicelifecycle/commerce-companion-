// Maps marketplace + marketplace_account to human-friendly labels and a
// canonical "channel key" used everywhere we need to differentiate multiple
// seller accounts on the same marketplace (e.g., Best Buy TGW vs VES).
//
// A "channel" is either a single marketplace (`shopify`, `amazon`, `other`)
// or a marketplace + account combo (`bestbuy_tgw`, `bestbuy_ves`). Use the
// channel key as the grouping/aggregation key in reports, charts, and tables.

export type MarketplaceAccount =
  | 'bestbuy_tgw'
  | 'bestbuy_ves'
  | null
  | undefined;

export type ChannelKey =
  | 'shopify'
  | 'amazon'
  | 'bestbuy'        // generic fallback (rows missing an account)
  | 'bestbuy_tgw'
  | 'bestbuy_ves'
  | 'temu'
  | 'manual'
  | 'other'
  | string;

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
  temu: 'Temu',
  manual: 'Manual',
  other: 'Other',
};

// Channel key → label (full + short) lookup. Falls back to title-casing.
const CHANNEL_LABELS: Record<string, { full: string; short: string }> = {
  shopify: { full: 'Shopify', short: 'Shopify' },
  amazon: { full: 'Amazon', short: 'Amazon' },
  bestbuy: { full: 'Best Buy', short: 'Best Buy' },
  bestbuy_tgw: { full: 'Best Buy — TGW', short: 'BBY · TGW' },
  bestbuy_ves: { full: 'Best Buy — VES', short: 'BBY · VES' },
  temu: { full: 'Temu', short: 'Temu' },
  manual: { full: 'Manual', short: 'Manual' },
  other: { full: 'Other', short: 'Other' },
};

// Visual color per channel (HSL design tokens). Reports use these for chart
// fills, badges, etc.
export const CHANNEL_COLORS: Record<string, string> = {
  shopify: 'hsl(var(--shopify))',
  amazon: 'hsl(var(--amazon))',
  bestbuy: 'hsl(var(--bestbuy))',
  bestbuy_tgw: 'hsl(var(--bestbuy))',
  bestbuy_ves: 'hsl(var(--info))',
  temu: 'hsl(var(--accent))',
  manual: 'hsl(var(--muted-foreground))',
  other: 'hsl(var(--muted-foreground))',
};

// Stable ordering used by tables and chart legends. Anything unknown is
// appended at the end alphabetically.
export const CHANNEL_DISPLAY_ORDER: string[] = [
  'shopify',
  'amazon',
  'bestbuy_tgw',
  'bestbuy_ves',
  'bestbuy',
  'temu',
  'manual',
  'other',
];

/**
 * Canonical channel key for a row. Best Buy rows split by `marketplace_account`,
 * everything else collapses to the marketplace value.
 *
 * Example:
 *   getChannelKey('bestbuy', 'bestbuy_tgw') === 'bestbuy_tgw'
 *   getChannelKey('bestbuy', null)          === 'bestbuy'   // unsplit fallback
 *   getChannelKey('shopify', null)          === 'shopify'
 *   getChannelKey(null, null)               === 'other'
 */
export function getChannelKey(
  marketplace: string | null | undefined,
  account?: MarketplaceAccount
): ChannelKey {
  if (!marketplace) return 'other';
  if (marketplace === 'bestbuy' && account) return account;
  return marketplace;
}

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

/** Full display label for a channel key. */
export function getChannelLabel(channel: string): string {
  if (CHANNEL_LABELS[channel]) return CHANNEL_LABELS[channel].full;
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

/** Short display label for a channel key (for badges and chart axes). */
export function getChannelShortLabel(channel: string): string {
  if (CHANNEL_LABELS[channel]) return CHANNEL_LABELS[channel].short;
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

/** Color for a channel key, with a sensible fallback. */
export function getChannelColor(channel: string): string {
  return CHANNEL_COLORS[channel] || CHANNEL_COLORS.other;
}

/** Sort comparator for channel keys following CHANNEL_DISPLAY_ORDER. */
export function compareChannels(a: string, b: string): number {
  const ai = CHANNEL_DISPLAY_ORDER.indexOf(a);
  const bi = CHANNEL_DISPLAY_ORDER.indexOf(b);
  if (ai === -1 && bi === -1) return a.localeCompare(b);
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
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

/** Standard filter options used by dropdowns site-wide. */
export const MARKETPLACE_FILTER_OPTIONS: MarketplaceFilterOption[] = [
  { value: 'shopify', label: 'Shopify', marketplace: 'shopify' },
  { value: 'amazon', label: 'Amazon', marketplace: 'amazon' },
  { value: 'bestbuy:tgw', label: 'Best Buy — TGW', marketplace: 'bestbuy', account: 'bestbuy_tgw' },
  { value: 'bestbuy:ves', label: 'Best Buy — VES', marketplace: 'bestbuy', account: 'bestbuy_ves' },
];
