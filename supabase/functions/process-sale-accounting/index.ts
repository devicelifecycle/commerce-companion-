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
// Account code map: marketplace → account codes (accrual: use AR, not Cash)
const ACCOUNT_MAP = {
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
} as const;

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
      reference_type: "sale",
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

  // Insert lines
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

  // Update account balances
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

    // Accept optional sale_ids to process specific sales, otherwise process all unaccounted
    let saleIds: string[] | null = null;
    try {
      const body = await req.json();
      saleIds = body?.sale_ids || null;
    } catch {
      // No body — process all unaccounted
    }

    // Find sales that have a device linked but NO journal entries yet
    let salesQuery = supabase
      .from("sales")
      .select(
        "id, order_number, marketplace, sale_price, shipping_cost, marketplace_fees, tax_amount, sale_date, device_id, company_id"
      )
      .not("device_id", "is", null);

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

    // Check which sales already have journal entries
    const allSaleIds = sales.map((s) => s.id);
    const { data: existingEntries } = await supabase
      .from("journal_entries")
      .select("reference_id")
      .eq("reference_type", "sale")
      .in("reference_id", allSaleIds);

    const salesWithJE = new Set(existingEntries?.map((e) => e.reference_id) || []);

    // Filter to unaccounted sales
    const unaccountedSales = sales.filter((s) => !salesWithJE.has(s.id));

    if (unaccountedSales.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "All sales already have journal entries" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${unaccountedSales.length} unaccounted sales`);

    // Fetch device costs in bulk
    const deviceIds = unaccountedSales.map((s) => s.device_id!);
    const { data: devices } = await supabase
      .from("devices")
      .select("id, cost_price, brand, model")
      .in("id", deviceIds);

    const deviceMap: Record<string, { cost: number; desc: string }> = {};
    devices?.forEach((d) => {
      deviceMap[d.id] = {
        cost: Number(d.cost_price),
        desc: `${d.brand} ${d.model}`,
      };
    });

    // Cache account IDs per company
    const accountCache: Record<string, Record<string, string | null>> = {};

    async function getAccounts(companyId: string, marketplace: string) {
      const key = `${companyId}-${marketplace}`;
      if (accountCache[key]) return accountCache[key];

      const codes = ACCOUNT_MAP[marketplace as keyof typeof ACCOUNT_MAP];
      if (!codes) return null;

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

    for (const sale of unaccountedSales) {
      try {
        const accounts = await getAccounts(sale.company_id, sale.marketplace);
        if (!accounts || !accounts.ar || !accounts.revenue || !accounts.cogs || !accounts.inventory) {
          errors.push(`${sale.order_number}: Missing chart of accounts for ${sale.marketplace}`);
          continue;
        }

        const device = deviceMap[sale.device_id!];
        if (!device) {
          errors.push(`${sale.order_number}: Device ${sale.device_id} not found`);
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

        // Entry 1: Revenue recognition (Accrual)
        // Dr. Accounts Receivable (net settlement expected)
        // Dr. Marketplace Fees
        // Dr. Shipping Cost
        // Cr. Sales Revenue
        // Cr. Tax Collected
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
          description: `Sale - ${device.desc} - ${sale.order_number}`,
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
          `Sale via ${sale.marketplace} - Order#${sale.order_number} - ${device.desc}`,
          sale.id,
          revenueLines
        );

        // Entry 2: COGS
        // Dr. COGS (device cost)
        // Cr. Inventory (device cost)
        if (device.cost > 0) {
          await createJournalEntry(
            supabase,
            sale.company_id,
            saleDate,
            `COGS - ${device.desc} - Order#${sale.order_number}`,
            sale.id,
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
        }

        // Create Accounts Receivable record
        const arDueDate = new Date(saleDate);
        arDueDate.setDate(arDueDate.getDate() + 14); // Marketplace typically pays within 14 days
        
        // Check if AR already exists for this sale
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
            notes: `Order #${sale.order_number} - ${device.desc}`,
          });
        }

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
