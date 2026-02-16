
-- Add supplier_code to suppliers table
ALTER TABLE public.suppliers ADD COLUMN supplier_code text;

-- Create function to generate next supplier code
CREATE OR REPLACE FUNCTION public.generate_supplier_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  next_code integer;
BEGIN
  IF NEW.supplier_code IS NULL OR NEW.supplier_code = '' THEN
    SELECT COALESCE(MAX(supplier_code::integer), 0) + 1 INTO next_code
    FROM public.suppliers
    WHERE supplier_code ~ '^\d+$';
    
    NEW.supplier_code := LPAD(next_code::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for auto-generating supplier code
CREATE TRIGGER trigger_generate_supplier_code
BEFORE INSERT ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.generate_supplier_code();

-- Backfill existing suppliers with codes
DO $$
DECLARE
  r RECORD;
  counter integer := 1;
BEGIN
  FOR r IN SELECT id FROM public.suppliers ORDER BY created_at LOOP
    UPDATE public.suppliers SET supplier_code = LPAD(counter::text, 3, '0') WHERE id = r.id;
    counter := counter + 1;
  END LOOP;
END;
$$;

-- Now add unique and not null constraints
ALTER TABLE public.suppliers ALTER COLUMN supplier_code SET NOT NULL;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_supplier_code_unique UNIQUE (supplier_code);

-- Add new columns to devices table
ALTER TABLE public.devices ADD COLUMN supplier_invoice_number text;
ALTER TABLE public.devices ADD COLUMN tax_status text;
ALTER TABLE public.devices ADD COLUMN import_batch_id uuid REFERENCES public.import_batches(id);

-- Add new columns to import_batches table
ALTER TABLE public.import_batches ADD COLUMN shipping_cost numeric DEFAULT 0;
ALTER TABLE public.import_batches ADD COLUMN other_charges numeric DEFAULT 0;
ALTER TABLE public.import_batches ADD COLUMN supplier_invoice_number text;
ALTER TABLE public.import_batches ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id);
ALTER TABLE public.import_batches ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.import_batches ADD COLUMN is_finalized boolean DEFAULT false;

-- Add UPDATE policy for import_batches (needed for review screen)
CREATE POLICY "Admins and managers can update import batches"
ON public.import_batches
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
