import { PageGuide } from './PageGuide';
import { ShoppingCart, Link, RotateCcw, FileText, BarChart3 } from 'lucide-react';

export function OrdersGuide() {
  return (
    <PageGuide
      title="Orders Guide — How orders work in Warehouse"
      sections={[
        {
          icon: <ShoppingCart className="h-4 w-4 text-primary" />,
          title: 'What Are Orders?',
          content: (
            <>
              <p>Orders represent <strong>sales transactions</strong> from your marketplaces (Amazon, Best Buy, Shopify) or manual entries. Each order tracks the sale price, shipping costs, marketplace fees, and tax amounts.</p>
              <p>Orders are automatically imported when you sync marketplace data, or you can create them manually for off-marketplace sales.</p>
            </>
          ),
        },
        {
          icon: <Link className="h-4 w-4 text-[hsl(var(--success))]" />,
          title: 'Linking Devices to Orders',
          content: (
            <>
              <p>Each order can be <strong>linked to an inventory device</strong> to calculate profit accurately (Sale Price − Cost − Fees − Shipping).</p>
              <p>The system auto-matches using: (1) IMEI match, (2) SKU match, (3) Fuzzy model name match. You can also link/unlink manually.</p>
              <p className="text-xs mt-1">Once linked, the device status changes to <strong>"sold"</strong> and journal entries for revenue, COGS, and AR are created automatically.</p>
            </>
          ),
        },
        {
          icon: <RotateCcw className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'Returns & RMAs',
          content: (
            <>
              <p>You can initiate a <strong>Return / RMA</strong> directly from any order using the ⋯ menu → "Initiate Return." This creates a return authorization record and triggers reversal journal entries for revenue, AR, and COGS.</p>
              <p>Returns appear in both the Returns/RMA page and are tracked against the original order.</p>
            </>
          ),
        },
        {
          icon: <BarChart3 className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'Accounting Status',
          content: (
            <>
              <p>Each order has an <strong>accounting status</strong>:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Unprocessed</strong> — No journal entries yet</li>
                <li><strong>Revenue Only</strong> — Revenue & AR entries created (no device linked)</li>
                <li><strong>Fully Processed</strong> — All entries created including COGS (device linked)</li>
              </ul>
              <p className="mt-1">Use "Process Accounting" from the ⋯ menu to trigger journal entries manually.</p>
            </>
          ),
        },
      ]}
    />
  );
}
