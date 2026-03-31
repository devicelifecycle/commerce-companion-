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
      await supabase.from("customers").update(updates).eq("id", existingCustomer.id);
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

function buildShopifyStatus(order: any): string {
  if (order.cancelled_at) return "Cancelled";
  const financial = order.financial_status || "pending";
  if (financial === "voided") return "Voided";
  const fulfillment = order.fulfillment_status || "unfulfilled";
  const financialLabel = financial.charAt(0).toUpperCase() + financial.slice(1).replace(/_/g, ' ');
  const fulfillmentLabel = fulfillment === "unfulfilled" ? "Unfulfilled"
    : fulfillment.charAt(0).toUpperCase() + fulfillment.slice(1).replace(/_/g, ' ');
  return `${financialLabel} / ${fulfillmentLabel}`;
}

function mapShopifyToFulfillment(order: any): string {
  if (order.cancelled_at) return "cancelled";
  if (order.financial_status === "voided") return "cancelled";
  if (order.fulfillment_status === "fulfilled") return "delivered";
  if (order.fulfillment_status === "partial") return "shipped";
  if (order.refunds && order.refunds.length > 0) return "cancelled";
  if (order.financial_status === "paid" || order.financial_status === "authorized") return "pending";
  return "received";
}

function isOrderVoided(order: any): boolean {
  return !!order.cancelled_at || order.financial_status === "voided" || order.financial_status === "refunded";
}

/**
 * Reverse all accounting entries for a sale (journal entries + AR).
 * Used when a previously-processed order is found to be voided/cancelled.
 */
async function reverseAccountingForSale(supabase: any, saleId: string) {
  // Delete journal entry lines first, then entries
  const { data: journalEntries } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("reference_id", saleId)
    .eq("reference_type", "sale");

  if (journalEntries?.length) {
    const entryIds = journalEntries.map((e: any) => e.id);
    await supabase.from("journal_entry_lines").delete().in("journal_entry_id", entryIds);
    await supabase.from("journal_entries").delete().in("id", entryIds);
    console.log(`Reversed ${entryIds.length} journal entries for voided sale ${saleId}`);
  }

  // Delete AR entries
  await supabase.from("accounts_receivable").delete().eq("source_reference", saleId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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

    const { data: tgwCompany, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("code", "TGW")
      .single();

    if (companyError || !tgwCompany) {
      throw new Error("TGW company not found");
    }

    const companyId = tgwCompany.id;

    let body: any = {};
    try { body = await req.json(); } catch (_) { /* empty body */ }
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 7);
    const createdAtMin = body.startDate ? new Date(body.startDate).toISOString() : defaultStart.toISOString();

    console.log(`Fetching Shopify orders since ${createdAtMin}`);

    let shopifyBaseUrl = SHOPIFY_STORE_URL.trim();
    if (!shopifyBaseUrl.startsWith("https://")) shopifyBaseUrl = `https://${shopifyBaseUrl}`;
    if (!shopifyBaseUrl.includes(".myshopify.com")) shopifyBaseUrl = shopifyBaseUrl.replace(/\/$/, "") + ".myshopify.com";
    shopifyBaseUrl = shopifyBaseUrl.replace(/\/$/, "");

    // === Fetch all orders with pagination ===
    const orders: any[] = [];
    let nextUrl: string | null = `${shopifyBaseUrl}/admin/api/2024-01/orders.json?status=any&created_at_min=${createdAtMin}&limit=250`;
    let pageCount = 0;

    while (nextUrl && pageCount < 50) {
      const response = await fetch(nextUrl, {
        headers: { "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_TOKEN, "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      orders.push(...(data.orders || []));
      pageCount++;
      nextUrl = null;
      const linkHeader = response.headers.get('Link');
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch) nextUrl = nextMatch[1];
      }
    }

    console.log(`Fetched ${orders.length} orders across ${pageCount} pages`);

    // === Schema validation ===
    if (orders.length > 0) {
      const sampleOrder = orders[0];
      const shopExpectedFields = [
        { path: 'order_number', required: true, type: 'number' },
        { path: 'created_at', required: true, type: 'string' },
        { path: 'financial_status', required: true, type: 'string' },
        { path: 'total_price', required: true, type: 'string' },
        { path: 'line_items', required: true },
      ];
      const shopKnownPaths = [
        'id', 'order_number', 'name', 'created_at', 'updated_at', 'closed_at',
        'cancelled_at', 'cancel_reason', 'financial_status', 'fulfillment_status',
        'total_price', 'subtotal_price', 'total_tax', 'total_discounts',
        'total_shipping_price_set', 'currency', 'customer', 'shipping_address',
        'billing_address', 'line_items', 'refunds', 'shipping_lines', 'tax_lines',
        'note', 'tags', 'email', 'phone', 'gateway', 'payment_gateway_names',
      ];
      const schemaResult = validateSchema(sampleOrder, shopExpectedFields, shopKnownPaths);
      if (!schemaResult.valid) {
        await raiseSchemaAlert(supabase, 'Shopify (Admin API)', schemaResult, Object.keys(sampleOrder));
      }
    }

    // === Fetch Shopify Payments balance transactions for accurate fee data ===
    // Fees = total order amount - net payout amount
    const feeMap: Record<string, { fee: number; net: number }> = {};
    try {
      let balUrl: string | null = `${shopifyBaseUrl}/admin/api/2024-01/shopify_payments/balance/transactions.json?limit=250`;
      let balPages = 0;
      while (balUrl && balPages < 20) {
        const balResp = await fetch(balUrl, {
          headers: { "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_TOKEN, "Content-Type": "application/json" },
        });
        if (!balResp.ok) {
          console.warn(`Balance transactions API returned ${balResp.status}`);
          break;
        }
        const balData = await balResp.json();
        for (const txn of balData.transactions || []) {
          if (txn.source_order_id && (txn.type === 'charge' || txn.type === 'sale')) {
            feeMap[String(txn.source_order_id)] = {
              fee: Math.abs(parseFloat(txn.fee || "0")),
              net: parseFloat(txn.net || "0"),
            };
          }
        }
        balUrl = null;
        const linkHeader = balResp.headers.get('Link');
        if (linkHeader) {
          const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          if (nextMatch) balUrl = nextMatch[1];
        }
        balPages++;
      }
      console.log(`Loaded ${Object.keys(feeMap).length} balance transactions for fee lookup`);
    } catch (err) {
      console.warn("Could not fetch balance transactions (store may not use Shopify Payments):", err);
    }

    const importedOrders: string[] = [];
    const skippedOrders: string[] = [];
    const cancelledOrders: string[] = [];
    const errors: string[] = [];

    for (const order of orders) {
      try {
        const orderNumber = `SHOP-${order.order_number}`;
        const voided = isOrderVoided(order);
        const shopifyMarketplaceStatus = buildShopifyStatus(order);
        const fulfillmentStatus = mapShopifyToFulfillment(order);

        // Calculate marketplace fees from balance transactions (total - net payout)
        const totalPrice = parseFloat(order.total_price || "0");
        const balanceTxn = feeMap[String(order.id)];
        let marketplaceFees = 0;
        if (balanceTxn) {
          // Fee from balance transactions = total charged - net received
          marketplaceFees = balanceTxn.fee;
        } else {
          // Fallback: estimate at 2.9% + $0.30
          marketplaceFees = totalPrice > 0 ? totalPrice * 0.029 + 0.30 : 0;
        }
        marketplaceFees = parseFloat(marketplaceFees.toFixed(2));

        // Check if order already exists
        const { data: existingOrder } = await supabase
          .from("sales")
          .select("id, fulfillment_status, accounting_status, marketplace_fees, shipping_cost")
          .eq("order_number", orderNumber)
          .maybeSingle();

        if (existingOrder) {
          // === UPDATE existing order ===
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

          const updates: any = {
            marketplace_status: shopifyMarketplaceStatus,
            fulfillment_status: fulfillmentStatus,
            // Fix shipping_cost: customer shipping charges are INCOME (already in total_price), not an expense
            shipping_cost: 0,
            // Update fees from balance transactions
            marketplace_fees: marketplaceFees,
          };
          if (customerEmail) updates.customer_email = customerEmail;
          if (shippingAddress) updates.shipping_address = shippingAddress;
          if (customerName) updates.customer_name = customerName;

          // Handle voided/cancelled orders — reverse accounting if previously processed
          if (voided && existingOrder.fulfillment_status !== 'cancelled') {
            console.log(`Order ${orderNumber} is now voided — reversing accounting`);
            await reverseAccountingForSale(supabase, existingOrder.id);
            updates.accounting_status = 'voided';
            updates.fulfillment_status = 'cancelled';
            cancelledOrders.push(orderNumber);
          }

          await supabase.from("sales").update(updates).eq("id", existingOrder.id);
          await upsertCustomer(supabase, customerName, customerEmail, customerPhone, shippingAddress, companyId, "shopify", 0);
          skippedOrders.push(orderNumber);
          continue;
        }

        // === INSERT new order ===
        const salePrice = totalPrice;
        const taxAmount = parseFloat(order.total_tax || "0");
        // Shipping charged to customer is INCOME, already included in total_price. 
        // shipping_cost field = our actual cost to ship (unknown from Shopify, set to 0)
        const shippingCost = 0;

        const shippingAddress = order.shipping_address
          ? [order.shipping_address.address1, order.shipping_address.address2,
             `${order.shipping_address.city}, ${order.shipping_address.province} ${order.shipping_address.zip}`,
             order.shipping_address.country].filter(Boolean).join("\n")
          : null;

        const customerName = order.customer?.first_name
          ? `${order.customer.first_name} ${order.customer.last_name || ""}`.trim()
          : null;
        const customerEmail = order.customer?.email || order.email || null;
        const customerPhone = order.customer?.phone || order.shipping_address?.phone || null;

        const customerId = await upsertCustomer(supabase, customerName, customerEmail, customerPhone, shippingAddress, companyId, "shopify", salePrice);

        const lineItemsStr = order.line_items?.map((item: any) => `${item.name} (x${item.quantity})`).join(", ") || "";
        const province = order.shipping_address?.province_code || order.billing_address?.province_code || null;
        const notes = `Shopify Order #${order.order_number} | Status: ${shopifyMarketplaceStatus} | Province: ${province || 'N/A'} | ${lineItemsStr}`;

        // Device matching
        let deviceId = null;
        if (!voided) {
          for (const item of order.line_items || []) {
            if (item.sku) {
              const { data: d1 } = await supabase.from("devices").select("id").eq("imei", item.sku).eq("status", "in_stock").eq("company_id", companyId).maybeSingle();
              if (d1) { deviceId = d1.id; break; }
              const { data: d2 } = await supabase.from("devices").select("id").eq("sku", item.sku).eq("status", "in_stock").eq("company_id", companyId).maybeSingle();
              if (d2) { deviceId = d2.id; break; }
              if (item.name) {
                const { data: d3 } = await supabase.from("devices").select("id").ilike("model", `%${item.name.split(" ").slice(0, 3).join(" ")}%`).eq("status", "in_stock").eq("company_id", companyId).limit(1).maybeSingle();
                if (d3) { deviceId = d3.id; break; }
              }
            }
          }
        }

        const { error: insertError } = await supabase.from("sales").insert({
          order_number: orderNumber,
          marketplace: "shopify",
          sale_price: salePrice,
          shipping_cost: shippingCost,
          marketplace_fees: marketplaceFees,
          tax_amount: taxAmount,
          sale_date: order.created_at,
          customer_name: customerName,
          customer_email: customerEmail,
          shipping_address: shippingAddress,
          shipping_province: province,
          notes,
          device_id: deviceId,
          company_id: companyId,
          customer_id: customerId,
          marketplace_status: shopifyMarketplaceStatus,
          fulfillment_status: fulfillmentStatus,
          is_marketplace_remitted: false,
          // Voided orders skip accounting entirely
          accounting_status: voided ? "voided" : "unprocessed",
          product_title: order.line_items?.length > 0 ? order.line_items[0].name : null,
          marketplace_sku: order.line_items?.length > 0 ? (order.line_items[0].sku || null) : null,
          item_count: order.line_items?.reduce((sum: number, i: any) => sum + (i.quantity || 1), 0) || 1,
        });

        if (insertError) {
          console.error(`Error inserting order ${order.order_number}:`, insertError);
          errors.push(`${orderNumber}: ${insertError.message}`);
        } else {
          if (voided) {
            cancelledOrders.push(orderNumber);
          } else {
            importedOrders.push(orderNumber);
          }
        }
      } catch (orderError: any) {
        console.error(`Error processing order ${order.order_number}:`, orderError);
        errors.push(`SHOP-${order.order_number}: ${orderError.message}`);
      }
    }

    console.log(`Import complete: ${importedOrders.length} imported, ${cancelledOrders.length} voided, ${skippedOrders.length} skipped, ${errors.length} errors`);

    // Log sync
    const syncStatus = errors.length > 0 ? (importedOrders.length > 0 ? 'partial' : 'failure') : 'success';
    await supabase.from("sync_logs").insert({
      marketplace: "shopify",
      company_id: companyId,
      status: syncStatus,
      started_at: new Date(Date.now() - 30000).toISOString(),
      completed_at: new Date().toISOString(),
      records_imported: importedOrders.length,
      records_skipped: skippedOrders.length,
      records_errored: errors.length,
      error_message: errors.length > 0 ? errors.join("; ") : null,
      sync_type: "scheduled",
      metadata: { total_from_api: orders.length, voided: cancelledOrders.length },
    });

    // Trigger accounting only for non-voided newly imported orders
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
        voided: cancelledOrders.length,
        errors: errors.length,
        accounting: accountingResult,
        details: { imported: importedOrders, skipped: skippedOrders, voided: cancelledOrders, errors },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Import error:", error);
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
