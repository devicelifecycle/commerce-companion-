import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateSchema, raiseSchemaAlert } from "../_shared/schemaValidator.ts";

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
// Build a human-readable marketplace status from Shopify order fields
function buildShopifyStatus(order: any): string {
  if (order.cancelled_at) return "Cancelled";
  
  const financial = order.financial_status || "pending";
  const fulfillment = order.fulfillment_status || "unfulfilled";
  
  // Combine both dimensions into a single readable status
  const financialLabel = financial.charAt(0).toUpperCase() + financial.slice(1).replace(/_/g, ' ');
  const fulfillmentLabel = fulfillment === "unfulfilled" ? "Unfulfilled" 
    : fulfillment.charAt(0).toUpperCase() + fulfillment.slice(1).replace(/_/g, ' ');
  
  return `${financialLabel} / ${fulfillmentLabel}`;
}

// Map Shopify status to internal fulfillment_status
function mapShopifyToFulfillment(order: any): string {
  if (order.cancelled_at) return "cancelled";
  if (order.fulfillment_status === "fulfilled") return "delivered";
  if (order.fulfillment_status === "partial") return "shipped";
  if (order.refunds && order.refunds.length > 0) return "cancelled";
  if (order.financial_status === "voided") return "cancelled";
  if (order.financial_status === "paid" || order.financial_status === "authorized") return "pending";
  return "received";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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

    const SHOPIFY_STORE_URL = Deno.env.get("SHOPIFY_STORE_URL");
    const SHOPIFY_ADMIN_API_TOKEN = Deno.env.get("SHOPIFY_ADMIN_API_TOKEN");

    if (!SHOPIFY_STORE_URL || !SHOPIFY_ADMIN_API_TOKEN) {
      throw new Error("Shopify credentials not configured");
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
      throw new Error("Failed to fetch orders from marketplace");
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
          // Backfill customer data and sync marketplace status on existing orders
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

          // Build marketplace status string from Shopify fields
          const shopifyMarketplaceStatus = buildShopifyStatus(order);

          const updates: any = { marketplace_status: shopifyMarketplaceStatus };
          if (customerEmail) updates.customer_email = customerEmail;
          if (shippingAddress) updates.shipping_address = shippingAddress;
          if (customerName) updates.customer_name = customerName;
          
          // Also sync fulfillment_status from marketplace
          updates.fulfillment_status = mapShopifyToFulfillment(order);

          await supabase.from("sales").update(updates).eq("order_number", `SHOP-${order.order_number}`);
          await upsertCustomer(supabase, customerName, customerEmail, customerPhone, shippingAddress, companyId, "shopify", 0);
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
        
        // Extract actual transaction fees from Shopify order transactions
        let marketplaceFees = 0;
        try {
          const txnUrl = `${shopifyBaseUrl}/admin/api/2024-01/orders/${order.id}/transactions.json`;
          const txnResponse = await fetch(txnUrl, {
            headers: {
              "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_TOKEN,
              "Content-Type": "application/json",
            },
          });
          if (txnResponse.ok) {
            const txnData = await txnResponse.json();
            const transactions = txnData.transactions || [];
            // Sum all receipt.fee values from successful transactions
            for (const txn of transactions) {
              if (txn.status === "success" && txn.receipt?.fee) {
                marketplaceFees += parseFloat(txn.receipt.fee);
              }
            }
            // Also check for fees in the transaction fee field
            if (marketplaceFees === 0) {
              for (const txn of transactions) {
                if (txn.status === "success" && txn.fees) {
                  marketplaceFees += parseFloat(txn.fees);
                }
              }
            }
          }
        } catch (feeErr) {
          console.warn(`Could not fetch transaction fees for order ${order.order_number}:`, feeErr);
        }
        // Fallback to estimate if no actual fee data
        if (marketplaceFees === 0) {
          marketplaceFees = salePrice * 0.029 + 0.30;
        }

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

        // Build marketplace-specific status
        const shopifyMarketplaceStatus = buildShopifyStatus(order);
        const fulfillmentStatus = mapShopifyToFulfillment(order);

        const province = order.shipping_address?.province_code || 
                        order.billing_address?.province_code || null;

        const notes = `Shopify Order #${order.order_number} | Status: ${shopifyMarketplaceStatus} | Province: ${province || 'N/A'} | ${lineItemsStr}`;

        // Try to match device by SKU/IMEI with multiple fallback strategies
        let deviceId = null;
        for (const item of order.line_items || []) {
          if (item.sku) {
            // Strategy 1: Match by IMEI
            const { data: deviceByImei } = await supabase
              .from("devices")
              .select("id")
              .eq("imei", item.sku)
              .eq("status", "in_stock")
              .eq("company_id", companyId)
              .maybeSingle();

            if (deviceByImei) {
              deviceId = deviceByImei.id;
              console.log(`Matched device ${deviceByImei.id} by IMEI for SKU ${item.sku}`);
              break;
            }

            // Strategy 2: Match by SKU field
            const { data: deviceBySku } = await supabase
              .from("devices")
              .select("id")
              .eq("sku", item.sku)
              .eq("status", "in_stock")
              .eq("company_id", companyId)
              .maybeSingle();

            if (deviceBySku) {
              deviceId = deviceBySku.id;
              console.log(`Matched device ${deviceBySku.id} by SKU for ${item.sku}`);
              break;
            }

            // Strategy 3: Match by model name from item title
            if (item.name) {
              const { data: deviceByModel } = await supabase
                .from("devices")
                .select("id")
                .ilike("model", `%${item.name.split(" ").slice(0, 3).join(" ")}%`)
                .eq("status", "in_stock")
                .eq("company_id", companyId)
                .limit(1)
                .maybeSingle();

              if (deviceByModel) {
                deviceId = deviceByModel.id;
                console.log(`Matched device ${deviceByModel.id} by model for "${item.name}"`);
                break;
              }
            }
          }
        }

        // Insert the sale with customer_id and marketplace status
        // Shopify passes ALL tax through to you — you must remit to CRA
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
          marketplace_status: shopifyMarketplaceStatus,
          fulfillment_status: fulfillmentStatus,
          is_marketplace_remitted: false,
          accounting_status: "unprocessed",
          product_title: order.line_items?.length > 0 ? order.line_items[0].name : null,
          marketplace_sku: order.line_items?.length > 0 ? (order.line_items[0].sku || null) : null,
          item_count: order.line_items?.reduce((sum: number, i: any) => sum + (i.quantity || 1), 0) || 1,
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

    // Log sync result
    const syncStatus = errors.length > 0 ? (importedOrders.length > 0 ? 'partial' : 'failure') : 'success';
    await supabase.from("sync_logs").insert({
      marketplace: "shopify",
      company_id: companyId,
      status: syncStatus,
      started_at: new Date(Date.now() - 30000).toISOString(), // approx start
      completed_at: new Date().toISOString(),
      records_imported: importedOrders.length,
      records_skipped: skippedOrders.length,
      records_errored: errors.length,
      error_message: errors.length > 0 ? errors.join("; ") : null,
      sync_type: "scheduled",
      metadata: { total_from_api: orders.length },
    });

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

    // Log failure
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await sb.from("sync_logs").insert({
        marketplace: "shopify",
        status: "failure",
        completed_at: new Date().toISOString(),
        error_message: error.message,
        sync_type: "scheduled",
      });
    } catch (_) { /* best effort */ }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
