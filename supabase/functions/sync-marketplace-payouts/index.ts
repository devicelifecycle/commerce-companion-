import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Company-marketplace mapping
// Amazon → VES, Shopify/BestBuy → TGW
async function getCompanyMap(supabase: any): Promise<Record<string, string>> {
  const { data: companies } = await supabase.from("companies").select("id, code");
  const map: Record<string, string> = {};
  for (const c of companies || []) {
    if (c.code === "VES") map.ves = c.id;
    if (c.code === "TGW") map.tgw = c.id;
  }
  return map;
}

function getCompanyForMarketplace(map: Record<string, string>, marketplace: string): string | null {
  if (marketplace === "amazon") return map.ves || null;
  return map.tgw || null; // shopify, bestbuy → TGW
}

// Amazon SP-API Token Exchange
async function getAmazonAccessToken(
  clientId: string, clientSecret: string, refreshToken: string
): Promise<string> {
  const response = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Amazon token exchange failed: ${response.status} - ${errText}`);
  }
  return (await response.json()).access_token;
}

// Centralized reconciliation logic
async function reconcilePayoutAgainstSystem(
  supabase: any,
  marketplace: string,
  companyId: string,
  periodStart: string | null,
  periodEnd: string | null,
  payoutDate: string
) {
  const queryStart = periodStart || payoutDate;
  const queryEnd = periodEnd || payoutDate;

  const { data: systemOrders } = await supabase
    .from("sales")
    .select("sale_price, marketplace_fees, shipping_cost, tax_amount")
    .eq("marketplace", marketplace)
    .eq("company_id", companyId)
    .gte("sale_date", queryStart)
    .lte("sale_date", queryEnd);

  const orders = systemOrders || [];
  const systemOrderTotal = orders.reduce((sum: number, s: any) => sum + Number(s.sale_price || 0), 0);
  const systemFeesTotal = orders.reduce((sum: number, s: any) => sum + Number(s.marketplace_fees || 0), 0);
  const systemShippingTotal = orders.reduce((sum: number, s: any) => sum + Number(s.shipping_cost || 0), 0);
  const systemTaxTotal = orders.reduce((sum: number, s: any) => sum + Number(s.tax_amount || 0), 0);

  return {
    systemOrderTotal,
    systemFeesTotal,
    systemShippingTotal,
    systemTaxTotal,
    orderCount: orders.length,
  };
}

function determineReconciliationStatus(netPayout: number, expectedNet: number, threshold = 1): string {
  const discrepancy = netPayout - expectedNet;
  if (Math.abs(discrepancy) < threshold) return "matched";
  return "discrepancy";
}

// Write sync log entry
async function writeSyncLog(
  supabase: any,
  marketplace: string,
  companyId: string,
  synced: number,
  skipped: number,
  errored: number,
  errorMessage?: string
) {
  await supabase.from("sync_logs").insert({
    marketplace,
    company_id: companyId,
    sync_type: "payout_reconciliation",
    status: errored > 0 ? "partial" : "success",
    records_imported: synced,
    records_skipped: skipped,
    records_errored: errored,
    error_message: errorMessage || null,
    completed_at: new Date().toISOString(),
    metadata: { type: "payout_sync" },
  });
}

// ============ SHOPIFY PAYOUTS ============
async function syncShopifyPayouts(supabase: any, companyId: string) {
  const storeUrl = Deno.env.get("SHOPIFY_STORE_URL");
  const token = Deno.env.get("SHOPIFY_ADMIN_API_TOKEN");
  if (!storeUrl || !token) throw new Error("Shopify credentials not configured");

  const cleanUrl = storeUrl.replace(/\/$/, "").replace(/^https?:\/\//, "");
  let synced = 0;
  let skipped = 0;

  let url: string | null = `https://${cleanUrl}/admin/api/2024-01/shopify_payments/payouts.json?limit=50`;

  while (url) {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      console.error("Shopify payouts API error:", res.status, await res.text());
      break;
    }

    const data = await res.json();
    const payouts = data.payouts || [];

    for (const payout of payouts) {
      if (payout.status !== "paid" && payout.status !== "in_transit") { skipped++; continue; }

      const payoutId = String(payout.id);

      // Check if already synced
      const { data: existing } = await supabase
        .from("marketplace_payouts")
        .select("id")
        .eq("marketplace", "shopify")
        .eq("payout_id", payoutId)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      // Get balance transactions for fee breakdown
      const txRes = await fetch(
        `https://${cleanUrl}/admin/api/2024-01/shopify_payments/balance/transactions.json?payout_id=${payoutId}&limit=250`,
        { headers: { "X-Shopify-Access-Token": token } }
      );

      let grossAmount = 0;
      let feesAmount = 0;
      let adjustmentsAmount = 0;

      if (txRes.ok) {
        const txData = await txRes.json();
        for (const tx of txData.transactions || []) {
          const amount = parseFloat(tx.amount || "0");
          const fee = Math.abs(parseFloat(tx.fee || "0"));
          if (tx.type === "charge" || tx.type === "sale") {
            grossAmount += amount + fee;
            feesAmount += fee;
          } else if (tx.type === "refund" || tx.type === "chargeback" || tx.type === "adjustment") {
            adjustmentsAmount += amount;
          }
        }
      }

      const netPayout = parseFloat(payout.amount || "0");
      const payoutDate = payout.date || new Date().toISOString().split("T")[0];

      // Shopify payouts typically cover the period since the last payout
      const periodEnd = payoutDate;
      const periodStart = new Date(new Date(payoutDate).getTime() - 7 * 86400000)
        .toISOString().split("T")[0];

      const recon = await reconcilePayoutAgainstSystem(
        supabase, "shopify", companyId, periodStart, periodEnd, payoutDate
      );

      const expectedNet = recon.systemOrderTotal - recon.systemFeesTotal;
      const discrepancy = netPayout - expectedNet;

      await supabase.from("marketplace_payouts").insert({
        company_id: companyId,
        marketplace: "shopify",
        payout_id: payoutId,
        payout_date: payoutDate,
        period_start: periodStart,
        period_end: periodEnd,
        gross_amount: grossAmount || recon.systemOrderTotal,
        fees_amount: feesAmount || recon.systemFeesTotal,
        adjustments_amount: adjustmentsAmount,
        net_payout: netPayout,
        system_order_total: recon.systemOrderTotal,
        system_fees_total: recon.systemFeesTotal,
        discrepancy_amount: Math.abs(discrepancy) < 0.01 ? 0 : discrepancy,
        reconciliation_status: determineReconciliationStatus(netPayout, expectedNet),
        raw_data: payout,
      });
      synced++;
    }

    // Pagination
    const linkHeader = res.headers.get("link");
    url = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) url = nextMatch[1];
    }
  }

  await writeSyncLog(supabase, "shopify", companyId, synced, skipped, 0);
  return synced;
}

// ============ AMAZON SETTLEMENTS ============
async function syncAmazonPayouts(supabase: any, companyId: string) {
  const clientId = Deno.env.get("AMAZON_CLIENT_ID");
  const clientSecret = Deno.env.get("AMAZON_CLIENT_SECRET");
  const refreshToken = Deno.env.get("AMAZON_REFRESH_TOKEN");
  const sellerId = Deno.env.get("AMAZON_SELLER_ID");

  if (!clientId || !clientSecret || !refreshToken || !sellerId) {
    throw new Error("Amazon credentials not configured");
  }

  const accessToken = await getAmazonAccessToken(clientId, clientSecret, refreshToken);
  let synced = 0;
  let skipped = 0;

  // Get settlement reports (last 90 days)
  const createdAfter = new Date(Date.now() - 90 * 86400000).toISOString();
  const reportsUrl = `https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports?reportTypes=GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE&createdSince=${createdAfter}&pageSize=10`;

  const reportsRes = await fetch(reportsUrl, {
    headers: { "x-amz-access-token": accessToken, "Content-Type": "application/json" },
  });

  if (!reportsRes.ok) {
    const errText = await reportsRes.text();
    console.error("Amazon reports API error:", reportsRes.status, errText);
    await writeSyncLog(supabase, "amazon", companyId, 0, 0, 1, errText);
    return 0;
  }

  const reports = (await reportsRes.json()).reports || [];

  for (const report of reports) {
    if (report.processingStatus !== "DONE") { skipped++; continue; }

    const reportId = report.reportId;

    const { data: existing } = await supabase
      .from("marketplace_payouts")
      .select("id")
      .eq("marketplace", "amazon")
      .eq("payout_id", reportId)
      .maybeSingle();

    if (existing) { skipped++; continue; }

    // Get document URL
    const docRes = await fetch(
      `https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/documents/${report.reportDocumentId}`,
      { headers: { "x-amz-access-token": accessToken } }
    );
    if (!docRes.ok) { skipped++; continue; }

    const docData = await docRes.json();
    const fileRes = await fetch(docData.url);
    if (!fileRes.ok) { skipped++; continue; }

    const fileText = await fileRes.text();
    const lines = fileText.split("\n");
    const headers = lines[0]?.split("\t") || [];

    let totalAmount = 0;
    let totalFees = 0;
    let totalOther = 0;
    let settlementStartDate = "";
    let settlementEndDate = "";

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("\t");
      if (cols.length < 3) continue;

      const amountType = cols[headers.indexOf("amount-type")] || "";
      const amount = parseFloat(cols[headers.indexOf("amount")] || "0");
      const sStart = cols[headers.indexOf("settlement-start-date")] || "";
      const sEnd = cols[headers.indexOf("settlement-end-date")] || "";

      if (sStart && !settlementStartDate) settlementStartDate = sStart.split("T")[0];
      if (sEnd) settlementEndDate = sEnd.split("T")[0];

      if (amountType === "ItemPrice" || amountType === "Promotion") {
        totalAmount += amount;
      } else if (amountType === "ItemFees" || amountType === "Commission") {
        totalFees += Math.abs(amount);
      } else if (amountType === "OtherTransaction" || amountType === "Refund") {
        totalOther += amount;
      }
    }

    const netPayout = totalAmount - totalFees + totalOther;
    const payoutDate = settlementEndDate || report.createdTime?.split("T")[0] || new Date().toISOString().split("T")[0];

    const recon = await reconcilePayoutAgainstSystem(
      supabase, "amazon", companyId, settlementStartDate || null, settlementEndDate || null, payoutDate
    );

    const expectedNet = recon.systemOrderTotal - recon.systemFeesTotal;
    const discrepancy = netPayout - expectedNet;

    await supabase.from("marketplace_payouts").insert({
      company_id: companyId,
      marketplace: "amazon",
      payout_id: reportId,
      payout_date: payoutDate,
      period_start: settlementStartDate || null,
      period_end: settlementEndDate || null,
      gross_amount: totalAmount,
      fees_amount: totalFees,
      adjustments_amount: totalOther,
      net_payout: netPayout,
      system_order_total: recon.systemOrderTotal,
      system_fees_total: recon.systemFeesTotal,
      discrepancy_amount: Math.abs(discrepancy) < 0.01 ? 0 : discrepancy,
      reconciliation_status: determineReconciliationStatus(netPayout, expectedNet),
      raw_data: { reportId, settlementStartDate, settlementEndDate, totalAmount, totalFees, totalOther },
    });
    synced++;
  }

  await writeSyncLog(supabase, "amazon", companyId, synced, skipped, 0);
  return synced;
}

// ============ BEST BUY (MIRAKL) PAYOUTS ============
async function syncBestBuyPayouts(supabase: any, companyId: string) {
  const apiKey = Deno.env.get("BESTBUY_API_KEY");
  if (!apiKey) throw new Error("Best Buy API key not configured");

  let synced = 0;
  let skipped = 0;
  const baseUrl = "https://marketplace.bestbuy.ca/api";

  // Fetch accounting documents (Mirakl PA11)
  const acctRes = await fetch(`${baseUrl}/payment/accounting_document?max=20`, {
    headers: { Authorization: apiKey, Accept: "application/json" },
  });

  if (!acctRes.ok) {
    const errText = await acctRes.text();
    console.error("Best Buy payouts API error:", acctRes.status, errText);
    await writeSyncLog(supabase, "bestbuy", companyId, 0, 0, 1, errText);
    return 0;
  }

  const acctData = await acctRes.json();
  const docs = acctData.accounting_documents || [];

  for (const doc of docs) {
    const payoutId = String(doc.accounting_document_id || doc.id || Date.now());

    const { data: existing } = await supabase
      .from("marketplace_payouts")
      .select("id")
      .eq("marketplace", "bestbuy")
      .eq("payout_id", payoutId)
      .maybeSingle();

    if (existing) { skipped++; continue; }

    const startDate = doc.start_date?.split("T")[0] || null;
    const endDate = doc.end_date?.split("T")[0] || null;
    const payoutDate = doc.date_created?.split("T")[0] || endDate || new Date().toISOString().split("T")[0];

    const totalAmount = parseFloat(doc.total_amount_credited || doc.total_orders_amount || "0");
    const totalFees = Math.abs(parseFloat(doc.total_commission_amount || "0"));
    const adjustments = parseFloat(doc.total_refunds_amount || "0");
    const netPayout = parseFloat(doc.balance || doc.total_amount || "0") || (totalAmount - totalFees + adjustments);

    const recon = await reconcilePayoutAgainstSystem(
      supabase, "bestbuy", companyId, startDate, endDate, payoutDate
    );

    const expectedNet = recon.systemOrderTotal - recon.systemFeesTotal;
    const discrepancy = netPayout - expectedNet;

    await supabase.from("marketplace_payouts").insert({
      company_id: companyId,
      marketplace: "bestbuy",
      payout_id: payoutId,
      payout_date: payoutDate,
      period_start: startDate,
      period_end: endDate,
      gross_amount: totalAmount,
      fees_amount: totalFees,
      adjustments_amount: adjustments,
      net_payout: netPayout,
      system_order_total: recon.systemOrderTotal,
      system_fees_total: recon.systemFeesTotal,
      discrepancy_amount: Math.abs(discrepancy) < 0.01 ? 0 : discrepancy,
      reconciliation_status: determineReconciliationStatus(netPayout, expectedNet),
      raw_data: doc,
    });
    synced++;
  }

  await writeSyncLog(supabase, "bestbuy", companyId, synced, skipped, 0);
  return synced;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let marketplace = "all";
    let overrideCompanyId: string | null = null;

    try {
      const body = await req.json();
      marketplace = body.marketplace || "all";
      overrideCompanyId = body.company_id || null;
    } catch { /* no body or cron trigger */ }

    // Build company map
    const companyMap = await getCompanyMap(supabase);
    console.log("Company map:", JSON.stringify(companyMap));

    const results: Record<string, { synced: number; error?: string }> = {};

    // Shopify → TGW
    if (marketplace === "all" || marketplace === "shopify") {
      const cid = overrideCompanyId || getCompanyForMarketplace(companyMap, "shopify");
      if (cid) {
        try {
          results.shopify = { synced: await syncShopifyPayouts(supabase, cid) };
        } catch (err) {
          console.error("Shopify payout sync error:", err);
          results.shopify = { synced: 0, error: err.message };
          await writeSyncLog(supabase, "shopify", cid, 0, 0, 1, err.message);
        }
      } else {
        results.shopify = { synced: 0, error: "No TGW company found" };
      }
    }

    // Amazon → VES
    if (marketplace === "all" || marketplace === "amazon") {
      const cid = overrideCompanyId || getCompanyForMarketplace(companyMap, "amazon");
      if (cid) {
        try {
          results.amazon = { synced: await syncAmazonPayouts(supabase, cid) };
        } catch (err) {
          console.error("Amazon payout sync error:", err);
          results.amazon = { synced: 0, error: err.message };
          await writeSyncLog(supabase, "amazon", cid, 0, 0, 1, err.message);
        }
      } else {
        results.amazon = { synced: 0, error: "No VES company found" };
      }
    }

    // Best Buy → TGW
    if (marketplace === "all" || marketplace === "bestbuy") {
      const cid = overrideCompanyId || getCompanyForMarketplace(companyMap, "bestbuy");
      if (cid) {
        try {
          results.bestbuy = { synced: await syncBestBuyPayouts(supabase, cid) };
        } catch (err) {
          console.error("Best Buy payout sync error:", err);
          results.bestbuy = { synced: 0, error: err.message };
          await writeSyncLog(supabase, "bestbuy", cid, 0, 0, 1, err.message);
        }
      } else {
        results.bestbuy = { synced: 0, error: "No TGW company found" };
      }
    }

    console.log("Payout sync results:", JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Payout sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
