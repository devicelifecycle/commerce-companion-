// Bank Reconciliation Matching Engine
// Matches bank transactions against journal entries by amount and date proximity

import { supabase } from '@/integrations/supabase/client';

export interface MatchResult {
  bankTransactionId: string;
  journalEntryId: string;
  confidence: 'exact' | 'high' | 'low';
  amountDiff: number;
  dateDiff: number; // days
}

export interface UnmatchedTransaction {
  id: string;
  transaction_date: string;
  amount: number;
  description: string | null;
  type: 'bank' | 'journal';
}

export interface ReconciliationResult {
  matched: MatchResult[];
  unmatchedBank: UnmatchedTransaction[];
  unmatchedJournal: UnmatchedTransaction[];
  totalBankAmount: number;
  totalJournalAmount: number;
  variance: number;
}

/**
 * Run auto-matching for a bank account within a date range.
 * Matches bank transactions to unmatched journal entries using amount + date proximity.
 */
export async function runAutoMatching(
  bankAccountId: string,
  startDate: string,
  endDate: string
): Promise<ReconciliationResult> {
  // Fetch unreconciled bank transactions
  const { data: bankTxns } = await supabase
    .from('bank_transactions')
    .select('*')
    .eq('bank_account_id', bankAccountId)
    .eq('is_reconciled', false)
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate)
    .order('transaction_date');

  // Get the company_id from bank account
  const { data: bankAccount } = await supabase
    .from('bank_accounts')
    .select('company_id')
    .eq('id', bankAccountId)
    .single();

  if (!bankAccount?.company_id) {
    return { matched: [], unmatchedBank: [], unmatchedJournal: [], totalBankAmount: 0, totalJournalAmount: 0, variance: 0 };
  }

  // Fetch posted journal entries that haven't been matched to a bank transaction
  const { data: journalEntries } = await supabase
    .from('journal_entries')
    .select('id, entry_date, total_debit, total_credit, description')
    .eq('company_id', bankAccount.company_id)
    .eq('status', 'posted')
    .gte('entry_date', startDate)
    .lte('entry_date', endDate)
    .order('entry_date');

  // Get already-matched journal entry IDs
  const { data: matchedTxns } = await supabase
    .from('bank_transactions')
    .select('matched_journal_entry_id')
    .eq('bank_account_id', bankAccountId)
    .not('matched_journal_entry_id', 'is', null);

  const matchedJeIds = new Set((matchedTxns || []).map(t => t.matched_journal_entry_id));

  const transactions = bankTxns || [];
  const entries = (journalEntries || []).filter(je => !matchedJeIds.has(je.id));

  const matched: MatchResult[] = [];
  const usedBankIds = new Set<string>();
  const usedJournalIds = new Set<string>();

  // Pass 1: Exact matches (same amount, within 3 days)
  for (const txn of transactions) {
    if (usedBankIds.has(txn.id)) continue;
    const txnAmount = Math.abs(Number(txn.amount));
    const txnDate = new Date(txn.transaction_date).getTime();

    for (const je of entries) {
      if (usedJournalIds.has(je.id)) continue;
      const jeAmount = Number(je.total_debit || 0);
      const jeDate = new Date(je.entry_date).getTime();
      const dateDiff = Math.abs(txnDate - jeDate) / (1000 * 60 * 60 * 24);
      const amountDiff = Math.abs(txnAmount - jeAmount);

      if (amountDiff < 0.01 && dateDiff <= 3) {
        matched.push({
          bankTransactionId: txn.id,
          journalEntryId: je.id,
          confidence: 'exact',
          amountDiff,
          dateDiff,
        });
        usedBankIds.add(txn.id);
        usedJournalIds.add(je.id);
        break;
      }
    }
  }

  // Pass 2: Close matches (within $1, within 7 days)
  for (const txn of transactions) {
    if (usedBankIds.has(txn.id)) continue;
    const txnAmount = Math.abs(Number(txn.amount));
    const txnDate = new Date(txn.transaction_date).getTime();

    let bestMatch: { je: typeof entries[0]; amountDiff: number; dateDiff: number } | null = null;

    for (const je of entries) {
      if (usedJournalIds.has(je.id)) continue;
      const jeAmount = Number(je.total_debit || 0);
      const jeDate = new Date(je.entry_date).getTime();
      const dateDiff = Math.abs(txnDate - jeDate) / (1000 * 60 * 60 * 24);
      const amountDiff = Math.abs(txnAmount - jeAmount);

      if (amountDiff <= 1.00 && dateDiff <= 7) {
        if (!bestMatch || amountDiff < bestMatch.amountDiff) {
          bestMatch = { je, amountDiff, dateDiff };
        }
      }
    }

    if (bestMatch) {
      matched.push({
        bankTransactionId: txn.id,
        journalEntryId: bestMatch.je.id,
        confidence: bestMatch.amountDiff < 0.01 ? 'high' : 'low',
        amountDiff: bestMatch.amountDiff,
        dateDiff: bestMatch.dateDiff,
      });
      usedBankIds.add(txn.id);
      usedJournalIds.add(bestMatch.je.id);
    }
  }

  const unmatchedBank: UnmatchedTransaction[] = transactions
    .filter(t => !usedBankIds.has(t.id))
    .map(t => ({
      id: t.id,
      transaction_date: t.transaction_date,
      amount: Number(t.amount),
      description: t.description,
      type: 'bank' as const,
    }));

  const unmatchedJournal: UnmatchedTransaction[] = entries
    .filter(je => !usedJournalIds.has(je.id))
    .map(je => ({
      id: je.id,
      transaction_date: je.entry_date,
      amount: Number(je.total_debit || 0),
      description: je.description,
      type: 'journal' as const,
    }));

  const totalBankAmount = transactions.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const totalJournalAmount = entries.reduce((s, je) => s + Number(je.total_debit || 0), 0);

  return {
    matched,
    unmatchedBank,
    unmatchedJournal,
    totalBankAmount,
    totalJournalAmount,
    variance: totalBankAmount - totalJournalAmount,
  };
}

/**
 * Apply a match — mark the bank transaction as reconciled and link to the journal entry.
 */
export async function applyMatch(bankTransactionId: string, journalEntryId: string) {
  const { error } = await supabase
    .from('bank_transactions')
    .update({
      is_reconciled: true,
      reconciled_date: new Date().toISOString().split('T')[0],
      matched_journal_entry_id: journalEntryId,
    })
    .eq('id', bankTransactionId);

  if (error) throw error;
}

/**
 * Apply all exact/high-confidence matches in bulk.
 */
export async function applyAllMatches(matches: MatchResult[], minConfidence: 'exact' | 'high' | 'low' = 'high') {
  const confidenceOrder = { exact: 0, high: 1, low: 2 };
  const toApply = matches.filter(m => confidenceOrder[m.confidence] <= confidenceOrder[minConfidence]);

  for (const match of toApply) {
    await applyMatch(match.bankTransactionId, match.journalEntryId);
  }

  return toApply.length;
}
