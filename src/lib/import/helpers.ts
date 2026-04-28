import { DRAFT_TAX_OPTIONS } from './constants';
import type { DraftTaxStatus } from './types';

/**
 * Calculate tax and pre-tax components for a single PO draft line item.
 * Mirrors the original behavior in Import.tsx (tax_included treated as zero added tax).
 */
export function calcTaxForItem(
  unitCost: number,
  quantity: number,
  taxStatus: DraftTaxStatus,
): { taxAmount: number; preTaxAmount: number } {
  const opt = DRAFT_TAX_OPTIONS.find(o => o.value === taxStatus);
  if (!opt || opt.rate === 0) {
    return { taxAmount: 0, preTaxAmount: unitCost * quantity };
  }
  const taxAmount = parseFloat((unitCost * quantity * opt.rate).toFixed(2));
  return { taxAmount, preTaxAmount: unitCost * quantity };
}

/**
 * Generate a deterministic SKU from brand/model/storage and a sequence number.
 * Format: {BRAND3}-{MODEL≤8}[-{STORAGE}]-{SEQ3}
 */
export function generateSKU(
  brand: string,
  model: string,
  storage: string | null,
  sequence: number,
): string {
  const brandAbbr = brand.substring(0, 3).toUpperCase();
  const modelWords = model.split(/\s+/);
  const modelAbbr = modelWords
    .map(w => (/^\d+$/.test(w) ? w : w.substring(0, 2).toUpperCase()))
    .join('')
    .substring(0, 8);
  const storagePart = storage ? `-${storage.replace(/\s/g, '')}` : '';
  return `${brandAbbr}-${modelAbbr}${storagePart}-${String(sequence).padStart(3, '0')}`;
}
