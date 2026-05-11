import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface JournalLine {
  account_id: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
}

function generateEntryNumber(): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `AUTO-${date}-${rand}`;
}

// Account code map: marketplace → account codes
// Marketplace sales settle directly to the operating bank account (no AR — payouts
// from Amazon/Shopify/Best Buy don't expose per-order breakdowns we can reconcile).
// `ar` here is used as the debit/settlement account (Cash for marketplace, true AR for other).
const ACCOUNT_MAP: Record<string, Record<string, string>> = {
  amazon: {
    ar: "1000", // Cash - VES (operating bank)
    revenue: "4000",
    shippingRevenue: "4002",
    taxCollected: "4200",
    fees: "6000",
    shipping: "6100",
    cogs: "5000",
    inventory: "1100",
  },
  bestbuy: {
    ar: "1001", // Cash - TGW (operating bank)
    revenue: "4100",
    shippingRevenue: "4103",
    taxCollected: "4201",
    fees: "6001",
    shipping: "6101",
    cogs: "5001",
    inventory: "1101",
  },
  shopify: {
    ar: "1001", // Cash - TGW (operating bank)
    revenue: "4101",
    shippingRevenue: "4102",
    taxCollected: "4201",
    fees: "6001",
    shipping: "6101",
    cogs: "5001",
    inventory: "1101",
  },
  temu: {
    ar: "1001", // Cash - TGW (operating bank)
    revenue: "4101",
    shippingRevenue: "4102",
    taxCollected: "4201",
    fees: "6001",
    shipping: "6101",
    cogs: "5001",
    inventory: "1101",
  },
  // Private/storefront/other sales — true AR (1051 = Accounts Receivable - TGW)
  other: {
    ar: "1051",
    revenue: "4101",
    shippingRevenue: "4102",
    taxCollected: "4201",
    fees: "6001",
    shipping: "6101",
    cogs: "5001",
    inventory: "1101",
  },
};

async function getAccountId(
  supabase: any,
  companyId: string,
  accountCode: string
): Promise<string | null> {
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("account_code", accountCode)
    .maybeSingle();
  return data?.id || null;
}

async function updateAccountBalance(
  supabase: any,
  accountId: string,
  debitAmount: number,
  creditAmount: number
) {
  const { data: account } = await supabase
    .from("chart_of_accounts")
    .select("current_balance, normal_balance")
    .eq("id", accountId)
    .single();

  if (!account) return;

  const current = Number(account.current_balance || 0);
  const newBalance =
    account.normal_balance === "debit"
      ? current + debitAmount - creditAmount
      : current + creditAmount - debitAmount;

  await supabase
    .from("chart_of_accounts")
    .update({ current_balance: newBalance })
    .eq("id", accountId);
}

async function createJournalEntry(
  supabase: any,
  companyId: string,
  entryDate: string,
  description: string,
  referenceId: string,
  referenceType: string,
  lines: JournalLine[]
) {
  const totalDebit = lines.reduce((s, l) => s + l.debit_amount, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit_amount, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    console.error(
      `Unbalanced entry for ${referenceId}: Dr ${totalDebit} Cr ${totalCredit}`
    );
    return null;
  }

  const { data: entry, error } = await supabase
    .from("journal_entries")
    .insert({
      company_id: companyId,
      entry_number: generateEntryNumber(),
      entry_date: entryDate,
      description,
      reference_type: referenceType,
      reference_id: referenceId,
      total_debit: totalDebit,
      total_credit: totalCredit,
      is_auto_generated: true,
      status: "posted",
      posted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error creating journal entry:", error);
    return null;
  }

  const lineInserts = lines.map((l) => ({
    journal_entry_id: entry.id,
    account_id: l.account_id,
    description: l.description,
    debit_amount: l.debit_amount,
    credit_amount: l.credit_amount,
  }));

  const { error: linesError } = await supabase
    .from("journal_entry_lines")
    .insert(lineInserts);

  if (linesError) {
    console.error("Error creating journal lines:", linesError);
    return null;
  }

  for (const line of lines) {
    await updateAccountBalance(
      supabase,
      line.account_id,
      line.debit_amount,
      line.credit_amount
    );
  }

  return entry.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = authHeader.replace('Bearer ', '');
    if (token !== SUPABASE_SERVICE_ROLE_KEY) {
      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: userData, error: authError } = await authClient.auth.getUser();
      if (authError || !userData.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let saleIds: string[] | null = null;
    let mode: "post" | "check_gates" = "post";
    try {
      const body = await req.json();
      saleIds = body?.sale_ids || null;
      // mode=check_gates: only evaluate gates and update status, do NOT create journal entries
      // mode=post (default): create journal entries for orders explicitly listed in sale_ids
      mode = body?.mode === "check_gates" ? "check_gates" : "post";
    } catch {
      // No body — default to gate-check mode (safe; no auto-posting)
      mode = "check_gates";
    }

    // Suspense pipeline statuses we operate on:
    //   pending_review  — newly imported, gates not yet checked
    //   needs_review    — failed a gate, waiting for human
    //   ready_to_post   — passed all gates, waiting for human "Post" click
    // We NEVER auto-touch fully_processed or voided.
    let salesQuery = supabase
      .from("sales")
      .select(
        "id, order_number, marketplace, sale_price, subtotal, shipping_cost, shipping_revenue, marketplace_fees, tax_amount, sale_date, device_id, company_id, accounting_status, manual_cost, shipping_province, marketplace_total_tax, marketplace_total_shipping, is_partner_sale"
      )
      .in("accounting_status", ["pending_review", "needs_review", "ready_to_post"]);

    if (saleIds && saleIds.length > 0) {
      salesQuery = salesQuery.in("id", saleIds);
    } else if (mode === "post") {
      // Safety: never bulk-post without explicit sale_ids
      return new Response(
        JSON.stringify({ success: false, error: "mode=post requires explicit sale_ids" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: sales, error: salesError } = await salesQuery;

    if (salesError) {
      throw new Error(`Error fetching sales: ${salesError.message}`);
    }

    if (!sales || sales.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No sales to process" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check which sales already have journal entries (belt and suspenders)
    const allSaleIds = sales.map((s) => s.id);
    const { data: existingEntries } = await supabase
      .from("journal_entries")
      .select("reference_id, description")
      .eq("reference_type", "sale")
      .in("reference_id", allSaleIds);

    // Track which sales have revenue entries vs COGS entries
    const salesWithRevenue = new Set<string>();
    const salesWithCOGS = new Set<string>();
    existingEntries?.forEach((e) => {
      if (e.description?.startsWith("COGS")) {
        salesWithCOGS.add(e.reference_id);
      } else {
        salesWithRevenue.add(e.reference_id);
      }
    });

    console.log(`Processing ${sales.length} sales (${sales.filter(s => s.accounting_status === 'unprocessed').length} unprocessed, ${sales.filter(s => s.accounting_status === 'revenue_only').length} revenue_only)`);

    // Fetch device costs in bulk for sales that have devices
    const deviceIds = sales.filter((s) => s.device_id).map((s) => s.device_id!);
    const deviceMap: Record<string, { cost: number; desc: string; companyId: string }> = {};
    
    if (deviceIds.length > 0) {
      const { data: devices } = await supabase
        .from("devices")
        .select("id, cost_price, brand, model, company_id")
        .in("id", deviceIds);

      devices?.forEach((d) => {
        deviceMap[d.id] = {
          cost: Number(d.cost_price),
          desc: `${d.brand} ${d.model}`,
          companyId: d.company_id,
        };
      });
    }

    // Fetch sale_items for multi-line orders — Gate 5 requires every line to have a cost basis
    const { data: allSaleItems } = await supabase
      .from("sale_items")
      .select("sale_id, id, device_id, product_id, cost_price, description")
      .in("sale_id", allSaleIds);
    const saleItemsBySale: Record<string, any[]> = {};
    (allSaleItems || []).forEach((it: any) => {
      if (!saleItemsBySale[it.sale_id]) saleItemsBySale[it.sale_id] = [];
      saleItemsBySale[it.sale_id].push(it);
    });

    // Cache account IDs per company
    const accountCache: Record<string, Record<string, string | null>> = {};

    async function getAccounts(companyId: string, marketplace: string) {
      const key = `${companyId}-${marketplace}`;
      if (accountCache[key]) return accountCache[key];

      const codes = ACCOUNT_MAP[marketplace] || ACCOUNT_MAP["other"];

      const [arId, revenueId, shippingRevenueId, taxId, feesId, shippingId, cogsId, inventoryId] =
        await Promise.all([
          getAccountId(supabase, companyId, codes.ar),
          getAccountId(supabase, companyId, codes.revenue),
          getAccountId(supabase, companyId, codes.shippingRevenue),
          getAccountId(supabase, companyId, codes.taxCollected),
          getAccountId(supabase, companyId, codes.fees),
          getAccountId(supabase, companyId, codes.shipping),
          getAccountId(supabase, companyId, codes.cogs),
          getAccountId(supabase, companyId, codes.inventory),
        ]);

      const result = {
        ar: arId,
        revenue: revenueId,
        shippingRevenue: shippingRevenueId,
        taxCollected: taxId,
        fees: feesId,
        shipping: shippingId,
        cogs: cogsId,
        inventory: inventoryId,
      };
      accountCache[key] = result;
      return result;
    }

    const processed: string[] = [];
    const errors: string[] = [];

    for (const sale of sales) {
      try {
        // Partner consignment sales — route to dedicated engine, skip COGS pipeline entirely
        if ((sale as any).is_partner_sale) {
          if (mode === "post") {
            try {
              const ppUrl = `${SUPABASE_URL}/functions/v1/process-partner-sale`;
              const r = await fetch(ppUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
                body: JSON.stringify({ sale_id: sale.id }),
              });
              if (r.ok) processed.push(sale.order_number);
              else errors.push(`${sale.order_number}: partner-sale processing failed`);
            } catch (e) {
              errors.push(`${sale.order_number}: ${(e as Error).message}`);
            }
          } else {
            if (sale.accounting_status !== "ready_to_post" && sale.accounting_status !== "fully_processed") {
              await supabase.from("sales").update({ accounting_status: "ready_to_post", review_reason: null }).eq("id", sale.id);
            }
          }
          continue;
        }

        // ============================================================
        // GATE EVALUATION — runs in BOTH modes
        // ============================================================
        const guardSalePrice = Number(sale.sale_price) || 0;
        const manualCost = Number(sale.manual_cost || 0);
        const device = sale.device_id ? deviceMap[sale.device_id] : null;
        const province = (sale as any).shipping_province as string | null;
        const fees = Number(sale.marketplace_fees || 0);
        const isMarketplaceSale = ["amazon", "bestbuy", "shopify", "temu"].includes(sale.marketplace);

        const failedGates: string[] = [];
        // Gate 1: price > 0
        if (guardSalePrice <= 0) failedGates.push("Zero sale price");
        // Gate 2: province resolved (only for non-Amazon — Amazon is marketplace-remitted)
        if (sale.marketplace !== "amazon" && !province) failedGates.push("Missing shipping province (tax cannot be calculated)");
        // Gate 3: cost basis (linked device OR manual_cost)
        if (!device && manualCost <= 0) failedGates.push("No linked device and no manual cost");
        // Gate 4: marketplace orders need fees populated (amount can be 0 if truly no fees, but field must be defined)
        if (isMarketplaceSale && sale.marketplace_fees === null) failedGates.push("Marketplace fees not yet populated");
        // Gate 5: multi-line orders — every sale_item must have a cost basis (device, product, or cost_price)
        const lineItems = saleItemsBySale[sale.id] || [];
        if (lineItems.length > 0) {
          const incomplete = lineItems.filter(
            (it: any) => !it.device_id && !it.product_id && (Number(it.cost_price) || 0) <= 0
          );
          if (incomplete.length > 0) {
            failedGates.push(
              `${incomplete.length} line item(s) missing device/product link or cost (e.g. "${(incomplete[0].description || 'unnamed').slice(0, 40)}")`
            );
          }
        }
        // Gate 6: marketplace totals reconciliation (Shopify) — stored editable values must match what the marketplace reported
        if (sale.marketplace === "shopify") {
          const expectedTax = (sale as any).marketplace_total_tax;
          const expectedShipping = (sale as any).marketplace_total_shipping;
          const storedTax = Number(sale.tax_amount || 0);
          const storedShipping = Number((sale as any).shipping_revenue || 0);
          const TOLERANCE = 0.01; // 1 cent rounding tolerance
          if (expectedTax !== null && expectedTax !== undefined) {
            const diff = Math.abs(storedTax - Number(expectedTax));
            if (diff > TOLERANCE) {
              failedGates.push(
                `Tax mismatch: stored ${storedTax.toFixed(2)} ≠ Shopify total_tax ${Number(expectedTax).toFixed(2)} (diff ${diff.toFixed(2)})`
              );
            }
          }
          if (expectedShipping !== null && expectedShipping !== undefined) {
            const diff = Math.abs(storedShipping - Number(expectedShipping));
            if (diff > TOLERANCE) {
              failedGates.push(
                `Shipping mismatch: stored ${storedShipping.toFixed(2)} ≠ Shopify total_shipping ${Number(expectedShipping).toFixed(2)} (diff ${diff.toFixed(2)})`
              );
            }
          }
        }

        if (failedGates.length > 0) {
          // Quarantine — never post
          await supabase
            .from("sales")
            .update({
              accounting_status: "needs_review",
              review_reason: failedGates.join("; "),
            })
            .eq("id", sale.id);
          if (mode === "post") {
            errors.push(`${sale.order_number}: gates failed — ${failedGates.join(", ")}`);
          }
          continue;
        }

        // Gates passed
        if (mode === "check_gates") {
          // Move to ready_to_post (waiting for human click)
          if (sale.accounting_status !== "ready_to_post") {
            await supabase
              .from("sales")
              .update({ accounting_status: "ready_to_post", review_reason: null })
              .eq("id", sale.id);
          }
          processed.push(sale.order_number);
          continue;
        }

        // mode === "post" — proceed to write journal entries below

        const accounts = await getAccounts(sale.company_id, sale.marketplace);
        if (!accounts || !accounts.ar || !accounts.revenue) {
          errors.push(`${sale.order_number}: Missing chart of accounts for ${sale.marketplace}`);
          continue;
        }

        const salePrice = Number(sale.sale_price);
        const shippingCost = Number(sale.shipping_cost || 0);   // What WE paid to ship (expense)
        const shippingRevenue = Number((sale as any).shipping_revenue || 0); // What customer paid us
        const tax = Number(sale.tax_amount || 0);
        const subtotalRaw = Number((sale as any).subtotal || 0);
        // Items revenue = subtotal if available, else derive: total - shipping_revenue - tax
        const itemsRevenue = subtotalRaw > 0
          ? subtotalRaw
          : Math.max(0, salePrice - shippingRevenue - tax);
        // Settlement = what marketplace owes us = gross - fees (- our shipping costs if any)
        const settlementAmount = salePrice - fees - shippingCost;
        const saleDate = sale.sale_date
          ? new Date(sale.sale_date).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];

        const deviceDesc = device?.desc || "Unlinked item";

        // Check for cross-company device linkage
        if (device && device.companyId && device.companyId !== sale.company_id) {
          console.log(`Cross-company detected: Device ${sale.device_id} belongs to ${device.companyId}, sale is for ${sale.company_id}`);
          try {
            const icUrl = `${SUPABASE_URL}/functions/v1/process-intercompany-accounting`;
            await fetch(icUrl, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                device_id: sale.device_id,
                from_company_id: device.companyId,
                to_company_id: sale.company_id,
                transfer_price: device.cost,
                reason: `Auto-transfer for cross-company sale ${sale.order_number}`,
              }),
            });
          } catch (icErr: any) {
            console.error("Intercompany transfer error:", icErr.message);
          }
        }

        // === Entry 1: Revenue recognition (create if not already done) ===
        if (!salesWithRevenue.has(sale.id)) {
          const revenueLines: JournalLine[] = [];
          const isMarketplaceSaleEntry = ["amazon", "bestbuy", "shopify", "temu"].includes(sale.marketplace);

          // Dr Cash (marketplace) or AR (other) — net settlement after fees
          revenueLines.push({
            account_id: accounts.ar!,
            description: isMarketplaceSaleEntry
              ? `Bank settlement from ${sale.marketplace} - ${sale.order_number}`
              : `Receivable from ${sale.marketplace} - ${sale.order_number}`,
            debit_amount: settlementAmount,
            credit_amount: 0,
          });

          // Dr Marketplace Fees (expense)
          if (fees > 0 && accounts.fees) {
            revenueLines.push({
              account_id: accounts.fees,
              description: `${sale.marketplace} fees - ${sale.order_number}`,
              debit_amount: fees,
              credit_amount: 0,
            });
          }

          // Dr Shipping Costs (only if WE actually paid for shipping — expense)
          if (shippingCost > 0 && accounts.shipping) {
            revenueLines.push({
              account_id: accounts.shipping,
              description: `Shipping cost paid - ${sale.order_number}`,
              debit_amount: shippingCost,
              credit_amount: 0,
            });
          }

          // Cr Sales Revenue (items only)
          revenueLines.push({
            account_id: accounts.revenue!,
            description: `Sale - ${deviceDesc} - ${sale.order_number}`,
            debit_amount: 0,
            credit_amount: itemsRevenue,
          });

          // Cr Shipping Revenue (customer-paid shipping is income)
          if (shippingRevenue > 0 && accounts.shippingRevenue) {
            revenueLines.push({
              account_id: accounts.shippingRevenue,
              description: `Shipping charged to customer - ${sale.order_number}`,
              debit_amount: 0,
              credit_amount: shippingRevenue,
            });
          }

          // Cr Tax Collected (liability)
          if (tax > 0 && accounts.taxCollected) {
            revenueLines.push({
              account_id: accounts.taxCollected,
              description: `Tax collected - ${sale.order_number}`,
              debit_amount: 0,
              credit_amount: tax,
            });
          }

          await createJournalEntry(
            supabase,
            sale.company_id,
            saleDate,
            `Sale via ${sale.marketplace} - Order#${sale.order_number} - ${deviceDesc}`,
            sale.id,
            "sale",
            revenueLines
          );

          // Create Accounts Receivable record — ONLY for non-marketplace (private/storefront) sales.
          // Marketplace sales (Amazon, Best Buy, Shopify, Temu) settle directly to the operating
          // bank account at posting time — no AR row, no per-order payout reconciliation.
          if (!isMarketplaceSaleEntry) {
            const arDueDate = new Date(saleDate);
            arDueDate.setDate(arDueDate.getDate() + 14);

            const { data: existingAR } = await supabase
              .from("accounts_receivable")
              .select("id")
              .eq("source_reference", sale.id)
              .maybeSingle();

            if (!existingAR) {
              const { error: arError } = await supabase.from("accounts_receivable").insert({
                company_id: sale.company_id,
                source_type: "sale",
                source_reference: sale.id,
                marketplace: sale.marketplace,
                customer_name: `${sale.marketplace} Sale`,
                original_amount: settlementAmount,
                paid_amount: 0,
                due_date: arDueDate.toISOString().split("T")[0],
                status: "outstanding",
                notes: `Order #${sale.order_number} - ${deviceDesc}`,
              });
              if (arError) {
                console.error(`Failed to create AR for ${sale.order_number}:`, arError);
              }
            }
          }
        }

        // === Entry 2: COGS (device linked OR manual_cost provided) ===
        // Gates already verified cost basis exists, so post should always reach fully_processed.
        let newStatus = "fully_processed";
        
        if (device && device.cost > 0 && !salesWithCOGS.has(sale.id)) {
          if (accounts.cogs && accounts.inventory) {
            await createJournalEntry(
              supabase,
              sale.company_id,
              saleDate,
              `COGS - ${device.desc} - Order#${sale.order_number}`,
              sale.id,
              "sale",
              [
                {
                  account_id: accounts.cogs!,
                  description: `Cost of goods sold - ${device.desc}`,
                  debit_amount: device.cost,
                  credit_amount: 0,
                },
                {
                  account_id: accounts.inventory!,
                  description: `Inventory reduction - ${device.desc}`,
                  debit_amount: 0,
                  credit_amount: device.cost,
                },
              ]
            );
            newStatus = "fully_processed";
          }
        } else if (!device && manualCost > 0 && !salesWithCOGS.has(sale.id)) {
          // Manual cost orders without linked device — book COGS against a general COGS account
          if (accounts.cogs) {
            // Use a general expense account (no inventory impact since there's no device)
            const cogsAccountId = accounts.cogs;
            // For manual cost, we Dr COGS and Cr a cost clearing / AP account
            // Since there's no inventory to reduce, we credit the same COGS to net zero the balance sheet impact
            // Actually, for manual cost (labor, services), Dr COGS / Cr Cash/AP equivalent
            // Use inventory account as the offset (represents cost already incurred)
            if (accounts.inventory) {
              await createJournalEntry(
                supabase,
                sale.company_id,
                saleDate,
                `COGS (manual) - Order#${sale.order_number}`,
                sale.id,
                "sale",
                [
                  {
                    account_id: cogsAccountId,
                    description: `Manual cost of goods sold - ${sale.order_number}`,
                    debit_amount: manualCost,
                    credit_amount: 0,
                  },
                  {
                    account_id: accounts.inventory!,
                    description: `Manual cost offset - ${sale.order_number}`,
                    debit_amount: 0,
                    credit_amount: manualCost,
                  },
                ]
              );
            }
            newStatus = "fully_processed";
          }
        } else if (device && salesWithCOGS.has(sale.id)) {
          newStatus = "fully_processed";
        } else if (!device && manualCost > 0 && salesWithCOGS.has(sale.id)) {
          newStatus = "fully_processed";
        }

        // Update accounting_status + stamp posted timestamp
        await supabase
          .from("sales")
          .update({
            accounting_status: newStatus,
            review_reason: null,
            posted_at: newStatus === "fully_processed" ? new Date().toISOString() : null,
          })
          .eq("id", sale.id);

        processed.push(sale.order_number);
      } catch (saleError: any) {
        console.error(`Error processing sale ${sale.order_number}:`, saleError);
        errors.push(`${sale.order_number}: ${saleError.message}`);
      }
    }

    console.log(
      `Accounting complete: ${processed.length} processed, ${errors.length} errors`
    );

    return new Response(
      JSON.stringify({
        success: true,
        processed: processed.length,
        errors: errors.length,
        details: { processed, errors },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Accounting processor error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
