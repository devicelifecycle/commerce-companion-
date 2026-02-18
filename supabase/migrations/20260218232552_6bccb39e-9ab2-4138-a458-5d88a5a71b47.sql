
-- Add new expense categories to the enum
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'payroll';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'insurance';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'rent';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'bank_fees';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'marketplace_fees';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'telecommunications';
