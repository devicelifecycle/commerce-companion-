// Bill refurb fee for a partner device that's being returned to the partner (no resale).
// Posts: Dr 1052 Partner Receivable / Cr 4500 Refurb Service Revenue
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function entryNumber() {
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `PRTRN-${day}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
}

async function getAccountId(supabase: any, companyId: string, code: string) {
  const { data } = await supabase.from("chart_of_accounts").select("id").eq("company_id", companyId).eq("account_code", code).maybeSingle();
  return data?.id || null;
}
async function bumpBalance(supabase: any, accountId: string, debit: number, credit: number) {
  const { data: a } = await supabase.from("chart_of_accounts").select("current_balance, normal_balance").eq("id", accountId).single();
  if (!a) return;
  const cur = Number(a.current_balance || 0);
  const nb = a.normal_balance === "debit" ? cur + debit - credit : cur + credit - debit;
  await supabase.from("chart_of_accounts").update({ current_balance: nb }).eq("id", accountId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { partner_device_id } = await req.json();
    if (!partner_device_id) {
      return new Response(JSON.stringify({ error: "partner_device_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: dev, error: dErr } = await supabase
      .from("partner_devices").select("*").eq("id", partner_device_id).single();
    if (dErr || !dev) throw new Error("Partner device not found");

    const refurbFee = Number(dev.refurb_fee || 0);
    const companyId = dev.company_id;

    // Update status + disposition
    await supabase.from("partner_devices").update({
      status: "returned_to_partner",
      disposition: "return_to_partner",
      refurb_fee_status: refurbFee > 0 ? "invoiced" : "settled",
    }).eq("id", partner_device_id);

    // Log event
    await supabase.from("partner_device_events").insert({
      partner_device_id, partner_id: dev.partner_id, company_id: companyId,
      event_type: "returned_to_partner",
      payload: { refurb_fee: refurbFee },
    });

    let receivableId: string | null = null;
    let journalEntryId: string | null = null;

    if (refurbFee > 0) {
      // Create receivable
      const { data: rec, error: rErr } = await supabase.from("partner_receivables").insert({
        partner_id: dev.partner_id, partner_device_id, company_id: companyId,
        fee_type: "refurb_fee", amount: refurbFee, status: "pending",
      }).select().single();
      if (rErr) throw rErr;
      receivableId = rec.id;

      const [recvAcc, revAcc] = await Promise.all([
        getAccountId(supabase, companyId, "1052"),
        getAccountId(supabase, companyId, "4500"),
      ]);
      if (!recvAcc || !revAcc) throw new Error("Required accounts (1052 / 4500) missing");

      const { data: je, error: jeErr } = await supabase.from("journal_entries").insert({
        company_id: companyId, entry_number: entryNumber(),
        entry_date: new Date().toISOString().split("T")[0],
        description: `Refurb fee — return to partner (device ${partner_device_id})`,
        reference_type: "partner_device_return", reference_id: rec.id,
        status: "posted", is_auto_generated: true,
        total_debit: refurbFee, total_credit: refurbFee, posted_at: new Date().toISOString(),
      }).select().single();
      if (jeErr) throw jeErr;
      journalEntryId = je.id;

      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je.id, account_id: recvAcc, debit_amount: refurbFee, credit_amount: 0, description: "Refurb fee receivable" },
        { journal_entry_id: je.id, account_id: revAcc, debit_amount: 0, credit_amount: refurbFee, description: "Refurbishment service revenue" },
      ]);
      await bumpBalance(supabase, recvAcc, refurbFee, 0);
      await bumpBalance(supabase, revAcc, 0, refurbFee);
    }

    return new Response(JSON.stringify({ success: true, receivable_id: receivableId, journal_entry_id: journalEntryId, billed: refurbFee }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("bill-refurb-return error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
