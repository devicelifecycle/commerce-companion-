import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateSchema, raiseSchemaAlert } from "../_shared/schemaValidator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AmazonOrder {
  AmazonOrderId: string;
  PurchaseDate: string;
  OrderStatus: string;
  OrderTotal?: {
    Amount: string;
    CurrencyCode: string;
  };
  ShippingAddress?: {
    Name: string;
    AddressLine1?: string;
    AddressLine2?: string;
    City?: string;
    StateOrRegion?: string;
    PostalCode?: string;
    CountryCode?: string;
    Phone?: string;
  };
  BuyerInfo?: {
    BuyerEmail?: string;
    BuyerName?: string;
  };
  OrderItems?: AmazonOrderItem[];
}

interface AmazonOrderItem {
  ASIN: string;
  SellerSKU: string;
  Title: string;
  QuantityOrdered: number;
  ItemPrice?: {
    Amount: string;
    CurrencyCode: string;
  };
  ShippingPrice?: {
    Amount: string;
  };
  ItemTax?: {
    Amount: string;
  };
  PromotionDiscount?: {
    Amount: string;
  };
}

// Amazon SP-API Token Exchange
async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const tokenUrl = "https://api.amazon.com/auth/o2/token";

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

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
// Map Amazon OrderStatus to internal fulfillment_status
function mapAmazonToFulfillment(orderStatus: string): string {
  switch (orderStatus) {
    case "Shipped": return "shipped";
    case "Canceled": return "cancelled";
    case "Unshipped":
    case "PartiallyShipped":
    case "PendingAvailability": return "pending";
    case "Pending":
    case "InvoiceUnconfirmed": return "received";
    default: return "received";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check - require valid user JWT or service role key
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

    const AMAZON_CLIENT_ID = Deno.env.get("AMAZON_CLIENT_ID");
    const AMAZON_CLIENT_SECRET = Deno.env.get("AMAZON_CLIENT_SECRET");
    const AMAZON_REFRESH_TOKEN = Deno.env.get("AMAZON_REFRESH_TOKEN");
    const AMAZON_SELLER_ID = Deno.env.get("AMAZON_SELLER_ID");

    if (!AMAZON_CLIENT_ID || !AMAZON_CLIENT_SECRET || !AMAZON_REFRESH_TOKEN) {
      throw new Error("Amazon SP-API credentials not configured");
    }




    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get VES company ID (Amazon is for VES)
    const { data: vesCompany, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("code", "VES")
      .single();

    if (companyError || !vesCompany) {
      throw new Error("VES company not found");
    }

    const companyId = vesCompany.id;
    console.log(`Using VES company ID: ${companyId}`);

    // Get access token
    console.log("Exchanging refresh token for access token...");
    const accessToken = await getAccessToken(
      AMAZON_CLIENT_ID,
      AMAZON_CLIENT_SECRET,
      AMAZON_REFRESH_TOKEN
    );

    // Calculate date 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const createdAfter = sevenDaysAgo.toISOString();

    console.log(`Fetching Amazon orders since ${createdAfter}`);

    // Amazon SP-API - Orders API (Canada marketplace)
    const ordersUrl = new URL("https://sellingpartnerapi-na.amazon.com/orders/v0/orders");
    ordersUrl.searchParams.set("MarketplaceIds", "A2EUQ1WTGCTBG2"); // Amazon.ca
    ordersUrl.searchParams.set("CreatedAfter", createdAfter);
    ordersUrl.searchParams.set("MaxResultsPerPage", "100");

    const ordersResponse = await fetch(ordersUrl.toString(), {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "x-amz-access-token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (!ordersResponse.ok) {
      const errorText = await ordersResponse.text();
      console.error(`Amazon API error: ${ordersResponse.status} - ${errorText}`);
      throw new Error("Failed to fetch orders from marketplace");
    }

    const ordersData = await ordersResponse.json();
    const orders: AmazonOrder[] = ordersData.payload?.Orders || [];

    console.log(`Found ${orders.length} orders from Amazon Canada`);

    const importedOrders: string[] = [];
    const skippedOrders: string[] = [];
    const errors: string[] = [];

    for (const order of orders) {
      try {
        const orderNumber = `AMZ-${order.AmazonOrderId}`;

        // Check if order already exists
        const { data: existingOrder } = await supabase
          .from("sales")
          .select("id")
          .eq("order_number", orderNumber)
          .maybeSingle();

        if (existingOrder) {
          // Backfill customer data and sync marketplace status on existing orders
          const customerName = order.ShippingAddress?.Name || order.BuyerInfo?.BuyerName || null;
          const customerEmail = order.BuyerInfo?.BuyerEmail || null;
          const customerPhone = order.ShippingAddress?.Phone || null;
          const addr = order.ShippingAddress;
          const shippingAddress = addr
            ? [addr.AddressLine1, addr.AddressLine2,
               `${addr.City || ""}, ${addr.StateOrRegion || ""} ${addr.PostalCode || ""}`.trim(),
               addr.CountryCode].filter(Boolean).join("\n")
            : null;

          // Build updates with raw marketplace status
          const amazonStatus = order.OrderStatus || "Unknown";
          const updates: any = { marketplace_status: amazonStatus };
          if (customerEmail) updates.customer_email = customerEmail;
          if (shippingAddress) updates.shipping_address = shippingAddress;
          if (customerName) updates.customer_name = customerName;
          
          // Also sync fulfillment_status
          updates.fulfillment_status = mapAmazonToFulfillment(order.OrderStatus);

          await supabase.from("sales").update(updates).eq("order_number", orderNumber);
          await upsertCustomer(supabase, customerName, customerEmail, customerPhone, shippingAddress, companyId, "amazon", 0);
          skippedOrders.push(orderNumber);
          continue;
        }

        // Fetch order items
        const itemsUrl = `https://sellingpartnerapi-na.amazon.com/orders/v0/orders/${order.AmazonOrderId}/orderItems`;
        const itemsResponse = await fetch(itemsUrl, {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "x-amz-access-token": accessToken,
            "Content-Type": "application/json",
          },
        });

        let orderItems: AmazonOrderItem[] = [];
        if (itemsResponse.ok) {
          const itemsData = await itemsResponse.json();
          orderItems = itemsData.payload?.OrderItems || [];
        }

        // Calculate totals from items
        let totalSalePrice = 0;
        let totalShipping = 0;
        let totalTax = 0;
        const itemDescriptions: string[] = [];

        for (const item of orderItems) {
          totalSalePrice += parseFloat(item.ItemPrice?.Amount || "0");
          totalShipping += parseFloat(item.ShippingPrice?.Amount || "0");
          totalTax += parseFloat(item.ItemTax?.Amount || "0");
          itemDescriptions.push(`${item.Title} (x${item.QuantityOrdered})`);
        }

        // If no items, use order total
        if (totalSalePrice === 0 && order.OrderTotal) {
          totalSalePrice = parseFloat(order.OrderTotal.Amount);
        }

        // Amazon referral fee estimate (~15% for most categories)
        const marketplaceFees = totalSalePrice * 0.15;

        // Extract province for tax purposes
        const province = order.ShippingAddress?.StateOrRegion || null;

        // Build shipping address
        const addr = order.ShippingAddress;
        const shippingAddress = addr
          ? [
              addr.AddressLine1,
              addr.AddressLine2,
              `${addr.City || ""}, ${addr.StateOrRegion || ""} ${addr.PostalCode || ""}`.trim(),
              addr.CountryCode,
            ]
              .filter(Boolean)
              .join("\n")
          : null;

        // Customer info
        const customerName = order.ShippingAddress?.Name || order.BuyerInfo?.BuyerName || null;
        const customerEmail = order.BuyerInfo?.BuyerEmail || null;
        const customerPhone = order.ShippingAddress?.Phone || null;

        // Upsert customer
        const customerId = await upsertCustomer(
          supabase,
          customerName,
          customerEmail,
          customerPhone,
          shippingAddress,
          companyId,
          "amazon",
          totalSalePrice
        );

        // Store raw Amazon status
        const amazonMarketplaceStatus = order.OrderStatus || "Unknown";
        const fulfillmentStatus = mapAmazonToFulfillment(order.OrderStatus);

        const notes = `Amazon Order #${order.AmazonOrderId} | Status: ${amazonMarketplaceStatus} | Province: ${province || 'N/A'} | ${itemDescriptions.join(", ")}`;

        // Try to match device by SKU/IMEI with multiple fallback strategies
        let deviceId = null;
        for (const item of orderItems) {
          if (item.SellerSKU) {
            // Strategy 1: Match by IMEI
            const { data: deviceByImei } = await supabase
              .from("devices")
              .select("id")
              .eq("imei", item.SellerSKU)
              .eq("status", "in_stock")
              .eq("company_id", companyId)
              .maybeSingle();

            if (deviceByImei) {
              deviceId = deviceByImei.id;
              console.log(`Matched device ${deviceByImei.id} by IMEI for SKU ${item.SellerSKU}`);
              break;
            }

            // Strategy 2: Match by SKU field
            const { data: deviceBySku } = await supabase
              .from("devices")
              .select("id")
              .eq("sku", item.SellerSKU)
              .eq("status", "in_stock")
              .eq("company_id", companyId)
              .maybeSingle();

            if (deviceBySku) {
              deviceId = deviceBySku.id;
              console.log(`Matched device ${deviceBySku.id} by SKU for ${item.SellerSKU}`);
              break;
            }

            // Strategy 3: Match by model name from item title
            if (item.Title) {
              const { data: deviceByModel } = await supabase
                .from("devices")
                .select("id")
                .ilike("model", `%${item.Title.split(" ").slice(0, 3).join(" ")}%`)
                .eq("status", "in_stock")
                .eq("company_id", companyId)
                .limit(1)
                .maybeSingle();

              if (deviceByModel) {
                deviceId = deviceByModel.id;
                console.log(`Matched device ${deviceByModel.id} by model for "${item.Title}"`);
                break;
              }
            }
          }
        }

        // Insert the sale with marketplace status
        // Amazon marketplace-facilitated tax: Amazon withholds and remits on most CA orders
        const { error: insertError } = await supabase.from("sales").insert({
          order_number: orderNumber,
          marketplace: "amazon",
          sale_price: totalSalePrice,
          shipping_cost: totalShipping,
          marketplace_fees: parseFloat(marketplaceFees.toFixed(2)),
          tax_amount: totalTax,
          sale_date: order.PurchaseDate,
          customer_name: customerName,
          customer_email: customerEmail,
          shipping_address: shippingAddress,
          notes: notes,
          device_id: deviceId,
          company_id: companyId,
          customer_id: customerId,
          marketplace_status: amazonMarketplaceStatus,
          fulfillment_status: fulfillmentStatus,
          is_marketplace_remitted: true,
          accounting_status: "unprocessed",
          product_title: orderItems.length > 0 ? orderItems[0].Title : null,
          marketplace_sku: orderItems.length > 0 ? (orderItems[0].SellerSKU || orderItems[0].ASIN) : null,
          item_count: orderItems.reduce((sum: number, i: any) => sum + (i.QuantityOrdered || 1), 0),
        });

        if (insertError) {
          console.error(`Error inserting order ${order.AmazonOrderId}:`, insertError);
          errors.push(`${orderNumber}: ${insertError.message}`);
        } else {
          importedOrders.push(orderNumber);
        }

        // Rate limiting - Amazon recommends 1 request per second for burst
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (orderError: any) {
        console.error(`Error processing order ${order.AmazonOrderId}:`, orderError);
        errors.push(`AMZ-${order.AmazonOrderId}: ${orderError.message}`);
      }
    }

    console.log(`Import complete: ${importedOrders.length} imported, ${skippedOrders.length} skipped, ${errors.length} errors`);

    // Log sync result
    const syncStatus = errors.length > 0 ? (importedOrders.length > 0 ? 'partial' : 'failure') : 'success';
    await supabase.from("sync_logs").insert({
      marketplace: "amazon",
      company_id: companyId,
      status: syncStatus,
      started_at: new Date(Date.now() - 30000).toISOString(),
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
        company: "VES",
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
        marketplace: "amazon",
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
