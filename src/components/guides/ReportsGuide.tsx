import { PageGuide } from './PageGuide';
import { LayoutDashboard, Store, CheckSquare, Banknote } from 'lucide-react';

export function ReportsGuide() {
  return (
    <PageGuide
      title="Reports Guide — Analytics and reconciliation"
      sections={[
        {
          icon: <LayoutDashboard className="h-4 w-4 text-primary" />,
          title: 'Executive Dashboard',
          content: (
            <>
              <p>High-level KPIs including <strong>total revenue, profit margins, order volume, and inventory value</strong>. Provides a quick snapshot of business health across all marketplaces.</p>
              <p>Use the company toggle to compare individual entity performance.</p>
            </>
          ),
        },
        {
          icon: <Store className="h-4 w-4 text-[hsl(var(--success))]" />,
          title: 'Marketplace Accounting',
          content: (
            <>
              <p>Breaks down <strong>revenue, fees, and profit per marketplace</strong> (Amazon, Best Buy, Shopify). Shows fee ratios, average order value, and marketplace-specific trends.</p>
              <p>Use this to identify which channels are most profitable after accounting for all fees and commissions.</p>
            </>
          ),
        },
        {
          icon: <CheckSquare className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'Reconciliation',
          content: (
            <>
              <p>Compares <strong>marketplace-reported data against your internal records</strong>. Highlights discrepancies in revenue, fees, and order counts that need investigation.</p>
              <p>Any variance over $1 is flagged as a discrepancy for manual review.</p>
            </>
          ),
        },
        {
          icon: <Banknote className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'Payouts',
          content: (
            <>
              <p>Tracks <strong>marketplace payout accuracy</strong> — comparing what each marketplace paid you against what the system calculates you should have received.</p>
              <p>Includes payout variance trends, fee accuracy analysis, and a per-channel breakdown. Review and annotate discrepancies with the review workflow.</p>
            </>
          ),
        },
      ]}
    />
  );
}
