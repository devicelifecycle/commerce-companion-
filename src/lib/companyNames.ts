// Maps company codes to their full display names.
// Use getCompanyDisplayName() everywhere in the UI.
// Internal code and DB queries should continue using the codes (VES, TGW).

const COMPANY_DISPLAY_NAMES: Record<string, string> = {
  VES: 'Virtual eShop',
  TGW: 'Tech Genius Warehouse',
};

export function getCompanyDisplayName(code: string): string {
  return COMPANY_DISPLAY_NAMES[code] || code;
}

export function formatCompanyLabel(code: string): string {
  return `${getCompanyDisplayName(code)} (${code})`;
}
