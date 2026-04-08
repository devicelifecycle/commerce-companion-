import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-topic, x-shopify-shop-domain",
};

interface ShopifyOrder {
  id: number;
  order_number: string;
  email: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_shipping_price_set?: {
    shop_money: { amount: string };
  };
  created_at: string;
  shipping_address?: {
    address1: string;
    address2?: string;
    city: string;
    province: string;
    zip: string;
    country: string;
    phone?: string;
  };
  customer?: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
  };
  line_items: Array<{
    id: number;
    title: string;
    sku: string;
    quantity: number;
    price: string;
  }>;
}

function verifyShopifyWebhook(
  body: string,
  hmacHeader: string,
  secret: string
): boolean {
  const hmac = createHmac("sha256", secret);
  hmac.update(body);
  const calculatedHmac = hmac.digest("base64");
  return calculatedHmac === hmacHeader;
}

function formatShippingAddress(address: ShopifyOrder["shipping_address"]): string | null {
  if (!address) return null;
  const parts = [
    address.address1,
    address.address2,
    `${address.city}, ${address.province} ${address.zip}`,
    address.country,
  ].filter(Boolean);
  return parts.join("\n");
}

function toTitleCase(str: string): string {
  return str.trim().replace(/\s+/g, ' ')
    .replace(/\b\w+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function parseStructuredAddress(address: ShopifyOrder["shipping_address"]) {
  if (!address) return { street_address: null, city: null, province: null, postal_code: null, country: null };
  return {
    street_address: [address.address1, address.address2].filter(Boolean).join(', ') || null,
    city: address.city ? toTitleCase(address.city) : null,
    province: address.province || null,
    postal_code: address.zip || null,
    country: address.country || 'Canada',
  };
}

async function upsertCustomer(
  supabase: any,
  customerName: string | null,
  customerEmail: string | null,
  customerPhone: string | null,
  customerAddress: string | null,
  companyId: string,
  marketplace: string,
  structuredAddress?: { street_address: string | null; city: string | null; province: string | null; postal_code: string | null; country: string | null }
): Promise<string | null> {
  if (!customerName) return null;

  const normalizedName = toTitleCase(customerName);

  try {
    let existingCustomer = null;
    if (customerEmail) {
      const { data } = await supabase
        .from("customers")
        .select("id")
        .eq("email", customerEmail)
        .eq("company_id", companyId)
        .maybeSingle();
      existingCustomer = data;
    }

    if (!existingCustomer) {
      const { data } = await supabase
        .from("customers")
        .select("id")
        .eq("name", normalizedName)
        .eq("company_id", companyId)
        .maybeSingle();
      existingCustomer = data;
    }

    if (existingCustomer) {
      const updates: any = {
        name: normalizedName,
      };
      if (customerEmail) updates.email = customerEmail;
      if (customerPhone) updates.phone = customerPhone;
      if (customerAddress) updates.address = customerAddress;
      if (structuredAddress) {
        if (structuredAddress.street_address) updates.street_address = structuredAddress.street_address;
        if (structuredAddress.city) updates.city = structuredAddress.city;
        if (structuredAddress.province) updates.province = structuredAddress.province;
        if (structuredAddress.postal_code) updates.postal_code = structuredAddress.postal_code;
        if (structuredAddress.country) updates.country = structuredAddress.country;
      }
      updates.channel = marketplace;

      await supabase
        .from("customers")
        .update(updates)
        .eq("id", existingCustomer.id);

      return existingCustomer.id;
    } else {
      const { data: newCustomer, error } = await supabase
        .from("customers")
        .insert({
          name: normalizedName,
          email: customerEmail,
          phone: customerPhone,
          address: customerAddress,
          company_id: companyId,
          marketplace_source: marketplace,
          channel: marketplace,
          ...(structuredAddress || {}),
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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("Shopify webhook received");

  try {
    const shopifyHmac = req.headers.get("x-shopify-hmac-sha256");
    const shopifyTopic = req.headers.get("x-shopify-topic");
    const shopifyDomain = req.headers.get("x-shopify-shop-domain");

    console.log(`Topic: ${shopifyTopic}, Domain: ${shopifyDomain}`);

    if (!shopifyHmac) {
      console.error("Missing HMAC signature");
      return new Response(
        JSON.stringify({ error: "Missing HMAC signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.text();
    const webhookSecret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET");

    if (!webhookSecret) {
      console.error("SHOPIFY_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the webhook signature
    const isValid = verifyShopifyWebhook(body, shopifyHmac, webhookSecret);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Webhook signature verified");

    // Only process order creation events
    if (shopifyTopic !== "orders/create") {
      console.log(`Ignoring topic: ${shopifyTopic}`);
      return new Response(
        JSON.stringify({ message: "Event ignored" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const order: ShopifyOrder = JSON.parse(body);
    console.log(`Processing order #${order.order_number}`);

    // Initialize Supabase client with service role for webhook processing
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get TGW company ID
    const { data: tgwCompany } = await supabase
      .from("companies")
      .select("id")
      .eq("code", "TGW")
      .single();

    const companyId = tgwCompany?.id || null;

    // Customer info
    const customerName = order.customer
      ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
      : null;
    const customerEmail = order.email || order.customer?.email || null;
    const customerPhone = order.customer?.phone || order.shipping_address?.phone || null;
    const shippingAddress = formatShippingAddress(order.shipping_address);
    const structuredAddr = parseStructuredAddress(order.shipping_address);
    const totalPrice = parseFloat(order.total_price || "0");

    // Upsert customer
    let customerId: string | null = null;
    if (companyId) {
      customerId = await upsertCustomer(
        supabase,
        customerName,
        customerEmail,
        customerPhone,
        shippingAddress,
        companyId,
        "shopify",
        structuredAddr
      );
    }

    // Process each line item as a separate sale
    const salesInserts = [];
    for (const item of order.line_items) {
      // Try to find matching device with multiple fallback strategies
      let deviceId = null;
      if (item.sku) {
        // Strategy 1: Match by IMEI
        const { data: deviceByImei } = await supabase
          .from("devices")
          .select("id")
          .eq("imei", item.sku)
          .eq("status", "in_stock")
          .maybeSingle();

        if (deviceByImei) {
          deviceId = deviceByImei.id;
          console.log(`Matched device ${deviceByImei.id} by IMEI for SKU ${item.sku}`);
        }

        // Strategy 2: Match by SKU field
        if (!deviceId) {
          const { data: deviceBySku } = await supabase
            .from("devices")
            .select("id")
            .eq("sku", item.sku)
            .eq("status", "in_stock")
            .maybeSingle();

          if (deviceBySku) {
            deviceId = deviceBySku.id;
            console.log(`Matched device ${deviceBySku.id} by SKU for ${item.sku}`);
          }
        }

        // Strategy 3: Match by model from product title
        if (!deviceId && item.title) {
          const { data: deviceByModel } = await supabase
            .from("devices")
            .select("id")
            .ilike("model", `%${item.title.split(" ").slice(0, 3).join(" ")}%`)
            .eq("status", "in_stock")
            .limit(1)
            .maybeSingle();

          if (deviceByModel) {
            deviceId = deviceByModel.id;
            console.log(`Matched device ${deviceByModel.id} by model for "${item.title}"`);
          }
        }

        if (!deviceId) {
          console.log(`No in-stock device found for SKU: ${item.sku}`);
        }
      }

      // Calculate shipping cost per item (divide by total items)
      const totalItems = order.line_items.reduce((sum, i) => sum + i.quantity, 0);
      const shippingTotal = parseFloat(order.total_shipping_price_set?.shop_money?.amount || "0");
      const shippingPerItem = shippingTotal / totalItems;

      // Estimate marketplace fees (Shopify typically 2.9% + $0.30 for Shopify Payments)
      const itemPrice = parseFloat(item.price);
      const estimatedFees = (itemPrice * 0.029) + 0.30;

      // Tax per item (proportional)
      const totalTax = parseFloat(order.total_tax || "0");
      const subtotal = parseFloat(order.subtotal_price || "0");
      const taxPerItem = subtotal > 0 ? (itemPrice / subtotal) * totalTax : 0;

      salesInserts.push({
        order_number: `SHOP-${order.order_number}-${item.id}`,
        device_id: deviceId,
        marketplace: "shopify" as const,
        sale_price: itemPrice,
        shipping_cost: shippingPerItem,
        marketplace_fees: estimatedFees,
        tax_amount: taxPerItem,
        sale_date: order.created_at,
        customer_name: customerName,
        customer_email: customerEmail,
        shipping_address: shippingAddress,
        notes: `Shopify Order #${order.order_number} | Item: ${item.title}`,
        company_id: companyId,
        customer_id: customerId,
      });
    }

    // Insert all sales
    if (salesInserts.length > 0) {
      const { data: insertedSales, error: insertError } = await supabase
        .from("sales")
        .insert(salesInserts)
        .select();

      if (insertError) {
        console.error("Error inserting sales:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to insert sales", details: insertError }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Successfully created ${insertedSales?.length || 0} sales from order #${order.order_number}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${salesInserts.length} items from order #${order.order_number}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
