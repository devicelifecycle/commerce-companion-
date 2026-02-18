import { PageGuide } from './PageGuide';
import { BarChart3, DollarSign, BookOpen, Calculator } from 'lucide-react';

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
              <p>The Financials Hub centralizes all <strong>accounting and financial reporting</strong> in one place. It includes Profit & Loss statements, Balance Sheet, Accounts Payable, Accounts Receivable, and Tax reporting.</p>
              <p>Use the company toggle at the top to switch between <strong>consolidated</strong> (all companies) and individual entity views (VES or TGW).</p>
            </>
          ),
        },
        {
          icon: <DollarSign className="h-4 w-4 text-[hsl(var(--success))]" />,
          title: 'Profit & Loss',
          content: (
            <>
              <p>Shows <strong>revenue, COGS, gross profit, operating expenses, and net income</strong> for a selected period. Data flows automatically from sales journal entries and expense records.</p>
              <p>The P&L follows accrual-basis accounting — revenue is recognized when earned (sale made), not when cash is received.</p>
            </>
          ),
        },
        {
          icon: <BookOpen className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'AP & AR',
          content: (
            <>
              <p><strong>Accounts Payable (AP)</strong> — Money you owe to suppliers. Auto-created from import batches and manual bills.</p>
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
