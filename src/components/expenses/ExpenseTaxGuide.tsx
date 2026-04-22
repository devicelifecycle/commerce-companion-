import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  BookOpen, CheckCircle2, XCircle, Info, Receipt, RotateCcw, Pencil,
  ShieldAlert, Building2, FileText, Calculator, ScrollText,
} from 'lucide-react';

/**
 * Educational guide for Canadian + Ontario tax-deductible expenses
 * and how Expense Adjustments / Refunds flow through the books.
 * Note: General information only — not professional tax advice.
 */
export function ExpenseTaxGuide() {
  return (
    <div className="space-y-6">
      {/* Disclaimer */}
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>General guidance only</AlertTitle>
        <AlertDescription>
          This guide summarizes Canada Revenue Agency (CRA) and Ontario rules for small
          businesses. It is not a substitute for advice from a CPA. Always confirm
          deductibility and ITC eligibility with a professional before filing.
        </AlertDescription>
      </Alert>

      {/* Section 1 — Core principle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            What makes an expense tax‑deductible in Canada?
          </CardTitle>
          <CardDescription>
            Income Tax Act §18(1)(a) — the “earning income” test
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            An expense is deductible if it is <strong>incurred to earn business income</strong>,
            is <strong>reasonable in the circumstances</strong>, and is <strong>not
            specifically denied</strong> by the Income Tax Act. The CRA also requires
            that you keep <strong>supporting documentation</strong> (receipts, invoices,
            contracts) for at least <strong>6 years</strong> from the end of the tax year.
          </p>
          <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
            <li>Capital purchases (equipment, vehicles) are <em>not</em> fully expensed — they are depreciated through CCA.</li>
            <li>Personal-use portions must be excluded (e.g. home office, vehicle).</li>
            <li>Fines, penalties, club dues, and most life insurance premiums are denied.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Section 2 — Categories table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Deductibility by category
          </CardTitle>
          <CardDescription>
            Mapped to the categories used in this app
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CategoryRow
            name="Inventory & Cost of Goods Sold"
            verdict="full"
            note="Fully deductible as COGS when sold. Unsold inventory stays on the balance sheet."
          />
          <CategoryRow
            name="Shipping & Logistics"
            verdict="full"
            note="Outbound shipping, courier, freight, customs brokerage — fully deductible."
          />
          <CategoryRow
            name="Rent & Utilities (commercial)"
            verdict="full"
            note="Rent for warehouse/office, hydro, water, gas — 100% deductible."
          />
          <CategoryRow
            name="Home Office (if applicable)"
            verdict="partial"
            note="Only the business‑use % of rent, utilities, internet, and property tax. Must be principal place of business or used regularly to meet clients."
          />
          <CategoryRow
            name="Telecommunications"
            verdict="partial"
            note="Business portion of phone/internet only. Pure business lines = 100%."
          />
          <CategoryRow
            name="Office Supplies"
            verdict="full"
            note="Stationery, printer ink, packaging supplies — fully deductible."
          />
          <CategoryRow
            name="Software & Subscriptions"
            verdict="full"
            note="SaaS (Shopify, QuickBooks, Microsoft 365, etc.) — fully deductible in the year incurred."
          />
          <CategoryRow
            name="Equipment & Tools"
            verdict="capital"
            note="Items > ~$500 generally capitalized and depreciated via CCA (Class 8 = 20%, Class 50 computers = 55%). Smaller tools can be expensed."
          />
          <CategoryRow
            name="Professional Services"
            verdict="full"
            note="Accounting, legal, bookkeeping, consulting — fully deductible. Legal fees to acquire capital assets are capitalized instead."
          />
          <CategoryRow
            name="Marketing & Advertising"
            verdict="full"
            note="Canadian media — 100%. Foreign media targeting Canadian markets may be denied (s.19)."
          />
          <CategoryRow
            name="Travel & Transportation"
            verdict="partial"
            note="Business travel 100%. Meals while traveling are limited to 50% (ITA §67.1)."
          />
          <CategoryRow
            name="Meals & Entertainment"
            verdict="partial"
            note="Limited to 50% of cost. Office parties (max 6/year) and meals for all employees can be 100%."
          />
          <CategoryRow
            name="Insurance"
            verdict="full"
            note="Business liability, property, and key‑person insurance — deductible. Personal life insurance — denied."
          />
          <CategoryRow
            name="Payroll & Benefits"
            verdict="full"
            note="Wages, employer CPP/EI, WSIB, EHT (Ontario), and reasonable bonuses — fully deductible."
          />
          <CategoryRow
            name="Bank Fees & Interest"
            verdict="full"
            note="Business account fees, merchant fees, interest on business loans — fully deductible."
          />
          <CategoryRow
            name="Marketplace Fees"
            verdict="full"
            note="Amazon, Best Buy, Shopify, eBay commissions and FBA fees — fully deductible."
          />
          <CategoryRow
            name="Vehicle (business use)"
            verdict="partial"
            note="Pro‑rate by business‑km / total‑km. Keep a logbook. Lease and CCA limits apply."
          />
          <CategoryRow
            name="Fines, Penalties, Personal Expenses"
            verdict="none"
            note="Not deductible (ITA §67.6). Includes traffic tickets and CRA late penalties."
          />
        </CardContent>
      </Card>

      {/* Section 3 — Ontario / GST‑HST */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Ontario specifics — HST & ITCs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Ontario uses a harmonized <strong>13% HST</strong> (5% federal + 8% provincial).
            Once your business is GST/HST‑registered (mandatory at <strong>$30,000</strong> in
            taxable revenue over 4 quarters), you can claim <strong>Input Tax Credits (ITCs)</strong>
            for the HST you pay on business purchases.
          </p>
          <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
            <li>ITC eligibility is independent of income‑tax deductibility — but the underlying expense must be for commercial activity.</li>
            <li>Meals & entertainment ITCs are limited to <strong>50%</strong>, mirroring the income‑tax rule.</li>
            <li>Receipts under $30 need vendor name + date + total. $30–$149.99 also need GST/HST # and amount. ≥ $150 also need buyer name and description.</li>
            <li>Ontario also has <strong>EHT</strong> (Employer Health Tax) on payroll over $1M and <strong>WSIB</strong> premiums — both deductible business expenses.</li>
            <li>Some categories (e.g. residential rent, basic groceries) are exempt or zero‑rated — no HST charged, no ITC available.</li>
          </ul>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              When you record an expense in this app, the <strong>GST/HST</strong> field
              automatically posts to account <strong>8000/8001 — GST/HST Paid (ITC)</strong>,
              which reduces your net HST remittance to the CRA.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Section 4 — Adjustments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            How expense adjustments work
          </CardTitle>
          <CardDescription>
            Editing or deleting an existing expense
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            When you <strong>edit</strong> an expense, the system updates the underlying
            record and <strong>regenerates the journal entry</strong> on save so the
            ledger always matches the latest details (amount, tax, allocation, category).
          </p>
          <p>
            When you <strong>delete</strong> an expense, the system performs a clean
            reversal:
          </p>
          <ol className="list-decimal pl-6 space-y-1 text-muted-foreground">
            <li>All linked journal entries are reversed (Dr/Cr swapped) so totals remain balanced.</li>
            <li>Any related <strong>Input Tax Credit</strong> and <strong>Accounts Payable</strong> entries are removed.</li>
            <li>Refund records linked to the expense are also cleaned up.</li>
            <li>An audit log entry records who deleted it and how many JEs were reversed.</li>
          </ol>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              For shared expenses, the system creates <em>two</em> journal entries —
              one for VES and one for TGW — using the configured allocation %. Editing
              the allocation regenerates both sides automatically.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Section 5 — Refunds */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" />
            How expense refunds work
          </CardTitle>
          <CardDescription>
            Recording money received back from a vendor
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            A <strong>refund</strong> is a separate record linked to the original expense.
            This preserves the original transaction history (great for audits) while still
            reflecting the net cost in your reports.
          </p>

          <div>
            <p className="font-medium mb-1">Supported scenarios</p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li><strong>Full refund</strong> — vendor returns 100% of the amount</li>
              <li><strong>Partial refund</strong> — only a portion is returned (e.g. one item from a multi‑item invoice)</li>
              <li><strong>Multiple refunds</strong> — you can record several refunds against one expense over time</li>
            </ul>
          </div>

          <Separator />

          <div>
            <p className="font-medium mb-2 flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              Automatic accounting on refund
            </p>
            <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs space-y-1">
              <div>Dr  Cash / Bank          $XXX.XX  <span className="text-muted-foreground">(refund received)</span></div>
              <div>  Cr  Expense Account    $XXX.XX  <span className="text-muted-foreground">(reverses the original expense)</span></div>
              <div>  Cr  GST/HST Paid (ITC) $XX.XX   <span className="text-muted-foreground">(reverses the ITC claimed)</span></div>
              <div>  Cr  PST/QST Paid       $XX.XX   <span className="text-muted-foreground">(if applicable)</span></div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              The expense category and tax amounts are reversed proportionally, so your P&amp;L,
              ITC report, and HST filing all stay accurate.
            </p>
          </div>

          <Separator />

          <div>
            <p className="font-medium mb-1 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Where refunds appear
            </p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>The expense list shows a <strong>“Partial Refund”</strong> or <strong>“Fully Refunded”</strong> badge.</li>
              <li>The original total is shown with strikethrough once fully refunded.</li>
              <li>The Expense Dashboard, P&amp;L, and HST Reconciliation reports use the <em>net</em> amount (expense minus refunds).</li>
              <li>Refund journal entries are visible in the Financials → Journal Entries view.</li>
            </ul>
          </div>

          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>When NOT to use a refund</AlertTitle>
            <AlertDescription className="text-xs">
              If the expense was simply entered incorrectly (wrong amount, wrong vendor),
              <strong> edit it</strong> instead. Refunds are for actual money returned by the vendor.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Section 6 — Best practices */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" />
            Record‑keeping best practices
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
            <li>Attach a receipt to <strong>every</strong> expense (the dialog supports file upload).</li>
            <li>Use the correct <strong>category</strong> — it drives both the P&amp;L line and the chart‑of‑accounts code.</li>
            <li>Mark personal/non‑business charges as <strong>not tax deductible</strong> rather than deleting them, so the bank reconciliation still matches.</li>
            <li>For shared expenses, set the <strong>VES / TGW allocation %</strong> at entry time — this drives the inter‑company split.</li>
            <li>Keep records for <strong>6 years</strong> after the end of the tax year (CRA requirement).</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

type Verdict = 'full' | 'partial' | 'capital' | 'none';

function CategoryRow({ name, verdict, note }: { name: string; verdict: Verdict; note: string }) {
  const config: Record<Verdict, { label: string; icon: typeof CheckCircle2; className: string }> = {
    full:    { label: '100% deductible',  icon: CheckCircle2, className: 'border-[hsl(var(--success))] text-[hsl(var(--success))]' },
    partial: { label: 'Partially deductible', icon: Info,     className: 'border-amber-500 text-amber-600 dark:text-amber-400' },
    capital: { label: 'Capitalized (CCA)',    icon: Info,     className: 'border-blue-500 text-blue-600 dark:text-blue-400' },
    none:    { label: 'Not deductible',       icon: XCircle,  className: 'border-destructive text-destructive' },
  };
  const { label, icon: Icon, className } = config[verdict];

  return (
    <div className="flex items-start justify-between gap-4 pb-3 border-b last:border-b-0 last:pb-0">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{note}</p>
      </div>
      <Badge variant="outline" className={`shrink-0 ${className}`}>
        <Icon className="h-3 w-3 mr-1" />
        {label}
      </Badge>
    </div>
  );
}