import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface MiraklAddress {
  additional_info?: string;
  city: string;
  civility?: string;
  company?: string;
  company_2?: string | null;
  country: string;
  country_iso_code?: string | null;
  firstname: string;
  lastname: string;
  phone?: string;
  phone_secondary?: string;
  state?: string;
  street_1: string;
  street_2?: string;
  zip_code: string;
}

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
    customer_id?: string;
    firstname: string;
    lastname: string;
    email?: string;
    locale?: string;
    billing_address?: MiraklAddress;
    shipping_address?: MiraklAddress;
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
    // Try to find existing customer by email first, then by name
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
      // Update existing customer
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
      // Create new customer
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
// Map Best Buy (Mirakl) order_state to internal fulfillment_status
function mapBestBuyToFulfillment(orderState: string): string {
  switch (orderState?.toUpperCase()) {
    case "SHIPPED": return "shipped";
    case "RECEIVED":
    case "CLOSED": return "delivered";
    case "REFUSED":
    case "CANCELED": return "cancelled";
    case "SHIPPING": return "shipped";
    case "WAITING_ACCEPTANCE":
    case "WAITING_DEBIT":
    case "WAITING_DEBIT_PAYMENT":
    case "STAGING": return "pending";
    default: return "received";
  }
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

    const BESTBUY_API_KEY = Deno.env.get("BESTBUY_API_KEY");

    if (!BESTBUY_API_KEY) {
      throw new Error("Best Buy API key not configured");
    }




    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get TGW company ID (BestBuy is for TGW)
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

    // Fetch provincial tax rates for tax calculation
    const { data: taxRates, error: taxRatesError } = await supabase
      .from("provincial_tax_rates")
      .select("province_code, province_name, gst_rate, hst_rate, pst_rate, qst_rate, total_rate, is_hst_province");

    if (taxRatesError) {
      console.error("Error fetching tax rates:", taxRatesError);
    }

    // Build lookup maps: province code -> rates, and province name -> code
    const taxRateMap: Record<string, any> = {};
    const provinceNameToCode: Record<string, string> = {};
    for (const rate of (taxRates || [])) {
      taxRateMap[rate.province_code] = rate;
      provinceNameToCode[rate.province_name.toLowerCase()] = rate.province_code;
    }

    // Resolve province code from state field (could be code or full name)
    function resolveProvinceCode(state: string | null | undefined): string | null {
      if (!state) return null;
      const trimmed = state.trim();
      if (trimmed.length === 2 && taxRateMap[trimmed.toUpperCase()]) {
        return trimmed.toUpperCase();
      }
      const byName = provinceNameToCode[trimmed.toLowerCase()];
      if (byName) return byName;
      return null;
    }

    // Calculate date 7 days ago for filtering recent orders
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = sevenDaysAgo.toISOString();

    console.log(`Fetching Best Buy Canada orders since ${startDate}`);

    // Best Buy Canada uses Mirakl platform
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
      throw new Error("Failed to fetch orders from marketplace");
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

        // Customer info
        const customerName = order.customer
          ? `${order.customer.firstname} ${order.customer.lastname}`.trim()
          : null;
        const customerEmail = order.customer?.email || null;
        // Shipping address is nested inside customer object
        const shippingAddr = order.customer?.shipping_address || order.shipping_address;
        const customerPhone = shippingAddr?.phone || null;

        // Build customer address
        const shippingAddress = shippingAddr
          ? [
              shippingAddr.street_1,
              shippingAddr.street_2,
              `${shippingAddr.city}, ${shippingAddr.state || ""} ${shippingAddr.zip_code}`.trim(),
              shippingAddr.country,
            ]
              .filter(Boolean)
              .join("\n")
          : null;

        

        if (existingOrder) {
          // Backfill customer data and sync marketplace status on existing orders
          if (customerName || customerEmail || shippingAddress) {
            const bbyStatus = order.order_state || "UNKNOWN";
            const updates: any = { marketplace_status: bbyStatus };
            if (customerEmail) updates.customer_email = customerEmail;
            if (shippingAddress) updates.shipping_address = shippingAddress;
            if (customerName) updates.customer_name = customerName;
            
            // Sync fulfillment_status
            updates.fulfillment_status = mapBestBuyToFulfillment(order.order_state);

            await supabase
              .from("sales")
              .update(updates)
              .eq("order_number", orderNumber);

            // Also update all line-item sales for this order
            await supabase
              .from("sales")
              .update(updates)
              .like("order_number", `BBY-${order.commercial_id}-%`);

            // Upsert customer record
            await upsertCustomer(
              supabase,
              customerName,
              customerEmail,
              customerPhone,
              shippingAddress,
              companyId,
              "bestbuy",
              0
            );
          }
          skippedOrders.push(orderNumber);
          continue;
        }

        // Upsert customer record (once per order, before processing line items)
        const customerId = await upsertCustomer(
          supabase,
          customerName,
          customerEmail,
          customerPhone,
          shippingAddress,
          companyId,
          "bestbuy",
          0 // Will be updated per line item below if new
        );

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
            // Backfill customer data on existing line-item sales
            if (customerName || customerPhone || shippingAddress) {
              const updates: any = {};
              if (customerEmail) updates.customer_email = customerEmail;
              if (shippingAddress) updates.shipping_address = shippingAddress;
              if (customerName) updates.customer_name = customerName;
              await supabase.from("sales").update(updates).eq("id", existingLineOrder.id);
            }
            continue;
          }

          // Calculate values
          const salePrice = lineItem.total_price || lineItem.price;
          const shippingCost = lineItem.shipping_price || 0;
          const marketplaceFees = lineItem.commission_fee || 0;
          
          // Best Buy commission taxes are taxes ON the commission, not product tax
          const commissionTaxAmount = lineItem.commission_taxes?.reduce(
            (sum: number, tax: { amount: number; code: string }) => sum + (tax.amount || 0),
            0
          ) || 0;
          // Add commission tax to fees since it's our cost
          const totalFees = marketplaceFees + commissionTaxAmount;

          // Calculate tax from shipping province using provincial_tax_rates
          const province = shippingAddr?.state || null;
          const provinceCode = resolveProvinceCode(province);
          const taxRate = provinceCode ? taxRateMap[provinceCode] : null;

          let calculatedGst = 0;
          let calculatedHst = 0;
          let calculatedPst = 0;
          let calculatedQst = 0;
          let taxAmount = 0;

          if (taxRate) {
            // Tax is calculated on the sale price (pre-tax amount the customer pays)
            if (taxRate.is_hst_province && taxRate.hst_rate) {
              calculatedHst = parseFloat((salePrice * taxRate.hst_rate / 100).toFixed(2));
              taxAmount = calculatedHst;
            } else {
              calculatedGst = parseFloat((salePrice * taxRate.gst_rate / 100).toFixed(2));
              if (taxRate.pst_rate) {
                calculatedPst = parseFloat((salePrice * taxRate.pst_rate / 100).toFixed(2));
              }
              if (taxRate.qst_rate) {
                calculatedQst = parseFloat((salePrice * taxRate.qst_rate / 100).toFixed(2));
              }
              taxAmount = calculatedGst + calculatedPst + calculatedQst;
            }
            console.log(`Tax for ${provinceCode}: GST=${calculatedGst} HST=${calculatedHst} PST=${calculatedPst} QST=${calculatedQst} Total=${taxAmount}`);
          } else {
            console.warn(`No tax rate found for province: ${province} (resolved: ${provinceCode})`);
          }

          // Upsert customer
          const customerId = await upsertCustomer(
            supabase,
            customerName,
            customerEmail,
            customerPhone,
            shippingAddress,
            companyId,
            "bestbuy",
            salePrice
          );

          // Store raw Best Buy marketplace status
          const bbyMarketplaceStatus = order.order_state || "UNKNOWN";
          const lineItemStatus = lineItem.order_line_state || bbyMarketplaceStatus;
          const fulfillmentStatus = mapBestBuyToFulfillment(order.order_state);

          const notes = `Best Buy Order #${order.commercial_id} | Status: ${bbyMarketplaceStatus} | Line: ${lineItemStatus} | Province: ${provinceCode || province || 'N/A'} | Tax: $${taxAmount.toFixed(2)} | ${lineItem.product_title} (x${lineItem.quantity}) | Commission: ${(lineItem.commission_fee / salePrice * 100).toFixed(1)}%`;

          // Try to match device by SKU/IMEI with multiple fallback strategies
          let deviceId = null;
          if (lineItem.offer_sku) {
            // Strategy 1: Match by IMEI
            const { data: deviceByImei } = await supabase
              .from("devices")
              .select("id")
              .eq("imei", lineItem.offer_sku)
              .eq("status", "in_stock")
              .eq("company_id", companyId)
              .maybeSingle();

            if (deviceByImei) {
              deviceId = deviceByImei.id;
              console.log(`Matched device ${deviceByImei.id} by IMEI for SKU ${lineItem.offer_sku}`);
            }

            // Strategy 2: Match by SKU field
            if (!deviceId) {
              const { data: deviceBySku } = await supabase
                .from("devices")
                .select("id")
                .eq("sku", lineItem.offer_sku)
                .eq("status", "in_stock")
                .eq("company_id", companyId)
                .maybeSingle();

              if (deviceBySku) {
                deviceId = deviceBySku.id;
                console.log(`Matched device ${deviceBySku.id} by SKU for ${lineItem.offer_sku}`);
              }
            }

            // Strategy 3: Match by model from product title
            if (!deviceId && lineItem.product_title) {
              const { data: deviceByModel } = await supabase
                .from("devices")
                .select("id")
                .ilike("model", `%${lineItem.product_title.split(" ").slice(0, 3).join(" ")}%`)
                .eq("status", "in_stock")
                .eq("company_id", companyId)
                .limit(1)
                .maybeSingle();

              if (deviceByModel) {
                deviceId = deviceByModel.id;
                console.log(`Matched device ${deviceByModel.id} by model for "${lineItem.product_title}"`);
              }
            }
          }

          // Insert the sale with calculated tax from province
          const { data: insertedSale, error: insertError } = await supabase.from("sales").insert({
            order_number: lineOrderNumber,
            marketplace: "bestbuy",
            sale_price: salePrice,
            shipping_cost: shippingCost,
            marketplace_fees: parseFloat(totalFees.toFixed(2)),
            tax_amount: parseFloat(taxAmount.toFixed(2)),
            sale_date: order.created_date,
            customer_name: customerName,
            customer_email: customerEmail,
            shipping_address: shippingAddress,
            notes: notes,
            device_id: deviceId,
            company_id: companyId,
            customer_id: customerId,
            marketplace_status: lineItemStatus,
            fulfillment_status: fulfillmentStatus,
            is_marketplace_remitted: false, // Best Buy pays us the tax — we remit to CRA ourselves
            accounting_status: "unprocessed",
          }).select("id").single();

          if (insertError) {
            console.error(`Error inserting order line ${lineOrderNumber}:`, insertError);
            errors.push(`${lineOrderNumber}: ${insertError.message}`);
          } else {
            importedOrders.push(lineOrderNumber);

            // Insert tax breakdown into sales_tax_details
            if (taxAmount > 0 && insertedSale?.id) {
              const { error: taxError } = await supabase.from("sales_tax_details").insert({
                sale_id: insertedSale.id,
                company_id: companyId,
                customer_province: provinceCode,
                marketplace: "bestbuy",
                gst_amount: calculatedGst,
                hst_amount: calculatedHst,
                pst_amount: calculatedPst,
                qst_amount: calculatedQst,
                total_tax: parseFloat(taxAmount.toFixed(2)),
                is_marketplace_collected: false, // We collect and remit
              });
              if (taxError) {
                console.error(`Error inserting tax details for ${lineOrderNumber}:`, taxError);
              }
            }
          }
        }
      } catch (orderError: any) {
        console.error(`Error processing order ${order.commercial_id}:`, orderError);
        errors.push(`BBY-${order.commercial_id}: ${orderError.message}`);
      }
    }

    console.log(`Import complete: ${importedOrders.length} imported, ${skippedOrders.length} skipped, ${errors.length} errors`);

    // Log sync result
    const syncStatus = errors.length > 0 ? (importedOrders.length > 0 ? 'partial' : 'failure') : 'success';
    await supabase.from("sync_logs").insert({
      marketplace: "bestbuy",
      company_id: companyId,
      status: syncStatus,
      started_at: new Date(Date.now() - 30000).toISOString(),
      completed_at: new Date().toISOString(),
      records_imported: importedOrders.length,
      records_skipped: skippedOrders.length,
      records_errored: errors.length,
      error_message: errors.length > 0 ? errors.join("; ") : null,
      sync_type: "scheduled",
      metadata: { total_from_api: orders.length, total_count: data.total_count },
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
        marketplace: "bestbuy",
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
