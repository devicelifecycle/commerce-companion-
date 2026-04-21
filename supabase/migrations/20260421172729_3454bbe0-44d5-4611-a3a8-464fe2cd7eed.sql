-- =========================================================
-- 1. DEDUPE CUSTOMERS
-- Keep the oldest customer per (company_id, lower(trim(name)), coalesce(lower(email),''))
-- Repoint sales.customer_id and invoice references, then delete dupes.
-- =========================================================

WITH ranked AS (
  SELECT
    id,
    company_id,
    lower(trim(name)) AS name_key,
    coalesce(lower(trim(email)), '') AS email_key,
    ROW_NUMBER() OVER (
      PARTITION BY company_id, lower(trim(name)), coalesce(lower(trim(email)), '')
      ORDER BY created_at ASC, id ASC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY company_id, lower(trim(name)), coalesce(lower(trim(email)), '')
      ORDER BY created_at ASC, id ASC
    ) AS keeper_id
  FROM public.customers
),
mapping AS (
  SELECT id AS dupe_id, keeper_id
  FROM ranked
  WHERE rn > 1
)
-- Repoint sales.customer_id from dupes to keeper
UPDATE public.sales s
SET customer_id = m.keeper_id
FROM mapping m
WHERE s.customer_id = m.dupe_id;

-- Delete the duplicate customers
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY company_id, lower(trim(name)), coalesce(lower(trim(email)), '')
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.customers
)
DELETE FROM public.customers
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- =========================================================
-- 2. UNIQUE INDEX to prevent future duplicates
-- =========================================================
CREATE UNIQUE INDEX IF NOT EXISTS customers_company_name_email_key
  ON public.customers (company_id, lower(trim(name)), coalesce(lower(trim(email)), ''));
