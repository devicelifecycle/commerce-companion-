import { PageGuide } from './PageGuide';
import { Upload, FileSpreadsheet, DollarSign, CheckCircle } from 'lucide-react';

export function ImportGuide() {
  return (
    <PageGuide
      title="Import Guide — How to import devices from Excel"
      sections={[
        {
          icon: <FileSpreadsheet className="h-4 w-4 text-primary" />,
          title: 'How to Import',
          content: (
            <>
              <p>Upload an <strong>Excel file (.xlsx)</strong> containing device data. The system will map your columns to required fields: Company, Brand, Model, Condition, Cost Price, and optional fields like Storage, Color, IMEI, and Category.</p>
              <p>The file must include a <strong>Supplier ID</strong> column using the 3-digit code (e.g., 101, 102). Supplier records are auto-created if they don't exist.</p>
            </>
          ),
        },
        {
          icon: <Upload className="h-4 w-4 text-[hsl(var(--success))]" />,
          title: 'Upload & Review',
          content: (
            <>
              <p>After uploading, you'll see a <strong>review screen</strong> showing each row and any validation errors. You can fix issues before proceeding.</p>
              <p>Brand names are normalized (e.g., "apple" → "Apple") and SKUs are auto-generated using the format <code>{'{Brand}-{Model}-{Storage}-{Seq}'}</code>.</p>
            </>
          ),
        },
        {
          icon: <DollarSign className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'Shipping & Charges',
          content: (
            <>
              <p>Before finalizing, you can add <strong>shipping costs</strong> and <strong>other charges</strong> from the supplier invoice. These costs are distributed across devices in the batch for accurate COGS calculation.</p>
              <p>You can also enter the <strong>supplier invoice number</strong> for cross-referencing with Accounts Payable.</p>
            </>
          ),
        },
        {
          icon: <CheckCircle className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'What Happens on Finalize',
          content: (
            <>
              <p>Finalizing a batch automatically creates:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Accounts Payable (AP)</strong> record for the supplier</li>
                <li><strong>Purchase Order (PO)</strong> with all line items</li>
                <li><strong>Goods Received Note (GRN)</strong> confirming receipt</li>
                <li><strong>Journal entries</strong> for inventory and AP</li>
              </ul>
              <p className="mt-1">VES purchases are automatically attributed as payables for "Virtual eShop."</p>
            </>
          ),
        },
      ]}
    />
  );
}
