// Automated Journal Entry Creation for Cash-Basis Accounting
// All entries are created AUTOMATICALLY from business transactions

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
  referenceType: 'sale' | 'purchase' | 'expense' | 'return' | 'transfer' | 'tax_payment';
  referenceId: string;
  lines: JournalEntryLine[];
}

// Generate unique entry number
function generateEntryNumber(prefix: string = 'JE'): string {
  const date = format(new Date(), 'yyyyMMdd');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${date}-${random}`;
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
        status: 'posted', // Auto-entries are immediately posted
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
    // Get account details
    const { data: account, error: fetchError } = await supabase
      .from('chart_of_accounts')
      .select('current_balance, normal_balance')
      .eq('id', accountId)
      .single();

    if (fetchError) throw fetchError;

    const currentBalance = Number(account.current_balance || 0);
    let newBalance: number;

    // Calculate new balance based on normal balance type
    if (account.normal_balance === 'debit') {
      // Debit increases, credit decreases
      newBalance = currentBalance + debitAmount - creditAmount;
    } else {
      // Credit increases, debit decreases
      newBalance = currentBalance + creditAmount - debitAmount;
    }

    // Update the balance
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
// SALE AUTOMATION - When cash is received from marketplace
// ============================================
export interface SaleJournalParams {
  companyId: string;
  saleId: string;
  saleDate: string;
  marketplace: 'amazon' | 'bestbuy' | 'shopify';
  settlementAmount: number; // Net cash received
  salePrice: number; // Gross sale price before tax
  taxCollected: number; // Tax collected by marketplace
  marketplaceFees: number;
  deviceCost: number; // FIFO cost of device
  deviceDescription: string;
  orderNumber: string;
}

export async function createSaleJournalEntries(params: SaleJournalParams) {
  const {
    companyId, saleId, saleDate, marketplace, settlementAmount,
    salePrice, taxCollected, marketplaceFees, deviceCost, deviceDescription, orderNumber
  } = params;

  // Determine accounts based on marketplace (VES = Amazon, TGW = BestBuy/Shopify)
  const isVES = marketplace === 'amazon';
  const cashAccount = isVES ? '1000' : '1001';
  const revenueAccount = marketplace === 'amazon' ? '4000' : (marketplace === 'bestbuy' ? '4100' : '4101');
  const taxCollectedAccount = isVES ? '4200' : '4201';
  const feesAccount = isVES ? '6000' : '6001';
  const cogsAccount = isVES ? '5000' : '5001';
  const inventoryAccount = isVES ? '1100' : '1101';

  // Get account IDs
  const [cashId, revenueId, taxId, feesId, cogsId, inventoryId] = await Promise.all([
    getAccountIdByCode(companyId, cashAccount),
    getAccountIdByCode(companyId, revenueAccount),
    getAccountIdByCode(companyId, taxCollectedAccount),
    getAccountIdByCode(companyId, feesAccount),
    getAccountIdByCode(companyId, cogsAccount),
    getAccountIdByCode(companyId, inventoryAccount),
  ]);

  if (!cashId || !revenueId || !cogsId || !inventoryId) {
    throw new Error('Required accounts not found. Please initialize Chart of Accounts first.');
  }

  const lines: JournalEntryLine[] = [];

  // Entry 1: Cash received from sale
  // Dr. Cash (settlement amount)
  // Dr. Marketplace Fees
  // Cr. Sales Revenue (sale price - tax)
  // Cr. Tax Collected (tax amount)
  
  lines.push({
    accountCode: cashAccount,
    accountId: cashId,
    description: `Cash received - ${orderNumber}`,
    debitAmount: settlementAmount,
    creditAmount: 0,
  });

  if (marketplaceFees > 0 && feesId) {
    lines.push({
      accountCode: feesAccount,
      accountId: feesId,
      description: `${marketplace} fees - ${orderNumber}`,
      debitAmount: marketplaceFees,
      creditAmount: 0,
    });
  }

  lines.push({
    accountCode: revenueAccount,
    accountId: revenueId,
    description: `Sale - ${deviceDescription} - ${orderNumber}`,
    debitAmount: 0,
    creditAmount: salePrice,
  });

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

  // Entry 2: COGS and Inventory reduction
  // Dr. COGS (device cost)
  // Cr. Inventory (device cost)
  
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
// PURCHASE AUTOMATION - When cash is paid to supplier
// ============================================
export interface PurchaseJournalParams {
  companyId: string;
  purchaseId: string;
  paymentDate: string;
  supplierName: string;
  poNumber: string;
  unitCost: number;
  gstHstAmount: number;
  qstAmount: number;
  totalPaid: number;
  deviceDescription: string;
  isVES: boolean;
}

export async function createPurchaseJournalEntry(params: PurchaseJournalParams) {
  const {
    companyId, purchaseId, paymentDate, supplierName, poNumber,
    unitCost, gstHstAmount, qstAmount, totalPaid, deviceDescription, isVES
  } = params;

  const inventoryAccount = isVES ? '1100' : '1101';
  const gstPaidAccount = isVES ? '8000' : '8001';
  const qstPaidAccount = isVES ? '8100' : '8101';
  const cashAccount = isVES ? '1000' : '1001';

  const [inventoryId, gstId, qstId, cashId] = await Promise.all([
    getAccountIdByCode(companyId, inventoryAccount),
    getAccountIdByCode(companyId, gstPaidAccount),
    getAccountIdByCode(companyId, qstPaidAccount),
    getAccountIdByCode(companyId, cashAccount),
  ]);

  if (!inventoryId || !cashId) {
    throw new Error('Required accounts not found. Please initialize Chart of Accounts first.');
  }

  const lines: JournalEntryLine[] = [];

  // Dr. Inventory (unit cost)
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

  // Cr. Cash (total paid)
  lines.push({
    accountCode: cashAccount,
    accountId: cashId,
    description: `Payment to ${supplierName} - ${poNumber}`,
    debitAmount: 0,
    creditAmount: totalPaid,
  });

  await createAutoJournalEntry({
    companyId,
    entryDate: paymentDate,
    description: `Inventory purchase from ${supplierName} - PO#${poNumber}`,
    referenceType: 'purchase',
    referenceId: purchaseId,
    lines,
  });
}

// ============================================
// EXPENSE AUTOMATION - When cash is paid for expenses
// ============================================
export interface ExpenseJournalParams {
  companyId: string;
  expenseId: string;
  paymentDate: string;
  vendor: string;
  description: string;
  expenseAccountCode: string;
  amount: number;
  gstHstAmount: number;
  qstAmount: number;
  totalPaid: number;
  isVES: boolean;
  allocationVES?: number; // Percentage for VES if shared
  allocationTGW?: number; // Percentage for TGW if shared
}

export async function createExpenseJournalEntry(params: ExpenseJournalParams) {
  const {
    companyId, expenseId, paymentDate, vendor, description,
    expenseAccountCode, amount, gstHstAmount, qstAmount, totalPaid,
    isVES, allocationVES = 100, allocationTGW = 0
  } = params;

  const gstPaidAccount = isVES ? '8000' : '8001';
  const qstPaidAccount = isVES ? '8100' : '8101';
  const cashAccount = isVES ? '1000' : '1001';

  const [expenseId_, gstId, qstId, cashId] = await Promise.all([
    getAccountIdByCode(companyId, expenseAccountCode),
    getAccountIdByCode(companyId, gstPaidAccount),
    getAccountIdByCode(companyId, qstPaidAccount),
    getAccountIdByCode(companyId, cashAccount),
  ]);

  if (!expenseId_ || !cashId) {
    throw new Error('Required accounts not found. Please initialize Chart of Accounts first.');
  }

  const lines: JournalEntryLine[] = [];

  // Dr. Expense Account
  lines.push({
    accountCode: expenseAccountCode,
    accountId: expenseId_,
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

  // Cr. Cash
  lines.push({
    accountCode: cashAccount,
    accountId: cashId,
    description: `Payment to ${vendor}`,
    debitAmount: 0,
    creditAmount: totalPaid,
  });

  await createAutoJournalEntry({
    companyId,
    entryDate: paymentDate,
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
