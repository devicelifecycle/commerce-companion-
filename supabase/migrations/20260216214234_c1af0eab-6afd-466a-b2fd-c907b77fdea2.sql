-- Add module, notes, and status columns to audit_logs for richer activity tracking
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS module text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS status text DEFAULT 'success';