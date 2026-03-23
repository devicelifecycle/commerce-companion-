import { PageGuide } from './PageGuide';
import { PackageCheck, ClipboardList, AlertCircle, CheckCircle } from 'lucide-react';

export function GoodsReceivedGuide() {
  return (
    <PageGuide
      title="Goods Received Guide — Confirming deliveries"
      sections={[
        {
          icon: <PackageCheck className="h-4 w-4 text-primary" />,
          title: 'What Are GRNs?',
          content: (
            <>
              <p>Goods Received Notes (GRNs) <strong>confirm that items have been physically received</strong> from a supplier. They link back to a Purchase Order and record the received quantities and condition of each item.</p>
              <p>GRNs are created via the "Receive Items" button on PO & GRN page, or auto-created when finalizing an import batch.</p>
            </>
          ),
        },
        {
          icon: <ClipboardList className="h-4 w-4 text-[hsl(var(--success))]" />,
          title: "What's Tracked",
          content: (
            <>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>GRN Number</strong> — Unique identifier for the receipt</li>
                <li><strong>Received Date</strong> — When items were physically received</li>
                <li><strong>Line Items</strong> — Each item with quantity, condition, and routing (inventory/repair parts/expense)</li>
                <li><strong>Condition Status</strong> — Passed, damaged, or rejected per split line</li>
              </ul>
            </>
          ),
        },
        {
          icon: <AlertCircle className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'Item Type Routing',
          content: (
            <>
              <p>On receive, each PO line item is routed based on its <strong>item type</strong>:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Inventory</strong> → Products table (added to stock)</li>
                <li><strong>Repair Parts</strong> → Repair parts table</li>
                <li><strong>Expense</strong> → Expenses table (tools/supplies, not inventory)</li>
              </ul>
              <p className="mt-1">All types generate AP entries and GRN records.</p>
            </>
          ),
        },
        {
          icon: <CheckCircle className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'Audit Trail',
          content: (
            <>
              <p>GRNs provide the <strong>third leg of the procurement audit trail</strong>: PO → GRN → Inventory/Expense. Together they prove that items were ordered, received, and properly routed.</p>
              <p>You can access this chain from the Inventory page by clicking "Procurement History" on any device.</p>
            </>
          ),
        },
      ]}
    />
  );
}
