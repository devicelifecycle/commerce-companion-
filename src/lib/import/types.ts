// Shared types for the bulk Excel import flow.
// Pure type/constant module — no runtime side effects.

export interface ExcelRow {
  [key: string]: string | number | null;
}

export interface ColumnMapping {
  company: string;
  category: string;
  brand: string;
  model: string;
  imei: string;
  storage: string;
  color: string;
  cost_price: string;
  notes: string;
  supplier_id_code: string;
  supplier_invoice_number: string;
  purchase_date: string;
  tax_status: string;
}

export interface ValidationResult {
  row: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  data: ExcelRow;
}

export interface ImportResult {
  success: boolean;
  row: number;
  message: string;
  data?: ExcelRow;
}

export interface SupplierInfo {
  id: string;
  supplier_code: string;
  name: string;
}

export type DraftTaxStatus = 'zero_rated' | 'gst_paid' | 'hst_paid' | 'tax_included';

export interface PODraftItem {
  description: string;
  quantity: number;
  unitCost: number;
  taxStatus: DraftTaxStatus;
  pstQstAmount: number;
  imei: string;
}

export interface PODraft {
  supplierCode: string;
  supplierName: string;
  supplierId: string | null;
  invoiceNumber: string;
  shippingCost: string;
  shippingTaxStatus: DraftTaxStatus;
  otherCharges: string;
  otherChargesTaxStatus: DraftTaxStatus;
  paymentMethod: string;
  paymentDate: string;
  items: PODraftItem[];
}

export interface FinalizeResultItem {
  supplierName: string;
  poNumber: string;
  grnNumber: string;
  invoiceTotal: number;
}
