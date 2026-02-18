import { PageGuide } from './PageGuide';
import { ClipboardCheck, Truck, DollarSign, FileText } from 'lucide-react';

export function PurchaseOrdersGuide() {
  return (
    <PageGuide
      title="Purchase Orders Guide — Tracking procurement"
      sections={[
        {
          icon: <ClipboardCheck className="h-4 w-4 text-primary" />,
          title: 'What Are Purchase Orders?',
          content: (
            <>
              <p>Purchase Orders (POs) are <strong>records of device purchases</strong> from your suppliers. They are automatically created when you finalize an import batch, capturing line items, costs, and tax amounts.</p>
              <p>POs provide an audit trail linking supplier invoices to received inventory.</p>
            </>
          ),
        },
        {
          icon: <Truck className="h-4 w-4 text-[hsl(var(--success))]" />,
          title: 'PO Status',
          content: (
            <>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Pending</strong> — Order placed, awaiting delivery</li>
                <li><strong>Received</strong> — Goods arrived and confirmed via GRN</li>
                <li><strong>Partial</strong> — Some items received, others pending</li>
                <li><strong>Cancelled</strong> — Order voided</li>
              </ul>
            </>
          ),
        },
        {
          icon: <DollarSign className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'Payment Tracking',
          content: (
            <>
              <p>Each PO tracks <strong>payment status</strong> (unpaid/paid) and payment method. When a PO is marked as paid, it updates the corresponding Accounts Payable record.</p>
              <p>You can view the full cost breakdown: subtotal, GST/HST, PST/QST, and total amount.</p>
            </>
          ),
        },
        {
          icon: <FileText className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'How POs Are Created',
          content: (
            <>
              <p>POs are <strong>auto-generated</strong> during the import finalization process. Each finalized batch creates one PO with line items matching the imported devices.</p>
              <p>The PO number follows the format <code>PO-{'{YYYY}'}-{'{SEQ}'}</code> and links back to the import batch and supplier for full traceability.</p>
            </>
          ),
        },
      ]}
    />
  );
}
