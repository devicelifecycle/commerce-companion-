
-- Delete orphaned AP payments first (FK constraint)
DELETE FROM public.ap_payments WHERE accounts_payable_id IN (
  'c4a3239b-5c1f-4249-9b9f-c10f8f1b6921',
  '1a877a0b-6996-40d8-aef8-996f20dd0f90',
  'cd27605b-413e-4005-be6a-9c0b4e897e11'
);

-- Delete the orphaned AP entries
DELETE FROM public.accounts_payable WHERE id IN (
  'c4a3239b-5c1f-4249-9b9f-c10f8f1b6921',
  '1a877a0b-6996-40d8-aef8-996f20dd0f90',
  'cd27605b-413e-4005-be6a-9c0b4e897e11'
);
