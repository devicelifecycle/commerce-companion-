-- Block direct DELETE on journal_entries at the DB level.
-- The only safe way to remove a JE is to void it (status = 'voided') via reverseJournalEntries().
-- This trigger fires BEFORE DELETE so it prevents the operation entirely.
-- Service-role bypass: if the session variable app.allow_je_delete = 'true', the guard is skipped
-- (used by migration scripts / admin tooling only).

CREATE OR REPLACE FUNCTION public.prevent_journal_entry_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_setting('app.allow_je_delete', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    'Direct DELETE on journal_entries is not allowed. '
    'Void the entry via reverseJournalEntries() instead. '
    '(entry id: %)', OLD.id
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_block_journal_entry_delete
BEFORE DELETE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.prevent_journal_entry_delete();
