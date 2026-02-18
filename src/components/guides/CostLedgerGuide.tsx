import { PageGuide } from './PageGuide';
import { DollarSign, Package, Users, FileText } from 'lucide-react';

export function CostLedgerGuide() {
  return (
    <PageGuide
      title="Cost Ledger Guide — Audit-ready cost tracking"
      sections={[
        {
          icon: <DollarSign className="h-4 w-4 text-primary" />,
          title: 'What Is the Cost Ledger?',
          content: (
            <>
              <p>The Cost & Supplier Ledger provides an <strong>audit-ready view of every device cost</strong>, its supplier origin, and the import batch it came from. It's designed for financial audits and cost analysis.</p>
              <p>Data is pulled directly from your inventory, import batches, and supplier records — no manual data entry needed.</p>
            </>
          ),
        },
        {
          icon: <Package className="h-4 w-4 text-[hsl(var(--success))]" />,
          title: 'Device Costs Tab',
          content: (
            <>
              <p>Shows every device with its <strong>cost price, sale price, margin, supplier, and invoice number</strong>. Use this to verify per-unit profitability and trace costs back to their source.</p>
              <p>Filter by supplier or search by SKU, model, or invoice number.</p>
            </>
          ),
        },
        {
          icon: <FileText className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'Batch History Tab',
          content: (
            <>
              <p>Lists all <strong>import batches with shipping costs, other charges, and total cost</strong>. Expand any batch to see the individual devices it contains.</p>
              <p>Use this to reconcile supplier invoices against what was actually imported and verify that all charges are accounted for.</p>
            </>
          ),
        },
        {
          icon: <Users className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'Supplier Summary Tab',
          content: (
            <>
              <p>Aggregated view showing <strong>total spend, average cost, device count, and batch count per supplier</strong>. Useful for negotiating better terms with high-volume suppliers.</p>
              <p>The "Last Import" column helps identify inactive suppliers.</p>
            </>
          ),
        },
      ]}
    />
  );
}
