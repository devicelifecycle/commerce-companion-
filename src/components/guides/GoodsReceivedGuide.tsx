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
              <p>Goods Received Notes (GRNs) <strong>confirm that devices have been physically received</strong> from a supplier. They link back to a Purchase Order and record the received quantities and condition of each item.</p>
              <p>GRNs are auto-created when you finalize an import batch.</p>
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
                <li><strong>Line Items</strong> — Each device with quantity and condition status</li>
                <li><strong>Condition Status</strong> — Passed, damaged, or rejected</li>
              </ul>
            </>
          ),
        },
        {
          icon: <AlertCircle className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'Expanding GRN Details',
          content: (
            <>
              <p>Click on any GRN row to <strong>expand and view line items</strong> — individual devices received, their condition, and any notes.</p>
              <p>This detail is essential for quality control and verifying that what was ordered matches what was delivered.</p>
            </>
          ),
        },
        {
          icon: <CheckCircle className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'Audit Trail',
          content: (
            <>
              <p>GRNs provide the <strong>third leg of the procurement audit trail</strong>: PO → GRN → Inventory. Together they prove that items were ordered, received, and added to stock.</p>
              <p>You can access this chain from the Inventory page by clicking "Procurement History" on any device.</p>
            </>
          ),
        },
      ]}
    />
  );
}
