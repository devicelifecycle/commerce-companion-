import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Amazon SP-API Token Exchange
async function getAmazonAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
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
  if (!response.ok) throw new Error(`Amazon token exchange failed: ${response.status}`);
  const data = await response.json();
  return data.access_token;
}

// ============ SHOPIFY PAYOUTS ============
async function syncShopifyPayouts(supabase: any, companyId: string) {
  const storeUrl = Deno.env.get("SHOPIFY_STORE_URL");
  const token = Deno.env.get("SHOPIFY_ADMIN_API_TOKEN");
  if (!storeUrl || !token) throw new Error("Shopify credentials not configured");

  const cleanUrl = storeUrl.replace(/\/$/, "").replace(/^https?:\/\//, "");
  let synced = 0;

  // Fetch payouts from Shopify Payouts API
  let url = `https://${cleanUrl}/admin/api/2024-01/shopify_payments/payouts.json?limit=50`;
  
  while (url) {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Shopify payouts API error:", res.status, errText);
      break;
    }

    const data = await res.json();
    const payouts = data.payouts || [];

    for (const payout of payouts) {
      if (payout.status !== "paid" && payout.status !== "in_transit") continue;

      const payoutId = String(payout.id);
      
      // Check if already synced
      const { data: existing } = await supabase
        .from("marketplace_payouts")
        .select("id")
        .eq("marketplace", "shopify")
        .eq("payout_id", payoutId)
        .maybeSingle();
      
      if (existing) continue;

      // Get payout transactions to compute breakdown
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
            grossAmount += amount + fee; // gross before fee
            feesAmount += fee;
          } else if (tx.type === "refund" || tx.type === "chargeback" || tx.type === "adjustment") {
            adjustmentsAmount += amount;
          }
        }
      }

      const netPayout = parseFloat(payout.amount || "0");
      const payoutDate = payout.date || new Date().toISOString().split("T")[0];

      // Reconcile against system orders for this payout period
      // Use a 7-day lookback as Shopify payouts typically cover a few days
      const periodEnd = payoutDate;
      const periodStart = new Date(new Date(payoutDate).getTime() - 7 * 86400000)
        .toISOString().split("T")[0];

      const { data: systemOrders } = await supabase
        .from("sales")
        .select("sale_price, marketplace_fees")
        .eq("marketplace", "shopify")
        .eq("company_id", companyId)
        .gte("sale_date", periodStart)
        .lte("sale_date", periodEnd);

      const systemOrderTotal = (systemOrders || []).reduce(
        (sum: number, s: any) => sum + Number(s.sale_price || 0), 0
      );
      const systemFeesTotal = (systemOrders || []).reduce(
        (sum: number, s: any) => sum + Number(s.marketplace_fees || 0), 0
      );
      const expectedNet = systemOrderTotal - systemFeesTotal;
      const discrepancy = netPayout - expectedNet;

      await supabase.from("marketplace_payouts").insert({
        company_id: companyId,
        marketplace: "shopify",
        payout_id: payoutId,
        payout_date: payoutDate,
        period_start: periodStart,
        period_end: periodEnd,
        gross_amount: grossAmount || systemOrderTotal,
        fees_amount: feesAmount || systemFeesTotal,
        adjustments_amount: adjustmentsAmount,
        net_payout: netPayout,
        system_order_total: systemOrderTotal,
        system_fees_total: systemFeesTotal,
        discrepancy_amount: Math.abs(discrepancy) < 0.01 ? 0 : discrepancy,
        reconciliation_status: Math.abs(discrepancy) < 1 ? "matched" : "discrepancy",
        raw_data: payout,
      });
      synced++;
    }

    // Pagination via Link header
    const linkHeader = res.headers.get("link");
    url = "";
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) url = nextMatch[1];
    }
  }

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

  // Get settlement reports list (last 90 days)
  const createdAfter = new Date(Date.now() - 90 * 86400000).toISOString();
  const reportsUrl = `https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports?reportTypes=GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE&createdSince=${createdAfter}&pageSize=10`;

  const reportsRes = await fetch(reportsUrl, {
    headers: {
      "x-amz-access-token": accessToken,
      "Content-Type": "application/json",
    },
  });

  if (!reportsRes.ok) {
    const errText = await reportsRes.text();
    console.error("Amazon reports API error:", reportsRes.status, errText);
    return 0;
  }

  const reportsData = await reportsRes.json();
  const reports = reportsData.reports || [];

  for (const report of reports) {
    if (report.processingStatus !== "DONE") continue;
    
    const reportId = report.reportId;
    
    // Check if already synced
    const { data: existing } = await supabase
      .from("marketplace_payouts")
      .select("id")
      .eq("marketplace", "amazon")
      .eq("payout_id", reportId)
      .maybeSingle();

    if (existing) continue;

    // Get document URL
    const docRes = await fetch(
      `https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/documents/${report.reportDocumentId}`,
      { headers: { "x-amz-access-token": accessToken } }
    );

    if (!docRes.ok) continue;
    const docData = await docRes.json();

    // Download and parse settlement data
    const fileRes = await fetch(docData.url);
    if (!fileRes.ok) continue;
    const fileText = await fileRes.text();

    // Parse TSV settlement file
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
      const settlementStart = cols[headers.indexOf("settlement-start-date")] || "";
      const settlementEnd = cols[headers.indexOf("settlement-end-date")] || "";

      if (settlementStart && !settlementStartDate) settlementStartDate = settlementStart.split("T")[0];
      if (settlementEnd) settlementEndDate = settlementEnd.split("T")[0];

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

    // Reconcile against system
    const { data: systemOrders } = await supabase
      .from("sales")
      .select("sale_price, marketplace_fees")
      .eq("marketplace", "amazon")
      .eq("company_id", companyId)
      .gte("sale_date", settlementStartDate || payoutDate)
      .lte("sale_date", settlementEndDate || payoutDate);

    const systemOrderTotal = (systemOrders || []).reduce(
      (sum: number, s: any) => sum + Number(s.sale_price || 0), 0
    );
    const systemFeesTotal = (systemOrders || []).reduce(
      (sum: number, s: any) => sum + Number(s.marketplace_fees || 0), 0
    );
    const expectedNet = systemOrderTotal - systemFeesTotal;
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
      system_order_total: systemOrderTotal,
      system_fees_total: systemFeesTotal,
      discrepancy_amount: Math.abs(discrepancy) < 0.01 ? 0 : discrepancy,
      reconciliation_status: Math.abs(discrepancy) < 1 ? "matched" : "discrepancy",
      raw_data: { reportId, settlementStartDate, settlementEndDate, totalAmount, totalFees, totalOther },
    });
    synced++;
  }

  return synced;
}

// ============ BEST BUY (MIRAKL) PAYOUTS ============
async function syncBestBuyPayouts(supabase: any, companyId: string) {
  const apiKey = Deno.env.get("BESTBUY_API_KEY");
  if (!apiKey) throw new Error("Best Buy API key not configured");

  let synced = 0;
  const baseUrl = "https://marketplace.bestbuy.ca/api";

  // Fetch accounting documents (PA11 - Mirakl accounting docs)
  const res = await fetch(`${baseUrl}/payment/debit?max=50`, {
    headers: { Authorization: apiKey, Accept: "application/json" },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Best Buy payouts API error:", res.status, errText);
    return 0;
  }

  const data = await res.json();
  const debits = data.orders || data.data || [];

  // Alternatively try accounting documents endpoint
  const acctRes = await fetch(`${baseUrl}/payment/accounting_document?max=20`, {
    headers: { Authorization: apiKey, Accept: "application/json" },
  });

  if (acctRes.ok) {
    const acctData = await acctRes.json();
    const docs = acctData.accounting_documents || [];

    for (const doc of docs) {
      const payoutId = doc.accounting_document_id || doc.id || String(Date.now());

      const { data: existing } = await supabase
        .from("marketplace_payouts")
        .select("id")
        .eq("marketplace", "bestbuy")
        .eq("payout_id", String(payoutId))
        .maybeSingle();

      if (existing) continue;

      const startDate = doc.start_date?.split("T")[0];
      const endDate = doc.end_date?.split("T")[0];
      const payoutDate = doc.date_created?.split("T")[0] || endDate || new Date().toISOString().split("T")[0];

      const totalAmount = parseFloat(doc.total_amount_credited || doc.total_orders_amount || "0");
      const totalFees = Math.abs(parseFloat(doc.total_commission_amount || "0"));
      const adjustments = parseFloat(doc.total_refunds_amount || "0");
      const netPayout = parseFloat(doc.balance || doc.total_amount || "0") || (totalAmount - totalFees + adjustments);

      // Reconcile
      const queryStart = startDate || payoutDate;
      const queryEnd = endDate || payoutDate;

      const { data: systemOrders } = await supabase
        .from("sales")
        .select("sale_price, marketplace_fees")
        .eq("marketplace", "bestbuy")
        .eq("company_id", companyId)
        .gte("sale_date", queryStart)
        .lte("sale_date", queryEnd);

      const systemOrderTotal = (systemOrders || []).reduce(
        (sum: number, s: any) => sum + Number(s.sale_price || 0), 0
      );
      const systemFeesTotal = (systemOrders || []).reduce(
        (sum: number, s: any) => sum + Number(s.marketplace_fees || 0), 0
      );
      const expectedNet = systemOrderTotal - systemFeesTotal;
      const discrepancy = netPayout - expectedNet;

      await supabase.from("marketplace_payouts").insert({
        company_id: companyId,
        marketplace: "bestbuy",
        payout_id: String(payoutId),
        payout_date: payoutDate,
        period_start: startDate || null,
        period_end: endDate || null,
        gross_amount: totalAmount,
        fees_amount: totalFees,
        adjustments_amount: adjustments,
        net_payout: netPayout,
        system_order_total: systemOrderTotal,
        system_fees_total: systemFeesTotal,
        discrepancy_amount: Math.abs(discrepancy) < 0.01 ? 0 : discrepancy,
        reconciliation_status: Math.abs(discrepancy) < 1 ? "matched" : "discrepancy",
        raw_data: doc,
      });
      synced++;
    }
  }

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

    // Get body params
    let marketplace = "all";
    let companyId: string | null = null;
    
    try {
      const body = await req.json();
      marketplace = body.marketplace || "all";
      companyId = body.company_id || null;
    } catch { /* no body */ }

    // Get default company if not specified
    if (!companyId) {
      const { data: companies } = await supabase
        .from("companies")
        .select("id")
        .limit(1);
      companyId = companies?.[0]?.id || null;
    }

    if (!companyId) {
      return new Response(
        JSON.stringify({ error: "No company found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Record<string, { synced: number; error?: string }> = {};

    if (marketplace === "all" || marketplace === "shopify") {
      try {
        const synced = await syncShopifyPayouts(supabase, companyId);
        results.shopify = { synced };
      } catch (err) {
        console.error("Shopify payout sync error:", err);
        results.shopify = { synced: 0, error: err.message };
      }
    }

    if (marketplace === "all" || marketplace === "amazon") {
      try {
        const synced = await syncAmazonPayouts(supabase, companyId);
        results.amazon = { synced };
      } catch (err) {
        console.error("Amazon payout sync error:", err);
        results.amazon = { synced: 0, error: err.message };
      }
    }

    if (marketplace === "all" || marketplace === "bestbuy") {
      try {
        const synced = await syncBestBuyPayouts(supabase, companyId);
        results.bestbuy = { synced };
      } catch (err) {
        console.error("Best Buy payout sync error:", err);
        results.bestbuy = { synced: 0, error: err.message };
      }
    }

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
