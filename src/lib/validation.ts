/**
 * Shared Zod validation schemas for form inputs and API payloads.
 * Import from here — never duplicate schemas across components.
 */
import { z } from 'zod';

// ── Auth ────────────────────────────────────────────────────────────────────

export const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  role: z.enum(['admin', 'associate']),
  company_ids: z.array(z.string().uuid()).min(1, 'Assign at least one company'),
});

// ── Sales ────────────────────────────────────────────────────────────────────

export const manualCostSchema = z.object({
  amount: z
    .string()
    .optional()
    .transform(v => (v ? parseFloat(v) : null))
    .refine(v => v === null || (v >= 0 && v < 1_000_000), 'Cost must be between $0 and $999,999'),
  description: z.string().max(255).optional().nullable(),
});

export const saleItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(9999),
  unit_price: z.number().min(0).max(1_000_000),
  cost_price: z.number().min(0).max(1_000_000),
});

// ── Expenses ─────────────────────────────────────────────────────────────────

export const expenseSchema = z.object({
  description: z.string().min(1).max(500),
  amount: z.number().min(0.01).max(10_000_000),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  category: z.string().min(1),
  vendor_name: z.string().max(200).optional().nullable(),
  tax_amount: z.number().min(0).optional().default(0),
  is_tax_inclusive: z.boolean().optional().default(false),
});

// ── Purchase Orders ───────────────────────────────────────────────────────────

export const purchaseOrderItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1),
  unit_cost: z.number().min(0).max(1_000_000),
  sku: z.string().max(100).optional().nullable(),
});

export const purchaseOrderSchema = z.object({
  vendor_id: z.string().uuid(),
  expected_delivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(purchaseOrderItemSchema).min(1, 'Add at least one item'),
});

// ── Invoices ──────────────────────────────────────────────────────────────────

export const invoiceItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1),
  unit_price: z.number().min(0),
  tax_rate: z.number().min(0).max(1).optional().default(0),
});

// ── Type exports ──────────────────────────────────────────────────────────────

export type SignInInput = z.infer<typeof signInSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ManualCostInput = z.infer<typeof manualCostSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
