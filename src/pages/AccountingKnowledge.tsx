import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Search, Building2, Cog, Network, ArrowRight,
  DollarSign, Receipt, FileText, Package, RotateCcw, Wallet,
  Calculator, Scale, TrendingUp, ShieldCheck, Zap, GitBranch,
} from 'lucide-react';
import { CASH_BASIS_CHART_OF_ACCOUNTS } from '@/lib/accounting/chartOfAccounts';

const GENERAL_SECTIONS = [
  {
    title: 'Accrual-Basis Accounting',
    icon: <Scale className="h-4 w-4 text-primary" />,
    content: `This business uses accrual-basis accounting under IFRS principles. Revenue is recognized when goods are shipped or delivered — not when cash is received. Expenses are recognized when incurred, regardless of payment timing. This means a sale creates revenue and an Accounts Receivable entry immediately, while a purchase creates an expense and an Accounts Payable entry upon receipt of goods. This approach provides a more accurate picture of financial health at any point in time.`,
  },
  {
    title: 'Double-Entry Bookkeeping',
    icon: <Calculator className="h-4 w-4 text-primary" />,
    content: `Every financial transaction is recorded with at least two entries: a debit and a credit of equal value. Assets and expenses increase with debits; liabilities, equity, and revenue increase with credits. The fundamental equation (Assets = Liabilities + Equity) must always balance. For example, a sale debits Accounts Receivable (asset increases) and credits Sales Revenue (revenue increases). When payment is received, Cash is debited and AR is credited.`,
  },
  {
    title: 'FIFO Inventory Valuation',
    icon: <Package className="h-4 w-4 text-primary" />,
    content: `Inventory is valued using the First-In, First-Out (FIFO) method. When devices are sold, the cost of the oldest inventory is recognized as Cost of Goods Sold first. Each import batch creates a "cost layer" — when a device from that batch is sold, its original purchase cost (plus any allocated shipping/charges) becomes COGS. This is standard practice for electronics resale where individual unit costs vary by purchase lot.`,
  },
  {
    title: 'Multi-Entity Structure (VES & TGW)',
    icon: <Building2 className="h-4 w-4 text-primary" />,
    content: `The business operates as two separate legal entities: Virtual eShop (VES) and Tech Genius Warehouse (TGW). Each entity has its own set of books — separate bank accounts, AR/AP, inventory, and tax obligations. VES primarily sells on Amazon; TGW sells on Best Buy and Shopify. Shared expenses (rent, software, salaries) are allocated between entities using configurable percentages. Inter-company transfers create matching receivable/payable entries on each side.`,
  },
  {
    title: 'Canadian Tax Obligations (GST/HST)',
    icon: <Receipt className="h-4 w-4 text-primary" />,
    content: `As Ontario-based businesses, both entities collect HST (Harmonized Sales Tax) at 13% on taxable sales. Tax collected is held as a liability (GST/HST Payable) until remitted to the CRA. Input Tax Credits (ITCs) are claimed on GST/HST paid on business purchases, reducing the net tax owing. For marketplace sales, the marketplace typically collects and remits tax — but the system still tracks these amounts for reconciliation. Tax filing periods are managed quarterly or annually depending on revenue thresholds.`,
  },
  {
    title: 'Accounts Receivable (AR) Lifecycle',
    icon: <TrendingUp className="h-4 w-4 text-primary" />,
    content: `AR represents money owed to the business. When a sale occurs or an invoice is issued, an AR entry is created with the full amount due. As payments are received, the AR balance decreases. For marketplace sales, the marketplace holds funds until payout — AR tracks the expected payout amount. The aging report categorizes outstanding AR by how long it has been unpaid (Current, 30 days, 60 days, 90+ days) to identify collection risks.`,
  },
  {
    title: 'Accounts Payable (AP) Lifecycle',
    icon: <DollarSign className="h-4 w-4 text-primary" />,
    content: `AP represents money the business owes to suppliers. When goods are received (via GRN) or when an expense uses a non-immediate payment method, an AP entry is created. Payments against AP are recorded individually, and partial payments are supported. AP aging reports track overdue obligations. The system enforces payment method selection on all purchases — immediate payment methods (Cash, Debit/Credit) skip AP and debit Cash directly.`,
  },
  {
    title: 'Inter-Company Transactions',
    icon: <GitBranch className="h-4 w-4 text-primary" />,
    content: `When inventory moves between VES and TGW, the system creates matching inter-company entries. The selling entity records revenue and an inter-company receivable; the buying entity records inventory and an inter-company payable. These inter-company balances must net to zero in consolidated reporting. Transfer prices are typically set at cost plus a margin, and each transfer is fully documented in the audit trail.`,
  },
];

const SYSTEM_SECTIONS = [
  {
    title: 'Automated Journal Entries',
    icon: <Zap className="h-4 w-4 text-primary" />,
    content: `Unlike traditional accounting where bookkeepers manually post journal entries, this system auto-generates them. When a sale is recorded, the system immediately posts: DR Accounts Receivable / CR Sales Revenue / CR GST/HST Payable. When a device is linked to the sale, it adds: DR COGS / CR Inventory. When goods are received via GRN, it posts: DR Inventory / CR Accounts Payable. Expense payments post: DR Expense / CR Cash (or CR AP). Returns reverse all original entries. This eliminates manual posting errors and ensures real-time ledger accuracy.`,
  },
  {
    title: 'Accounting Status Pipeline',
    icon: <Cog className="h-4 w-4 text-primary" />,
    content: `Every sale has an "accounting_status" field that tracks its automation progress: (1) "unprocessed" — sale recorded but no journal entries created yet; (2) "revenue_only" — revenue recognition and AR entries posted, but no COGS (device not yet linked or cost unknown); (3) "fully_processed" — all entries complete including COGS and inventory reduction. This pipeline ensures no sale falls through the cracks and allows the system to batch-process incomplete entries.`,
  },
  {
    title: 'Lot-Based Cost Tracking',
    icon: <Package className="h-4 w-4 text-primary" />,
    content: `Every import batch is treated as a "lot" with a unique lot number. Shipping costs, customs fees, and other charges entered during import are allocated proportionally across all devices in the batch. This creates a true "landed cost" per device. When a device is sold, its specific landed cost from its lot is used for COGS — not an average or estimated cost. This provides precise per-unit profitability analysis.`,
  },
  {
    title: 'Shared Expense Allocation',
    icon: <Wallet className="h-4 w-4 text-primary" />,
    content: `Shared business expenses (rent, software, salaries) are allocated between VES and TGW using configurable split percentages. Each expense category has default allocation ratios (e.g., rent might be 60% VES / 40% TGW). When a shared expense is recorded, the system creates separate journal entries for each entity proportional to their allocation. These defaults can be overridden per-expense, and allocation rules are managed in Settings.`,
  },
  {
    title: 'Model Normalization',
    icon: <ShieldCheck className="h-4 w-4 text-primary" />,
    content: `Device model names from different sources (suppliers, marketplaces) vary wildly. The system automatically normalizes these names to a standard format during import. For example, "Apple iPhone 15 Pro Max 256GB", "iphone15promax 256", and "iPhone 15 PM 256" all normalize to "iPhone 15 Pro Max". This ensures accurate inventory counts, sales analysis, and cost tracking across all sources.`,
  },
  {
    title: 'Mandatory Payment Method & AP Creation',
    icon: <DollarSign className="h-4 w-4 text-primary" />,
    content: `Every purchase and expense requires a payment method selection. The system distinguishes between immediate payments (Cash, Debit Card, Credit Card) and deferred payments (Check, Wire Transfer, Net 30, etc.). Immediate payments debit the Cash account directly. Deferred payments create an Accounts Payable entry that must be settled later — this ensures nothing is "lost" and all obligations are tracked in the ledger.`,
  },
  {
    title: 'Duplicate Prevention & Validation',
    icon: <ShieldCheck className="h-4 w-4 text-primary" />,
    content: `The system runs automated validation checks to prevent common data issues: duplicate order IDs from marketplace imports, IMEI conflicts, missing required fields, and price anomalies. A dedicated Integration Health page surfaces these issues for review. Edge functions validate data on import and flag discrepancies between marketplace-reported figures and internal calculations.`,
  },
  {
    title: 'Real-Time Audit Trail',
    icon: <FileText className="h-4 w-4 text-primary" />,
    content: `Every action in the system is logged with full before/after data snapshots. The audit log captures: who made the change, what changed (old vs new values), when it happened, and which module was affected. Entity relationship chains (Sale → Device → Journal Entry → AR Payment) are traceable end-to-end. This provides complete accountability and makes tax audits straightforward.`,
  },
];

const ENTITY_RELATIONSHIPS = [
  { source: 'sales', link: 'device_id', target: 'devices', description: 'Each sale links to the device sold' },
  { source: 'sales', link: 'company_id', target: 'companies', description: 'Sale belongs to VES or TGW' },
  { source: 'sales', link: 'customer_id', target: 'customers', description: 'Sale links to customer record' },
  { source: 'devices', link: 'supplier_id', target: 'suppliers', description: 'Device sourced from supplier' },
  { source: 'devices', link: 'import_batch_id', target: 'import_batches', description: 'Device belongs to import lot' },
  { source: 'devices', link: 'company_id', target: 'companies', description: 'Device owned by VES or TGW' },
  { source: 'import_batches', link: 'supplier_id', target: 'suppliers', description: 'Batch purchased from supplier' },
  { source: 'purchase_orders', link: 'supplier_id', target: 'suppliers', description: 'PO issued to supplier' },
  { source: 'purchase_order_items', link: 'purchase_order_id', target: 'purchase_orders', description: 'Line items on a PO' },
  { source: 'goods_received_notes', link: 'purchase_order_id', target: 'purchase_orders', description: 'GRN fulfills a PO' },
  { source: 'grn_items', link: 'grn_id', target: 'goods_received_notes', description: 'Items received in a GRN' },
  { source: 'grn_items', link: 'device_id', target: 'devices', description: 'GRN item creates a device' },
  { source: 'invoices', link: 'company_id', target: 'companies', description: 'Invoice issued by entity' },
  { source: 'invoice_items', link: 'invoice_id', target: 'invoices', description: 'Line items on invoice' },
  { source: 'invoice_items', link: 'device_id', target: 'devices', description: 'Invoice item references device' },
  { source: 'accounts_receivable', link: 'invoice_id', target: 'invoices', description: 'AR entry from invoice' },
  { source: 'ar_payments', link: 'accounts_receivable_id', target: 'accounts_receivable', description: 'Payment against AR' },
  { source: 'accounts_payable', link: 'vendor_id', target: 'vendors', description: 'AP owed to vendor' },
  { source: 'ap_payments', link: 'accounts_payable_id', target: 'accounts_payable', description: 'Payment against AP' },
  { source: 'expenses', link: 'company_id', target: 'companies', description: 'Expense charged to entity' },
  { source: 'expenses', link: 'parent_expense_id', target: 'expenses', description: 'Split expense child' },
  { source: 'journal_entries', link: 'company_id', target: 'companies', description: 'JE posted for entity' },
  { source: 'journal_entry_lines', link: 'journal_entry_id', target: 'journal_entries', description: 'Debit/credit lines in JE' },
  { source: 'journal_entry_lines', link: 'account_id', target: 'chart_of_accounts', description: 'Line posts to COA account' },
  { source: 'bank_transactions', link: 'bank_account_id', target: 'bank_accounts', description: 'Transaction in bank account' },
  { source: 'bank_transactions', link: 'matched_journal_entry_id', target: 'journal_entries', description: 'Bank txn matched to JE' },
  { source: 'inventory_transfers', link: 'device_id', target: 'devices', description: 'Transfer moves a device' },
  { source: 'inventory_transfers', link: 'from_company_id / to_company_id', target: 'companies', description: 'Transfer between entities' },
  { source: 'input_tax_credits', link: 'expense_id', target: 'expenses', description: 'ITC from expense' },
  { source: 'input_tax_credits', link: 'filing_period_id', target: 'tax_filing_periods', description: 'ITC claimed in filing period' },
  { source: 'marketplace_payouts', link: 'company_id', target: 'companies', description: 'Payout received by entity' },
];

const ACCOUNTING_FLOWS = [
  {
    title: 'Sale Lifecycle',
    icon: <TrendingUp className="h-4 w-4 text-primary" />,
    steps: [
      'Order recorded (manual or marketplace import)',
      'Status set to "unprocessed"',
      'Revenue & AR journal entries auto-generated → status becomes "revenue_only"',
      'Device linked → COGS & inventory entries posted → status becomes "fully_processed"',
      'Marketplace payout received → AR payment recorded → Cash debited',
    ],
  },
  {
    title: 'Procurement Lifecycle',
    icon: <Package className="h-4 w-4 text-primary" />,
    steps: [
      'Purchase Order created for supplier',
      'PO approved by admin',
      'Goods arrive → GRN created against PO',
      'GRN finalized → Devices created in inventory (DR Inventory)',
      'AP bill auto-generated (CR Accounts Payable)',
      'Payment recorded → AP cleared (DR AP / CR Cash)',
    ],
  },
  {
    title: 'Return Lifecycle',
    icon: <RotateCcw className="h-4 w-4 text-primary" />,
    steps: [
      'Return initiated from original order',
      'Reason and condition recorded',
      'Reversal journal entries auto-posted: DR Sales Returns / CR AR',
      'COGS reversed: CR COGS / DR Inventory',
      'Tax reversed: DR GST/HST Payable',
      'Device re-enters inventory with updated condition',
    ],
  },
  {
    title: 'Expense Allocation',
    icon: <Wallet className="h-4 w-4 text-primary" />,
    steps: [
      'Expense recorded with category and payment method',
      'If shared: allocation percentages applied (VES% / TGW%)',
      'Split child expenses created for each entity',
      'Journal entries posted per entity (DR Expense / CR Cash or AP)',
      'ITC eligibility calculated on GST/HST portion',
    ],
  },
  {
    title: 'Tax Remittance',
    icon: <Receipt className="h-4 w-4 text-primary" />,
    steps: [
      'Tax collected on sales accumulates in GST/HST Payable',
      'ITCs from purchases offset payable amount',
      'Net tax liability calculated for filing period',
      'Payment recorded → DR GST/HST Payable / CR Cash',
      'Filing period marked as submitted/paid',
    ],
  },
];

export default function AccountingKnowledge() {
  const [searchTerm, setSearchTerm] = useState('');

  const coaByType = CASH_BASIS_CHART_OF_ACCOUNTS.reduce((acc, account) => {
    const type = account.type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(account);
    return acc;
  }, {} as Record<string, typeof CASH_BASIS_CHART_OF_ACCOUNTS>);

  const typeOrder = ['asset', 'liability', 'equity', 'revenue', 'expense', 'tax_paid'];
  const typeLabels: Record<string, string> = {
    asset: 'Assets (1xxx)',
    liability: 'Liabilities (2xxx)',
    equity: 'Equity (3xxx)',
    revenue: 'Revenue (4xxx)',
    expense: 'Expenses (5xxx–7xxx)',
    tax_paid: 'Tax Paid / ITCs (8xxx)',
  };

  const filteredCOA = CASH_BASIS_CHART_OF_ACCOUNTS.filter(a =>
    !searchTerm ||
    a.code.includes(searchTerm) ||
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredRelationships = ENTITY_RELATIONSHIPS.filter(r =>
    !searchTerm ||
    r.source.includes(searchTerm.toLowerCase()) ||
    r.target.includes(searchTerm.toLowerCase()) ||
    r.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold gradient-text">Accounting Guides</h1>
          <p className="text-muted-foreground mt-1">
            Understand how accounting works in this business and how the system automates it
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search accounting guides, chart of accounts, relationships..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="general" className="text-xs">
              <Building2 className="h-3.5 w-3.5 mr-1.5" />
              General Accounting
            </TabsTrigger>
            <TabsTrigger value="system" className="text-xs">
              <Cog className="h-3.5 w-3.5 mr-1.5" />
              How Our System Works
            </TabsTrigger>
            <TabsTrigger value="relationships" className="text-xs">
              <Network className="h-3.5 w-3.5 mr-1.5" />
              Relationships & Charts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="py-4">
                <p className="text-sm text-muted-foreground">
                  How a multi-entity electronics resale business in Ontario would normally handle accounting — IFRS principles, FIFO inventory, GST/HST, double-entry bookkeeping, and inter-company transactions.
                </p>
              </CardContent>
            </Card>
            {GENERAL_SECTIONS.map((section, i) => (
              <Card key={i}>
                <Accordion type="single" collapsible>
                  <AccordionItem value={`general-${i}`} className="border-0">
                    <AccordionTrigger className="px-6 py-4 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">{section.icon}</div>
                        <span className="font-semibold text-sm">{section.title}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-4">
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                        {section.content}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="system" className="space-y-4">
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="py-4">
                <p className="text-sm text-muted-foreground">
                  What makes this program unique — automated journal entries, the accounting status pipeline, lot-based costing, shared expense allocation, model normalization, and real-time audit trails.
                </p>
              </CardContent>
            </Card>
            {SYSTEM_SECTIONS.map((section, i) => (
              <Card key={i}>
                <Accordion type="single" collapsible>
                  <AccordionItem value={`system-${i}`} className="border-0">
                    <AccordionTrigger className="px-6 py-4 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">{section.icon}</div>
                        <span className="font-semibold text-sm">{section.title}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-4">
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                        {section.content}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="relationships" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Calculator className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Chart of Accounts</CardTitle>
                    <CardDescription>
                      All {CASH_BASIS_CHART_OF_ACCOUNTS.length} accounts · Live-synced from system configuration
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {typeOrder.map(type => {
                  const accounts = (coaByType[type] || []).filter(a => filteredCOA.includes(a));
                  if (accounts.length === 0) return null;
                  return (
                    <Accordion key={type} type="single" collapsible>
                      <AccordionItem value={type} className="border rounded-lg">
                        <AccordionTrigger className="px-4 py-3 hover:no-underline">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {accounts.length}
                            </Badge>
                            <span className="font-semibold text-sm capitalize">{typeLabels[type] || type}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-20">Code</TableHead>
                                <TableHead>Account Name</TableHead>
                                <TableHead className="w-24">Entity</TableHead>
                                <TableHead className="w-20">Normal</TableHead>
                                <TableHead className="hidden lg:table-cell">Description</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {accounts.map(a => (
                                <TableRow key={a.code}>
                                  <TableCell className="font-mono text-xs">{a.code}</TableCell>
                                  <TableCell className="text-sm font-medium">{a.name}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-[10px] capitalize">
                                      {a.company || 'shared'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs capitalize">{a.normalBalance}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                                    {a.description}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Network className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Entity Relationship Map</CardTitle>
                    <CardDescription>
                      {ENTITY_RELATIONSHIPS.length} foreign-key relationships across all tables
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source Table</TableHead>
                      <TableHead className="w-12 text-center"></TableHead>
                      <TableHead>Target Table</TableHead>
                      <TableHead className="hidden md:table-cell">Link Column</TableHead>
                      <TableHead className="hidden lg:table-cell">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRelationships.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{r.source}</TableCell>
                        <TableCell className="text-center">
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.target}</TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground hidden md:table-cell">
                          {r.link}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                          {r.description}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <GitBranch className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Accounting Flow Diagrams</CardTitle>
                    <CardDescription>Step-by-step lifecycle for each major process</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {ACCOUNTING_FLOWS.map((flow, fi) => (
                  <Accordion key={fi} type="single" collapsible>
                    <AccordionItem value={`flow-${fi}`} className="border rounded-lg">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex items-center gap-3">
                          {flow.icon}
                          <span className="font-semibold text-sm">{flow.title}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        <div className="space-y-2">
                          {flow.steps.map((step, si) => (
                            <div key={si} className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                                <span className="text-[10px] font-bold text-primary">{si + 1}</span>
                              </div>
                              <p className="text-sm text-muted-foreground leading-relaxed">{step}</p>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="bg-muted/30 border-dashed">
          <CardContent className="py-6">
            <p className="text-xs text-muted-foreground text-center">
              <strong>{CASH_BASIS_CHART_OF_ACCOUNTS.length} accounts</strong> · {ENTITY_RELATIONSHIPS.length} relationships · {ACCOUNTING_FLOWS.length} flow diagrams · Content auto-updates with system changes
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
