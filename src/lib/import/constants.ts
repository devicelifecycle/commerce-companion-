import type { DraftTaxStatus } from './types';

export const DRAFT_TAX_OPTIONS: { value: DraftTaxStatus; label: string; rate: number }[] = [
  { value: 'zero_rated', label: 'Zero-Rated', rate: 0 },
  { value: 'gst_paid', label: 'GST Paid (5%)', rate: 0.05 },
  { value: 'hst_paid', label: 'HST Paid (13%)', rate: 0.13 },
  { value: 'tax_included', label: 'Tax Inclusive', rate: 0 },
];

export const CATEGORIES = ['phone', 'tablet', 'laptop'];

export const VALID_TAX_STATUSES = ['Tax Included', 'Zero-Rated', 'GST Paid', 'HST Paid'];

export const TAX_STATUS_DB_MAP: Record<string, string> = {
  'Tax Included': 'tax_included',
  'Zero-Rated': 'zero_rated',
  'GST Paid': 'gst_paid',
  'HST Paid': 'hst_paid',
};

export const KNOWN_BRANDS = [
  'Apple', 'Samsung', 'Google', 'OnePlus', 'Xiaomi', 'Huawei', 'Sony', 'LG',
  'Motorola', 'Nokia', 'Asus', 'Lenovo', 'Dell', 'HP', 'Microsoft', 'Acer',
  'Razer', 'Nothing', 'Oppo', 'Vivo', 'Realme', 'TCL', 'ZTE', 'BlackBerry',
];
