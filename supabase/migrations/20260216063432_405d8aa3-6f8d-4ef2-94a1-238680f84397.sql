
CREATE OR REPLACE FUNCTION public.generate_supplier_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  next_code INTEGER;
BEGIN
  IF NEW.supplier_code IS NULL OR NEW.supplier_code = '000' THEN
    SELECT COALESCE(MAX(supplier_code::integer), 100) + 1 INTO next_code
    FROM public.suppliers
    WHERE supplier_code ~ '^\d+$';
    
    NEW.supplier_code := next_code::text;
  END IF;
  RETURN NEW;
END;
$function$;

-- Renumber existing suppliers starting from 101
WITH numbered AS (
  SELECT id, 100 + ROW_NUMBER() OVER (ORDER BY created_at) as new_code
  FROM public.suppliers
)
UPDATE public.suppliers s
SET supplier_code = n.new_code::text
FROM numbered n
WHERE s.id = n.id;
