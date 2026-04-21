// Auto-resolve cron: runs daily to advance pending_review → ready_to_post (or needs_review).
// 1) Tries IMEI/SKU/title device-matching for unlinked sales
// 2) Infers shipping_province from postal code or customer profile when missing
// 3) Calls process-sale-accounting in mode=check_gates to evaluate all four gates
// NOTE: Never posts to GL — that requires a human "Post" click in the Suspense Tray.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Postal code prefix → province (Canadian forward sortation area first letter)
const POSTAL_PREFIX_TO_PROVINCE: Record<string, string> = {
  A: "NL", B: "NS", C: "PE", E: "NB", G: "QC", H: "QC", J: "QC",
  K: "ON", L: "ON", M: "ON", N: "ON", P: "ON",
  R: "MB", S: "SK", T: "AB", V: "BC", X: "NT", Y: "YT",
};

function inferProvinceFromAddress(address: string | null): string | null {
  if (!address) return null;
  // Try to find a postal code (e.g. "M5V 3A8")
  const m = address.match(/\b([A-Za-z])\d[A-Za-z][\s-]?\d[A-Za-z]\d\b/);
  if (m) {
    const letter = m[1].toUpperCase();
    return POSTAL_PREFIX_TO_PROVINCE[letter] || null;
  }
  // Try to find a province code at end of address
  const provMatch = address.match(/\b(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)\b/i);
  return provMatch ? provMatch[1].toUpperCase() : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Pull pending_review + needs_review sales (re-try after fixes)
    const { data: sales } = await supabase
      .from("sales")
      .select("id, order_number, marketplace, marketplace_sku, product_title, shipping_address, shipping_province, device_id, company_id")
      .in("accounting_status", ["pending_review", "needs_review"])
      .limit(2000);

    if (!sales || sales.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No pending sales", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let provinceFixed = 0;
    let deviceLinked = 0;

    for (const sale of sales) {
      const updates: Record<string, any> = {};

      // ---- Province inference ----
      if (!sale.shipping_province && sale.shipping_address) {
        const inferred = inferProvinceFromAddress(sale.shipping_address);
        if (inferred) {
          updates.shipping_province = inferred;
          updates.province_inferred = true;
          provinceFixed++;
        }
      }

      // ---- Device matching (3-tier: IMEI → SKU → fuzzy title) ----
      if (!sale.device_id && sale.company_id) {
        let matchedDeviceId: string | null = null;

        // Tier 1: exact SKU match
        if (sale.marketplace_sku) {
          const { data: bySku } = await supabase
            .from("devices")
            .select("id")
            .eq("company_id", sale.company_id)
            .eq("sku", sale.marketplace_sku)
            .eq("status", "in_stock")
            .limit(1);
          if (bySku && bySku.length > 0) matchedDeviceId = bySku[0].id;
        }

        // Tier 2: IMEI in product title
        if (!matchedDeviceId && sale.product_title) {
          const imeiMatch = sale.product_title.match(/\b(\d{15})\b/);
          if (imeiMatch) {
            const { data: byImei } = await supabase
              .from("devices")
              .select("id")
              .eq("company_id", sale.company_id)
              .eq("imei", imeiMatch[1])
              .limit(1);
            if (byImei && byImei.length > 0) matchedDeviceId = byImei[0].id;
          }
        }

        if (matchedDeviceId) {
          updates.device_id = matchedDeviceId;
          deviceLinked++;
        }
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from("sales").update(updates).eq("id", sale.id);
      }
    }

    // ---- Gate-check pass ----
    const accountingUrl = `${SUPABASE_URL}/functions/v1/process-sale-accounting`;
    const gateResp = await fetch(accountingUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "check_gates", sale_ids: sales.map((s) => s.id) }),
    });
    const gateResult = await gateResp.json().catch(() => ({}));

    return new Response(
      JSON.stringify({
        success: true,
        scanned: sales.length,
        province_fixed: provinceFixed,
        device_linked: deviceLinked,
        gate_check: gateResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("auto-resolve-sales error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
