
CREATE OR REPLACE FUNCTION public.normalize_customer_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.name := initcap(trim(regexp_replace(NEW.name, '\s+', ' ', 'g')));
  IF NEW.city IS NOT NULL AND NEW.city != '' THEN
    NEW.city := initcap(trim(NEW.city));
  END IF;
  RETURN NEW;
END;
$$;
