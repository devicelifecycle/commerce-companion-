import { PageGuide } from './PageGuide';
import { FileText, Send, DollarSign, AlertCircle } from 'lucide-react';

export function InvoicesGuide() {
  return (
    <PageGuide
      title="Invoices Guide — Creating and managing invoices"
      sections={[
        {
          icon: <FileText className="h-4 w-4 text-primary" />,
          title: 'What Are Invoices?',
          content: (
            <>
              <p>Invoices are <strong>billing documents</strong> you send to customers for goods or services. Each invoice includes line items, tax amounts, and payment terms.</p>
              <p>Invoices are separate from marketplace orders — use them for direct B2B sales, custom deals, or service billing outside of marketplace channels.</p>
            </>
          ),
        },
        {
          icon: <Send className="h-4 w-4 text-[hsl(var(--success))]" />,
          title: 'Invoice Lifecycle',
          content: (
            <>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Draft</strong> — Created but not yet sent to the customer</li>
                <li><strong>Sent</strong> — Delivered to the customer, awaiting payment</li>
                <li><strong>Paid</strong> — Payment received and recorded</li>
                <li><strong>Overdue</strong> — Past the due date without payment</li>
                <li><strong>Cancelled</strong> — Voided, no longer active</li>
              </ul>
            </>
          ),
        },
        {
          icon: <DollarSign className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'Tax & Payment',
          content: (
            <>
              <p>Invoices automatically calculate <strong>13% HST</strong> (Ontario) on the subtotal. Payment terms default to Net 30 days.</p>
              <p>When an invoice is marked as <strong>paid</strong>, the system records the payment date for AR tracking and cash flow reporting.</p>
            </>
          ),
        },
        {
          icon: <AlertCircle className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'Tips',
          content: (
            <>
              <p>Invoice numbers are <strong>auto-generated</strong> using the company prefix and a sequential number. You can customize the prefix in Settings.</p>
              <p>Keep customer names consistent — the system uses them for AR reconciliation and customer reporting.</p>
            </>
          ),
        },
      ]}
    />
  );
}
