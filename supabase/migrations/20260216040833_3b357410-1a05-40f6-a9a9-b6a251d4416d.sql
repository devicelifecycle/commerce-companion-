
CREATE OR REPLACE FUNCTION public.generate_supplier_code()
RETURNS TRIGGER AS $$
DECLARE
  next_code INTEGER;
BEGIN
  IF NEW.supplier_code IS NULL OR NEW.supplier_code = '000' THEN
    SELECT COALESCE(MAX(supplier_code::integer), 100) + 1 INTO next_code
    FROM public.suppliers
    WHERE supplier_code ~ '^\d+$';
    
    NEW.supplier_code := LPAD(next_code::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
