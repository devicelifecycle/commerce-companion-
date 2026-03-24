
-- Clean up orphaned journal entry lines and entries for deleted expenses
-- First reverse the account balances, then delete the lines and entries

-- Reverse chart_of_accounts balances for orphaned expense JE lines
UPDATE chart_of_accounts SET current_balance = current_balance - sub.net_debit
FROM (
  SELECT jel.account_id, SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) AS net_debit
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE je.reference_type = 'expense'
    AND je.reference_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.id = je.reference_id)
  GROUP BY jel.account_id
) sub
WHERE chart_of_accounts.id = sub.account_id;

-- Delete orphaned journal entry lines
DELETE FROM journal_entry_lines
WHERE journal_entry_id IN (
  SELECT je.id FROM journal_entries je
  WHERE je.reference_type = 'expense'
    AND je.reference_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.id = je.reference_id)
);

-- Delete orphaned journal entries
DELETE FROM journal_entries
WHERE reference_type = 'expense'
  AND reference_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.id = reference_id);
