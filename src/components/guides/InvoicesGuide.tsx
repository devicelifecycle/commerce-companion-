import { PageGuide } from './PageGuide';
import { FileText, Send, DollarSign, AlertCircle, Package, Calculator } from 'lucide-react';

export function InvoicesGuide() {
  return (
    <PageGuide
      title="Invoices Guide — Off-marketplace billing"
      sections={[
        {
          icon: <FileText className="h-4 w-4 text-primary" />,
          title: 'What Are Invoices For?',
          content: (
            <>
              <p>Invoices are for <strong>off-marketplace sales</strong> — when a device or service is sold directly to a customer outside of Amazon, Best Buy, or Shopify.</p>
              <p>Use invoices for B2B deals, walk-in sales, custom orders, or service billing that doesn't go through an integrated marketplace.</p>
            </>
          ),
        },
        {
          icon: <Package className="h-4 w-4 text-[hsl(var(--secondary))]" />,
          title: 'Line Items',
          content: (
            <>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>From Inventory</strong> — Search and select devices already in stock. The device will be marked as "sold" automatically.</li>
                <li><strong>Manual Item</strong> — Type in any product or service description with custom pricing (e.g., setup fee, consulting, accessories).</li>
              </ul>
              <p className="mt-1">Each line item has its own tax treatment, so you can mix taxable and zero-rated items on the same invoice.</p>
            </>
          ),
        },
        {
          icon: <Calculator className="h-4 w-4 text-[hsl(var(--accent))]" />,
          title: 'Tax Options',
          content: (
            <>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>HST (13%)</strong> — Ontario Harmonized Sales Tax, added on top of the price</li>
                <li><strong>GST (5%)</strong> — Federal GST only, for out-of-province sales where HST doesn't apply</li>
                <li><strong>Zero-Rated</strong> — No tax (e.g., exports, certain medical devices)</li>
                <li><strong>Tax Inclusive</strong> — The entered price already includes 13% HST; the system extracts the tax portion</li>
              </ul>
            </>
          ),
        },
        {
          icon: <DollarSign className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'Accounting Treatment',
          content: (
            <>
              <p>When an invoice is created, the system automatically:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Creates an <strong>Accounts Receivable</strong> entry for the total amount</li>
                <li>Revenue flows to the <strong>Sales Revenue</strong> account</li>
                <li>Tax collected flows to <strong>GST/HST Payable</strong></li>
                <li>Inventory items are marked as <strong>sold</strong></li>
              </ul>
              <p className="mt-1">When status is changed to "Paid", the AR entry is automatically settled.</p>
            </>
          ),
        },
        {
          icon: <Send className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'Invoice Lifecycle',
          content: (
            <>
              <p>All invoices are <strong>live</strong> the moment they are created — there is no draft stage. Statuses are <strong>automatically assigned</strong> based on payments and due dates:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Outstanding</strong> — Active invoice awaiting payment</li>
                <li><strong>Partially Paid</strong> — One or more payments received, but balance remains</li>
                <li><strong>Paid</strong> — Full payment received, AR settled</li>
                <li><strong>Overdue</strong> — Past due date without full payment</li>
                <li><strong>Cancelled</strong> — Voided, all accounting entries reversed</li>
              </ul>
              <p className="mt-1">Click any invoice row to view full details, payment history, and remaining balance.</p>
            </>
          ),
        },
        {
          icon: <AlertCircle className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'Tips',
          content: (
            <>
              <p>Include the customer's <strong>GST/HST number</strong> for B2B invoices — they'll need it to claim Input Tax Credits.</p>
              <p>Invoice numbers are <strong>auto-generated</strong> using the company code prefix. Keep customer names consistent for accurate AR reporting.</p>
            </>
          ),
        },
      ]}
    />
  );
}
