import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    let fileContent: string;
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".csv")) {
      fileContent = await file.text();
    } else if (fileName.endsWith(".xls") || fileName.endsWith(".xlsx")) {
      // For Excel files, read as base64 and send to AI
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // Convert to CSV-like representation by reading raw text
      const decoder = new TextDecoder("utf-8", { fatal: false });
      fileContent = decoder.decode(bytes);
      // If binary, encode as base64 for AI processing
      if (fileContent.includes("\x00") || fileContent.includes("PK")) {
        const base64 = btoa(String.fromCharCode(...bytes.slice(0, 50000)));
        fileContent = `[Binary Excel file - base64 encoded first 50KB]: ${base64}`;
      }
    } else if (fileName.endsWith(".pdf")) {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const base64 = btoa(String.fromCharCode(...bytes));
      fileContent = `[PDF file - base64 encoded]`;
      // We'll send this as an image/document to the AI
    } else {
      fileContent = await file.text();
    }

    // Build the AI request
    const isPdf = fileName.endsWith(".pdf");
    const fileBytes = isPdf ? new Uint8Array(await file.arrayBuffer()) : null;

    const messages: any[] = [
      {
        role: "system",
        content: `You are an invoice parser for MobileSentrix repair parts invoices. Extract all line items from the invoice.

For each line item, extract:
- sku: The MobileSentrix SKU/part number
- name: The part description/name
- quantity: Number ordered
- unit_cost: Price per unit in CAD (BEFORE tax)
- category: One of: screen, battery, housing, camera, charging_port, speaker, button, connector, adhesive, general

Also extract these invoice-level fields:
- invoice_number: The invoice/order number
- invoice_date: The date (YYYY-MM-DD format)
- subtotal: Total before tax
- gst_hst_amount: GST/HST tax amount (look for tax line items)
- shipping_cost: Shipping cost if any
- total: Grand total

Return ONLY valid JSON in this exact format:
{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "subtotal": number,
  "gst_hst_amount": number,
  "shipping_cost": number,
  "total": number,
  "items": [
    {
      "sku": "string",
      "name": "string",
      "quantity": number,
      "unit_cost": number,
      "category": "string"
    }
  ]
}

Important:
- All monetary values should be numbers (not strings)
- If you can't determine a category, use "general"
- If shipping is free or not listed, use 0
- Parse the tax amount carefully - MobileSentrix charges HST 13% for Ontario customers`
      },
    ];

    if (isPdf && fileBytes) {
      const base64Data = btoa(String.fromCharCode(...fileBytes));
      messages.push({
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:application/pdf;base64,${base64Data}`,
            },
          },
          {
            type: "text",
            text: "Parse this MobileSentrix invoice and extract all line items. Return ONLY the JSON.",
          },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: `Parse this MobileSentrix invoice and extract all line items. Return ONLY the JSON.\n\nFile content:\n${fileContent}`,
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        temperature: 0.1,
        max_tokens: 8000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI API error: ${aiResponse.status} - ${errText}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Extract JSON from the response (may be wrapped in markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    return new Response(JSON.stringify({ success: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error parsing invoice:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to parse invoice" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
