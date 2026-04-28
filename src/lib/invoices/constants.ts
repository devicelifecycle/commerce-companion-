// Constants for the Invoices page (icon-free so this stays pure data).

export const PAYMENT_METHODS = [
  'Cash', 'E-Transfer', 'Credit Card', 'Debit Card', 'Cheque', 'Wire Transfer', 'Other',
] as const;

export const TAX_LABELS: Record<string, string> = {
  hst: 'HST 13%',
  gst: 'GST 5%',
  zero_rated: 'Zero-Rated',
  tax_inclusive: 'Tax Incl.',
};

export const TAX_RATES: Record<string, number> = {
  hst: 0.13,
  gst: 0.05,
  zero_rated: 0,
  tax_inclusive: 0.13,
};
