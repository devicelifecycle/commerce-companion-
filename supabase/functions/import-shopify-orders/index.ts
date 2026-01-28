import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SHOPIFY_STORE_URL = Deno.env.get("SHOPIFY_STORE_URL");
    const SHOPIFY_ADMIN_API_TOKEN = Deno.env.get("SHOPIFY_ADMIN_API_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SHOPIFY_STORE_URL || !SHOPIFY_ADMIN_API_TOKEN) {
      throw new Error("Shopify credentials not configured");
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Calculate date 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const createdAtMin = sevenDaysAgo.toISOString();

    console.log(`Fetching Shopify orders since ${createdAtMin}`);

    // Build Shopify API URL - handle different URL formats
    let shopifyBaseUrl = SHOPIFY_STORE_URL.trim();
    if (!shopifyBaseUrl.startsWith("https://")) {
      shopifyBaseUrl = `https://${shopifyBaseUrl}`;
    }
    if (!shopifyBaseUrl.includes(".myshopify.com")) {
      shopifyBaseUrl = shopifyBaseUrl.replace(/\/$/, "") + ".myshopify.com";
    }
    shopifyBaseUrl = shopifyBaseUrl.replace(/\/$/, "");

    const ordersUrl = `${shopifyBaseUrl}/admin/api/2024-01/orders.json?status=any&created_at_min=${createdAtMin}&limit=250`;

    console.log(`Calling Shopify API: ${ordersUrl}`);

    const response = await fetch(ordersUrl, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_TOKEN,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Shopify API error: ${response.status} - ${errorText}`);
      throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const orders = data.orders || [];

    console.log(`Found ${orders.length} orders from Shopify`);

    const importedOrders: string[] = [];
    const skippedOrders: string[] = [];
    const errors: string[] = [];

    for (const order of orders) {
      try {
        // Check if order already exists
        const { data: existingOrder } = await supabase
          .from("sales")
          .select("id")
          .eq("order_number", `SHOP-${order.order_number}`)
          .maybeSingle();

        if (existingOrder) {
          skippedOrders.push(`SHOP-${order.order_number}`);
          continue;
        }

        // Calculate values
        const salePrice = parseFloat(order.total_price || "0");
        const shippingCost = order.shipping_lines?.reduce(
          (sum: number, line: any) => sum + parseFloat(line.price || "0"),
          0
        ) || 0;
        const taxAmount = parseFloat(order.total_tax || "0");
        
        // Estimate marketplace fees (Shopify Payments ~2.9% + $0.30)
        const marketplaceFees = salePrice * 0.029 + 0.30;

        // Build customer address
        const shippingAddress = order.shipping_address
          ? [
              order.shipping_address.address1,
              order.shipping_address.address2,
              `${order.shipping_address.city}, ${order.shipping_address.province} ${order.shipping_address.zip}`,
              order.shipping_address.country,
            ]
              .filter(Boolean)
              .join("\n")
          : null;

        // Build notes with line items
        const lineItemsStr = order.line_items
          ?.map((item: any) => `${item.name} (x${item.quantity})`)
          .join(", ") || "";

        const notes = `Shopify Order #${order.order_number} | ${lineItemsStr}`;

        // Try to match device by SKU/IMEI
        let deviceId = null;
        for (const item of order.line_items || []) {
          if (item.sku) {
            const { data: device } = await supabase
              .from("devices")
              .select("id")
              .eq("imei", item.sku)
              .eq("status", "in_stock")
              .maybeSingle();

            if (device) {
              deviceId = device.id;
              break;
            }
          }
        }

        // Insert the sale
        const { error: insertError } = await supabase.from("sales").insert({
          order_number: `SHOP-${order.order_number}`,
          marketplace: "shopify",
          sale_price: salePrice,
          shipping_cost: shippingCost,
          marketplace_fees: parseFloat(marketplaceFees.toFixed(2)),
          tax_amount: taxAmount,
          sale_date: order.created_at,
          customer_name: order.customer?.first_name
            ? `${order.customer.first_name} ${order.customer.last_name || ""}`.trim()
            : null,
          customer_email: order.customer?.email || null,
          shipping_address: shippingAddress,
          notes: notes,
          device_id: deviceId,
        });

        if (insertError) {
          console.error(`Error inserting order ${order.order_number}:`, insertError);
          errors.push(`SHOP-${order.order_number}: ${insertError.message}`);
        } else {
          importedOrders.push(`SHOP-${order.order_number}`);
        }
      } catch (orderError: any) {
        console.error(`Error processing order ${order.order_number}:`, orderError);
        errors.push(`SHOP-${order.order_number}: ${orderError.message}`);
      }
    }

    console.log(`Import complete: ${importedOrders.length} imported, ${skippedOrders.length} skipped, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        imported: importedOrders.length,
        skipped: skippedOrders.length,
        errors: errors.length,
        details: {
          imported: importedOrders,
          skipped: skippedOrders,
          errors: errors,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Import error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
