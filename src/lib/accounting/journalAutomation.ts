// Automated Journal Entry Creation for Accrual-Basis Accounting
// Revenue recognized when earned (sale occurs), expenses when incurred (bill received)

import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface JournalEntryLine {
  accountCode: string;
  accountId: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
}

interface AutoJournalEntryParams {
  companyId: string;
  entryDate: string;
  description: string;
  referenceType: 'sale' | 'purchase' | 'expense' | 'return' | 'transfer' | 'tax_payment' | 'payment_received' | 'payment_made';
  referenceId: string;
  lines: JournalEntryLine[];
}

// Generate unique entry number — uses HHmmssSSS for sub-second precision + 5-digit random
// to make same-second collisions astronomically unlikely under concurrent bulk processing.
function generateEntryNumber(prefix: string = 'JE'): string {
  const ts = format(new Date(), 'yyyyMMddHHmmssSSS');
  const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `${prefix}-${ts}-${random}`;
}

// Create automated journal entry
export async function createAutoJournalEntry(params: AutoJournalEntryParams) {
  const { companyId, entryDate, description, referenceType, referenceId, lines } = params;

  // Validate debits equal credits
  const totalDebit = lines.reduce((sum, l) => sum + l.debitAmount, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.creditAmount, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Journal entry is not balanced. Debits: ${totalDebit}, Credits: ${totalCredit}`);
  }

  try {
    // Create journal entry header
    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .insert({
        company_id: companyId,
        entry_number: generateEntryNumber('AUTO'),
        entry_date: entryDate,
        description,
        reference_type: referenceType,
        reference_id: referenceId,
        total_debit: totalDebit,
        total_credit: totalCredit,
        is_auto_generated: true,
        status: 'posted',
        posted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (entryError) throw entryError;

    // Create journal entry lines
    const linesToInsert = lines.map(line => ({
      journal_entry_id: entry.id,
      account_id: line.accountId,
      description: line.description,
      debit_amount: line.debitAmount,
      credit_amount: line.creditAmount,
    }));

    const { error: linesError } = await supabase
      .from('journal_entry_lines')
      .insert(linesToInsert);

    if (linesError) throw linesError;

    // Update account balances
    for (const line of lines) {
      await updateAccountBalance(line.accountId, line.debitAmount, line.creditAmount);
    }

    return entry;
  } catch (error) {
    console.error('Error creating auto journal entry:', error);
    throw error;
  }
}

// Update account balance based on debit/credit and normal balance
async function updateAccountBalance(accountId: string, debitAmount: number, creditAmount: number) {
  try {
    const { data: account, error: fetchError } = await supabase
      .from('chart_of_accounts')
      .select('current_balance, normal_balance')
      .eq('id', accountId)
      .single();

    if (fetchError) throw fetchError;

    const currentBalance = Number(account.current_balance || 0);
    let newBalance: number;

    if (account.normal_balance === 'debit') {
      newBalance = currentBalance + debitAmount - creditAmount;
    } else {
      newBalance = currentBalance + creditAmount - debitAmount;
    }

    const { error: updateError } = await supabase
      .from('chart_of_accounts')
      .update({ current_balance: newBalance })
      .eq('id', accountId);

    if (updateError) throw updateError;
  } catch (error) {
    console.error('Error updating account balance:', error);
    throw error;
  }
}

// Get account ID by code for a company
export async function getAccountIdByCode(companyId: string, accountCode: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('account_code', accountCode)
    .single();

  if (error || !data) return null;
  return data.id;
}

// ============================================
// SALE AUTOMATION (Accrual) - Revenue recognized when sale occurs
// Dr. Accounts Receivable  (amount owed by marketplace)
// Dr. Marketplace Fees     (deducted from settlement)
// Cr. Sales Revenue        (sale price excl. tax)
// Cr. Tax Collected        (tax amount)
// ============================================
export interface SaleJournalParams {
  companyId: string;
  saleId: string;
  saleDate: string;
  marketplace: 'amazon' | 'bestbuy' | 'shopify';
  settlementAmount: number; // Net amount expected from marketplace
  salePrice: number; // Gross sale price before tax
  taxCollected: number;
  marketplaceFees: number;
  shippingCost: number;
  deviceCost: number; // FIFO cost of device
  deviceDescription: string;
  orderNumber: string;
}

export async function createSaleJournalEntries(params: SaleJournalParams) {
  const {
    companyId, saleId, saleDate, marketplace, settlementAmount,
    salePrice, taxCollected, marketplaceFees, shippingCost, deviceCost, deviceDescription, orderNumber
  } = params;

  const isVES = marketplace === 'amazon';
  const arAccount = isVES ? '1050' : '1051';
  const revenueAccount = marketplace === 'amazon' ? '4000' : (marketplace === 'bestbuy' ? '4100' : '4101');
  const taxCollectedAccount = isVES ? '4200' : '4201';
  const feesAccount = isVES ? '6000' : '6001';
  const shippingAccount = isVES ? '6100' : '6101';
  const cogsAccount = isVES ? '5000' : '5001';
  const inventoryAccount = isVES ? '1100' : '1101';

  const [arId, revenueId, taxId, feesId, shippingId, cogsId, inventoryId] = await Promise.all([
    getAccountIdByCode(companyId, arAccount),
    getAccountIdByCode(companyId, revenueAccount),
    getAccountIdByCode(companyId, taxCollectedAccount),
    getAccountIdByCode(companyId, feesAccount),
    getAccountIdByCode(companyId, shippingAccount),
    getAccountIdByCode(companyId, cogsAccount),
    getAccountIdByCode(companyId, inventoryAccount),
  ]);

  if (!arId || !revenueId || !cogsId || !inventoryId) {
    throw new Error('Required accounts not found. Please initialize Chart of Accounts first.');
  }

  const lines: JournalEntryLine[] = [];

  // Dr. Accounts Receivable (net settlement expected from marketplace)
  lines.push({
    accountCode: arAccount,
    accountId: arId,
    description: `Receivable from ${marketplace} - ${orderNumber}`,
    debitAmount: settlementAmount,
    creditAmount: 0,
  });

  // Dr. Marketplace Fees (deducted by marketplace)
  if (marketplaceFees > 0 && feesId) {
    lines.push({
      accountCode: feesAccount,
      accountId: feesId,
      description: `${marketplace} fees - ${orderNumber}`,
      debitAmount: marketplaceFees,
      creditAmount: 0,
    });
  }

  // Dr. Shipping Costs
  if (shippingCost > 0 && shippingId) {
    lines.push({
      accountCode: shippingAccount,
      accountId: shippingId,
      description: `Shipping cost - ${orderNumber}`,
      debitAmount: shippingCost,
      creditAmount: 0,
    });
  }

  // Cr. Sales Revenue
  lines.push({
    accountCode: revenueAccount,
    accountId: revenueId,
    description: `Sale - ${deviceDescription} - ${orderNumber}`,
    debitAmount: 0,
    creditAmount: salePrice,
  });

  // Cr. Tax Collected
  if (taxCollected > 0 && taxId) {
    lines.push({
      accountCode: taxCollectedAccount,
      accountId: taxId,
      description: `Tax collected - ${orderNumber}`,
      debitAmount: 0,
      creditAmount: taxCollected,
    });
  }

  // Create the revenue entry
  await createAutoJournalEntry({
    companyId,
    entryDate: saleDate,
    description: `Sale via ${marketplace} - Order#${orderNumber} - ${deviceDescription}`,
    referenceType: 'sale',
    referenceId: saleId,
    lines,
  });

  // Entry 2: COGS and Inventory reduction (recognized at time of sale)
  if (deviceCost > 0) {
    await createAutoJournalEntry({
      companyId,
      entryDate: saleDate,
      description: `COGS - ${deviceDescription} - Order#${orderNumber}`,
      referenceType: 'sale',
      referenceId: saleId,
      lines: [
        {
          accountCode: cogsAccount,
          accountId: cogsId,
          description: `Cost of goods sold - ${deviceDescription}`,
          debitAmount: deviceCost,
          creditAmount: 0,
        },
        {
          accountCode: inventoryAccount,
          accountId: inventoryId,
          description: `Inventory reduction - ${deviceDescription}`,
          debitAmount: 0,
          creditAmount: deviceCost,
        },
      ],
    });
  }
}

// ============================================
// PAYMENT RECEIVED - When marketplace settles / customer pays
// Dr. Cash
// Cr. Accounts Receivable
// ============================================
export interface PaymentReceivedParams {
  companyId: string;
  paymentDate: string;
  amount: number;
  referenceId: string;
  description: string;
  isVES: boolean;
}

export async function createPaymentReceivedJournalEntry(params: PaymentReceivedParams) {
  const { companyId, paymentDate, amount, referenceId, description, isVES } = params;

  const cashAccount = isVES ? '1000' : '1001';
  const arAccount = isVES ? '1050' : '1051';

  const [cashId, arId] = await Promise.all([
    getAccountIdByCode(companyId, cashAccount),
    getAccountIdByCode(companyId, arAccount),
  ]);

  if (!cashId || !arId) {
    throw new Error('Required accounts not found.');
  }

  await createAutoJournalEntry({
    companyId,
    entryDate: paymentDate,
    description,
    referenceType: 'payment_received',
    referenceId,
    lines: [
      {
        accountCode: cashAccount,
        accountId: cashId,
        description: `Cash received - ${description}`,
        debitAmount: amount,
        creditAmount: 0,
      },
      {
        accountCode: arAccount,
        accountId: arId,
        description: `AR cleared - ${description}`,
        debitAmount: 0,
        creditAmount: amount,
      },
    ],
  });
}

// ============================================
// PURCHASE AUTOMATION (Accrual) - Expense recognized when goods received
// Dr. Inventory
// Dr. GST/HST Paid (ITC)
// Cr. Accounts Payable
// ============================================
export interface PurchaseJournalParams {
  companyId: string;
  purchaseId: string;
  receiveDate: string;
  supplierName: string;
  poNumber: string;
  unitCost: number;
  gstHstAmount: number;
  qstAmount: number;
  totalAmount: number;
  deviceDescription: string;
  isVES: boolean;
}

export async function createPurchaseJournalEntry(params: PurchaseJournalParams) {
  const {
    companyId, purchaseId, receiveDate, supplierName, poNumber,
    unitCost, gstHstAmount, qstAmount, totalAmount, deviceDescription, isVES
  } = params;

  const inventoryAccount = isVES ? '1100' : '1101';
  const gstPaidAccount = isVES ? '8000' : '8001';
  const qstPaidAccount = isVES ? '8100' : '8101';
  const apAccount = isVES ? '2010' : '2011';

  const [inventoryId, gstId, qstId, apId] = await Promise.all([
    getAccountIdByCode(companyId, inventoryAccount),
    getAccountIdByCode(companyId, gstPaidAccount),
    getAccountIdByCode(companyId, qstPaidAccount),
    getAccountIdByCode(companyId, apAccount),
  ]);

  if (!inventoryId || !apId) {
    throw new Error('Required accounts not found. Please initialize Chart of Accounts first.');
  }

  const lines: JournalEntryLine[] = [];

  // Dr. Inventory
  lines.push({
    accountCode: inventoryAccount,
    accountId: inventoryId,
    description: `Inventory purchase - ${deviceDescription}`,
    debitAmount: unitCost,
    creditAmount: 0,
  });

  // Dr. GST/HST Paid (ITC)
  if (gstHstAmount > 0 && gstId) {
    lines.push({
      accountCode: gstPaidAccount,
      accountId: gstId,
      description: `GST/HST paid - ${poNumber}`,
      debitAmount: gstHstAmount,
      creditAmount: 0,
    });
  }

  // Dr. QST Paid (if applicable)
  if (qstAmount > 0 && qstId) {
    lines.push({
      accountCode: qstPaidAccount,
      accountId: qstId,
      description: `QST paid - ${poNumber}`,
      debitAmount: qstAmount,
      creditAmount: 0,
    });
  }

  // Cr. Accounts Payable
  lines.push({
    accountCode: apAccount,
    accountId: apId,
    description: `Payable to ${supplierName} - ${poNumber}`,
    debitAmount: 0,
    creditAmount: totalAmount,
  });

  await createAutoJournalEntry({
    companyId,
    entryDate: receiveDate,
    description: `Inventory purchase from ${supplierName} - PO#${poNumber}`,
    referenceType: 'purchase',
    referenceId: purchaseId,
    lines,
  });
}

// ============================================
// PAYMENT MADE - When supplier is paid (clears AP)
// Dr. Accounts Payable
// Cr. Cash
// ============================================
export interface PaymentMadeParams {
  companyId: string;
  paymentDate: string;
  amount: number;
  referenceId: string;
  supplierName: string;
  isVES: boolean;
}

export async function createPaymentMadeJournalEntry(params: PaymentMadeParams) {
  const { companyId, paymentDate, amount, referenceId, supplierName, isVES } = params;

  const apAccount = isVES ? '2010' : '2011';
  const cashAccount = isVES ? '1000' : '1001';

  const [apId, cashId] = await Promise.all([
    getAccountIdByCode(companyId, apAccount),
    getAccountIdByCode(companyId, cashAccount),
  ]);

  if (!apId || !cashId) {
    throw new Error('Required accounts not found.');
  }

  await createAutoJournalEntry({
    companyId,
    entryDate: paymentDate,
    description: `Payment to ${supplierName}`,
    referenceType: 'payment_made',
    referenceId,
    lines: [
      {
        accountCode: apAccount,
        accountId: apId,
        description: `AP cleared - ${supplierName}`,
        debitAmount: amount,
        creditAmount: 0,
      },
      {
        accountCode: cashAccount,
        accountId: cashId,
        description: `Cash payment to ${supplierName}`,
        debitAmount: 0,
        creditAmount: amount,
      },
    ],
  });
}

// ============================================
// EXPENSE AUTOMATION (Accrual) - Expense recognized when incurred
// Dr. Expense Account
// Dr. GST/HST Paid (ITC)
// Cr. Accounts Payable (or Cash if paid immediately)
// ============================================
export interface ExpenseJournalParams {
  companyId: string;
  expenseId: string;
  expenseDate: string;
  vendor: string;
  description: string;
  expenseAccountCode: string;
  amount: number;
  gstHstAmount: number;
  qstAmount: number;
  totalAmount: number;
  isVES: boolean;
  isPaidImmediately?: boolean;
  allocationVES?: number;
  allocationTGW?: number;
}

export async function createExpenseJournalEntry(params: ExpenseJournalParams) {
  const {
    companyId, expenseId, expenseDate, vendor, description,
    expenseAccountCode, amount, gstHstAmount, qstAmount, totalAmount,
    isVES, isPaidImmediately = true, allocationVES = 100, allocationTGW = 0
  } = params;

  const gstPaidAccount = isVES ? '8000' : '8001';
  const qstPaidAccount = isVES ? '8100' : '8101';
  const creditAccount = isPaidImmediately ? (isVES ? '1000' : '1001') : (isVES ? '2010' : '2011');

  const [expenseAccId, gstId, qstId, creditId] = await Promise.all([
    getAccountIdByCode(companyId, expenseAccountCode),
    getAccountIdByCode(companyId, gstPaidAccount),
    getAccountIdByCode(companyId, qstPaidAccount),
    getAccountIdByCode(companyId, creditAccount),
  ]);

  if (!expenseAccId || !creditId) {
    throw new Error('Required accounts not found. Please initialize Chart of Accounts first.');
  }

  const lines: JournalEntryLine[] = [];

  // Dr. Expense Account
  lines.push({
    accountCode: expenseAccountCode,
    accountId: expenseAccId,
    description: `${description} - ${vendor}`,
    debitAmount: amount,
    creditAmount: 0,
  });

  // Dr. GST/HST Paid (ITC)
  if (gstHstAmount > 0 && gstId) {
    lines.push({
      accountCode: gstPaidAccount,
      accountId: gstId,
      description: `GST/HST paid - ${vendor}`,
      debitAmount: gstHstAmount,
      creditAmount: 0,
    });
  }

  // Dr. QST Paid (if applicable)
  if (qstAmount > 0 && qstId) {
    lines.push({
      accountCode: qstPaidAccount,
      accountId: qstId,
      description: `QST paid - ${vendor}`,
      debitAmount: qstAmount,
      creditAmount: 0,
    });
  }

  // Cr. Cash or Accounts Payable
  lines.push({
    accountCode: creditAccount,
    accountId: creditId,
    description: isPaidImmediately ? `Payment to ${vendor}` : `Payable to ${vendor}`,
    debitAmount: 0,
    creditAmount: totalAmount,
  });

  await createAutoJournalEntry({
    companyId,
    entryDate: expenseDate,
    description: `Expense: ${description} - ${vendor}`,
    referenceType: 'expense',
    referenceId: expenseId,
    lines,
  });
}

// ============================================
// TAX PAYMENT - When GST/HST is remitted to CRA
// ============================================
export interface TaxPaymentParams {
  companyId: string;
  paymentDate: string;
  amount: number;
  referenceNumber: string;
  isVES: boolean;
}

export async function createTaxPaymentJournalEntry(params: TaxPaymentParams) {
  const { companyId, paymentDate, amount, referenceNumber, isVES } = params;

  const gstPayableAccount = isVES ? '2000' : '2001';
  const cashAccount = isVES ? '1000' : '1001';

  const [gstPayableId, cashId] = await Promise.all([
    getAccountIdByCode(companyId, gstPayableAccount),
    getAccountIdByCode(companyId, cashAccount),
  ]);

  if (!gstPayableId || !cashId) {
    throw new Error('Required accounts not found.');
  }

  await createAutoJournalEntry({
    companyId,
    entryDate: paymentDate,
    description: `GST/HST payment to CRA - Ref#${referenceNumber}`,
    referenceType: 'tax_payment',
    referenceId: referenceNumber,
    lines: [
      {
        accountCode: gstPayableAccount,
        accountId: gstPayableId,
        description: 'GST/HST remittance',
        debitAmount: amount,
        creditAmount: 0,
      },
      {
        accountCode: cashAccount,
        accountId: cashId,
        description: 'CRA payment',
        debitAmount: 0,
        creditAmount: amount,
      },
    ],
  });
}

// ============================================
// EXPENSE REFUND - Reversal when refund is received
// ============================================
export interface ExpenseRefundJournalParams {
  companyId: string;
  refundId: string;
  refundDate: string;
  expenseAccountCode: string;
  amount: number;
  gstHstAmount: number;
  qstAmount: number;
  totalAmount: number;
  description: string;
  vendor: string;
  isVES: boolean;
}

export async function createExpenseRefundJournalEntry(params: ExpenseRefundJournalParams) {
  const {
    companyId, refundId, refundDate, expenseAccountCode, amount,
    gstHstAmount, qstAmount, totalAmount, description, vendor, isVES
  } = params;

  const gstPaidAccount = isVES ? '8000' : '8001';
  const qstPaidAccount = isVES ? '8100' : '8101';
  const cashAccount = isVES ? '1000' : '1001';

  const [expenseAccId, gstId, qstId, cashId] = await Promise.all([
    getAccountIdByCode(companyId, expenseAccountCode),
    getAccountIdByCode(companyId, gstPaidAccount),
    getAccountIdByCode(companyId, qstPaidAccount),
    getAccountIdByCode(companyId, cashAccount),
  ]);

  if (!expenseAccId || !cashId) {
    throw new Error('Required accounts not found for refund reversal.');
  }

  const lines: JournalEntryLine[] = [];

  // Dr. Cash (money received back)
  lines.push({
    accountCode: cashAccount,
    accountId: cashId,
    description: `Refund received from ${vendor}`,
    debitAmount: totalAmount,
    creditAmount: 0,
  });

  // Cr. Expense Account (reverse the original expense)
  lines.push({
    accountCode: expenseAccountCode,
    accountId: expenseAccId,
    description: `Expense refund: ${description}`,
    debitAmount: 0,
    creditAmount: amount,
  });

  // Cr. GST/HST Paid (reverse ITC)
  if (gstHstAmount > 0 && gstId) {
    lines.push({
      accountCode: gstPaidAccount,
      accountId: gstId,
      description: `GST/HST refund reversal - ${vendor}`,
      debitAmount: 0,
      creditAmount: gstHstAmount,
    });
  }

  // Cr. QST Paid (if applicable)
  if (qstAmount > 0 && qstId) {
    lines.push({
      accountCode: qstPaidAccount,
      accountId: qstId,
      description: `QST refund reversal - ${vendor}`,
      debitAmount: 0,
      creditAmount: qstAmount,
    });
  }

  await createAutoJournalEntry({
    companyId,
    entryDate: refundDate,
    description: `Expense Refund: ${description} - ${vendor}`,
    referenceType: 'expense',
    referenceId: refundId,
    lines,
  });
}
