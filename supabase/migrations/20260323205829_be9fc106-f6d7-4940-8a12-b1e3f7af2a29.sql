
UPDATE public.customers
SET name = initcap(trim(regexp_replace(name, '\s+', ' ', 'g'))),
    city = CASE WHEN city IS NOT NULL AND city != '' THEN initcap(trim(city)) ELSE city END
WHERE name IS DISTINCT FROM initcap(trim(regexp_replace(name, '\s+', ' ', 'g')))
   OR (city IS NOT NULL AND city != '' AND city IS DISTINCT FROM initcap(trim(city)));
