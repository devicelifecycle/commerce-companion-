import { describe, it, expect, vi, beforeEach } from "vitest";

const insertedHeaders: any[] = [];
const lookedUpCodes: string[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const fromBuilder = (table: string) => {
    if (table === "chart_of_accounts") {
      // select('id').eq('company_id', X).eq('account_code', Y).single()
      // OR select('current_balance,normal_balance').eq('id', X).single()
      return {
        select: (cols: string) => {
          const builder: any = {
            _filters: {} as Record<string, any>,
            eq(col: string, val: any) {
              builder._filters[col] = val;
              if (col === "account_code") lookedUpCodes.push(val);
              return builder;
            },
            single() {
              if (cols.includes("current_balance")) {
                return Promise.resolve({
                  data: { current_balance: 0, normal_balance: "debit" },
                  error: null,
                });
              }
              return Promise.resolve({
                data: { id: `acc-${builder._filters.account_code}` },
                error: null,
              });
            },
          };
          return builder;
        },
        update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      };
    }
    if (table === "journal_entries") {
      return {
        insert: (row: any) => {
          insertedHeaders.push(row);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: `je-${insertedHeaders.length}` }, error: null }),
            }),
          };
        },
      };
    }
    if (table === "journal_entry_lines") {
      return { insert: () => Promise.resolve({ data: null, error: null }) };
    }
    return {} as any;
  };
  return { supabase: { from: vi.fn(fromBuilder) } };
});

import {
  createSaleJournalEntries,
  createPaymentReceivedJournalEntry,
  createPurchaseJournalEntry,
} from "../journalAutomation";

beforeEach(() => {
  insertedHeaders.length = 0;
  lookedUpCodes.length = 0;
});

describe("journalAutomation", () => {
  it("creates balanced revenue + COGS entries for Amazon (VES) sale", async () => {
    await createSaleJournalEntries({
      companyId: "co-ves",
      saleId: "sale-1",
      saleDate: "2026-01-15",
      marketplace: "amazon",
      settlementAmount: 100, // debits
      salePrice: 100,
      taxCollected: 13,
      marketplaceFees: 10,
      shippingCost: 3,
      deviceCost: 60,
      deviceDescription: "iPhone 14",
      orderNumber: "AMZ-001",
    });

    expect(insertedHeaders.length).toBe(2); // revenue + COGS
    insertedHeaders.forEach((h) => {
      expect(Math.abs(Number(h.total_debit) - Number(h.total_credit))).toBeLessThan(0.01);
    });
  });

  it("uses VES account codes (1000 Cash, 1050 AR) for amazon", async () => {
    await createPaymentReceivedJournalEntry({
      companyId: "co-ves",
      paymentDate: "2026-01-20",
      amount: 100,
      referenceId: "pay-1",
      description: "Amazon payout",
      isVES: true,
    });
    expect(lookedUpCodes).toContain("1000");
    expect(lookedUpCodes).toContain("1050");
  });

  it("uses TGW account codes (1001 Cash, 1051 AR) when isVES=false", async () => {
    await createPaymentReceivedJournalEntry({
      companyId: "co-tgw",
      paymentDate: "2026-01-20",
      amount: 100,
      referenceId: "pay-2",
      description: "Shopify payout",
      isVES: false,
    });
    expect(lookedUpCodes).toContain("1001");
    expect(lookedUpCodes).toContain("1051");
  });

  it("creates balanced purchase entry with HST and QST", async () => {
    await createPurchaseJournalEntry({
      companyId: "co-ves",
      purchaseId: "po-1",
      receiveDate: "2026-01-10",
      supplierName: "MobileSentrix",
      poNumber: "PO-100",
      unitCost: 1000,
      gstHstAmount: 130,
      qstAmount: 50,
      totalAmount: 1180,
      deviceDescription: "iPhone Lot",
      isVES: true,
    });

    expect(insertedHeaders.length).toBe(1);
    const h = insertedHeaders[0];
    expect(Math.abs(Number(h.total_debit) - Number(h.total_credit))).toBeLessThan(0.01);
    expect(Number(h.total_debit)).toBeCloseTo(1180);
  });

  it("revenue account selection: 4000=amazon, 4100=bestbuy, 4101=shopify", async () => {
    await createSaleJournalEntries({
      companyId: "co",
      saleId: "s1",
      saleDate: "2026-01-15",
      marketplace: "bestbuy",
      settlementAmount: 100,
      salePrice: 100,
      taxCollected: 0,
      marketplaceFees: 0,
      shippingCost: 0,
      deviceCost: 0,
      deviceDescription: "x",
      orderNumber: "BB-1",
    });
    expect(lookedUpCodes).toContain("4100");
  });
});
