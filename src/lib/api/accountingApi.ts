/**
 * Accounting domain API.
 * Single point of contact for all journal entry, account balance, and
 * sale-accounting operations. Components and hooks must call these
 * functions — never call supabase directly for accounting operations.
 */
import { supabase } from '@/integrations/supabase/client';
import { assertNoError } from './errors';

export interface AccountBalance {
  id: string;
  current_balance: number;
  normal_balance: 'debit' | 'credit';
}

export interface JournalEntryLine {
  account_id: string;
  debit_amount: number;
  credit_amount: number;
}

/**
 * Fetch the current balance and normal_balance for a single account.
 */
export async function getAccountBalance(accountId: string): Promise<AccountBalance> {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('id, current_balance, normal_balance')
    .eq('id', accountId)
    .single();
  assertNoError(error, `getAccountBalance(${accountId})`);
  return data as AccountBalance;
}

/**
 * Update the current_balance of an account.
 */
export async function setAccountBalance(accountId: string, newBalance: number): Promise<void> {
  const { error } = await supabase
    .from('chart_of_accounts')
    .update({ current_balance: newBalance })
    .eq('id', accountId);
  assertNoError(error, `setAccountBalance(${accountId})`);
}

/**
 * Compute and apply the reversal delta for a single JE line to its account.
 * Debit-normal accounts: new = current - debit + credit
 * Credit-normal accounts: new = current - credit + debit
 */
export async function reverseLineBalance(line: JournalEntryLine): Promise<void> {
  const account = await getAccountBalance(line.account_id);
  const debit = Number(line.debit_amount || 0);
  const credit = Number(line.credit_amount || 0);
  const current = Number(account.current_balance || 0);
  const newBal = account.normal_balance === 'debit'
    ? current - debit + credit
    : current - credit + debit;
  await setAccountBalance(line.account_id, newBal);
}

/**
 * Fetch all lines for a journal entry.
 */
export async function getJournalEntryLines(journalEntryId: string): Promise<JournalEntryLine[]> {
  const { data, error } = await supabase
    .from('journal_entry_lines')
    .select('account_id, debit_amount, credit_amount')
    .eq('journal_entry_id', journalEntryId);
  assertNoError(error, `getJournalEntryLines(${journalEntryId})`);
  return (data ?? []) as JournalEntryLine[];
}

/**
 * Trigger the process-sale-accounting edge function for one or more sales.
 */
export async function triggerSaleAccounting(saleIds: string[]): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const { error } = await supabase.functions.invoke('process-sale-accounting', {
    body: { sale_ids: saleIds },
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
  });
  assertNoError(error, 'triggerSaleAccounting');
}

/**
 * Mark a sale's accounting_status and optionally clear device link.
 */
export async function updateSaleAccountingStatus(
  saleId: string,
  status: 'unprocessed' | 'revenue_only' | 'fully_processed',
  extra?: { device_id?: null; manual_cost?: number | null; manual_cost_description?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('sales')
    .update({ accounting_status: status, ...extra })
    .eq('id', saleId);
  assertNoError(error, `updateSaleAccountingStatus(${saleId})`);
}
