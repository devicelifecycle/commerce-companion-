import { PageGuide } from './PageGuide';
import { BarChart3, DollarSign, BookOpen, Calculator, TrendingUp } from 'lucide-react';

export function FinancialsGuide() {
  return (
    <PageGuide
      title="Financials Guide — Understanding your financial statements"
      sections={[
        {
          icon: <BarChart3 className="h-4 w-4 text-primary" />,
          title: 'What Is the Financials Hub?',
          content: (
            <>
              <p>The Financials Hub centralizes all <strong>accounting and financial reporting</strong> in one place — Statements, Ledger, Cost Ledger, AP/AR, Reconciliation, Taxes, and Audit Trail.</p>
              <p>Use the company toggle at the top to switch between <strong>consolidated</strong> (all companies) and individual entity views (VES or TGW).</p>
            </>
          ),
        },
        {
          icon: <TrendingUp className="h-4 w-4 text-[hsl(var(--success))]" />,
          title: 'P&L — Accounting vs Management View',
          content: (
            <>
              <p><strong>Accounting View</strong> — Standard GAAP P&L. COGS = device purchase cost + capitalized repair parts. Payroll/labor appears in Operating Expenses.</p>
              <p><strong>Management View</strong> — Performance P&L. COGS includes purchase cost + repair parts + estimated management labor (per-device). Payroll is excluded from OpEx to avoid double-counting.</p>
              <p className="text-xs mt-1">Toggle between views using the switch at the top of the P&L report.</p>
            </>
          ),
        },
        {
          icon: <BookOpen className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'AP & AR',
          content: (
            <>
              <p><strong>Accounts Payable (AP)</strong> — Money you owe to suppliers. Auto-created from PO receives, import batches, and manual bills.</p>
              <p><strong>Accounts Receivable (AR)</strong> — Money owed to you from marketplace payouts, invoices, or customer orders.</p>
              <p>Both track aging (current, 30d, 60d, 90d+) to help manage cash flow.</p>
            </>
          ),
        },
        {
          icon: <Calculator className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'Tax Center',
          content: (
            <>
              <p>Tracks <strong>HST collected on sales, Input Tax Credits (ITCs) on expenses</strong>, and net tax payable. Filing periods are managed per company.</p>
              <p>As an Ontario business, you collect 13% HST and can claim ITCs on eligible business expenses to reduce your remittance.</p>
            </>
          ),
        },
      ]}
    />
  );
}
