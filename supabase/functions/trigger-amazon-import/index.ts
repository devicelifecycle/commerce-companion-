import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const startDate = body.startDate || "2026-02-01T00:00:00Z";

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/import-amazon-orders`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ startDate }),
  });

  const result = await resp.text();
  return new Response(result, {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: resp.status,
  });
});
