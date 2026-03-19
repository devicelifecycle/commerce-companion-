// Accrual-Basis Chart of Accounts for VES and TGW
// Following IFRS Accrual Accounting Principles

export interface AccountDefinition {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'tax_paid';
  subtype: string;
  normalBalance: 'debit' | 'credit';
  company?: 'VES' | 'TGW' | 'shared';
  description?: string;
}

// ASSETS (1xxx)
export const ASSET_ACCOUNTS: AccountDefinition[] = [
  // Cash Accounts
  { code: '1000', name: 'Cash - VES', type: 'asset', subtype: 'Current Assets', normalBalance: 'debit', company: 'VES', description: 'VES operating cash account' },
  { code: '1001', name: 'Cash - TGW', type: 'asset', subtype: 'Current Assets', normalBalance: 'debit', company: 'TGW', description: 'TGW operating cash account' },
  
  // Accounts Receivable
  { code: '1050', name: 'Accounts Receivable - VES', type: 'asset', subtype: 'Current Assets', normalBalance: 'debit', company: 'VES', description: 'VES amounts owed by customers/marketplaces' },
  { code: '1051', name: 'Accounts Receivable - TGW', type: 'asset', subtype: 'Current Assets', normalBalance: 'debit', company: 'TGW', description: 'TGW amounts owed by customers/marketplaces' },
  
  // Inventory Accounts (FIFO valuation)
  { code: '1100', name: 'Inventory - VES', type: 'asset', subtype: 'Current Assets', normalBalance: 'debit', company: 'VES', description: 'VES inventory at cost (FIFO)' },
  { code: '1101', name: 'Inventory - TGW', type: 'asset', subtype: 'Current Assets', normalBalance: 'debit', company: 'TGW', description: 'TGW inventory at cost (FIFO)' },
  
  // Prepaid Expenses
  { code: '1200', name: 'Prepaid Expenses - VES', type: 'asset', subtype: 'Current Assets', normalBalance: 'debit', company: 'VES', description: 'VES prepaid expenses' },
  { code: '1201', name: 'Prepaid Expenses - TGW', type: 'asset', subtype: 'Current Assets', normalBalance: 'debit', company: 'TGW', description: 'TGW prepaid expenses' },
];

// LIABILITIES (2xxx)
export const LIABILITY_ACCOUNTS: AccountDefinition[] = [
  // Accounts Payable
  { code: '2010', name: 'Accounts Payable - VES', type: 'liability', subtype: 'Current Liabilities', normalBalance: 'credit', company: 'VES', description: 'VES amounts owed to suppliers' },
  { code: '2011', name: 'Accounts Payable - TGW', type: 'liability', subtype: 'Current Liabilities', normalBalance: 'credit', company: 'TGW', description: 'TGW amounts owed to suppliers' },
  
  // GST/HST Payable
  { code: '2000', name: 'GST/HST Payable - VES', type: 'liability', subtype: 'Current Liabilities', normalBalance: 'credit', company: 'VES', description: 'VES GST/HST collected on sales' },
  { code: '2001', name: 'GST/HST Payable - TGW', type: 'liability', subtype: 'Current Liabilities', normalBalance: 'credit', company: 'TGW', description: 'TGW GST/HST collected on sales' },
  
  // QST Payable (Quebec)
  { code: '2100', name: 'QST Payable - VES', type: 'liability', subtype: 'Current Liabilities', normalBalance: 'credit', company: 'VES', description: 'VES QST if applicable' },
  { code: '2101', name: 'QST Payable - TGW', type: 'liability', subtype: 'Current Liabilities', normalBalance: 'credit', company: 'TGW', description: 'TGW QST if applicable' },
  
  // Inter-company accounts
  { code: '2200', name: 'Inter-company Payable - VES to TGW', type: 'liability', subtype: 'Current Liabilities', normalBalance: 'credit', company: 'VES', description: 'VES owes TGW' },
  { code: '2201', name: 'Inter-company Receivable - TGW from VES', type: 'asset', subtype: 'Current Assets', normalBalance: 'debit', company: 'TGW', description: 'TGW receivable from VES' },
];

// EQUITY (3xxx)
export const EQUITY_ACCOUNTS: AccountDefinition[] = [
  { code: '3000', name: "Owner's Equity - VES", type: 'equity', subtype: "Owner's Equity", normalBalance: 'credit', company: 'VES', description: 'VES owner capital' },
  { code: '3001', name: "Owner's Equity - TGW", type: 'equity', subtype: "Owner's Equity", normalBalance: 'credit', company: 'TGW', description: 'TGW owner capital' },
  { code: '3100', name: 'Retained Earnings - VES', type: 'equity', subtype: 'Retained Earnings', normalBalance: 'credit', company: 'VES', description: 'VES accumulated profits' },
  { code: '3101', name: 'Retained Earnings - TGW', type: 'equity', subtype: 'Retained Earnings', normalBalance: 'credit', company: 'TGW', description: 'TGW accumulated profits' },
  { code: '3200', name: 'Current Year Profit/Loss - VES', type: 'equity', subtype: 'Retained Earnings', normalBalance: 'credit', company: 'VES', description: 'VES current year P&L (auto-calculated)' },
  { code: '3201', name: 'Current Year Profit/Loss - TGW', type: 'equity', subtype: 'Retained Earnings', normalBalance: 'credit', company: 'TGW', description: 'TGW current year P&L (auto-calculated)' },
];

// REVENUE (4xxx)
export const REVENUE_ACCOUNTS: AccountDefinition[] = [
  // Sales Revenue by Marketplace
  { code: '4000', name: 'Sales Revenue - Amazon - VES', type: 'revenue', subtype: 'Sales Revenue', normalBalance: 'credit', company: 'VES', description: 'VES Amazon sales' },
  { code: '4100', name: 'Sales Revenue - BestBuy - TGW', type: 'revenue', subtype: 'Sales Revenue', normalBalance: 'credit', company: 'TGW', description: 'TGW BestBuy sales' },
  { code: '4101', name: 'Sales Revenue - Shopify - TGW', type: 'revenue', subtype: 'Sales Revenue', normalBalance: 'credit', company: 'TGW', description: 'TGW Shopify sales' },
  
  // Tax Collected (memo accounts - flow through)
  { code: '4200', name: 'Tax Collected on Sales - VES', type: 'revenue', subtype: 'Tax Revenue', normalBalance: 'credit', company: 'VES', description: 'VES tax collected (marketplace remits)' },
  { code: '4201', name: 'Tax Collected on Sales - TGW', type: 'revenue', subtype: 'Tax Revenue', normalBalance: 'credit', company: 'TGW', description: 'TGW tax collected (marketplace remits)' },
  
  // Inter-company Revenue
  { code: '4300', name: 'Inter-company Revenue', type: 'revenue', subtype: 'Other Income', normalBalance: 'credit', company: 'shared', description: 'Revenue from inter-company sales' },

  // Direct / Invoice Sales Revenue
  { code: '4400', name: 'Direct Sales Revenue - VES', type: 'revenue', subtype: 'Sales Revenue', normalBalance: 'credit', company: 'VES', description: 'VES direct / invoice sales' },
  { code: '4401', name: 'Direct Sales Revenue - TGW', type: 'revenue', subtype: 'Sales Revenue', normalBalance: 'credit', company: 'TGW', description: 'TGW direct / invoice sales' },
];

// COST OF GOODS SOLD (5xxx)
export const COGS_ACCOUNTS: AccountDefinition[] = [
  { code: '5000', name: 'COGS - VES', type: 'expense', subtype: 'COGS', normalBalance: 'debit', company: 'VES', description: 'VES cost of goods sold (FIFO)' },
  { code: '5001', name: 'COGS - TGW', type: 'expense', subtype: 'COGS', normalBalance: 'debit', company: 'TGW', description: 'TGW cost of goods sold (FIFO)' },
];

// EXPENSES (6xxx-7xxx)
export const EXPENSE_ACCOUNTS: AccountDefinition[] = [
  // Marketplace Fees
  { code: '6000', name: 'Marketplace Fees - VES', type: 'expense', subtype: 'Operating Expenses', normalBalance: 'debit', company: 'VES', description: 'VES marketplace commissions and fees' },
  { code: '6001', name: 'Marketplace Fees - TGW', type: 'expense', subtype: 'Operating Expenses', normalBalance: 'debit', company: 'TGW', description: 'TGW marketplace commissions and fees' },
  
  // Shipping Costs
  { code: '6100', name: 'Shipping Costs - VES', type: 'expense', subtype: 'Operating Expenses', normalBalance: 'debit', company: 'VES', description: 'VES shipping and delivery costs' },
  { code: '6101', name: 'Shipping Costs - TGW', type: 'expense', subtype: 'Operating Expenses', normalBalance: 'debit', company: 'TGW', description: 'TGW shipping and delivery costs' },
  
  // Shared/Allocated Expenses
  { code: '6200', name: 'Rent and Utilities', type: 'expense', subtype: 'Operating Expenses', normalBalance: 'debit', company: 'shared', description: 'Shared rent and utilities (allocate %)' },
  { code: '6300', name: 'Salaries and Wages', type: 'expense', subtype: 'Operating Expenses', normalBalance: 'debit', company: 'shared', description: 'Employee compensation' },
  { code: '6400', name: 'Marketing and Advertising', type: 'expense', subtype: 'Operating Expenses', normalBalance: 'debit', company: 'shared', description: 'Advertising and promotional costs' },
  { code: '6500', name: 'Office and Supplies', type: 'expense', subtype: 'Operating Expenses', normalBalance: 'debit', company: 'shared', description: 'Office supplies and materials' },
  { code: '6600', name: 'Professional Fees', type: 'expense', subtype: 'Operating Expenses', normalBalance: 'debit', company: 'shared', description: 'Accounting, legal, consulting fees' },
  { code: '6700', name: 'Insurance', type: 'expense', subtype: 'Operating Expenses', normalBalance: 'debit', company: 'shared', description: 'Business insurance premiums' },
  { code: '6800', name: 'Bank Fees', type: 'expense', subtype: 'Operating Expenses', normalBalance: 'debit', company: 'shared', description: 'Banking and transaction fees' },
  { code: '6900', name: 'Software and Subscriptions', type: 'expense', subtype: 'Operating Expenses', normalBalance: 'debit', company: 'shared', description: 'Software licenses and SaaS fees' },
  { code: '7000', name: 'Telecommunications', type: 'expense', subtype: 'Operating Expenses', normalBalance: 'debit', company: 'shared', description: 'Phone, internet, communication' },
  { code: '7100', name: 'Other Operating Expenses', type: 'expense', subtype: 'Operating Expenses', normalBalance: 'debit', company: 'shared', description: 'Miscellaneous operating costs' },
];

// TAX PAID / INPUT TAX CREDITS (8xxx)
export const TAX_PAID_ACCOUNTS: AccountDefinition[] = [
  // GST/HST Paid (ITC)
  { code: '8000', name: 'GST/HST Paid on Purchases - VES', type: 'tax_paid', subtype: 'Input Tax Credits', normalBalance: 'debit', company: 'VES', description: 'VES GST/HST paid (ITC recoverable)' },
  { code: '8001', name: 'GST/HST Paid on Purchases - TGW', type: 'tax_paid', subtype: 'Input Tax Credits', normalBalance: 'debit', company: 'TGW', description: 'TGW GST/HST paid (ITC recoverable)' },
  
  // QST Paid
  { code: '8100', name: 'QST Paid on Purchases - VES', type: 'tax_paid', subtype: 'Input Tax Credits', normalBalance: 'debit', company: 'VES', description: 'VES QST paid if applicable' },
  { code: '8101', name: 'QST Paid on Purchases - TGW', type: 'tax_paid', subtype: 'Input Tax Credits', normalBalance: 'debit', company: 'TGW', description: 'TGW QST paid if applicable' },
];

// Combined Chart of Accounts
export const ACCRUAL_CHART_OF_ACCOUNTS: AccountDefinition[] = [
  ...ASSET_ACCOUNTS,
  ...LIABILITY_ACCOUNTS,
  ...EQUITY_ACCOUNTS,
  ...REVENUE_ACCOUNTS,
  ...COGS_ACCOUNTS,
  ...EXPENSE_ACCOUNTS,
  ...TAX_PAID_ACCOUNTS,
];

// Alias for backward compatibility
export const CASH_BASIS_CHART_OF_ACCOUNTS = ACCRUAL_CHART_OF_ACCOUNTS;

// Helper to get account by code
export function getAccountByCode(code: string): AccountDefinition | undefined {
  return CASH_BASIS_CHART_OF_ACCOUNTS.find(acc => acc.code === code);
}

// Helper to get accounts by company
export function getAccountsByCompany(company: 'VES' | 'TGW' | 'shared'): AccountDefinition[] {
  return CASH_BASIS_CHART_OF_ACCOUNTS.filter(acc => acc.company === company || acc.company === 'shared');
}

// Helper to get accounts by type
export function getAccountsByType(type: AccountDefinition['type']): AccountDefinition[] {
  return CASH_BASIS_CHART_OF_ACCOUNTS.filter(acc => acc.type === type);
}
