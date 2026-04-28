// Shared types for the Invoices page.

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_gst_hst_number: string | null;
  subtotal: number;
  tax_amount: number;
  total: number;
  status: string;
  issue_date: string;
  due_date: string;
  paid_date: string | null;
  notes: string | null;
  created_at: string;
  company_id: string | null;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  tax_treatment: string;
  device_id: string | null;
}

export interface ARRecord {
  id: string;
  invoice_id: string;
  original_amount: number;
  paid_amount: number | null;
  balance_due: number | null;
  status: string | null;
}

export interface ARPayment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  notes: string | null;
  created_at: string | null;
}

export type DisplayStatus = 'outstanding' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
