import { PageGuide } from './PageGuide';
import { ClipboardCheck, Truck, DollarSign, FileText, Package, Wrench, Receipt } from 'lucide-react';

export function PurchaseOrdersGuide() {
  return (
    <PageGuide
      title="PO & GRN Guide — Procurement, receiving & expense routing"
      sections={[
        {
          icon: <ClipboardCheck className="h-4 w-4 text-primary" />,
          title: 'What Are POs?',
          content: (
            <>
              <p>Purchase Orders (POs) formalize <strong>procurement from suppliers</strong>. Each PO contains line items with a description, quantity, unit cost, tax status, and an <strong>item type</strong> that controls what happens on receive.</p>
              <p>A single PO can mix inventory, repair parts, and expense items — e.g. ordering phones plus tools from the same supplier.</p>
            </>
          ),
        },
        {
          icon: <Package className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'Item Types',
          content: (
            <>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Device</strong> — Serialized items added to device inventory on receive (phones, tablets, laptops)</li>
                <li><strong>Product</strong> — Bulk/generic items added to product stock (cases, cables, accessories). Auto-creates the product if new.</li>
                <li><strong>Repair Parts</strong> — Added to repair parts inventory. Must be selected from the <em>Repair Parts Catalog</em> (Settings → Parts) to prevent naming duplicates.</li>
                <li><strong>Expense</strong> — Tools & supplies recorded as an expense, <em>not</em> added to inventory</li>
              </ul>
              <p className="mt-1 text-xs">Each line item has its own type selector — no need for separate POs.</p>
            </>
          ),
        },
        {
          icon: <Truck className="h-4 w-4 text-[hsl(var(--success))]" />,
          title: 'Receiving (GRN)',
          content: (
            <>
              <p>When goods arrive, use <strong>"Receive Items"</strong> to create a GRN. Each line can be split by condition (passed, defective, damaged).</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>Inventory items → product stock</li>
                <li>Repair parts → repair parts table</li>
                <li>Expense items → expense records (auto-categorized as Supplies)</li>
              </ul>
              <p className="mt-1">AP entries and GRNs are created for all item types.</p>
            </>
          ),
        },
        {
          icon: <DollarSign className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'Payment & Audit Trail',
          content: (
            <>
              <p>Each PO tracks <strong>payment status</strong> (unpaid/partial/paid) and payment method. Payments sync with Accounts Payable records.</p>
              <p>The PO number format is <code>{'{CO}'}-{'{YYYYMMDD}'}-{'{SEQ}'}</code>. Clone POs for recurring supplier orders.</p>
            </>
          ),
        },
      ]}
    />
  );
}
