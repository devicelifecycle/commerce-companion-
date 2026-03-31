import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = authHeader.replace("Bearer ", "");

    if (token !== SUPABASE_SERVICE_ROLE_KEY) {
      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: authError } = await authClient.auth.getUser();
      if (authError || !userData.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().split("T")[0];

    // Fetch all active recurring expense templates
    const { data: templates, error: fetchError } = await supabase
      .from("expenses")
      .select("*")
      .eq("is_recurring", true)
      .is("parent_expense_id", null) // Only templates, not generated children
      .or(`recurring_end_date.is.null,recurring_end_date.gte.${today}`);

    if (fetchError) throw fetchError;

    let generated = 0;
    let skipped = 0;

    for (const template of templates || []) {
      const freq = template.recurring_frequency;
      if (!freq) { skipped++; continue; }

      // Find the most recent generated child for this template
      const { data: lastChild } = await supabase
        .from("expenses")
        .select("expense_date")
        .eq("parent_expense_id", template.id)
        .order("expense_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastDate = lastChild?.expense_date
        ? new Date(lastChild.expense_date)
        : new Date(template.expense_date);

      // Calculate next due date
      const nextDate = new Date(lastDate);
      switch (freq) {
        case "weekly":
          nextDate.setDate(nextDate.getDate() + 7);
          break;
        case "biweekly":
          nextDate.setDate(nextDate.getDate() + 14);
          break;
        case "monthly":
          nextDate.setMonth(nextDate.getMonth() + 1);
          break;
        case "quarterly":
          nextDate.setMonth(nextDate.getMonth() + 3);
          break;
        case "annually":
          nextDate.setFullYear(nextDate.getFullYear() + 1);
          break;
        default:
          skipped++;
          continue;
      }

      const nextDateStr = nextDate.toISOString().split("T")[0];

      // Only generate if next date is today or in the past (catch-up)
      if (nextDateStr > today) {
        skipped++;
        continue;
      }

      // Create the child expense
      const { error: insertError } = await supabase.from("expenses").insert({
        company_id: template.company_id,
        description: template.description,
        amount: template.amount,
        category: template.category,
        subcategory: template.subcategory,
        vendor: template.vendor,
        expense_date: nextDateStr,
        payment_method: template.payment_method,
        gst_hst_amount: template.gst_hst_amount,
        pst_amount: template.pst_amount,
        total_amount: template.total_amount,
        is_tax_deductible: template.is_tax_deductible,
        is_shared: template.is_shared,
        allocation_ves: template.allocation_ves,
        allocation_tgw: template.allocation_tgw,
        is_recurring: false,
        parent_expense_id: template.id,
        approval_status: "approved",
        notes: `Auto-generated from recurring template (${freq})`,
        created_by: template.created_by,
      });

      if (insertError) {
        console.error(`Error generating expense from template ${template.id}:`, insertError);
      } else {
        generated++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        generated,
        skipped,
        templates_checked: templates?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Recurring expense error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
