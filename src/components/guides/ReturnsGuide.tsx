import { PageGuide } from './PageGuide';
import { RotateCcw, FileText, DollarSign, AlertCircle, Tag, Wrench } from 'lucide-react';

export function ReturnsGuide() {
  return (
    <PageGuide
      title="Returns Guide — Managing RMAs, Refunds & Adjustments"
      sections={[
        {
          icon: <RotateCcw className="h-4 w-4 text-primary" />,
          title: 'What Are Returns/RMAs?',
          content: (
            <>
              <p>Return Material Authorizations (RMAs) track <strong>products returned by customers or to suppliers</strong>. They record the reason, refund amount, and accounting impact of each return.</p>
              <p>Customer returns are initiated from <strong>Orders → Order Details → Initiate Return</strong>. Supplier returns can be created here or via bulk selection in Inventory.</p>
            </>
          ),
        },
        {
          icon: <FileText className="h-4 w-4 text-[hsl(var(--success))]" />,
          title: 'Resolution Types',
          content: (
            <>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Refund</strong> — Full or partial refund with item returned</li>
                <li><strong>Adjustment/Credit</strong> — Courtesy credit (e.g., late delivery discount) — no item return expected</li>
                <li><strong>Exchange</strong> — Replace with another device; original returned</li>
                <li><strong>Repair & Return</strong> — Fix the item and send it back; links to the Device Repairs module</li>
              </ul>
              <p className="mt-1">Each type triggers different accounting entries.</p>
            </>
          ),
        },
        {
          icon: <DollarSign className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'Accounting Impact',
          content: (
            <>
              <p>When a return is processed, the system automatically creates <strong>reversal journal entries</strong>:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Refund/Exchange</strong>: Revenue reversal + COGS reversal + AR cancellation</li>
                <li><strong>Adjustment</strong>: Partial revenue reversal + AR credit (no COGS change)</li>
                <li><strong>Repair</strong>: Revenue reversal + AR cancellation (no COGS reversal — item stays in repair)</li>
                <li><strong>Supplier Return</strong>: AP reduction + Inventory removal</li>
              </ul>
            </>
          ),
        },
        {
          icon: <AlertCircle className="h-4 w-4 text-destructive" />,
          title: 'Marketplace Flags',
          content: (
            <>
              <p>Returns marked as <strong>"Marketplace-Initiated"</strong> (A-to-Z claims, chargebacks) display a <span className="text-destructive font-bold">⚠</span> red flag in the table for associate review.</p>
              <p className="mt-1">Use the <strong>Flagged</strong> tab to quickly find all marketplace-forced refunds that need attention.</p>
            </>
          ),
        },
        {
          icon: <Tag className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'Supplier Returns',
          content: (
            <>
              <p>Supplier returns go through an <strong>approval pipeline</strong>: Pending → Approved → Shipped → Refunded/Completed.</p>
              <p className="mt-1">Create them from:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>The <strong>"Supplier Return"</strong> button on this page</li>
                <li><strong>Bulk select</strong> items in Inventory and choose "Create RMA"</li>
                <li>Select a <strong>Supplier or PO</strong> first, then pick items</li>
              </ul>
            </>
          ),
        },
      ]}
    />
  );
}
