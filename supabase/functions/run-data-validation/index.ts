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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const issuesFound: any[] = [];

    // Get companies
    const { data: companies } = await supabase.from("companies").select("id, code");
    const companyMap: Record<string, string> = {};
    companies?.forEach((c) => { companyMap[c.id] = c.code; });

    // === CHECK 1: Missing tax calculations ===
    const { data: salesNoTax } = await supabase
      .from("sales")
      .select("id, order_number, marketplace, sale_price, tax_amount, company_id, sale_date")
      .or("tax_amount.is.null,tax_amount.eq.0")
      .not("marketplace", "eq", "amazon")
      .order("sale_date", { ascending: false })
      .limit(100);

    for (const sale of salesNoTax || []) {
      if (sale.sale_price > 0) {
        issuesFound.push({
          issue_type: "missing_tax",
          severity: "warning",
          marketplace: sale.marketplace,
          company_id: sale.company_id,
          record_id: sale.id,
          record_type: "sale",
          description: `Order ${sale.order_number} has $0 tax on $${sale.sale_price} sale`,
          details: { sale_price: sale.sale_price, sale_date: sale.sale_date },
        });
      }
    }

    // === CHECK 2: Unlinked inventory (revenue_only for >48h) ===
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: unlinkedSales } = await supabase
      .from("sales")
      .select("id, order_number, marketplace, sale_price, company_id, sale_date, accounting_status")
      .eq("accounting_status", "revenue_only")
      .lt("sale_date", twoDaysAgo)
      .order("sale_date", { ascending: true })
      .limit(100);

    for (const sale of unlinkedSales || []) {
      issuesFound.push({
        issue_type: "unlinked_inventory",
        severity: "critical",
        marketplace: sale.marketplace,
        company_id: sale.company_id,
        record_id: sale.id,
        record_type: "sale",
        description: `Order ${sale.order_number} has no linked device (revenue_only since ${new Date(sale.sale_date).toLocaleDateString()})`,
        details: { sale_price: sale.sale_price, sale_date: sale.sale_date, accounting_status: sale.accounting_status },
      });
    }

    // === CHECK 3: Fee anomalies (commission rate outside expected range) ===
    const { data: salesForFees } = await supabase
      .from("sales")
      .select("id, order_number, marketplace, sale_price, marketplace_fees, company_id")
      .gt("sale_price", 0)
      .gt("marketplace_fees", 0)
      .order("sale_date", { ascending: false })
      .limit(500);

    const expectedFeeRanges: Record<string, [number, number]> = {
      amazon: [0.05, 0.25],
      bestbuy: [0.05, 0.25],
      shopify: [0.01, 0.10],
    };

    for (const sale of salesForFees || []) {
      const feeRate = sale.marketplace_fees / sale.sale_price;
      const range = expectedFeeRanges[sale.marketplace] || [0.01, 0.30];
      if (feeRate < range[0] || feeRate > range[1]) {
        issuesFound.push({
          issue_type: "fee_anomaly",
          severity: "warning",
          marketplace: sale.marketplace,
          company_id: sale.company_id,
          record_id: sale.id,
          record_type: "sale",
          description: `Order ${sale.order_number} has unusual fee rate: ${(feeRate * 100).toFixed(1)}% ($${sale.marketplace_fees} on $${sale.sale_price})`,
          details: { sale_price: sale.sale_price, marketplace_fees: sale.marketplace_fees, fee_rate: feeRate },
        });
      }
    }

    // === CHECK 4: Zero/negative sale price ===
    const { data: zeroSales } = await supabase
      .from("sales")
      .select("id, order_number, marketplace, sale_price, company_id, sale_date")
      .lte("sale_price", 0)
      .limit(50);

    for (const sale of zeroSales || []) {
      issuesFound.push({
        issue_type: "zero_sale",
        severity: "critical",
        marketplace: sale.marketplace,
        company_id: sale.company_id,
        record_id: sale.id,
        record_type: "sale",
        description: `Order ${sale.order_number} has $${sale.sale_price} sale price`,
        details: { sale_price: sale.sale_price, sale_date: sale.sale_date },
      });
    }

    // === CHECK 5: Order number gap detection per marketplace ===
    for (const marketplace of ["shopify", "bestbuy"]) {
      const { data: recentOrders } = await supabase
        .from("sales")
        .select("order_number, sale_date")
        .eq("marketplace", marketplace)
        .order("sale_date", { ascending: false })
        .limit(200);

      if (recentOrders && recentOrders.length > 1) {
        const numbers = recentOrders
          .map((o) => {
            const match = o.order_number.match(/\d+$/);
            return match ? parseInt(match[0]) : null;
          })
          .filter((n): n is number => n !== null)
          .sort((a, b) => a - b);

        const gaps: number[] = [];
        for (let i = 1; i < numbers.length; i++) {
          const diff = numbers[i] - numbers[i - 1];
          if (diff > 1 && diff < 10) {
            for (let g = numbers[i - 1] + 1; g < numbers[i]; g++) {
              gaps.push(g);
            }
          }
        }

        if (gaps.length > 0) {
          const companyId = marketplace === "amazon"
            ? companies?.find((c) => c.code === "VES")?.id
            : companies?.find((c) => c.code === "TGW")?.id;

          issuesFound.push({
            issue_type: "order_gap",
            severity: "warning",
            marketplace,
            company_id: companyId || null,
            record_type: "sale",
            description: `${gaps.length} potential missing order number(s) detected for ${marketplace}`,
            details: { missing_numbers: gaps.slice(0, 20), total_gaps: gaps.length },
          });
        }
      }
    }

    // === CHECK 6: Sales missing province (relevant for tax) ===
    const { data: salesNoProvince } = await supabase
      .from("sales")
      .select("id, order_number, marketplace, company_id, notes, shipping_address")
      .not("marketplace", "eq", "amazon")
      .is("shipping_address", null)
      .order("sale_date", { ascending: false })
      .limit(50);

    for (const sale of salesNoProvince || []) {
      const hasProvince = sale.notes?.includes("Province:") && !sale.notes?.includes("Province: N/A");
      if (!hasProvince) {
        issuesFound.push({
          issue_type: "missing_province",
          severity: "warning",
          marketplace: sale.marketplace,
          company_id: sale.company_id,
          record_id: sale.id,
          record_type: "sale",
          description: `Order ${sale.order_number} has no shipping province — tax calculation may be inaccurate`,
          details: {},
        });
      }
    }

    // === CHECK 7: Unbalanced journal entries (total_debit ≠ total_credit) ===
    const { data: unbalancedJEs } = await supabase
      .from("journal_entries")
      .select("id, entry_number, company_id, total_debit, total_credit, description")
      .neq("status", "voided")
      .order("entry_date", { ascending: false })
      .limit(1000);

    for (const je of unbalancedJEs || []) {
      const debit = Number(je.total_debit || 0);
      const credit = Number(je.total_credit || 0);
      if (Math.abs(debit - credit) > 0.01) {
        issuesFound.push({
          issue_type: "unbalanced_je",
          severity: "critical",
          company_id: je.company_id,
          record_id: je.id,
          record_type: "journal_entry",
          description: `Journal entry ${je.entry_number} is unbalanced: debit $${debit.toFixed(2)} ≠ credit $${credit.toFixed(2)}`,
          details: { total_debit: debit, total_credit: credit, difference: Math.abs(debit - credit) },
        });
      }
    }

    // === CHECK 8: Orphan journal entries (reference_id points to missing records) ===
    const { data: jeWithRefs } = await supabase
      .from("journal_entries")
      .select("id, entry_number, company_id, reference_type, reference_id")
      .not("reference_id", "is", null)
      .not("reference_type", "is", null)
      .neq("status", "voided")
      .order("entry_date", { ascending: false })
      .limit(500);

    for (const je of jeWithRefs || []) {
      let exists = true;
      if (je.reference_type === "sale") {
        const { data } = await supabase.from("sales").select("id").eq("id", je.reference_id).maybeSingle();
        exists = !!data;
      } else if (je.reference_type === "expense") {
        const { data } = await supabase.from("expenses").select("id").eq("id", je.reference_id).maybeSingle();
        exists = !!data;
      } else if (je.reference_type === "invoice") {
        const { data } = await supabase.from("invoices").select("id").eq("id", je.reference_id).maybeSingle();
        exists = !!data;
      }
      if (!exists) {
        issuesFound.push({
          issue_type: "orphan_je",
          severity: "warning",
          company_id: je.company_id,
          record_id: je.id,
          record_type: "journal_entry",
          description: `Journal entry ${je.entry_number} references a deleted ${je.reference_type} (${je.reference_id?.slice(0, 8)}...)`,
          details: { reference_type: je.reference_type, reference_id: je.reference_id },
        });
      }
    }

    // === CHECK 9: AP/AR records without linked journal entries ===
    const { data: arRecords } = await supabase
      .from("accounts_receivable")
      .select("id, customer_name, original_amount, company_id, source_type, source_reference")
      .order("created_at", { ascending: false })
      .limit(500);

    for (const ar of arRecords || []) {
      const { data: linkedJE } = await supabase
        .from("journal_entries")
        .select("id")
        .or(`reference_id.eq.${ar.id},description.ilike.%${ar.source_reference || 'NONE'}%`)
        .limit(1);

      if (!linkedJE || linkedJE.length === 0) {
        // Check if any JE references this AR via its source reference
        const { data: jeByRef } = await supabase
          .from("journal_entries")
          .select("id")
          .eq("reference_id", ar.id)
          .limit(1);

        if (!jeByRef || jeByRef.length === 0) {
          issuesFound.push({
            issue_type: "ar_no_je",
            severity: "warning",
            company_id: ar.company_id,
            record_id: ar.id,
            record_type: "accounts_receivable",
            description: `AR for ${ar.customer_name || 'Unknown'} ($${ar.original_amount}) has no linked journal entry`,
            details: { original_amount: ar.original_amount, source_type: ar.source_type },
          });
        }
      }
    }

    // === CHECK 10: Expenses without journal entries ===
    const { data: expensesAll } = await supabase
      .from("expenses")
      .select("id, description, amount, company_id, expense_date")
      .eq("approval_status", "approved")
      .order("expense_date", { ascending: false })
      .limit(500);

    for (const expense of expensesAll || []) {
      const { data: linkedJE } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("reference_type", "expense")
        .eq("reference_id", expense.id)
        .limit(1);

      if (!linkedJE || linkedJE.length === 0) {
        issuesFound.push({
          issue_type: "expense_no_je",
          severity: "warning",
          company_id: expense.company_id,
          record_id: expense.id,
          record_type: "expense",
          description: `Expense "${expense.description}" ($${expense.amount}) has no journal entry`,
          details: { amount: expense.amount, expense_date: expense.expense_date },
        });
      }
    }

    // === CHECK 11: Unmapped chart of accounts codes ===
    const knownCodes = new Set([
      '1000','1001','1050','1051','1100','1101','1200','1201',
      '2000','2001','2010','2011','2050','2051','2100','2101',
      '3000','3001','3100','3101',
      '4000','4100','4101','4200','4201','4300','4400','4401',
      '5000','5001',
      '6000','6001','6100','6101','6200','6201','6300','6301','6400','6401','6500','6501',
      '7000','7001','7100','7101','7200','7201',
      '8000','8001','8100','8101',
    ]);

    const { data: allAccounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, company_id")
      .eq("is_active", true);

    for (const acc of allAccounts || []) {
      if (!knownCodes.has(acc.account_code)) {
        issuesFound.push({
          issue_type: "unmapped_account",
          severity: "warning",
          company_id: acc.company_id,
          record_id: acc.id,
          record_type: "chart_of_accounts",
          description: `Account ${acc.account_code} (${acc.account_name}) is not mapped in reports — may be excluded from P&L/Balance Sheet`,
          details: { account_code: acc.account_code, account_name: acc.account_name },
        });
      }
    }

    // === CHECK 12: Orphan devices — status 'sold' but no sale record ===
    const { data: soldDevices } = await supabase
      .from("devices")
      .select("id, brand, model, imei, company_id")
      .eq("status", "sold")
      .limit(500);

    for (const device of soldDevices || []) {
      const { data: sale } = await supabase
        .from("sales")
        .select("id")
        .eq("device_id", device.id)
        .limit(1);

      if (!sale || sale.length === 0) {
        issuesFound.push({
          issue_type: "orphan_sold_device",
          severity: "critical",
          company_id: device.company_id,
          record_id: device.id,
          record_type: "device",
          description: `${device.brand} ${device.model}${device.imei ? ` (${device.imei})` : ''} is marked "sold" but has no linked sale`,
          details: { brand: device.brand, model: device.model, imei: device.imei },
        });
      }
    }

    // === CHECK 13: Duplicate IMEIs (informational — unique index now prevents new dupes) ===
    const { data: imeiDevices } = await supabase
      .from("devices")
      .select("imei, company_id")
      .not("imei", "is", null)
      .neq("imei", "")
      .limit(2000);

    const imeiCounts: Record<string, { count: number; companyId: string | null }> = {};
    for (const d of imeiDevices || []) {
      if (d.imei) {
        if (imeiCounts[d.imei]) {
          imeiCounts[d.imei].count++;
        } else {
          imeiCounts[d.imei] = { count: 1, companyId: d.company_id };
        }
      }
    }
    for (const [imei, info] of Object.entries(imeiCounts)) {
      if (info.count > 1) {
        issuesFound.push({
          issue_type: "duplicate_imei",
          severity: "critical",
          company_id: info.companyId,
          record_type: "device",
          description: `IMEI ${imei} appears ${info.count} times in inventory`,
          details: { imei, count: info.count },
        });
      }
    }

    // === Clear old resolved issues and upsert new ones ===
    for (const issue of issuesFound) {
      let query = supabase
        .from("data_validation_issues")
        .select("id")
        .eq("issue_type", issue.issue_type)
        .eq("status", "open");

      if (issue.record_id) {
        query = query.eq("record_id", issue.record_id);
      } else if (issue.marketplace) {
        query = query.eq("marketplace", issue.marketplace).eq("description", issue.description);
      }

      const { data: existing } = await query.maybeSingle();

      if (!existing) {
        await supabase.from("data_validation_issues").insert(issue);
      }
    }

    // Auto-resolve issues that no longer exist
    const { data: openIssues } = await supabase
      .from("data_validation_issues")
      .select("id, record_id, issue_type")
      .eq("status", "open");

    const foundRecordKeys = new Set(
      issuesFound.filter((i) => i.record_id).map((i) => `${i.record_id}-${i.issue_type}`)
    );

    for (const open of openIssues || []) {
      if (open.record_id && !foundRecordKeys.has(`${open.record_id}-${open.issue_type}`)) {
        await supabase
          .from("data_validation_issues")
          .update({ status: "resolved", resolved_at: new Date().toISOString() })
          .eq("id", open.id);
      }
    }

    console.log(`Validation complete: ${issuesFound.length} issues found`);

    return new Response(
      JSON.stringify({
        success: true,
        issues_found: issuesFound.length,
        breakdown: {
          missing_tax: issuesFound.filter((i) => i.issue_type === "missing_tax").length,
          unlinked_inventory: issuesFound.filter((i) => i.issue_type === "unlinked_inventory").length,
          fee_anomaly: issuesFound.filter((i) => i.issue_type === "fee_anomaly").length,
          zero_sale: issuesFound.filter((i) => i.issue_type === "zero_sale").length,
          order_gap: issuesFound.filter((i) => i.issue_type === "order_gap").length,
          missing_province: issuesFound.filter((i) => i.issue_type === "missing_province").length,
          unbalanced_je: issuesFound.filter((i) => i.issue_type === "unbalanced_je").length,
          orphan_je: issuesFound.filter((i) => i.issue_type === "orphan_je").length,
          ar_no_je: issuesFound.filter((i) => i.issue_type === "ar_no_je").length,
          expense_no_je: issuesFound.filter((i) => i.issue_type === "expense_no_je").length,
          unmapped_account: issuesFound.filter((i) => i.issue_type === "unmapped_account").length,
          orphan_sold_device: issuesFound.filter((i) => i.issue_type === "orphan_sold_device").length,
          duplicate_imei: issuesFound.filter((i) => i.issue_type === "duplicate_imei").length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Validation error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});