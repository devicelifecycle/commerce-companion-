import { PageGuide } from './PageGuide';
import { Package, Hash, FileText, AlertCircle } from 'lucide-react';

export function SuppliersGuide() {
  return (
    <PageGuide
      title="Suppliers Guide — Managing your vendor relationships"
      sections={[
        {
          icon: <Package className="h-4 w-4 text-primary" />,
          title: 'What Are Suppliers?',
          content: (
            <>
              <p>Suppliers are the <strong>vendors you buy devices from</strong>. Each supplier has a unique 3-digit code (starting at 101) used during import to link devices to their source.</p>
              <p>Supplier records are automatically created during device import if a new Supplier ID is encountered.</p>
            </>
          ),
        },
        {
          icon: <Hash className="h-4 w-4 text-[hsl(var(--success))]" />,
          title: 'Supplier Codes',
          content: (
            <>
              <p>The system uses a <strong>sequential numeric ID starting at 101</strong> (e.g., 101, 102, 103). Codes start at 101 instead of 001 because <strong>Excel automatically strips leading zeros</strong> — entering "001" in a spreadsheet becomes "1", which breaks import matching.</p>
              <p>When adding a supplier manually, the code is auto-generated. You can also enter it manually if you have a preferred numbering scheme.</p>
            </>
          ),
        },
        {
          icon: <FileText className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'What to Track',
          content: (
            <>
              <p>For each supplier, maintain:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Contact info</strong> — Name, email, phone for quick communication</li>
                <li><strong>Address</strong> — Street, city, province, postal code for invoice matching and shipping</li>
                <li><strong>GST/HST Number</strong> — For Input Tax Credit (ITC) claims and invoice verification</li>
                <li><strong>Notes</strong> — Payment terms, special conditions, quality notes</li>
              </ul>
            </>
          ),
        },
        {
          icon: <AlertCircle className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'Tips',
          content: (
            <>
              <p>Each supplier is <strong>company-specific</strong> — they belong to either Virtual eShop or Tech Genius Warehouse. Make sure you select the correct company when creating suppliers.</p>
              <p>Supplier metrics (total purchases, payment history) are tracked automatically from import batches and Accounts Payable records.</p>
            </>
          ),
        },
      ]}
    />
  );
}
