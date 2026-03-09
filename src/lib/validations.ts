import { z } from 'zod';

// ============================================
// Shared primitives
// ============================================

const currency = z.coerce.number().min(0, 'Must be 0 or greater').max(999_999_999, 'Value too large');
const currencyOptional = currency.optional().or(z.literal('').transform(() => undefined));
const requiredString = (field: string) => z.string().trim().min(1, `${field} is required`).max(500);
const optionalString = z.string().trim().max(1000).optional().or(z.literal(''));
const uuid = z.string().uuid();
const uuidOptional = z.string().uuid().optional().or(z.literal('').transform(() => undefined));

// ============================================
// Device / Inventory
// ============================================

export const deviceSchema = z.object({
  brand: requiredString('Brand'),
  model: requiredString('Model'),
  imei: z.string().trim().max(20).optional().or(z.literal('')),
  sku: z.string().trim().max(50).optional().or(z.literal('')),
  cost_price: currency,
  sale_price: currencyOptional,
  condition: z.enum(['new', 'used', 'refurbished', 'damaged']).default('new'),
  storage: optionalString,
  color: optionalString,
  category: z.string().default('phone'),
  warehouse_location: optionalString,
  notes: optionalString,
  company_id: uuidOptional,
  supplier_id: uuidOptional,
});

export type DeviceFormData = z.infer<typeof deviceSchema>;

// ============================================
// Sale / Order
// ============================================

export const saleSchema = z.object({
  order_number: requiredString('Order number'),
  marketplace: z.enum(['amazon', 'bestbuy', 'shopify', 'manual']),
  sale_price: currency.min(0.01, 'Sale price must be greater than 0'),
  shipping_cost: currency.default(0),
  marketplace_fees: currency.default(0),
  tax_amount: currency.default(0),
  sale_date: z.string().min(1, 'Sale date is required'),
  customer_name: optionalString,
  device_id: uuidOptional,
  company_id: uuidOptional,
});

export type SaleFormData = z.infer<typeof saleSchema>;

// ============================================
// Expense
// ============================================

export const expenseSchema = z.object({
  description: requiredString('Description'),
  amount: currency.min(0.01, 'Amount must be greater than 0'),
  category: z.string().min(1, 'Category is required'),
  subcategory: optionalString,
  expense_date: z.string().min(1, 'Date is required'),
  vendor: optionalString,
  payment_method: z.string().default('credit_card'),
  gst_hst_amount: currency.default(0),
  pst_amount: currency.default(0),
  is_tax_deductible: z.boolean().default(true),
  is_shared: z.boolean().default(false),
  allocation_ves: z.coerce.number().min(0).max(100).default(100),
  allocation_tgw: z.coerce.number().min(0).max(100).default(0),
  notes: optionalString,
  company_id: uuidOptional,
});

export type ExpenseFormData = z.infer<typeof expenseSchema>;

// ============================================
// Invoice
// ============================================

export const invoiceSchema = z.object({
  customer_name: requiredString('Customer name'),
  customer_email: z.string().email('Invalid email').optional().or(z.literal('')),
  customer_phone: optionalString,
  customer_address: optionalString,
  due_date: z.string().min(1, 'Due date is required'),
  notes: optionalString,
});

export type InvoiceFormData = z.infer<typeof invoiceSchema>;

export const invoiceItemSchema = z.object({
  description: requiredString('Description'),
  quantity: z.coerce.number().int().min(1, 'Min 1'),
  unit_price: currency.min(0.01, 'Price must be greater than 0'),
  tax_treatment: z.enum(['hst', 'exempt', 'zero_rated']).default('hst'),
  device_id: uuidOptional,
});

export type InvoiceItemFormData = z.infer<typeof invoiceItemSchema>;

// ============================================
// Purchase Order
// ============================================

export const purchaseOrderSchema = z.object({
  supplier_name: requiredString('Supplier name'),
  supplier_id: uuidOptional,
  po_date: z.string().min(1, 'PO date is required'),
  expected_delivery_date: z.string().optional().or(z.literal('')),
  notes: optionalString,
  company_id: uuidOptional,
});

export type PurchaseOrderFormData = z.infer<typeof purchaseOrderSchema>;

// ============================================
// Supplier
// ============================================

export const supplierSchema = z.object({
  name: requiredString('Supplier name'),
  contact_name: optionalString,
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  address: optionalString,
  notes: optionalString,
  company_id: uuidOptional,
});

export type SupplierFormData = z.infer<typeof supplierSchema>;

// ============================================
// Customer
// ============================================

export const customerSchema = z.object({
  name: requiredString('Customer name'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  address: optionalString,
  notes: optionalString,
  company_id: uuidOptional,
});

export type CustomerFormData = z.infer<typeof customerSchema>;

// ============================================
// Return / RMA
// ============================================

export const returnSchema = z.object({
  rma_number: requiredString('RMA number'),
  return_type: z.enum(['customer_return', 'supplier_return']),
  reason: requiredString('Reason'),
  return_date: z.string().min(1, 'Return date is required'),
  customer_name: optionalString,
  refund_amount: currencyOptional,
  refund_method: optionalString,
  notes: optionalString,
  sale_id: uuidOptional,
  device_id: uuidOptional,
  supplier_id: uuidOptional,
  company_id: uuidOptional,
});

export type ReturnFormData = z.infer<typeof returnSchema>;
