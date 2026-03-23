import { PageGuide } from './PageGuide';
import { Upload, FileSpreadsheet, DollarSign, CheckCircle, AlertCircle } from 'lucide-react';

export function ImportGuide() {
  return (
    <PageGuide
      title="Import Guide — How to import devices from Excel"
      sections={[
        {
          icon: <AlertCircle className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'Devices Only',
          content: (
            <>
              <p>This import is exclusively for <strong>electronic devices</strong> — phones, tablets, and laptops — that are tracked individually by IMEI or unique serial number.</p>
              <p>For <strong>bulk items</strong> (accessories, cables, cases, repair parts, tools) use <strong>PO & GRN</strong> instead — set each line item's type to Inventory, Repair Parts, or Expense as needed.</p>
            </>
          ),
        },
        {
          icon: <FileSpreadsheet className="h-4 w-4 text-primary" />,
          title: 'How to Import',
          content: (
            <>
              <p>Upload an <strong>Excel file (.xlsx)</strong> containing device data. The system will map your columns to required fields: Company, Brand, Model, Condition, Cost Price, and optional fields like Storage, Color, IMEI, and Category.</p>
              <p>The file must include a <strong>Supplier ID</strong> column using the numeric code (e.g., 101, 102). Codes start at 101 instead of 001 because <strong>Excel automatically strips leading zeros</strong>.</p>
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
          title: 'Editable PO Draft',
          content: (
            <>
              <p>After devices are imported, an <strong>editable Purchase Order draft</strong> is generated for each supplier. You can:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Edit <strong>line item descriptions, costs, and tax amounts</strong> to match the supplier's invoice</li>
                <li>Add <strong>shipping costs</strong> and <strong>other charges</strong> per supplier</li>
                <li>Enter the <strong>supplier invoice number</strong> for cross-referencing</li>
              </ul>
              <p className="mt-1">Each supplier gets their own PO, so multi-supplier batches produce separate POs that match each supplier's invoice exactly.</p>
            </>
          ),
        },
        {
          icon: <CheckCircle className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'What Happens on Finalize',
          content: (
            <>
              <p>Finalizing creates the following <strong>per supplier</strong>:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Purchase Order (PO)</strong> with all line items matching the supplier invoice</li>
                <li><strong>Goods Received Note (GRN)</strong> confirming receipt</li>
                <li><strong>Accounts Payable (AP)</strong> record for the supplier</li>
                <li><strong>Journal entries</strong> — Dr. Inventory + Dr. GST/HST → Cr. AP</li>
              </ul>
              <p className="mt-1">VES purchases are automatically attributed as payables for "Virtual eShop." The batch is locked after finalization.</p>
            </>
          ),
        },
      ]}
    />
  );
}
