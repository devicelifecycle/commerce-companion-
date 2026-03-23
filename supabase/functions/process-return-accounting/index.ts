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
  return `RET-${date}-${rand}`;
}

async function getAccountId(supabase: any, companyId: string, accountCode: string): Promise<string | null> {
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("account_code", accountCode)
    .maybeSingle();
  return data?.id || null;
}

async function updateAccountBalance(supabase: any, accountId: string, debitAmount: number, creditAmount: number) {
  const { data: account } = await supabase
    .from("chart_of_accounts")
    .select("current_balance, normal_balance")
    .eq("id", accountId)
    .single();
  if (!account) return;
  const current = Number(account.current_balance || 0);
  const newBalance = account.normal_balance === "debit"
    ? current + debitAmount - creditAmount
    : current + creditAmount - debitAmount;
  await supabase.from("chart_of_accounts").update({ current_balance: newBalance }).eq("id", accountId);
}

async function createJournalEntry(supabase: any, companyId: string, entryDate: string, description: string, referenceId: string, lines: JournalLine[]) {
  const totalDebit = lines.reduce((s, l) => s + l.debit_amount, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit_amount, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    console.error(`Unbalanced: Dr ${totalDebit} Cr ${totalCredit}`);
    return null;
  }
  const { data: entry, error } = await supabase.from("journal_entries").insert({
    company_id: companyId,
    entry_number: generateEntryNumber(),
    entry_date: entryDate,
    description,
    reference_type: "return",
    reference_id: referenceId,
    total_debit: totalDebit,
    total_credit: totalCredit,
    is_auto_generated: true,
    status: "posted",
    posted_at: new Date().toISOString(),
  }).select("id").single();
  if (error) { console.error("Error creating return JE:", error); return null; }

  await supabase.from("journal_entry_lines").insert(
    lines.map((l) => ({ journal_entry_id: entry.id, ...l }))
  );
  for (const line of lines) {
    await updateAccountBalance(supabase, line.account_id, line.debit_amount, line.credit_amount);
  }
  return entry.id;
}

// Marketplace to account codes mapping
const ACCOUNT_MAP: Record<string, Record<string, string>> = {
  amazon: { ar: "1050", revenue: "4000", taxCollected: "4200", fees: "6000", cogs: "5000", inventory: "1100", ap: "2010" },
  bestbuy: { ar: "1051", revenue: "4100", taxCollected: "4201", fees: "6001", cogs: "5001", inventory: "1101", ap: "2011" },
  shopify: { ar: "1051", revenue: "4101", taxCollected: "4201", fees: "6001", cogs: "5001", inventory: "1101", ap: "2011" },
  other: { ar: "1051", revenue: "4101", taxCollected: "4201", fees: "6001", cogs: "5001", inventory: "1101", ap: "2011" },
};

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

    const { return_id } = await req.json();
    if (!return_id) throw new Error("return_id is required");

    // Fetch the return authorization with related data
    const { data: rma, error: rmaError } = await supabase
      .from("return_authorizations")
      .select("*, device:devices(brand, model, cost_price, company_id)")
      .eq("id", return_id)
      .single();

    if (rmaError || !rma) throw new Error("RMA not found");
    if (rma.accounting_status === "processed") {
      return new Response(
        JSON.stringify({ success: true, message: "Already processed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyId = rma.company_id;
    const returnDate = rma.refund_date || new Date().toISOString().split("T")[0];
    const refundAmount = Number(rma.refund_amount || rma.original_cost || 0);
    const taxRefunded = Number(rma.tax_refunded || 0);

    if (rma.return_type === "sales_return" && rma.sale_id) {
      // Fetch the original sale
      const { data: sale } = await supabase
        .from("sales")
        .select("marketplace, sale_price, marketplace_fees, shipping_cost, tax_amount, device_id, company_id")
        .eq("id", rma.sale_id)
        .single();

      if (!sale) throw new Error("Original sale not found");

      const codes = ACCOUNT_MAP[sale.marketplace] || ACCOUNT_MAP["other"];

      // === ADJUSTMENT TYPE: Partial credit, no item return ===
      if (rma.resolution_type === "adjustment") {
        const [arId, revenueId] = await Promise.all([
          getAccountId(supabase, companyId, codes.ar),
          getAccountId(supabase, companyId, codes.revenue),
        ]);
        if (!arId || !revenueId) throw new Error("Missing accounts for adjustment");

        // Dr. Revenue (reduce revenue by adjustment amount)
        // Cr. AR (reduce receivable / issue credit)
        await createJournalEntry(
          supabase, companyId, returnDate,
          `Courtesy adjustment/credit - ${rma.rma_number}`,
          rma.id,
          [
            { account_id: revenueId, description: `Revenue adjustment - ${rma.rma_number}`, debit_amount: refundAmount, credit_amount: 0 },
            { account_id: arId, description: `AR credit - ${rma.rma_number}`, debit_amount: 0, credit_amount: refundAmount },
          ]
        );
      } else {
        // === FULL RETURN (refund, exchange, repair): Reverse the sale's accounting ===
        const [arId, revenueId, taxId, cogsId, inventoryId] = await Promise.all([
          getAccountId(supabase, companyId, codes.ar),
          getAccountId(supabase, companyId, codes.revenue),
          getAccountId(supabase, companyId, codes.taxCollected),
          getAccountId(supabase, companyId, codes.cogs),
          getAccountId(supabase, companyId, codes.inventory),
        ]);

        if (!arId || !revenueId) throw new Error("Missing accounts for return reversal");

        // Entry 1: Reverse revenue
        const revenueLines: JournalLine[] = [];
        const salePrice = Number(sale.sale_price);

        revenueLines.push({
          account_id: revenueId,
          description: `Revenue reversal - Return ${rma.rma_number}`,
          debit_amount: refundAmount > 0 ? refundAmount : salePrice,
          credit_amount: 0,
        });

        if (taxRefunded > 0 && taxId) {
          revenueLines.push({
            account_id: taxId,
            description: `Tax reversal - Return ${rma.rma_number}`,
            debit_amount: taxRefunded,
            credit_amount: 0,
          });
        }

        const totalDebitForAR = (refundAmount > 0 ? refundAmount : salePrice) + taxRefunded;
        revenueLines.push({
          account_id: arId,
          description: `AR reversal/refund - Return ${rma.rma_number}`,
          debit_amount: 0,
          credit_amount: totalDebitForAR,
        });

        await createJournalEntry(
          supabase, companyId, returnDate,
          `Sales return reversal - RMA#${rma.rma_number}`,
          rma.id, revenueLines
        );

        // Entry 2: Reverse COGS (if device was linked and it's a refund/exchange — not repair since item stays)
        if (sale.device_id && cogsId && inventoryId && rma.resolution_type !== "repair") {
          const device = rma.device as any;
          const deviceCost = device?.cost_price ? Number(device.cost_price) : 0;
          if (deviceCost > 0) {
            await createJournalEntry(
              supabase, companyId, returnDate,
              `COGS reversal - RMA#${rma.rma_number}`,
              rma.id,
              [
                { account_id: inventoryId, description: `Inventory restored - ${rma.rma_number}`, debit_amount: deviceCost, credit_amount: 0 },
                { account_id: cogsId, description: `COGS reversed - ${rma.rma_number}`, debit_amount: 0, credit_amount: deviceCost },
              ]
            );
          }
        }

        // Update the AR record if one exists
        const { data: arRecord } = await supabase
          .from("accounts_receivable")
          .select("id, balance_due, paid_amount")
          .eq("source_reference", rma.sale_id)
          .maybeSingle();

        if (arRecord) {
          await supabase.from("accounts_receivable").update({
            status: "cancelled",
            notes: `Cancelled due to return RMA#${rma.rma_number}`,
            balance_due: 0,
          }).eq("id", arRecord.id);
        }
      }

    } else if (rma.return_type === "purchase_return") {
      // === SUPPLIER RETURN: Reverse the purchase ===
      const codes = ACCOUNT_MAP["other"];
      const [inventoryId, apId] = await Promise.all([
        getAccountId(supabase, companyId, codes.inventory),
        getAccountId(supabase, companyId, codes.ap),
      ]);

      if (!inventoryId || !apId) throw new Error("Missing accounts for purchase return");

      // Dr. AP (reduce what we owe / expect credit)
      // Cr. Inventory (remove from inventory)
      await createJournalEntry(
        supabase, companyId, returnDate,
        `Purchase return - RMA#${rma.rma_number}`,
        rma.id,
        [
          { account_id: apId, description: `AP reduced - Supplier return ${rma.rma_number}`, debit_amount: refundAmount, credit_amount: 0 },
          { account_id: inventoryId, description: `Inventory removed - Supplier return ${rma.rma_number}`, debit_amount: 0, credit_amount: refundAmount },
        ]
      );
    }

    // Mark RMA as accounting-processed
    await supabase
      .from("return_authorizations")
      .update({ accounting_status: "processed" })
      .eq("id", rma.id);

    return new Response(
      JSON.stringify({ success: true, message: `Accounting entries created for RMA ${rma.rma_number}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Return accounting error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
