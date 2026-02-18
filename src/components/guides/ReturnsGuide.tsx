import { PageGuide } from './PageGuide';
import { RotateCcw, FileText, DollarSign, AlertCircle } from 'lucide-react';

export function ReturnsGuide() {
  return (
    <PageGuide
      title="Returns Guide — Managing RMAs and refunds"
      sections={[
        {
          icon: <RotateCcw className="h-4 w-4 text-primary" />,
          title: 'What Are Returns/RMAs?',
          content: (
            <>
              <p>Return Material Authorizations (RMAs) track <strong>products returned by customers or to suppliers</strong>. They record the reason, refund amount, and accounting impact of each return.</p>
              <p>RMAs can be initiated from the Orders page (customer returns) or created here for supplier returns.</p>
            </>
          ),
        },
        {
          icon: <FileText className="h-4 w-4 text-[hsl(var(--success))]" />,
          title: 'Return Types',
          content: (
            <>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Customer Return</strong> — Product returned by the buyer (refund to customer)</li>
                <li><strong>Supplier Return</strong> — Defective/wrong item returned to vendor (refund from supplier)</li>
              </ul>
              <p className="mt-1">Each type triggers different accounting entries — customer returns reverse revenue; supplier returns reverse AP.</p>
            </>
          ),
        },
        {
          icon: <DollarSign className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'Accounting Impact',
          content: (
            <>
              <p>When a return is processed, the system automatically creates <strong>reversal journal entries</strong> for:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Revenue reversal (credit Sales, debit AR)</li>
                <li>COGS reversal (credit Inventory, debit COGS)</li>
                <li>Tax adjustments</li>
              </ul>
              <p className="mt-1">The linked device status changes back to <strong>"returned"</strong> or <strong>"in_stock"</strong> depending on condition.</p>
            </>
          ),
        },
        {
          icon: <AlertCircle className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'RMA Status',
          content: (
            <>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Pending</strong> — Return initiated, awaiting processing</li>
                <li><strong>Approved</strong> — Return accepted</li>
                <li><strong>Completed</strong> — Refund issued, inventory updated</li>
                <li><strong>Rejected</strong> — Return denied</li>
              </ul>
            </>
          ),
        },
      ]}
    />
  );
}
