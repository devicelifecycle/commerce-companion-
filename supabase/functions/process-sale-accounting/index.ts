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

// Account code map: marketplace → account codes (accrual: use AR, not Cash)
const ACCOUNT_MAP: Record<string, Record<string, string>> = {
  amazon: {
    ar: "1050",
    revenue: "4000",
    taxCollected: "4200",
    fees: "6000",
    shipping: "6100",
    cogs: "5000",
    inventory: "1100",
  },
  bestbuy: {
    ar: "1051",
    revenue: "4100",
    taxCollected: "4201",
    fees: "6001",
    shipping: "6101",
    cogs: "5001",
    inventory: "1101",
  },
  shopify: {
    ar: "1051",
    revenue: "4101",
    taxCollected: "4201",
    fees: "6001",
    shipping: "6101",
    cogs: "5001",
    inventory: "1101",
  },
  // Private/storefront/other sales use TGW accounts by default
  other: {
    ar: "1051",
    revenue: "4101",
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let saleIds: string[] | null = null;
    try {
      const body = await req.json();
      saleIds = body?.sale_ids || null;
    } catch {
      // No body — process all unaccounted
    }

    // Find sales that need accounting processing
    // Phase 1 fix: process ALL sales, not just ones with device_id
    // - 'unprocessed' sales get revenue/AR entries (with or without device)
    // - 'revenue_only' sales with a device_id now linked get COGS entries added
    let salesQuery = supabase
      .from("sales")
      .select(
        "id, order_number, marketplace, sale_price, shipping_cost, marketplace_fees, tax_amount, sale_date, device_id, company_id, accounting_status"
      )
      .in("accounting_status", ["unprocessed", "revenue_only"]);

    if (saleIds && saleIds.length > 0) {
      salesQuery = salesQuery.in("id", saleIds);
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

    // Cache account IDs per company
    const accountCache: Record<string, Record<string, string | null>> = {};

    async function getAccounts(companyId: string, marketplace: string) {
      const key = `${companyId}-${marketplace}`;
      if (accountCache[key]) return accountCache[key];

      const codes = ACCOUNT_MAP[marketplace] || ACCOUNT_MAP["other"];

      const [arId, revenueId, taxId, feesId, shippingId, cogsId, inventoryId] =
        await Promise.all([
          getAccountId(supabase, companyId, codes.ar),
          getAccountId(supabase, companyId, codes.revenue),
          getAccountId(supabase, companyId, codes.taxCollected),
          getAccountId(supabase, companyId, codes.fees),
          getAccountId(supabase, companyId, codes.shipping),
          getAccountId(supabase, companyId, codes.cogs),
          getAccountId(supabase, companyId, codes.inventory),
        ]);

      const result = {
        ar: arId,
        revenue: revenueId,
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
        const accounts = await getAccounts(sale.company_id, sale.marketplace);
        if (!accounts || !accounts.ar || !accounts.revenue) {
          errors.push(`${sale.order_number}: Missing chart of accounts for ${sale.marketplace}`);
          continue;
        }

        const salePrice = Number(sale.sale_price);
        const fees = Number(sale.marketplace_fees || 0);
        const shipping = Number(sale.shipping_cost || 0);
        const tax = Number(sale.tax_amount || 0);
        const settlementAmount = salePrice - fees + tax - shipping;
        const saleDate = sale.sale_date
          ? new Date(sale.sale_date).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];

        const device = sale.device_id ? deviceMap[sale.device_id] : null;
        const deviceDesc = device?.desc || "Unlinked item";

        // Check for cross-company device linkage
        if (device && device.companyId && device.companyId !== sale.company_id) {
          console.log(`Cross-company detected: Device ${sale.device_id} belongs to ${device.companyId}, sale is for ${sale.company_id}`);
          // Auto-create intercompany transfer
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

          revenueLines.push({
            account_id: accounts.ar!,
            description: `Receivable from ${sale.marketplace} - ${sale.order_number}`,
            debit_amount: settlementAmount,
            credit_amount: 0,
          });

          if (fees > 0 && accounts.fees) {
            revenueLines.push({
              account_id: accounts.fees,
              description: `${sale.marketplace} fees - ${sale.order_number}`,
              debit_amount: fees,
              credit_amount: 0,
            });
          }

          if (shipping > 0 && accounts.shipping) {
            revenueLines.push({
              account_id: accounts.shipping,
              description: `Shipping cost - ${sale.order_number}`,
              debit_amount: shipping,
              credit_amount: 0,
            });
          }

          revenueLines.push({
            account_id: accounts.revenue!,
            description: `Sale - ${deviceDesc} - ${sale.order_number}`,
            debit_amount: 0,
            credit_amount: salePrice,
          });

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

          // Create Accounts Receivable record
          const arDueDate = new Date(saleDate);
          arDueDate.setDate(arDueDate.getDate() + 14);

          const { data: existingAR } = await supabase
            .from("accounts_receivable")
            .select("id")
            .eq("source_reference", sale.id)
            .maybeSingle();

          if (!existingAR) {
            await supabase.from("accounts_receivable").insert({
              company_id: sale.company_id,
              source_type: "marketplace_sale",
              source_reference: sale.id,
              marketplace: sale.marketplace,
              customer_name: `${sale.marketplace} Marketplace`,
              original_amount: settlementAmount,
              paid_amount: 0,
              balance_due: settlementAmount,
              due_date: arDueDate.toISOString().split("T")[0],
              status: "outstanding",
              notes: `Order #${sale.order_number} - ${deviceDesc}`,
            });
          }
        }

        // === Entry 2: COGS (only if device is linked and COGS not yet created) ===
        let newStatus = "revenue_only";
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
        } else if (device && salesWithCOGS.has(sale.id)) {
          newStatus = "fully_processed";
        }

        // Update accounting_status
        await supabase
          .from("sales")
          .update({ accounting_status: newStatus })
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
