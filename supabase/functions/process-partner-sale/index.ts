import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Settlement (Cash/AR) account by marketplace — same map as process-sale-accounting
const SETTLEMENT_ACCOUNT: Record<string, string> = {
  amazon: "1000",
  bestbuy: "1001",
  shopify: "1001",
  temu: "1001",
  other: "1051",
  manual: "1051",
};

const FEES_ACCOUNT: Record<string, string> = {
  amazon: "6000", bestbuy: "6001", shopify: "6001", temu: "6001", other: "6001", manual: "6001",
};

const SHIPPING_EXPENSE_ACCOUNT: Record<string, string> = {
  amazon: "6100", bestbuy: "6101", shopify: "6101", temu: "6101", other: "6101", manual: "6101",
};

// Tax collected (HST) account
const TAX_ACCOUNT: Record<string, string> = {
  amazon: "4200", bestbuy: "4201", shopify: "4201", temu: "4201", other: "4201", manual: "4201",
};

function entryNumber() {
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const r = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `PARTNER-${day}-${r}`;
}

async function getAccountId(supabase: any, companyId: string, code: string): Promise<string | null> {
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("account_code", code)
    .maybeSingle();
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const body = await req.json();
    const saleId: string | undefined = body?.sale_id;
    if (!saleId) {
      return new Response(JSON.stringify({ error: "sale_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip if already processed
    const { data: existing } = await supabase
      .from("partner_sales").select("id").eq("sale_id", saleId).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ success: true, message: "Already processed", partner_sale_id: existing.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: sale, error: sErr } = await supabase
      .from("sales")
      .select("id, order_number, marketplace, sale_price, shipping_cost, shipping_revenue, marketplace_fees, tax_amount, sale_date, device_id, company_id, partner_id, partner_device_id, is_partner_sale")
      .eq("id", saleId).maybeSingle();
    if (sErr || !sale) throw new Error("Sale not found");
    if (!sale.is_partner_sale) throw new Error("Sale is not flagged as partner sale");

    // Resolve partner + device
    let partnerId = sale.partner_id as string | null;
    let partnerDeviceId = sale.partner_device_id as string | null;

    // If sale.device_id is a partner-owned synth device, look up backwards
    if (!partnerDeviceId && sale.device_id) {
      const { data: dev } = await supabase
        .from("devices").select("partner_device_id, is_partner_owned").eq("id", sale.device_id).maybeSingle();
      if (dev?.partner_device_id) partnerDeviceId = dev.partner_device_id;
    }
    if (partnerDeviceId && !partnerId) {
      const { data: pd } = await supabase
        .from("partner_devices").select("partner_id").eq("id", partnerDeviceId).maybeSingle();
      if (pd) partnerId = pd.partner_id;
    }
    if (!partnerId) throw new Error("Cannot resolve partner_id for sale");

    const { data: partner } = await supabase
      .from("partners").select("commission_pct").eq("id", partnerId).single();
    const { data: pdev } = partnerDeviceId
      ? await supabase.from("partner_devices").select("partner_cost, refurb_fee").eq("id", partnerDeviceId).single()
      : { data: null as any };

    // Compute money flow
    const salePrice = Number(sale.sale_price) || 0;
    const fees = Number(sale.marketplace_fees) || 0;
    const shipping = Number(sale.shipping_cost) || 0;   // what we paid to ship
    const tax = Number(sale.tax_amount) || 0;
    const refurbFee = Number(pdev?.refurb_fee) || 0;
    const partnerCost = Number(pdev?.partner_cost) || 0;

    const netProfit = salePrice - partnerCost - fees - shipping - tax - refurbFee;
    const commissionPct = Number(partner?.commission_pct ?? 15);
    const commissionAmount = Math.max(0, netProfit) * (commissionPct / 100);
    // What we owe partner (out of cash we collected)
    const partnerProceeds = salePrice - fees - shipping - tax - refurbFee - commissionAmount;

    const channel = (sale.marketplace || "manual").toLowerCase();
    const settlementCode = SETTLEMENT_ACCOUNT[channel] || SETTLEMENT_ACCOUNT.other;
    const feesCode = FEES_ACCOUNT[channel] || FEES_ACCOUNT.other;
    const shippingCode = SHIPPING_EXPENSE_ACCOUNT[channel] || SHIPPING_EXPENSE_ACCOUNT.other;
    const taxCode = TAX_ACCOUNT[channel] || TAX_ACCOUNT.other;

    const [settlementId, feesId, shippingExpId, taxId, refurbRevId, commRevId, partnerPayableId] = await Promise.all([
      getAccountId(supabase, sale.company_id, settlementCode),
      getAccountId(supabase, sale.company_id, feesCode),
      getAccountId(supabase, sale.company_id, shippingCode),
      getAccountId(supabase, sale.company_id, taxCode),
      getAccountId(supabase, sale.company_id, "4500"),
      getAccountId(supabase, sale.company_id, "4510"),
      getAccountId(supabase, sale.company_id, "2050"),
    ]);

    if (!settlementId || !refurbRevId || !commRevId || !partnerPayableId) {
      throw new Error("Required chart-of-accounts entries not provisioned");
    }

    // Insert partner_sales row
    const { data: psRow, error: psErr } = await supabase.from("partner_sales").insert({
      partner_id: partnerId,
      partner_device_id: partnerDeviceId,
      sale_id: sale.id,
      company_id: sale.company_id,
      channel,
      sale_date: sale.sale_date ? new Date(sale.sale_date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      sale_amount: salePrice,
      partner_cost: partnerCost,
      marketplace_fees: fees,
      shipping,
      tax,
      refurb_fee: refurbFee,
      net_profit: netProfit,
      commission_pct: commissionPct,
      commission_amount: commissionAmount,
      partner_proceeds: partnerProceeds,
      status: "accrued",
    }).select().single();
    if (psErr) throw psErr;

    // Partner payable
    const { data: ppRow } = await supabase.from("partner_payables").insert({
      partner_id: partnerId,
      partner_sale_id: psRow.id,
      company_id: sale.company_id,
      amount: partnerProceeds,
      status: "accrued",
    }).select().single();

    // Build journal entry
    const lines: any[] = [];
    const entryNo = entryNumber();
    const settlement = salePrice - fees - shipping; // cash hits settlement after fees+shipping (mirrors process-sale-accounting)

    // Dr Cash/AR settlement
    if (settlement > 0) lines.push({ account_id: settlementId, debit_amount: settlement, credit_amount: 0, description: "Partner sale settlement" });
    // Dr Marketplace fees expense
    if (fees > 0 && feesId) lines.push({ account_id: feesId, debit_amount: fees, credit_amount: 0, description: "Marketplace fees" });
    // Dr Shipping expense (what we paid)
    if (shipping > 0 && shippingExpId) lines.push({ account_id: shippingExpId, debit_amount: shipping, credit_amount: 0, description: "Shipping cost" });
    // Cr HST payable
    if (tax > 0 && taxId) lines.push({ account_id: taxId, debit_amount: 0, credit_amount: tax, description: "Tax collected" });
    // Cr Refurb Service Revenue
    if (refurbFee > 0) lines.push({ account_id: refurbRevId, debit_amount: 0, credit_amount: refurbFee, description: "Refurbishment fee" });
    // Cr Consignment Commission Revenue
    if (commissionAmount > 0) lines.push({ account_id: commRevId, debit_amount: 0, credit_amount: commissionAmount, description: `Commission ${commissionPct}% of net profit` });
    // Cr Partner Payable (what we owe partner)
    if (partnerProceeds !== 0) lines.push({ account_id: partnerPayableId, debit_amount: partnerProceeds < 0 ? -partnerProceeds : 0, credit_amount: partnerProceeds > 0 ? partnerProceeds : 0, description: "Owed to partner" });

    const totalDr = lines.reduce((s, l) => s + Number(l.debit_amount || 0), 0);
    const totalCr = lines.reduce((s, l) => s + Number(l.credit_amount || 0), 0);
    // Balancing: residual goes to partner payable to keep entry balanced (handles sale_price = settlement + fees + shipping rounding)
    const diff = +(totalDr - totalCr).toFixed(2);
    if (Math.abs(diff) > 0.005 && partnerPayableId) {
      // If debits > credits, credit partner payable for the difference (we owe more); else reverse
      if (diff > 0) {
        lines.push({ account_id: partnerPayableId, debit_amount: 0, credit_amount: diff, description: "Balancing — owed to partner" });
      } else {
        lines.push({ account_id: partnerPayableId, debit_amount: -diff, credit_amount: 0, description: "Balancing — partner adjustment" });
      }
    }

    const finalDr = lines.reduce((s, l) => s + Number(l.debit_amount || 0), 0);
    const finalCr = lines.reduce((s, l) => s + Number(l.credit_amount || 0), 0);

    const { data: je, error: jeErr } = await supabase.from("journal_entries").insert({
      company_id: sale.company_id,
      entry_number: entryNo,
      entry_date: sale.sale_date ? new Date(sale.sale_date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      description: `Partner sale ${sale.order_number}`,
      reference_type: "partner_sale",
      reference_id: psRow.id,
      total_debit: finalDr,
      total_credit: finalCr,
      status: "posted",
      is_auto_generated: true,
      posted_at: new Date().toISOString(),
    }).select().single();
    if (jeErr) throw jeErr;

    await supabase.from("journal_entry_lines").insert(lines.map(l => ({ ...l, journal_entry_id: je.id })));
    for (const l of lines) {
      await bumpBalance(supabase, l.account_id, Number(l.debit_amount || 0), Number(l.credit_amount || 0));
    }

    // Mark partner_device sold
    if (partnerDeviceId) {
      await supabase.from("partner_devices").update({ status: "sold" }).eq("id", partnerDeviceId);
      await supabase.from("partner_device_events").insert({
        partner_device_id: partnerDeviceId,
        partner_id: partnerId,
        company_id: sale.company_id,
        event_type: "sale_recorded",
        payload: { sale_id: sale.id, sale_amount: salePrice, commission: commissionAmount, partner_proceeds: partnerProceeds },
      });
    }

    // Mark sale fully processed so existing engine ignores it
    await supabase.from("sales").update({ accounting_status: "fully_processed" }).eq("id", sale.id);

    return new Response(JSON.stringify({
      success: true,
      partner_sale_id: psRow.id,
      partner_payable_id: ppRow?.id,
      journal_entry_id: je.id,
      net_profit: netProfit,
      commission_amount: commissionAmount,
      partner_proceeds: partnerProceeds,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[process-partner-sale]", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
