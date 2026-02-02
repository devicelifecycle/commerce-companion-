import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const AMAZON_CLIENT_ID = Deno.env.get("AMAZON_CLIENT_ID");
    const AMAZON_CLIENT_SECRET = Deno.env.get("AMAZON_CLIENT_SECRET");
    const AMAZON_REFRESH_TOKEN = Deno.env.get("AMAZON_REFRESH_TOKEN");
    const AMAZON_SELLER_ID = Deno.env.get("AMAZON_SELLER_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!AMAZON_CLIENT_ID || !AMAZON_CLIENT_SECRET || !AMAZON_REFRESH_TOKEN) {
      throw new Error("Amazon SP-API credentials not configured");
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
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
      throw new Error(`Amazon API error: ${ordersResponse.status} - ${errorText}`);
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

        // Map order status
        let status = "pending";
        switch (order.OrderStatus) {
          case "Shipped":
            status = "shipped";
            break;
          case "Canceled":
            status = "cancelled";
            break;
          case "Unshipped":
          case "PendingAvailability":
            status = "pending";
            break;
          case "Refunded":
            status = "refunded";
            break;
        }

        const notes = `Amazon Order #${order.AmazonOrderId} | Status: ${status} | Province: ${province || 'N/A'} | ${itemDescriptions.join(", ")}`;

        // Try to match device by SKU (IMEI)
        let deviceId = null;
        for (const item of orderItems) {
          if (item.SellerSKU) {
            const { data: device } = await supabase
              .from("devices")
              .select("id")
              .eq("imei", item.SellerSKU)
              .eq("status", "in_stock")
              .eq("company_id", companyId)
              .maybeSingle();

            if (device) {
              deviceId = device.id;
              console.log(`Matched device ${device.id} for SKU ${item.SellerSKU}`);
              break;
            }
          }
        }

        // Insert the sale with company_id
        const { error: insertError } = await supabase.from("sales").insert({
          order_number: orderNumber,
          marketplace: "amazon",
          sale_price: totalSalePrice,
          shipping_cost: totalShipping,
          marketplace_fees: parseFloat(marketplaceFees.toFixed(2)),
          tax_amount: totalTax,
          sale_date: order.PurchaseDate,
          customer_name: order.ShippingAddress?.Name || order.BuyerInfo?.BuyerName || null,
          customer_email: order.BuyerInfo?.BuyerEmail || null,
          shipping_address: shippingAddress,
          notes: notes,
          device_id: deviceId,
          company_id: companyId,
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

    return new Response(
      JSON.stringify({
        success: true,
        company: "VES",
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
