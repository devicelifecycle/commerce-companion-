/**
 * Model name normalization to prevent duplicates like "S25+" vs "S25 Plus".
 * Standardizes abbreviations, symbols, and casing.
 */

const SYMBOL_REPLACEMENTS: [RegExp, string][] = [
  [/\+/g, ' Plus'],
  [/\bU\b/gi, 'Ultra'],
  [/\bFE\b/gi, 'Fan Edition'],
];

const BRAND_CASING: Record<string, string> = {
  apple: 'Apple',
  samsung: 'Samsung',
  google: 'Google',
  oneplus: 'OnePlus',
  xiaomi: 'Xiaomi',
  huawei: 'Huawei',
  sony: 'Sony',
  lg: 'LG',
  motorola: 'Motorola',
  nokia: 'Nokia',
  asus: 'Asus',
  lenovo: 'Lenovo',
  dell: 'Dell',
  hp: 'HP',
  microsoft: 'Microsoft',
  acer: 'Acer',
  razer: 'Razer',
  nothing: 'Nothing',
  oppo: 'Oppo',
  vivo: 'Vivo',
  realme: 'Realme',
  tcl: 'TCL',
  zte: 'ZTE',
  blackberry: 'BlackBerry',
};

/**
 * Normalize a brand name to proper casing.
 */
export function normalizeBrand(brand: string): string {
  const trimmed = brand.trim();
  return BRAND_CASING[trimmed.toLowerCase()] || trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Normalize a model name:
 * - Replace "+" with "Plus"
 * - Proper casing for each word
 * - Collapse whitespace
 */
export function normalizeModel(model: string): string {
  let normalized = model.trim();
  
  // Apply symbol replacements
  for (const [pattern, replacement] of SYMBOL_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Title-case each word, preserving numbers and known abbreviations
  normalized = normalized.split(' ').map(word => {
    // Keep all-caps abbreviations (e.g., "FE", "SE", "XS")
    if (word.length <= 3 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word;
    // Keep numbers as-is
    if (/^\d+$/.test(word)) return word;
    // Mixed alphanumeric (e.g., "5G", "A54") — keep as-is
    if (/\d/.test(word) && /[A-Za-z]/.test(word)) return word;
    // Capitalize first letter
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
  
  return normalized;
}

/**
 * Create a fuzzy key for matching similar model names.
 * Strips all non-alphanumeric chars and lowercases.
 */
export function modelFuzzyKey(brand: string, model: string): string {
  const combined = `${brand} ${model}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  return combined;
}

/**
 * Check if two devices are likely duplicates based on brand + model.
 */
export function areSimilarDevices(
  brand1: string, model1: string,
  brand2: string, model2: string
): boolean {
  const key1 = modelFuzzyKey(normalizeBrand(brand1), normalizeModel(model1));
  const key2 = modelFuzzyKey(normalizeBrand(brand2), normalizeModel(model2));
  return key1 === key2;
}
