// Settle outstanding partner payables (or net against receivables) and post the JE.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function entryNumber(prefix = "PSETL") {
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${prefix}-${day}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
}

async function getAccountId(supabase: any, companyId: string, code: string) {
  const { data } = await supabase
    .from("chart_of_accounts").select("id").eq("company_id", companyId).eq("account_code", code).maybeSingle();
  return data?.id || null;
}

async function bumpBalance(supabase: any, accountId: string, debit: number, credit: number) {
  const { data: a } = await supabase
    .from("chart_of_accounts").select("current_balance, normal_balance").eq("id", accountId).single();
  if (!a) return;
  const cur = Number(a.current_balance || 0);
  const nb = a.normal_balance === "debit" ? cur + debit - credit : cur + credit - debit;
  await supabase.from("chart_of_accounts").update({ current_balance: nb }).eq("id", accountId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const partnerId: string = body.partner_id;
    const companyId: string = body.company_id;
    const paymentMethod: string = body.payment_method || "bank_transfer";
    const reference: string = body.reference || "";
    const cashAccountCode: string = body.cash_account_code || "1000";
    const periodStart: string = body.period_start || new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];
    const periodEnd: string = body.period_end || new Date().toISOString().split("T")[0];
    const payableIds: string[] = body.payable_ids || [];
    const receivableIds: string[] = body.receivable_ids || [];

    if (!partnerId || !companyId) {
      return new Response(JSON.stringify({ error: "partner_id and company_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch open payables/receivables (use IDs if provided, else all 'accrued'/'pending')
    const payableQ = supabase.from("partner_payables").select("*").eq("partner_id", partnerId).eq("status", "accrued");
    const receivableQ = supabase.from("partner_receivables").select("*").eq("partner_id", partnerId).in("status", ["pending", "invoiced"]);
    const { data: payables } = payableIds.length ? await payableQ.in("id", payableIds) : await payableQ;
    const { data: receivables } = receivableIds.length ? await receivableQ.in("id", receivableIds) : await receivableQ;

    const totalPayable = (payables || []).reduce((s, p) => s + Number(p.amount), 0);
    const totalReceivable = (receivables || []).reduce((s, r) => s + Number(r.amount), 0);
    const netToPartner = totalPayable - totalReceivable; // positive = pay partner; negative = collect

    // Accounts
    const [payableAccId, receivableAccId, cashAccId] = await Promise.all([
      getAccountId(supabase, companyId, "2050"),
      getAccountId(supabase, companyId, "1052"),
      getAccountId(supabase, companyId, cashAccountCode),
    ]);
    if (!payableAccId || !cashAccId) throw new Error("Required accounts (2050 / cash) missing");

    // Build settlement record
    const { data: settlement, error: setErr } = await supabase.from("partner_settlements").insert({
      partner_id: partnerId, company_id: companyId,
      period_start: periodStart, period_end: periodEnd,
      total_payable: totalPayable, total_receivable: totalReceivable,
      net_amount: Math.abs(netToPartner),
      direction: netToPartner >= 0 ? "pay" : "collect",
      status: "paid", paid_date: new Date().toISOString().split("T")[0],
      payment_method: paymentMethod, reference,
    }).select().single();
    if (setErr) throw setErr;

    // Build JE
    const lines: any[] = [];
    if (totalPayable > 0) lines.push({ account_id: payableAccId, debit_amount: totalPayable, credit_amount: 0, description: "Settle partner payable" });
    if (totalReceivable > 0 && receivableAccId) lines.push({ account_id: receivableAccId, debit_amount: 0, credit_amount: totalReceivable, description: "Apply partner receivable" });
    if (netToPartner > 0) lines.push({ account_id: cashAccId, debit_amount: 0, credit_amount: netToPartner, description: `Cash paid to partner (${paymentMethod})` });
    else if (netToPartner < 0) lines.push({ account_id: cashAccId, debit_amount: -netToPartner, credit_amount: 0, description: `Cash collected from partner` });

    const totalDr = lines.reduce((s, l) => s + Number(l.debit_amount), 0);
    const totalCr = lines.reduce((s, l) => s + Number(l.credit_amount), 0);

    const { data: je, error: jeErr } = await supabase.from("journal_entries").insert({
      company_id: companyId, entry_number: entryNumber(),
      entry_date: new Date().toISOString().split("T")[0],
      description: `Partner settlement ${settlement.id}`,
      reference_type: "partner_settlement", reference_id: settlement.id,
      status: "posted", is_auto_generated: true,
      total_debit: totalDr, total_credit: totalCr, posted_at: new Date().toISOString(),
    }).select().single();
    if (jeErr) throw jeErr;

    if (lines.length > 0) {
      await supabase.from("journal_entry_lines").insert(lines.map((l) => ({ ...l, journal_entry_id: je.id })));
      for (const l of lines) await bumpBalance(supabase, l.account_id, Number(l.debit_amount || 0), Number(l.credit_amount || 0));
    }

    // Mark payables / receivables / sales as settled
    if (payables && payables.length) {
      const ids = payables.map((p: any) => p.id);
      await supabase.from("partner_payables").update({ status: "settled", settlement_id: settlement.id }).in("id", ids);
      const saleIds = payables.map((p: any) => p.partner_sale_id).filter(Boolean);
      if (saleIds.length) {
        await supabase.from("partner_sales").update({ status: "settled", settlement_id: settlement.id, settled_at: new Date().toISOString() }).in("id", saleIds);
      }
    }
    if (receivables && receivables.length) {
      const ids = receivables.map((r: any) => r.id);
      await supabase.from("partner_receivables").update({ status: "netted", settlement_id: settlement.id }).in("id", ids);
    }

    return new Response(JSON.stringify({ success: true, settlement_id: settlement.id, total_payable: totalPayable, total_receivable: totalReceivable, net: netToPartner, journal_entry_id: je.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("settle-partner error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
