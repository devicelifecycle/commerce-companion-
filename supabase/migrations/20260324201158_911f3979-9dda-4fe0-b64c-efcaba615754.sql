
-- Backfill AP records for purchase orders that have supporting data
-- Using data from purchase_orders table directly
INSERT INTO accounts_payable (vendor_name, bill_number, bill_date, due_date, original_amount, paid_amount, status, company_id, description, category)
SELECT 
  po.supplier_name,
  po.po_number,
  COALESCE(po.po_date, CURRENT_DATE),
  COALESCE(po.po_date, CURRENT_DATE) + interval '30 days',
  po.total_amount,
  0,
  'unpaid',
  po.company_id,
  'Inventory purchase - ' || po.po_number,
  'inventory'
FROM purchase_orders po
WHERE po.status IN ('received', 'partial', 'approved', 'sent')
AND NOT EXISTS (
  SELECT 1 FROM accounts_payable ap WHERE ap.bill_number = po.po_number AND ap.company_id = po.company_id
)
ON CONFLICT DO NOTHING;

-- Also backfill AP from finalized import batches that have supplier invoice numbers
INSERT INTO accounts_payable (vendor_name, bill_number, bill_date, due_date, original_amount, paid_amount, status, company_id, description, category)
SELECT 
  COALESCE(s.name, 'Unknown Supplier'),
  COALESCE(ib.supplier_invoice_number, ib.lot_number, ib.id::text),
  ib.created_at::date,
  ib.created_at::date + interval '30 days',
  COALESCE((SELECT SUM(d.cost_price) FROM devices d WHERE d.import_batch_id = ib.id), 0) + COALESCE(ib.shipping_cost, 0) + COALESCE(ib.other_charges, 0),
  0,
  'unpaid',
  ib.company_id,
  'Import batch - ' || ib.file_name,
  'inventory'
FROM import_batches ib
LEFT JOIN suppliers s ON s.id = ib.supplier_id
WHERE ib.is_finalized = true
AND NOT EXISTS (
  SELECT 1 FROM accounts_payable ap 
  WHERE ap.bill_number = COALESCE(ib.supplier_invoice_number, ib.lot_number, ib.id::text) 
  AND ap.company_id = ib.company_id
)
AND COALESCE((SELECT SUM(d.cost_price) FROM devices d WHERE d.import_batch_id = ib.id), 0) + COALESCE(ib.shipping_cost, 0) + COALESCE(ib.other_charges, 0) > 0
ON CONFLICT DO NOTHING;
