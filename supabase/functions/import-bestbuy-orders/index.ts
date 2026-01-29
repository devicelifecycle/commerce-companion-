import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface MiraklOrder {
  id: string;
  order_id: string;
  commercial_id: string;
  created_date: string;
  last_updated_date: string;
  order_state: string;
  order_state_reason_code?: string;
  order_state_reason_label?: string;
  customer: {
    civility?: string;
    firstname: string;
    lastname: string;
    email?: string;
  };
  shipping_address: {
    city: string;
    civility?: string;
    company?: string;
    country: string;
    country_iso_code: string;
    firstname: string;
    lastname: string;
    phone?: string;
    phone_secondary?: string;
    state?: string;
    street_1: string;
    street_2?: string;
    zip_code: string;
  };
  order_lines: MiraklOrderLine[];
  price: number;
  total_price: number;
  total_commission: number;
  shipping_price: number;
  shipping_zone_code?: string;
  shipping_zone_label?: string;
}

interface MiraklOrderLine {
  id: string;
  order_line_id: string;
  offer_id: number;
  offer_sku: string;
  product_title: string;
  quantity: number;
  price: number;
  price_unit: number;
  total_price: number;
  shipping_price: number;
  commission_fee: number;
  commission_rate_vat?: number;
  commission_taxes?: { amount: number; code: string }[];
  order_line_state: string;
}

interface MiraklOrdersResponse {
  orders: MiraklOrder[];
  total_count: number;
  next_page_token?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const BESTBUY_API_KEY = Deno.env.get("BESTBUY_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!BESTBUY_API_KEY) {
      throw new Error("Best Buy API key not configured");
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Calculate date 7 days ago for filtering recent orders
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = sevenDaysAgo.toISOString();

    console.log(`Fetching Best Buy Canada orders since ${startDate}`);

    // Best Buy Canada uses Mirakl platform
    // API endpoint: https://marketplace.bestbuy.ca/api/orders
    // Using OR11 - List orders with pagination
    const baseUrl = "https://marketplace.bestbuy.ca/api/orders";
    
    const params = new URLSearchParams({
      start_date: startDate,
      max: "100",
      paginate: "true",
    });

    const ordersUrl = `${baseUrl}?${params.toString()}`;

    console.log(`Calling Best Buy Mirakl API: ${ordersUrl}`);

    const response = await fetch(ordersUrl, {
      headers: {
        "Authorization": BESTBUY_API_KEY,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Best Buy API error: ${response.status} - ${errorText}`);
      throw new Error(`Best Buy API error: ${response.status} - ${errorText}`);
    }

    const data: MiraklOrdersResponse = await response.json();
    const orders = data.orders || [];

    console.log(`Found ${orders.length} orders from Best Buy Canada (total: ${data.total_count})`);

    const importedOrders: string[] = [];
    const skippedOrders: string[] = [];
    const errors: string[] = [];

    for (const order of orders) {
      try {
        const orderNumber = `BBY-${order.commercial_id}`;
        
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

        // Process each line item as a sale
        for (const lineItem of order.order_lines) {
          const lineOrderNumber = `BBY-${order.commercial_id}-${lineItem.order_line_id}`;
          
          // Check if this specific line item already exists
          const { data: existingLineOrder } = await supabase
            .from("sales")
            .select("id")
            .eq("order_number", lineOrderNumber)
            .maybeSingle();

          if (existingLineOrder) {
            continue;
          }

          // Calculate values
          const salePrice = lineItem.total_price || lineItem.price;
          const shippingCost = lineItem.shipping_price || 0;
          const marketplaceFees = lineItem.commission_fee || 0;
          
          // Best Buy Canada charges tax separately - estimate from commission taxes
          const taxAmount = lineItem.commission_taxes?.reduce(
            (sum, tax) => sum + (tax.amount || 0),
            0
          ) || 0;

          // Build customer address
          const addr = order.shipping_address;
          const shippingAddress = addr
            ? [
                addr.street_1,
                addr.street_2,
                `${addr.city}, ${addr.state || ""} ${addr.zip_code}`.trim(),
                addr.country,
              ]
                .filter(Boolean)
                .join("\n")
            : null;

          // Customer name
          const customerName = order.customer
            ? `${order.customer.firstname} ${order.customer.lastname}`.trim()
            : null;

          const notes = `Best Buy Order #${order.commercial_id} | ${lineItem.product_title} (x${lineItem.quantity})`;

          // Try to match device by SKU (IMEI)
          let deviceId = null;
          if (lineItem.offer_sku) {
            const { data: device } = await supabase
              .from("devices")
              .select("id")
              .eq("imei", lineItem.offer_sku)
              .eq("status", "in_stock")
              .maybeSingle();

            if (device) {
              deviceId = device.id;
              console.log(`Matched device ${device.id} for SKU ${lineItem.offer_sku}`);
            }
          }

          // Insert the sale
          const { error: insertError } = await supabase.from("sales").insert({
            order_number: lineOrderNumber,
            marketplace: "bestbuy",
            sale_price: salePrice,
            shipping_cost: shippingCost,
            marketplace_fees: parseFloat(marketplaceFees.toFixed(2)),
            tax_amount: taxAmount,
            sale_date: order.created_date,
            customer_name: customerName,
            customer_email: order.customer?.email || null,
            shipping_address: shippingAddress,
            notes: notes,
            device_id: deviceId,
          });

          if (insertError) {
            console.error(`Error inserting order line ${lineOrderNumber}:`, insertError);
            errors.push(`${lineOrderNumber}: ${insertError.message}`);
          } else {
            importedOrders.push(lineOrderNumber);
          }
        }
      } catch (orderError: any) {
        console.error(`Error processing order ${order.commercial_id}:`, orderError);
        errors.push(`BBY-${order.commercial_id}: ${orderError.message}`);
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
