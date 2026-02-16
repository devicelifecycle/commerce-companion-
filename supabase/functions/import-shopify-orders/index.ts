import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function upsertCustomer(
  supabase: any,
  customerName: string | null,
  customerEmail: string | null,
  customerPhone: string | null,
  customerAddress: string | null,
  companyId: string,
  marketplace: string,
  saleAmount: number
): Promise<string | null> {
  if (!customerName) return null;

  try {
    let existingCustomer = null;
    if (customerEmail) {
      const { data } = await supabase
        .from("customers")
        .select("id, total_spent, total_purchases")
        .eq("email", customerEmail)
        .eq("company_id", companyId)
        .maybeSingle();
      existingCustomer = data;
    }

    if (!existingCustomer) {
      const { data } = await supabase
        .from("customers")
        .select("id, total_spent, total_purchases")
        .eq("name", customerName)
        .eq("company_id", companyId)
        .maybeSingle();
      existingCustomer = data;
    }

    if (existingCustomer) {
      const updates: any = {
        total_spent: (existingCustomer.total_spent || 0) + saleAmount,
        total_purchases: (existingCustomer.total_purchases || 0) + 1,
      };
      if (customerEmail) updates.email = customerEmail;
      if (customerPhone) updates.phone = customerPhone;
      if (customerAddress) updates.address = customerAddress;

      await supabase
        .from("customers")
        .update(updates)
        .eq("id", existingCustomer.id);

      return existingCustomer.id;
    } else {
      const { data: newCustomer, error } = await supabase
        .from("customers")
        .insert({
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
          address: customerAddress,
          company_id: companyId,
          marketplace_source: marketplace,
          total_spent: saleAmount,
          total_purchases: 1,
        })
        .select("id")
        .single();

      if (error) {
        console.error("Error creating customer:", error);
        return null;
      }
      return newCustomer?.id || null;
    }
  } catch (err) {
    console.error("Error upserting customer:", err);
    return null;
  }
}

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

    // Get TGW company ID (Shopify is for TGW)
    const { data: tgwCompany, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("code", "TGW")
      .single();

    if (companyError || !tgwCompany) {
      throw new Error("TGW company not found");
    }

    const companyId = tgwCompany.id;
    console.log(`Using TGW company ID: ${companyId}`);

    // Calculate date 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const createdAtMin = sevenDaysAgo.toISOString();

    console.log(`Fetching Shopify orders since ${createdAtMin}`);

    // Build Shopify API URL
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
          // Backfill customer data on existing orders
          const customerName = order.customer?.first_name
            ? `${order.customer.first_name} ${order.customer.last_name || ""}`.trim()
            : null;
          const customerEmail = order.customer?.email || order.email || null;
          const customerPhone = order.customer?.phone || order.shipping_address?.phone || null;
          const shippingAddress = order.shipping_address
            ? [order.shipping_address.address1, order.shipping_address.address2,
               `${order.shipping_address.city}, ${order.shipping_address.province} ${order.shipping_address.zip}`,
               order.shipping_address.country].filter(Boolean).join("\n")
            : null;

          if (customerName || customerEmail || shippingAddress) {
            const updates: any = {};
            if (customerEmail) updates.customer_email = customerEmail;
            if (shippingAddress) updates.shipping_address = shippingAddress;
            if (customerName) updates.customer_name = customerName;
            await supabase.from("sales").update(updates).eq("order_number", `SHOP-${order.order_number}`);
            await upsertCustomer(supabase, customerName, customerEmail, customerPhone, shippingAddress, companyId, "shopify", 0);
          }
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

        // Customer info
        const customerName = order.customer?.first_name
          ? `${order.customer.first_name} ${order.customer.last_name || ""}`.trim()
          : null;
        const customerEmail = order.customer?.email || order.email || null;
        const customerPhone = order.customer?.phone || order.shipping_address?.phone || null;

        // Upsert customer
        const customerId = await upsertCustomer(
          supabase,
          customerName,
          customerEmail,
          customerPhone,
          shippingAddress,
          companyId,
          "shopify",
          salePrice
        );

        // Build notes with line items
        const lineItemsStr = order.line_items
          ?.map((item: any) => `${item.name} (x${item.quantity})`)
          .join(", ") || "";

        // Determine order status
        let status = "pending";
        if (order.cancelled_at) {
          status = "cancelled";
        } else if (order.refunds && order.refunds.length > 0) {
          status = "refunded";
        } else if (order.fulfillment_status === "fulfilled") {
          status = "delivered";
        } else if (order.fulfillment_status === "partial") {
          status = "shipped";
        }

        const province = order.shipping_address?.province_code || 
                        order.billing_address?.province_code || null;

        const notes = `Shopify Order #${order.order_number} | Status: ${status} | Province: ${province || 'N/A'} | ${lineItemsStr}`;

        // Try to match device by SKU/IMEI
        let deviceId = null;
        for (const item of order.line_items || []) {
          if (item.sku) {
            const { data: device } = await supabase
              .from("devices")
              .select("id")
              .eq("imei", item.sku)
              .eq("status", "in_stock")
              .eq("company_id", companyId)
              .maybeSingle();

            if (device) {
              deviceId = device.id;
              break;
            }
          }
        }

        // Insert the sale with customer_id
        const { error: insertError } = await supabase.from("sales").insert({
          order_number: `SHOP-${order.order_number}`,
          marketplace: "shopify",
          sale_price: salePrice,
          shipping_cost: shippingCost,
          marketplace_fees: parseFloat(marketplaceFees.toFixed(2)),
          tax_amount: taxAmount,
          sale_date: order.created_at,
          customer_name: customerName,
          customer_email: customerEmail,
          shipping_address: shippingAddress,
          notes: notes,
          device_id: deviceId,
          company_id: companyId,
          customer_id: customerId,
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

    // Trigger accounting processor for newly imported sales
    let accountingResult = null;
    if (importedOrders.length > 0) {
      try {
        const accountingUrl = `${SUPABASE_URL}/functions/v1/process-sale-accounting`;
        const accountingResponse = await fetch(accountingUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        accountingResult = await accountingResponse.json();
        console.log("Accounting processor result:", accountingResult);
      } catch (accError: any) {
        console.error("Accounting processor error:", accError.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        company: "TGW",
        imported: importedOrders.length,
        skipped: skippedOrders.length,
        errors: errors.length,
        accounting: accountingResult,
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
