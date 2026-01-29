import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ForecastRequest {
  type: "revenue" | "inventory" | "profit";
  months?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { type = "revenue", months = 3 }: ForecastRequest = await req.json();

    // Fetch historical data
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [salesResult, expensesResult, devicesResult] = await Promise.all([
      supabase
        .from("sales")
        .select("sale_price, profit, sale_date, marketplace")
        .gte("sale_date", sixMonthsAgo.toISOString()),
      supabase
        .from("expenses")
        .select("amount, category, expense_date")
        .gte("expense_date", sixMonthsAgo.toISOString().split("T")[0]),
      supabase
        .from("devices")
        .select("brand, model, cost_price, status, created_at")
    ]);

    const sales = salesResult.data || [];
    const expenses = expensesResult.data || [];
    const devices = devicesResult.data || [];

    // Calculate monthly stats
    const monthlyStats: Record<string, { revenue: number; profit: number; sales: number; expenses: number }> = {};
    
    sales.forEach((sale) => {
      const month = new Date(sale.sale_date).toISOString().slice(0, 7);
      if (!monthlyStats[month]) {
        monthlyStats[month] = { revenue: 0, profit: 0, sales: 0, expenses: 0 };
      }
      monthlyStats[month].revenue += Number(sale.sale_price) || 0;
      monthlyStats[month].profit += Number(sale.profit) || 0;
      monthlyStats[month].sales += 1;
    });

    expenses.forEach((expense) => {
      const month = new Date(expense.expense_date).toISOString().slice(0, 7);
      if (!monthlyStats[month]) {
        monthlyStats[month] = { revenue: 0, profit: 0, sales: 0, expenses: 0 };
      }
      monthlyStats[month].expenses += Number(expense.amount) || 0;
    });

    // Calculate inventory stats
    const inStock = devices.filter((d) => d.status === "in_stock");
    const brandCounts: Record<string, number> = {};
    inStock.forEach((d) => {
      brandCounts[d.brand] = (brandCounts[d.brand] || 0) + 1;
    });

    const dataContext = `
Historical Sales Data (Last 6 months):
${Object.entries(monthlyStats)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([month, data]) => 
    `- ${month}: Revenue: $${data.revenue.toFixed(2)}, Profit: $${data.profit.toFixed(2)}, Sales: ${data.sales}, Expenses: $${data.expenses.toFixed(2)}`
  ).join("\n")}

Current Inventory:
- Total devices in stock: ${inStock.length}
- Total inventory value: $${inStock.reduce((sum, d) => sum + Number(d.cost_price), 0).toFixed(2)}
- Brands in stock: ${Object.entries(brandCounts).map(([brand, count]) => `${brand}: ${count}`).join(", ")}

Total sales count: ${sales.length}
Average sale price: $${sales.length > 0 ? (sales.reduce((sum, s) => sum + Number(s.sale_price), 0) / sales.length).toFixed(2) : "0"}
Average profit per sale: $${sales.length > 0 ? (sales.reduce((sum, s) => sum + Number(s.profit || 0), 0) / sales.length).toFixed(2) : "0"}
`;

    let systemPrompt = "";
    if (type === "revenue") {
      systemPrompt = `You are a business analytics AI for a phone resale business. Analyze the provided sales data and provide revenue forecasts for the next ${months} months. Be specific with numbers and provide actionable insights. Format your response as JSON with this structure:
{
  "forecast": [{"month": "YYYY-MM", "predicted_revenue": number, "confidence": "high"|"medium"|"low"}],
  "trend": "growing"|"stable"|"declining",
  "insights": ["insight1", "insight2", "insight3"],
  "recommendations": ["recommendation1", "recommendation2"]
}`;
    } else if (type === "inventory") {
      systemPrompt = `You are an inventory management AI for a phone resale business. Analyze the provided inventory and sales data to predict inventory needs. Format your response as JSON with this structure:
{
  "recommendations": [{"brand": string, "action": "restock"|"reduce"|"maintain", "quantity": number, "reason": string}],
  "alerts": [{"type": "low_stock"|"slow_moving"|"high_demand", "message": string}],
  "optimal_stock_level": number,
  "insights": ["insight1", "insight2"]
}`;
    } else {
      systemPrompt = `You are a profitability analyst AI for a phone resale business. Analyze the provided data to provide profit forecasts and cost optimization suggestions. Format your response as JSON with this structure:
{
  "profit_forecast": [{"month": "YYYY-MM", "predicted_profit": number, "margin_percentage": number}],
  "cost_breakdown": {"inventory": number, "expenses": number, "total": number},
  "optimization_tips": ["tip1", "tip2", "tip3"],
  "risk_factors": ["risk1", "risk2"]
}`;
    }

    console.log("Calling Lovable AI for forecast...");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: dataContext },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    let forecast;
    try {
      forecast = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      forecast = { error: "Failed to parse forecast", raw: content };
    }

    console.log("Forecast generated successfully");

    return new Response(JSON.stringify({ type, forecast, generated_at: new Date().toISOString() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Forecast error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
