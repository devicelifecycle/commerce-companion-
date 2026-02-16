import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BookOpen, DollarSign, Calculator, TrendingUp, 
  ArrowRight, CheckCircle, FileText, Package, 
  Receipt, Building2, Coins, AlertTriangle
} from 'lucide-react';

export default function AccountingKnowledge() {
  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
        <div className="text-center">
          <h1 className="text-3xl font-display font-bold gradient-text">Accounting Knowledge Base</h1>
          <p className="text-muted-foreground mt-2">
            Accrual-Basis Accounting System | IFRS Compliant | FIFO Inventory
          </p>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
            <TabsTrigger value="tax">Tax Rules</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Accrual-Basis Accounting Principles
                </CardTitle>
                <CardDescription>
                  This system uses accrual-basis accounting following IFRS standards
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h4 className="font-semibold flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Revenue Recognition
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Revenue is recognized when the sale <strong>OCCURS</strong> (goods shipped / service delivered),
                      regardless of when payment is received. An Accounts Receivable is created until the marketplace settles.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <h4 className="font-semibold flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Expense Recognition
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Expenses are recognized when <strong>INCURRED</strong> (goods received / services consumed),
                      regardless of when payment is made. An Accounts Payable tracks the obligation.
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-500" />
                    FIFO Inventory Valuation
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Inventory is valued using <strong>First-In, First-Out (FIFO)</strong> method.
                    When items are sold, the cost of goods sold is calculated from the oldest
                    inventory first. This means your most accurate current costs are always
                    reflected in your inventory valuation.
                  </p>
                </div>

                <div className="bg-muted/50 p-4 rounded-lg">
                  <h4 className="font-semibold flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Key Feature of Accrual Accounting
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Accrual accounting uses <strong>Accounts Receivable (AR)</strong> and <strong>Accounts Payable (AP)</strong> to track
                    amounts owed to and by the business. Revenue and expenses are matched to the period they occur in, providing
                    a more accurate picture of financial performance.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                  Automation Principle
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-emerald-500/10 p-4 rounded-lg border border-emerald-500/20">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    🎯 All accounting entries are created <strong>AUTOMATICALLY</strong> from business transactions.
                    Users should rarely need to manually create journal entries.
                  </p>
                </div>
                <div className="mt-4 grid md:grid-cols-3 gap-4">
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <Package className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                    <p className="font-medium">Inventory Upload</p>
                    <p className="text-xs text-muted-foreground">Auto-creates PO, GRN, AP & Journal Entries</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <DollarSign className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
                    <p className="font-medium">Sales Import</p>
                    <p className="text-xs text-muted-foreground">Auto-creates AR, Revenue + COGS entries</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <Receipt className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                    <p className="font-medium">Expense Entry</p>
                    <p className="text-xs text-muted-foreground">Auto-creates AP or Cash journal entries</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ACCOUNTS TAB */}
          <TabsContent value="accounts" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Chart of Accounts Structure</CardTitle>
                <CardDescription>
                  Accrual-basis accounts for Virtual eShop and Tech Genius Warehouse
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Assets */}
                <div>
                  <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">ASSETS (1xxx)</h4>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between p-2 bg-blue-50 dark:bg-blue-950/30 rounded">
                      <span>1000/1001 - Cash</span>
                      <Badge variant="outline">Both</Badge>
                    </div>
                    <div className="flex justify-between p-2 bg-blue-50 dark:bg-blue-950/30 rounded">
                      <span>1050/1051 - Accounts Receivable</span>
                      <Badge variant="outline">Both</Badge>
                    </div>
                    <div className="flex justify-between p-2 bg-blue-50 dark:bg-blue-950/30 rounded">
                      <span>1100/1101 - Inventory (FIFO)</span>
                      <Badge variant="outline">Both</Badge>
                    </div>
                    <div className="flex justify-between p-2 bg-blue-50 dark:bg-blue-950/30 rounded">
                      <span>1200/1201 - Prepaid Expenses</span>
                      <Badge variant="outline">Both</Badge>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Liabilities */}
                <div>
                  <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">LIABILITIES (2xxx)</h4>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between p-2 bg-amber-50 dark:bg-amber-950/30 rounded">
                      <span>2010/2011 - Accounts Payable</span>
                      <Badge variant="outline">Both</Badge>
                    </div>
                    <div className="flex justify-between p-2 bg-amber-50 dark:bg-amber-950/30 rounded">
                      <span>2000/2001 - GST/HST Payable</span>
                      <Badge variant="outline">Both</Badge>
                    </div>
                    <div className="flex justify-between p-2 bg-amber-50 dark:bg-amber-950/30 rounded">
                      <span>2100/2101 - QST Payable (if applicable)</span>
                      <Badge variant="outline">Both</Badge>
                    </div>
                    <div className="flex justify-between p-2 bg-amber-50 dark:bg-amber-950/30 rounded">
                      <span>2200/2201 - Inter-company Payable/Receivable</span>
                      <Badge variant="outline">Inter-co</Badge>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Revenue */}
                <div>
                  <h4 className="font-semibold text-emerald-600 dark:text-emerald-400 mb-2">REVENUE (4xxx)</h4>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded">
                      <span>4000 - Sales Revenue - Amazon - Virtual eShop</span>
                      <Badge variant="outline">Virtual eShop</Badge>
                    </div>
                    <div className="flex justify-between p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded">
                      <span>4100 - Sales Revenue - BestBuy - Tech Genius Warehouse</span>
                      <Badge variant="outline">Tech Genius Warehouse</Badge>
                    </div>
                    <div className="flex justify-between p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded">
                      <span>4101 - Sales Revenue - Shopify - Tech Genius Warehouse</span>
                      <Badge variant="outline">Tech Genius Warehouse</Badge>
                    </div>
                    <div className="flex justify-between p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded">
                      <span>4200/4201 - Tax Collected on Sales</span>
                      <Badge variant="outline">Memo</Badge>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* COGS & Expenses */}
                <div>
                  <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">COGS & EXPENSES (5xxx-7xxx)</h4>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between p-2 bg-red-50 dark:bg-red-950/30 rounded">
                      <span>5000/5001 - Cost of Goods Sold (FIFO)</span>
                      <Badge variant="outline">Auto</Badge>
                    </div>
                    <div className="flex justify-between p-2 bg-red-50 dark:bg-red-950/30 rounded">
                      <span>6000/6001 - Marketplace Fees</span>
                      <Badge variant="outline">Both</Badge>
                    </div>
                    <div className="flex justify-between p-2 bg-red-50 dark:bg-red-950/30 rounded">
                      <span>6100/6101 - Shipping Costs</span>
                      <Badge variant="outline">Both</Badge>
                    </div>
                    <div className="flex justify-between p-2 bg-red-50 dark:bg-red-950/30 rounded">
                      <span>6200-7100 - Operating Expenses</span>
                      <Badge variant="outline">Shared</Badge>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Tax Paid */}
                <div>
                  <h4 className="font-semibold text-purple-600 dark:text-purple-400 mb-2">TAX PAID / ITC (8xxx)</h4>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between p-2 bg-purple-50 dark:bg-purple-950/30 rounded">
                      <span>8000/8001 - GST/HST Paid on Purchases</span>
                      <Badge variant="outline">ITC</Badge>
                    </div>
                    <div className="flex justify-between p-2 bg-purple-50 dark:bg-purple-950/30 rounded">
                      <span>8100/8101 - QST Paid on Purchases</span>
                      <Badge variant="outline">ITC</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AUTOMATION TAB */}
          <TabsContent value="automation" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-blue-500" />
                  Inventory Purchase Automation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  When inventory is received (goods received note finalized):
                </p>
                <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm">
                  <p className="text-blue-600">Dr. Inventory - [Company] &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[Unit Cost × Qty]</p>
                  <p className="text-blue-600">Dr. GST/HST Paid on Purchases &nbsp;&nbsp;[GST/HST Amount]</p>
                  <p className="text-blue-600">Dr. QST Paid on Purchases &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[QST Amount, if applicable]</p>
                  <p className="text-emerald-600">&nbsp;&nbsp;&nbsp;&nbsp;Cr. Accounts Payable &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[Total Amount]</p>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  The payable is cleared when payment is made to the supplier.
                </p>

                <Separator />

                <p className="text-sm text-muted-foreground">
                  When supplier is paid:
                </p>
                <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm">
                  <p className="text-blue-600">Dr. Accounts Payable &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[Payment Amount]</p>
                  <p className="text-emerald-600">&nbsp;&nbsp;&nbsp;&nbsp;Cr. Cash - [Company] &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[Payment Amount]</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-emerald-500" />
                  Sale Automation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  When a sale occurs (order confirmed / shipped):
                </p>
                <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm">
                  <p className="font-semibold mb-2">Entry 1 - Revenue Recognition:</p>
                  <p className="text-blue-600">Dr. Accounts Receivable &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[Settlement Amount]</p>
                  <p className="text-blue-600">Dr. Marketplace Fees &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[Fee Amount]</p>
                  <p className="text-emerald-600">&nbsp;&nbsp;&nbsp;&nbsp;Cr. Sales Revenue &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[Sale Price - Tax]</p>
                  <p className="text-emerald-600">&nbsp;&nbsp;&nbsp;&nbsp;Cr. Tax Collected on Sales &nbsp;&nbsp;&nbsp;[Tax Amount]</p>
                </div>
                <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm">
                  <p className="font-semibold mb-2">Entry 2 - COGS (FIFO):</p>
                  <p className="text-blue-600">Dr. COGS - [Company] &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[Purchase Cost from FIFO]</p>
                  <p className="text-emerald-600">&nbsp;&nbsp;&nbsp;&nbsp;Cr. Inventory - [Company] &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[Purchase Cost]</p>
                </div>

                <Separator />

                <p className="text-sm text-muted-foreground">
                  When marketplace disburses payment:
                </p>
                <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm">
                  <p className="text-blue-600">Dr. Cash - [Company] &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[Settlement Amount]</p>
                  <p className="text-emerald-600">&nbsp;&nbsp;&nbsp;&nbsp;Cr. Accounts Receivable &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[Settlement Amount]</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-amber-500" />
                  Expense Automation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  When an expense is incurred (bill received):
                </p>
                <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm">
                  <p className="text-blue-600">Dr. [Expense Category Account] &nbsp;&nbsp;&nbsp;[Amount]</p>
                  <p className="text-blue-600">Dr. GST/HST Paid on Purchases &nbsp;&nbsp;&nbsp;[GST/HST]</p>
                  <p className="text-blue-600">Dr. QST Paid on Purchases &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[QST, if applicable]</p>
                  <p className="text-emerald-600">&nbsp;&nbsp;&nbsp;&nbsp;Cr. Accounts Payable &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[Total Amount]</p>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  If paid immediately, Cash is credited instead of Accounts Payable.
                </p>
                <div className="bg-amber-500/10 p-3 rounded border border-amber-500/20">
                  <p className="text-sm font-medium">Shared Expense Allocation</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    For shared expenses, enter allocation % (e.g., 50% Virtual eShop, 50% Tech Genius Warehouse).
                    The system creates TWO journal entries, one for each company.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAX TAB */}
          <TabsContent value="tax" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-purple-500" />
                  Marketplace-Collected Tax Handling
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-amber-500/10 p-4 rounded-lg border border-amber-500/20">
                  <p className="font-medium text-amber-700 dark:text-amber-300">
                    ⚠️ Amazon, BestBuy, and Shopify collect and remit tax to CRA on your behalf.
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">Accounting Treatment:</h4>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2">
                      <ArrowRight className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      Tax collected by marketplace is <strong>NOT</strong> your revenue
                    </li>
                    <li className="flex items-start gap-2">
                      <ArrowRight className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      Tax you paid on purchases <strong>IS</strong> recoverable via ITC
                    </li>
                  </ul>
                </div>

                <Separator />

                <div className="space-y-2">
                  <h4 className="font-semibold">Monthly Tax Calculation:</h4>
                  <div className="bg-muted/50 p-4 rounded-lg text-sm">
                    <p><strong>Net Tax = Tax Collected - Tax Paid</strong></p>
                    <p className="text-muted-foreground mt-2">
                      This amount is what marketplace remits to CRA on your behalf.
                      Verify: Marketplace tax report = Your calculation
                    </p>
                  </div>
                </div>

                <div className="bg-emerald-500/10 p-4 rounded-lg border border-emerald-500/20">
                  <h4 className="font-semibold text-emerald-700 dark:text-emerald-300">Profit Calculation (Clean)</h4>
                  <ul className="text-sm mt-2 space-y-1">
                    <li>Revenue (excluding tax)</li>
                    <li>- COGS (excluding tax)</li>
                    <li>= Gross Profit</li>
                    <li className="text-muted-foreground italic">Tax does not affect your profit calculation</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tax Payment Journal Entry</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  When you make a tax payment to CRA:
                </p>
                <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm">
                  <p className="text-blue-600">Dr. GST/HST Payable - VES/TGW &nbsp;&nbsp;$X,XXX</p>
                  <p className="text-emerald-600">&nbsp;&nbsp;&nbsp;&nbsp;Cr. Cash - VES/TGW &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;$X,XXX</p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Account 2000/2001 balance resets to $0 after payment
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* REPORTS TAB */}
          <TabsContent value="reports" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Available Financial Reports
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                      Profit & Loss Statement
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Accrual-basis income statement showing revenue, COGS, and expenses
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-blue-500" />
                      Balance Sheet
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Assets (incl. AR), liabilities (incl. AP), and equity at a point in time
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Coins className="h-4 w-4 text-amber-500" />
                      Cash Flow Statement
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Cash movements from operations, investing, financing
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-purple-500" />
                      Tax Reconciliation
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Tax collected vs. paid, net payable, ITC tracking
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Package className="h-4 w-4 text-cyan-500" />
                      Inventory Valuation (FIFO)
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      IMEI/Serial list with purchase cost, days held, turnover
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-rose-500" />
                      Accounts Receivable / Payable Aging
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Outstanding AR/AP by age bucket (current, 30, 60, 90+ days)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Report Features</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    Auto-refresh when underlying data changes
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    Export to Excel/PDF
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    Comparison to previous period
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    Highlight significant variances
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    Role-based access control
                  </li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
