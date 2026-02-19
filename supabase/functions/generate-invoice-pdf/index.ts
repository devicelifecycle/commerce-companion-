import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = authHeader.replace('Bearer ', '');
    if (token !== supabaseKey) {
      const authClient = createClient(supabaseUrl, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: userData, error: authError } = await authClient.auth.getUser();
      if (authError || !userData.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const { invoiceId } = await req.json();
    if (!invoiceId) throw new Error("invoiceId required");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch invoice
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();
    if (invErr || !invoice) throw new Error("Invoice not found");

    // Fetch line items
    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("created_at");

    // Fetch company settings
    const { data: companySettings } = await supabase
      .from("company_settings")
      .select("*")
      .eq("company_id", invoice.company_id)
      .maybeSingle();

    const { data: company } = await supabase
      .from("companies")
      .select("*")
      .eq("id", invoice.company_id)
      .maybeSingle();

    const TAX_LABELS: Record<string, string> = {
      hst: "HST 13%",
      gst: "GST 5%",
      zero_rated: "Zero-Rated",
      tax_inclusive: "Tax Incl.",
    };

    const formatCurrency = (v: number) =>
      new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(v);

    const companyName = companySettings?.legal_name || company?.name || "Company";
    const companyAddr = [
      companySettings?.address_line1,
      companySettings?.address_line2,
      [companySettings?.city, companySettings?.province, companySettings?.postal_code].filter(Boolean).join(", "),
    ].filter(Boolean).join("<br/>");

    const lineItemsHtml = (items || []).map((item: any) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${item.description}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(item.unit_price)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${TAX_LABELS[item.tax_treatment] || item.tax_treatment}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(item.total)}</td>
      </tr>
    `).join("");

    const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><style>
      body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 40px; font-size: 13px; }
      .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
      .company-info { font-size: 12px; color: #666; line-height: 1.6; }
      .invoice-title { font-size: 28px; font-weight: 700; color: #111; }
      .invoice-meta { text-align: right; font-size: 12px; color: #666; line-height: 1.8; }
      .customer-section { background: #f9fafb; border-radius: 8px; padding: 16px 20px; margin-bottom: 30px; }
      .customer-section h3 { font-size: 11px; text-transform: uppercase; color: #999; margin: 0 0 8px; letter-spacing: 0.5px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
      th { background: #f3f4f6; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #666; letter-spacing: 0.5px; }
      .totals { margin-left: auto; width: 280px; }
      .totals tr td { padding: 6px 12px; }
      .totals .grand-total td { font-size: 16px; font-weight: 700; border-top: 2px solid #111; padding-top: 12px; }
      .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #999; text-align: center; }
    </style></head>
    <body>
      <div class="header">
        <div>
          <div class="invoice-title">INVOICE</div>
          <div class="company-info" style="margin-top:8px;">
            <strong>${companyName}</strong><br/>
            ${companyAddr}
            ${companySettings?.phone ? `<br/>Phone: ${companySettings.phone}` : ""}
            ${companySettings?.email ? `<br/>${companySettings.email}` : ""}
            ${companySettings?.gst_hst_number ? `<br/>GST/HST: ${companySettings.gst_hst_number}` : ""}
          </div>
        </div>
        <div class="invoice-meta">
          <strong>Invoice #:</strong> ${invoice.invoice_number}<br/>
          <strong>Issue Date:</strong> ${invoice.issue_date}<br/>
          <strong>Due Date:</strong> ${invoice.due_date}<br/>
          <strong>Status:</strong> ${invoice.status.toUpperCase()}
        </div>
      </div>

      <div class="customer-section">
        <h3>Bill To</h3>
        <strong>${invoice.customer_name}</strong>
        ${invoice.customer_address ? `<br/>${invoice.customer_address}` : ""}
        ${invoice.customer_email ? `<br/>${invoice.customer_email}` : ""}
        ${invoice.customer_phone ? `<br/>${invoice.customer_phone}` : ""}
        ${invoice.customer_gst_hst_number ? `<br/>GST/HST #: ${invoice.customer_gst_hst_number}` : ""}
      </div>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align:center;">Qty</th>
            <th style="text-align:right;">Unit Price</th>
            <th style="text-align:center;">Tax</th>
            <th style="text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemsHtml}
        </tbody>
      </table>

      <table class="totals">
        <tr><td style="color:#666;">Subtotal</td><td style="text-align:right;">${formatCurrency(invoice.subtotal)}</td></tr>
        <tr><td style="color:#666;">Tax</td><td style="text-align:right;">${formatCurrency(invoice.tax_amount)}</td></tr>
        <tr class="grand-total"><td>Total</td><td style="text-align:right;">${formatCurrency(invoice.total)}</td></tr>
      </table>

      ${invoice.notes ? `<div style="background:#f9fafb;border-radius:6px;padding:12px 16px;font-size:12px;color:#666;margin-top:20px;"><strong>Notes:</strong> ${invoice.notes}</div>` : ""}

      <div class="footer">
        Thank you for your business • ${companyName}
      </div>
    </body>
    </html>`;

    return new Response(JSON.stringify({ html }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
