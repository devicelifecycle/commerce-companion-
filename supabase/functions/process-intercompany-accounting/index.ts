import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateEntryNumber(): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `IC-${date}-${rand}`;
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

// VES accounts: AR=1050, AP=2010, Revenue=4000, Inventory=1100, COGS=5000
// TGW accounts: AR=1051, AP=2011, Revenue=4100, Inventory=1101, COGS=5001

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { device_id, from_company_id, to_company_id, transfer_price, reason, sale_id } = await req.json();

    if (!from_company_id || !to_company_id) throw new Error("from_company_id and to_company_id required");
    if (from_company_id === to_company_id) throw new Error("Companies must be different");

    // Determine which company is VES vs TGW
    const { data: fromCompany } = await supabase.from("companies").select("id, code").eq("id", from_company_id).single();
    const { data: toCompany } = await supabase.from("companies").select("id, code").eq("id", to_company_id).single();
    if (!fromCompany || !toCompany) throw new Error("Companies not found");

    const fromIsVES = fromCompany.code === "VES";
    const amount = Number(transfer_price || 0);
    const today = new Date().toISOString().split("T")[0];

    if (amount <= 0) throw new Error("Transfer price must be positive");

    // 1. Create inventory_transfers record
    const { data: transfer, error: transferError } = await supabase
      .from("inventory_transfers")
      .insert({
        device_id: device_id || null,
        from_company_id,
        to_company_id,
        transfer_price: amount,
        reason: reason || "Intercompany transfer",
        notes: sale_id ? `Related to sale ${sale_id}` : null,
      })
      .select("id")
      .single();

    if (transferError) throw transferError;

    // 2. Update device company_id if device provided
    if (device_id) {
      await supabase.from("devices").update({ company_id: to_company_id }).eq("id", device_id);
    }

    // 3. Seller side: Dr. AR, Cr. Revenue (intercompany)
    const sellerAR = fromIsVES ? "1050" : "1051";
    const sellerRevenue = fromIsVES ? "4000" : "4100";
    const [sellerARId, sellerRevenueId] = await Promise.all([
      getAccountId(supabase, from_company_id, sellerAR),
      getAccountId(supabase, from_company_id, sellerRevenue),
    ]);

    if (sellerARId && sellerRevenueId) {
      const entryNum = generateEntryNumber();
      const { data: sellerJE } = await supabase.from("journal_entries").insert({
        company_id: from_company_id,
        entry_number: entryNum,
        entry_date: today,
        description: `Intercompany sale to ${toCompany.code}`,
        reference_type: "transfer",
        reference_id: transfer.id,
        total_debit: amount,
        total_credit: amount,
        is_auto_generated: true,
        status: "posted",
        posted_at: new Date().toISOString(),
      }).select("id").single();

      if (sellerJE) {
        await supabase.from("journal_entry_lines").insert([
          { journal_entry_id: sellerJE.id, account_id: sellerARId, description: `IC Receivable from ${toCompany.code}`, debit_amount: amount, credit_amount: 0 },
          { journal_entry_id: sellerJE.id, account_id: sellerRevenueId, description: `IC Revenue - transfer to ${toCompany.code}`, debit_amount: 0, credit_amount: amount },
        ]);
        await updateAccountBalance(supabase, sellerARId, amount, 0);
        await updateAccountBalance(supabase, sellerRevenueId, 0, amount);
      }

      // Create AR for seller
      const arDueDate = new Date();
      arDueDate.setDate(arDueDate.getDate() + 30);
      await supabase.from("accounts_receivable").insert({
        company_id: from_company_id,
        source_type: "intercompany",
        source_reference: transfer.id,
        customer_name: `${toCompany.code} (Intercompany)`,
        original_amount: amount,
        balance_due: amount,
        due_date: arDueDate.toISOString().split("T")[0],
        status: "outstanding",
        notes: `Intercompany transfer - ${reason || "Device transfer"}`,
      });
    }

    // 4. Buyer side: Dr. Inventory, Cr. AP (intercompany)
    const buyerInventory = fromIsVES ? "1101" : "1100";
    const buyerAP = fromIsVES ? "2011" : "2010";
    const [buyerInventoryId, buyerAPId] = await Promise.all([
      getAccountId(supabase, to_company_id, buyerInventory),
      getAccountId(supabase, to_company_id, buyerAP),
    ]);

    if (buyerInventoryId && buyerAPId) {
      const entryNum = generateEntryNumber();
      const { data: buyerJE } = await supabase.from("journal_entries").insert({
        company_id: to_company_id,
        entry_number: entryNum,
        entry_date: today,
        description: `Intercompany purchase from ${fromCompany.code}`,
        reference_type: "transfer",
        reference_id: transfer.id,
        total_debit: amount,
        total_credit: amount,
        is_auto_generated: true,
        status: "posted",
        posted_at: new Date().toISOString(),
      }).select("id").single();

      if (buyerJE) {
        await supabase.from("journal_entry_lines").insert([
          { journal_entry_id: buyerJE.id, account_id: buyerInventoryId, description: `IC Inventory from ${fromCompany.code}`, debit_amount: amount, credit_amount: 0 },
          { journal_entry_id: buyerJE.id, account_id: buyerAPId, description: `IC Payable to ${fromCompany.code}`, debit_amount: 0, credit_amount: amount },
        ]);
        await updateAccountBalance(supabase, buyerInventoryId, amount, 0);
        await updateAccountBalance(supabase, buyerAPId, 0, amount);
      }

      // Create AP for buyer
      const apDueDate = new Date();
      apDueDate.setDate(apDueDate.getDate() + 30);
      await supabase.from("accounts_payable").insert({
        company_id: to_company_id,
        vendor_name: `${fromCompany.code} (Intercompany)`,
        original_amount: amount,
        balance_due: amount,
        due_date: apDueDate.toISOString().split("T")[0],
        status: "unpaid",
        category: "intercompany",
        description: `Intercompany purchase - ${reason || "Device transfer"}`,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        transfer_id: transfer.id,
        message: `Intercompany accounting complete: ${fromCompany.code} → ${toCompany.code} for $${amount}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Intercompany accounting error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
