import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";
import { z } from "https://esm.sh/zod@3.23.8";

// Zod schemas for Temu webhook payloads
const TemuOrderSchema = z.object({
  order_sn: z.string(),
  sub_order_sn: z.string().optional(),
  order_status: z.number().int(),
  create_time: z.number(),
  update_time: z.number().optional(),
  buyer_info: z.object({
    buyer_name: z.string(),
    email: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
  }).optional().nullable(),
  shipping_address: z.object({
    address_line1: z.string().optional().nullable(),
    address_line2: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    zip_code: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
  }).optional().nullable(),
  item_list: z.array(z.object({
    sku_id: z.string(),
    product_name: z.string(),
    product_sku: z.string().optional().default(""),
    quantity: z.number().int().positive(),
    sale_price: z.number(),
    currency: z.string().optional().default("CAD"),
  })).min(1),
  order_amount: z.number(),
  shipping_fee: z.number().optional().default(0),
  platform_discount: z.number().optional().default(0),
  seller_discount: z.number().optional().default(0),
}).passthrough();

const TemuReturnSchema = z.object({
  return_id: z.string(),
  order_sn: z.string(),
  sub_order_sn: z.string().optional(),
  return_status: z.number().int(),
  return_reason: z.string().optional().default(""),
  create_time: z.number(),
  item_list: z.array(z.any()).optional().default([]),
  refund_amount: z.number().optional().default(0),
  buyer_info: z.object({ buyer_name: z.string().optional() }).optional().nullable(),
}).passthrough();

const TemuSettlementSchema = z.object({
  settlement_id: z.string(),
  settlement_time: z.number(),
  period_start: z.number(),
  period_end: z.number(),
  total_order_amount: z.number(),
  total_platform_fee: z.number().optional().default(0),
  total_commission: z.number().optional().default(0),
  total_refund: z.number().optional().default(0),
  total_adjustment: z.number().optional().default(0),
  net_payout: z.number(),
  currency: z.string().optional().default("CAD"),
}).passthrough();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-temu-signature, x-temu-topic, x-temu-timestamp",
};

// ── Temu Webhook Event Types ──────────────────────────────────────────
interface TemuOrderEvent {
  order_sn: string;
  sub_order_sn?: string;
  order_status: number; // 1=pending, 2=shipped, 3=delivered, 4=cancelled
  create_time: number; // unix timestamp
  update_time: number;
  buyer_info?: {
    buyer_name: string;
    email?: string;
    phone?: string;
  };
  shipping_address?: {
    address_line1: string;
    address_line2?: string;
    city: string;
    state: string;
    zip_code: string;
    country: string;
  };
  item_list: Array<{
    sku_id: string;
    product_name: string;
    product_sku: string;
    quantity: number;
    sale_price: number; // in cents
    currency: string;
  }>;
  order_amount: number; // in cents
  shipping_fee: number; // in cents
  platform_discount: number; // in cents
  seller_discount: number; // in cents
}

interface TemuReturnEvent {
  return_id: string;
  order_sn: string;
  sub_order_sn?: string;
  return_status: number; // 1=requested, 2=approved, 3=received, 4=refunded, 5=rejected
  return_reason: string;
  create_time: number;
  item_list: Array<{
    sku_id: string;
    product_name: string;
    quantity: number;
    refund_amount: number; // in cents
  }>;
  refund_amount: number; // in cents
  buyer_info?: {
    buyer_name: string;
  };
}

interface TemuSettlementEvent {
  settlement_id: string;
  settlement_time: number;
  period_start: number;
  period_end: number;
  total_order_amount: number; // in cents
  total_platform_fee: number; // in cents
  total_commission: number; // in cents
  total_refund: number; // in cents
  total_adjustment: number; // in cents
  net_payout: number; // in cents
  currency: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function verifyTemuSignature(
  body: string,
  signature: string,
  secret: string,
  timestamp: string
): boolean {
  const payload = `${timestamp}\n${body}`;
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  const calculated = hmac.digest("hex");
  return calculated === signature;
}

function centsToCAD(cents: number): number {
  return Math.round(cents) / 100;
}

function unixToISO(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function formatShippingAddress(addr: TemuOrderEvent["shipping_address"]): string | null {
  if (!addr) return null;
  return [addr.address_line1, addr.address_line2, `${addr.city}, ${addr.state} ${addr.zip_code}`, addr.country]
    .filter(Boolean)
    .join("\n");
}

async function upsertCustomer(
  supabase: any,
  buyerName: string | null,
  buyerEmail: string | null,
  buyerPhone: string | null,
  shippingAddress: string | null,
  companyId: string
): Promise<string | null> {
  if (!buyerName) return null;

  try {
    let existing = null;
    if (buyerEmail) {
      const { data } = await supabase
        .from("customers")
        .select("id")
        .eq("email", buyerEmail)
        .eq("company_id", companyId)
        .maybeSingle();
      existing = data;
    }

    if (!existing) {
      const { data } = await supabase
        .from("customers")
        .select("id")
        .eq("name", buyerName)
        .eq("company_id", companyId)
        .maybeSingle();
      existing = data;
    }

    if (existing) {
      const updates: any = {};
      if (buyerEmail) updates.email = buyerEmail;
      if (buyerPhone) updates.phone = buyerPhone;
      if (shippingAddress) updates.address = shippingAddress;
      if (Object.keys(updates).length > 0) {
        await supabase.from("customers").update(updates).eq("id", existing.id);
      }
      return existing.id;
    } else {
      const { data: newCust, error } = await supabase
        .from("customers")
        .insert({
          name: buyerName,
          email: buyerEmail,
          phone: buyerPhone,
          address: shippingAddress,
          company_id: companyId,
          marketplace_source: "temu",
        })
        .select("id")
        .single();

      if (error) {
        if ((error as any).code === "23505") {
          const { data: recovered } = await supabase
            .from("customers").select("id")
            .eq("company_id", companyId).ilike("name", buyerName)
            .limit(1).maybeSingle();
          return recovered?.id || null;
        }
        console.error("Error creating customer:", error);
        return null;
      }
      return newCust?.id || null;
    }
  } catch (err) {
    console.error("Error upserting customer:", err);
    return null;
  }
}

// ── Main Handler ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("Temu webhook received");

  try {
    const temuSignature = req.headers.get("x-temu-signature");
    const temuTopic = req.headers.get("x-temu-topic");
    const temuTimestamp = req.headers.get("x-temu-timestamp") || "";

    console.log(`Topic: ${temuTopic}, Timestamp: ${temuTimestamp}`);

    const body = await req.text();
    const webhookSecret = Deno.env.get("TEMU_WEBHOOK_SECRET");

    if (!webhookSecret) {
      console.error("TEMU_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify signature if provided
    if (temuSignature) {
      const isValid = verifyTemuSignature(body, temuSignature, webhookSecret, temuTimestamp);
      if (!isValid) {
        console.error("Invalid webhook signature");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log("Webhook signature verified");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get TGW company ID (Temu orders go to TGW by default)
    const { data: tgwCompany } = await supabase
      .from("companies")
      .select("id")
      .eq("code", "TGW")
      .single();

    const companyId = tgwCompany?.id || null;

    if (!companyId) {
      console.error("TGW company not found");
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = JSON.parse(body);

    // Route by topic
    switch (temuTopic) {
      case "order.created":
      case "order.status_update":
        return await handleOrder(supabase, payload, companyId);

      case "return.created":
      case "return.status_update":
        return await handleReturn(supabase, payload, companyId);

      case "settlement.completed":
        return await handleSettlement(supabase, payload, companyId);

      default:
        console.log(`Ignoring topic: ${temuTopic}`);
        return new Response(
          JSON.stringify({ message: "Event ignored", topic: temuTopic }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Order Handler ─────────────────────────────────────────────────────

async function handleOrder(supabase: any, order: TemuOrderEvent, companyId: string) {
  console.log(`Processing Temu order ${order.order_sn}`);

  const customerName = order.buyer_info?.buyer_name || null;
  const customerEmail = order.buyer_info?.email || null;
  const customerPhone = order.buyer_info?.phone || null;
  const shippingAddress = formatShippingAddress(order.shipping_address);
  const totalPrice = centsToCAD(order.order_amount);

  // Upsert customer
  const customerId = await upsertCustomer(
    supabase, customerName, customerEmail, customerPhone,
    shippingAddress, companyId
  );

  // Check for duplicate order
  const { data: existingOrder } = await supabase
    .from("sales")
    .select("id")
    .ilike("order_number", `TEMU-${order.order_sn}%`)
    .limit(1);

  if (existingOrder && existingOrder.length > 0) {
    console.log(`Order ${order.order_sn} already exists, skipping`);
    return new Response(
      JSON.stringify({ success: true, message: "Order already exists" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const salesInserts = [];
  const totalItems = order.item_list.reduce((sum, i) => sum + i.quantity, 0);
  const shippingPerItem = centsToCAD(order.shipping_fee) / Math.max(totalItems, 1);

  for (const item of order.item_list) {
    const itemPrice = centsToCAD(item.sale_price);

    // Try to match device by SKU or IMEI
    let deviceId = null;
    if (item.product_sku) {
      const { data: deviceBySku } = await supabase
        .from("devices")
        .select("id")
        .eq("sku", item.product_sku)
        .eq("status", "in_stock")
        .maybeSingle();

      if (deviceBySku) {
        deviceId = deviceBySku.id;
        console.log(`Matched device ${deviceBySku.id} by SKU for ${item.product_sku}`);
      }

      if (!deviceId) {
        const { data: deviceByImei } = await supabase
          .from("devices")
          .select("id")
          .eq("imei", item.product_sku)
          .eq("status", "in_stock")
          .maybeSingle();

        if (deviceByImei) {
          deviceId = deviceByImei.id;
          console.log(`Matched device ${deviceByImei.id} by IMEI for ${item.product_sku}`);
        }
      }

      // Fallback: match by model name
      if (!deviceId && item.product_name) {
        const { data: deviceByModel } = await supabase
          .from("devices")
          .select("id")
          .ilike("model", `%${item.product_name.split(" ").slice(0, 3).join(" ")}%`)
          .eq("status", "in_stock")
          .limit(1)
          .maybeSingle();

        if (deviceByModel) {
          deviceId = deviceByModel.id;
          console.log(`Matched device ${deviceByModel.id} by model for "${item.product_name}"`);
        }
      }
    }

    // Temu typically charges ~15-20% commission
    const estimatedFees = itemPrice * 0.18;

    salesInserts.push({
      order_number: `TEMU-${order.order_sn}-${item.sku_id}`,
      device_id: deviceId,
      marketplace: "temu" as const,
      sale_price: itemPrice,
      shipping_cost: shippingPerItem,
      marketplace_fees: estimatedFees,
      tax_amount: 0,
      sale_date: unixToISO(order.create_time),
      customer_name: customerName,
      customer_email: customerEmail,
      shipping_address: shippingAddress,
      notes: `Temu Order #${order.order_sn} | Item: ${item.product_name}`,
      company_id: companyId,
      customer_id: customerId,
    });
  }

  if (salesInserts.length > 0) {
    const { data: inserted, error } = await supabase
      .from("sales")
      .insert(salesInserts)
      .select();

    if (error) {
      console.error("Error inserting sales:", error);
      return new Response(
        JSON.stringify({ error: "Failed to insert sales", details: error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log sync
    await supabase.from("sync_logs").insert({
      company_id: companyId,
      marketplace: "temu",
      status: "success",
      records_imported: inserted?.length || 0,
      sync_type: "webhook",
      metadata: { order_sn: order.order_sn },
    });

    console.log(`Created ${inserted?.length || 0} sales from Temu order #${order.order_sn}`);
  }

  return new Response(
    JSON.stringify({ success: true, message: `Processed ${salesInserts.length} items from order #${order.order_sn}` }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ── Return Handler ────────────────────────────────────────────────────

async function handleReturn(supabase: any, ret: TemuReturnEvent, companyId: string) {
  console.log(`Processing Temu return ${ret.return_id}`);

  // Check for duplicate
  const { data: existing } = await supabase
    .from("return_authorizations")
    .select("id")
    .eq("rma_number", `TEMU-RMA-${ret.return_id}`)
    .maybeSingle();

  if (existing) {
    console.log(`Return ${ret.return_id} already exists, updating status`);
    const statusMap: Record<number, string> = {
      1: "pending", 2: "approved", 3: "received", 4: "refunded", 5: "rejected",
    };
    await supabase
      .from("return_authorizations")
      .update({ status: statusMap[ret.return_status] || "pending" })
      .eq("id", existing.id);

    return new Response(
      JSON.stringify({ success: true, message: "Return updated" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Find related sale
  const { data: relatedSale } = await supabase
    .from("sales")
    .select("id, device_id")
    .ilike("order_number", `TEMU-${ret.order_sn}%`)
    .limit(1)
    .maybeSingle();

  const statusMap: Record<number, string> = {
    1: "pending", 2: "approved", 3: "received", 4: "refunded", 5: "rejected",
  };

  const { error } = await supabase.from("return_authorizations").insert({
    company_id: companyId,
    rma_number: `TEMU-RMA-${ret.return_id}`,
    return_type: "customer_return",
    reason: ret.return_reason || "Customer return via Temu",
    status: statusMap[ret.return_status] || "pending",
    return_date: unixToISO(ret.create_time).split("T")[0],
    refund_amount: centsToCAD(ret.refund_amount),
    customer_name: ret.buyer_info?.buyer_name || null,
    sale_id: relatedSale?.id || null,
    device_id: relatedSale?.device_id || null,
    notes: `Temu Return #${ret.return_id} for Order #${ret.order_sn}`,
  });

  if (error) {
    console.error("Error inserting return:", error);
    return new Response(
      JSON.stringify({ error: "Failed to insert return", details: error }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`Created return for Temu return #${ret.return_id}`);

  return new Response(
    JSON.stringify({ success: true, message: `Processed return #${ret.return_id}` }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ── Settlement/Payout Handler ─────────────────────────────────────────

async function handleSettlement(supabase: any, settlement: TemuSettlementEvent, companyId: string) {
  console.log(`Processing Temu settlement ${settlement.settlement_id}`);

  // Check for duplicate
  const { data: existing } = await supabase
    .from("marketplace_payouts")
    .select("id")
    .eq("payout_id", `TEMU-${settlement.settlement_id}`)
    .maybeSingle();

  if (existing) {
    console.log(`Settlement ${settlement.settlement_id} already exists`);
    return new Response(
      JSON.stringify({ success: true, message: "Settlement already exists" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { error } = await supabase.from("marketplace_payouts").insert({
    company_id: companyId,
    marketplace: "temu",
    payout_id: `TEMU-${settlement.settlement_id}`,
    payout_date: unixToISO(settlement.settlement_time).split("T")[0],
    period_start: unixToISO(settlement.period_start).split("T")[0],
    period_end: unixToISO(settlement.period_end).split("T")[0],
    gross_amount: centsToCAD(settlement.total_order_amount),
    fees_amount: centsToCAD(settlement.total_platform_fee + settlement.total_commission),
    adjustments_amount: centsToCAD(settlement.total_adjustment - settlement.total_refund),
    net_payout: centsToCAD(settlement.net_payout),
    currency: settlement.currency || "CAD",
    reconciliation_status: "pending",
    raw_data: settlement,
  });

  if (error) {
    console.error("Error inserting settlement:", error);
    return new Response(
      JSON.stringify({ error: "Failed to insert settlement", details: error }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`Created payout for Temu settlement #${settlement.settlement_id}`);

  return new Response(
    JSON.stringify({ success: true, message: `Processed settlement #${settlement.settlement_id}` }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
