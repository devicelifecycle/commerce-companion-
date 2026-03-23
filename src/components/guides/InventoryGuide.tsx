import { PageGuide } from './PageGuide';
import { Smartphone, ArrowRightLeft, Boxes, FileText } from 'lucide-react';

export function InventoryGuide() {
  return (
    <PageGuide
      title="Inventory Guide — Managing your device inventory"
      sections={[
        {
          icon: <Smartphone className="h-4 w-4 text-primary" />,
          title: 'What Is Inventory?',
          content: (
            <>
              <p>Inventory tracks every <strong>device</strong> in your system — phones, tablets, accessories — with details like brand, model, storage, condition, cost price, and current status.</p>
              <p>Devices enter inventory via the <strong>Import</strong> page (Excel upload) or manual creation. Each device is assigned a company (Virtual eShop or Tech Genius Warehouse).</p>
            </>
          ),
        },
        {
          icon: <Boxes className="h-4 w-4 text-[hsl(var(--success))]" />,
          title: 'Device Statuses & Labor',
          content: (
            <>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>In Stock</strong> — Available for sale</li>
                <li><strong>Reserved</strong> — Held for a pending order</li>
                <li><strong>Sold</strong> — Linked to a completed sale</li>
                <li><strong>Returned</strong> — Came back via RMA</li>
              </ul>
              <p className="mt-1">Devices can also have optional <strong>Management Labor Cost/Hours</strong> fields for performance reporting (does not affect accounting books).</p>
            </>
          ),
        },
        {
          icon: <ArrowRightLeft className="h-4 w-4 text-[hsl(var(--warning))]" />,
          title: 'Inter-Company Transfers',
          content: (
            <>
              <p>Devices can be <strong>transferred between VES and TGW</strong> using the transfer dialog. Each transfer records the transfer price and creates audit trail entries.</p>
              <p>This is useful when inventory purchased under one entity needs to be sold through the other's marketplace channels.</p>
            </>
          ),
        },
        {
          icon: <FileText className="h-4 w-4 text-[hsl(var(--info))]" />,
          title: 'Procurement History',
          content: (
            <>
              <p>Click <strong>"Procurement History"</strong> on any device to see its full lifecycle: which Purchase Order it came from, the Goods Received Note, supplier details, and cost breakdown.</p>
              <p>This provides a complete audit trail from purchase to sale for every item.</p>
            </>
          ),
        },
      ]}
    />
  );
}
