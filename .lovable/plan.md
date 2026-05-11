# Partner / Investor Consignment Module — Implementation Plan

## Goal
Onboard an inventory **partner (investor)** who supplies devices we test, refurbish, and sell across our marketplaces. Their inventory stays **off our balance sheet** (consignment). 

**Revenue model — clarified:**
- The partner OWNS the devices and KEEPS the proceeds of each sale.
- WE earn:
  1. **Refurbishment / testing fees** (manual entry per device) — billed to partner
  2. **Commission** = configurable % (default **15%**) of **net profit** on each sale, retained by us out of partner proceeds
- So on every sale: we collect cash, deduct our refurb fee + our 15% commission, and the **remainder is owed back to the partner** (Partner Payable).

Every partner device must be traceable end-to-end with full history.

---

## 1. Data model (new tables)

```text
partners                              ← investor master record
  id, name, contact info, commission_pct (default 15, editable per partner),
  is_active, agreement_start_date

partner_devices                       ← separate from `devices`, never on our books
  id, partner_id, intake_date, intake_batch_id
  category (phone/laptop/camera/other), brand, model, identifier (IMEI/SN), color, storage
  partner_cost (informational — supplied by partner, used in net-profit calc, NOT in GL)
  status: received → testing → tested → refurbishing → refurbished
          → listed → sold → returned_to_partner → written_off
  disposition: null | list_for_sale | return_to_partner   (decided AFTER testing)
  refurb_fee (manual, set per device by operator)
  refurb_fee_status: pending | accrued | netted | invoiced | settled
  device_id (nullable — synthesized device row used by sales/marketplace flows)
  notes

partner_intake_batches
  id, partner_id, received_date, manifest_url, total_units, notes

partner_device_events                 ← timeline / audit
  id, partner_device_id, event_type, payload jsonb, user_id, created_at
  event_types: received, tested, parts_added, labor_logged, refurb_completed,
               disposition_set, listed_<channel>, sale_recorded,
               refund_recorded, returned_to_partner, fee_billed,
               commission_earned, payable_accrued, settled

partner_device_parts                  ← parts pulled from our repair_parts inventory
  id, partner_device_id, repair_part_id, qty, unit_cost, total_cost, used_at
  (Parts ARE on our books → Dr. Refurb-Cost-Recoverable / Cr. Parts Inventory.
   Cost is then included in the refurb_fee billed to partner.)

partner_device_labor
  id, partner_device_id, hours, rate, total_cost, logged_at

partner_sales                         ← per-sale breakdown (the heart of traceability)
  id, partner_id, partner_device_id, sale_id
  sale_amount, partner_cost, marketplace_fees, shipping, tax, refurb_fee
  net_profit             ← sale − partner_cost − fees − shipping − tax − refurb_fee
  commission_pct, commission_amount   ← OUR revenue (net_profit × pct)
  partner_proceeds       ← sale − fees − shipping − tax − refurb_fee − commission
                           = what we owe the partner for this sale
  status: accrued | settled, settled_at, settlement_id

partner_payables                      ← rolled up by sale (what WE owe partner)
  id, partner_id, partner_sale_id, amount, status, settlement_id

partner_receivables                   ← refurb fees on returned/unsold devices
  id, partner_id, partner_device_id, fee_amount, billed_date, status

partner_settlements                   ← periodic netting / payouts
  id, partner_id, period_start, period_end
  total_payable, total_receivable, net_amount, direction (pay|collect),
  paid_date, payment_method, reference, statement_pdf_url
```

Schema additions to existing tables:
- `devices`: `is_partner_owned boolean default false`, `partner_device_id uuid`
- `sales`: `is_partner_sale boolean`, `partner_id uuid`, `partner_device_id uuid`

---

## 2. Sale-level money flow (single sale example)

```text
Sale price                              $500.00
  − Marketplace fees                    − $50.00
  − Shipping                            − $15.00
  − Tax (collected & remitted)          − $65.00
  − Refurb fee (our income)             − $40.00
  ─────────────────────────────────────
  = Net profit                          $330.00
  − Partner cost (informational)        − $200.00
  ─────────────────────────────────────
  = Net profit for commission base      $130.00
  × Commission %                        × 15%
  = OUR commission (income)             $19.50
  
Partner proceeds owed = $330.00 − $19.50 = $310.50  →  Partner Payable
```

**Accounting (our books):**
```text
Dr. Cash / AR                          500.00
    Cr. Marketplace Fees Clearing        50.00
    Cr. Shipping Clearing                15.00
    Cr. HST Payable                      65.00
    Cr. Refurb Service Revenue (4500)    40.00
    Cr. Consignment Commission (4510)    19.50
    Cr. Partner Payable (liability)     310.50
```
No COGS — we never owned the device.

---

## 3. Workflow

```text
INTAKE → TESTING → REFURB (optional) → DISPOSITION (list | return)
       → LIST → SALE → COMMISSION + PAYABLE → SETTLEMENT
```

- **Intake**: bulk Excel import or manual; creates partner_devices + intake batch.
- **Testing/refurb**: parts pulled from our inventory, labor logged, manual refurb fee entered.
- **Disposition (after testing)**: operator picks `list_for_sale` or `return_to_partner`.
  - List → synth `devices` row (`is_partner_owned=true`, `cost_price=0`) → flows through existing marketplaces unchanged.
  - Return → status `returned_to_partner`; refurb fee → `partner_receivables`.
- **Sale ingestion** (Amazon/Best Buy/Shopify/Temu/manual): existing pipelines run; post-insert hook detects `is_partner_owned` and calls `process-partner-sale` edge function which writes `partner_sales`, journal entries, and accrues payable.
- **Refunds**: reverse via existing `reversalUtils.ts`, plus reverse the matching partner_sale + payable.
- **Settlement**: monthly job nets payables − receivables → settlement → payment + statement PDF.

---

## 4. Partner Investor Dashboard (NEW)

Top-level nav item **"Partners"** (admin-gated). Selecting a partner opens their dashboard:

### Dashboard tabs
1. **Overview** — KPI tiles (tabular-nums, dark theme):
   - Total devices received / in-stock / listed / sold / returned
   - Lifetime gross sales, our commission earned, our refurb-fee revenue
   - Current Partner Payable balance, Receivable balance, Net owing
   - MTD / YTD toggle
2. **Inventory** — full partner_devices table with status filters; **clicking a device opens Device Detail** (timeline, parts, labor, fee, listings, sale).
3. **Sales & Profit Breakdown** — order-by-order table:
   - Date • Channel • Device • Sale $ • Fees • Shipping • Tax • Refurb Fee • Partner Cost • **Net Profit** • Commission % • **Our Commission $** • **Partner Proceeds $** • Status
   - Row click → drill into the full computation + linked sale + linked device timeline.
   - Export CSV / PDF.
4. **Refurb Fees** — every fee charged: device, fee, status (netted vs invoiced), date.
5. **Settlements** — period statements, payment history, generate next statement PDF.
6. **Documents** — uploaded agreements, intake manifests.

Sidebar deep-links: "View this partner's inventory", "View this partner's sales", "View open payables".

### Partner Device Detail page
- Header: identifiers, status, disposition, partner cost, current location
- **Timeline** (every `partner_device_events` row, with user + timestamp)
- Parts used (with cost), Labor log
- Refurb fee + status
- Listings per channel (active + historical)
- If sold: linked `partner_sales` row with full profit-share math
- Refunds/returns history

---

## 5. Reporting impact

- **Balance Sheet**: partner inventory excluded. New lines: Partner Payables (liability), Partner Receivables (asset).
- **P&L**: two new revenue accounts:
  - `4500 Refurbishment Service Revenue`
  - `4510 Consignment Commission Revenue`
- **FIFO valuation reports**: filter `is_partner_owned = false` everywhere.
- **Marketplace fee analytics**: unchanged.

---

## 6. UI integration with existing app

- Existing **Inventory** pages: hide `is_partner_owned = true` by default; add a "Partner inventory" toggle.
- Existing **Sales/Orders** pages: badge partner sales; Profit column shows our commission (not gross profit) for partner rows.
- Existing **Reports** (P&L, Balance Sheet, dashboards): partner activity excluded from VES/TGW totals; surfaced under "Partners" instead.

---

## 7. Marketplace integration touchpoints

All five sale ingestion paths (Amazon, Best Buy, Shopify, Temu, manual) get one additive post-insert hook → `process-partner-sale` edge function. Gated by `is_partner_owned`. No changes to fetching logic.

---

## 8. Implementation phases

1. **Schema** — new tables, columns, RLS (admin + new `partners_manage` permission).
2. **Partners CRUD + Intake** — partners page, intake batch + Excel importer.
3. **Partner Device detail + Timeline** (read-only shell).
4. **Testing/Refurb workflow** — parts, labor, manual fee entry, disposition decision.
5. **List-for-sale bridge** — synth `devices` row; verify existing marketplace flows ingest correctly.
6. **Partner profit/commission engine** — `process-partner-sale` edge function + hooks.
7. **Refurb-fee receivables + monthly billing job**.
8. **Investor Dashboard** (Overview, Sales Breakdown, Inventory, Fees, Settlements).
9. **Settlement UI + statement PDF**.
10. **Filter existing reports** to exclude partner inventory; permissions + audit logging.

---

## Risk / safety assessment

- ✅ Existing books untouched: only additive accounts + tables.
- ✅ Marketplace webhooks: additive hook gated by flag — zero risk to current sales flow.
- ✅ FIFO valuation: filtered by `is_partner_owned` — partner units never enter cost layers.
- ✅ Refunds: `reversalUtils.ts` extended to also reverse `partner_sales` + payable.
- ⚠️ Repair parts used on partner devices: posted to a recoverable account (not COGS); recovered via the refurb fee billed to partner.
- ⚠️ Multi-channel listings of the same partner device: enforce single active listing per `partner_device_id` to prevent overselling.

Yes — this is fully buildable without breaking the existing app. Approve and I'll start with Phase 1 (schema + RLS).
