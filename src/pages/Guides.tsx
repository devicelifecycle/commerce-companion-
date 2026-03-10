import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Search,
  ShoppingCart,
  Smartphone,
  Upload,
  Package,
  Users,
  FileText,
  Wallet,
  ClipboardCheck,
  PackageCheck,
  RotateCcw,
  LayoutDashboard,
  BarChart3,
  Warehouse,
  Brain,
  Settings,
  Activity,
  ClipboardList,
  Home,
  BookOpen,
} from 'lucide-react';

interface ModuleGuide {
  module: string;
  icon: React.ElementType;
  category: string;
  description: string;
  sections: {
    title: string;
    content: string;
  }[];
}

const MODULE_GUIDES: ModuleGuide[] = [
  {
    module: 'Home / Knowledge Hub',
    icon: Home,
    category: 'general',
    description: 'Central landing page documenting system rules, accounting principles, and automation logic.',
    sections: [
      { title: 'Overview', content: 'The Knowledge Hub serves as the primary orientation page for all users. It documents IFRS-compliant accounting principles (Accrual-basis, FIFO valuation), Canadian tax flow-through logic (GST/HST/ITC), and automation triggers for journal entries and inter-company transfers.' },
      { title: 'Who uses it', content: 'Both Admin and Associate roles. Associates use it to understand system behavior; Admins use it as a reference for configuration decisions.' },
      { title: 'Key features', content: 'System rules documentation, accounting principle references, automation trigger explanations, tax logic breakdowns, and role-based access summaries.' },
    ],
  },
  {
    module: 'Orders',
    icon: ShoppingCart,
    category: 'operations',
    description: 'Record, import, and manage sales across all marketplaces.',
    sections: [
      { title: 'Overview', content: 'The Orders module is the central hub for all sales activity. Record manual sales, import marketplace orders (Amazon, Best Buy, Shopify), and track order status from creation through fulfillment.' },
      { title: 'Manual sales', content: 'Click "Record Sale" to create a manual order. Select the device(s), customer, and marketplace. The system automatically calculates taxes based on the customer\'s province and creates the corresponding journal entries.' },
      { title: 'Marketplace imports', content: 'Orders from connected marketplaces sync automatically. Amazon and Best Buy orders are imported via settlement reports. Shopify orders sync in real-time via webhook.' },
      { title: 'Inter-company sales', content: 'Transfer inventory between VES and TGW entities. The system creates matching AR/AP entries and journal postings for both companies.' },
      { title: 'Returns', content: 'Process returns directly from an order. The system reverses the original journal entries, updates inventory status, and adjusts tax records.' },
      { title: 'Accounting impact', content: 'Every sale triggers: Revenue recognition (CR Sales), COGS entry (DR COGS, CR Inventory), Tax liability (CR GST/HST Payable), and Accounts Receivable (DR AR).' },
    ],
  },
  {
    module: 'Inventory',
    icon: Smartphone,
    category: 'operations',
    description: 'Track devices, stock levels, warehouse locations, and FBA inventory.',
    sections: [
      { title: 'Overview', content: 'Manage all device inventory across warehouses and fulfillment channels. Track individual devices by IMEI, model, condition, and location.' },
      { title: 'Adding devices', content: 'Add devices individually via "Add Device" or bulk import via Excel. Each device gets a unique ID and can be tracked through its entire lifecycle.' },
      { title: 'Stock status', content: 'Devices flow through statuses: In Stock → Listed → Sold → Shipped. Returned devices re-enter as "In Stock" with updated condition.' },
      { title: 'Transfers', content: 'Transfer devices between VES and TGW. This creates inter-company accounting entries and updates the device\'s company assignment.' },
      { title: 'FBA tracking', content: 'Track Amazon FBA inventory separately. Monitor inbound shipments, storage fees, and fulfillment status.' },
      { title: 'Aging reports', content: 'Identify slow-moving inventory with aging analysis. Devices held beyond configurable thresholds are flagged for review.' },
      { title: 'Labels', content: 'Generate and print inventory labels with barcodes for physical tracking.' },
    ],
  },
  {
    module: 'Import',
    icon: Upload,
    category: 'operations',
    description: 'Bulk import devices and orders from Excel files or marketplace APIs.',
    sections: [
      { title: 'Overview', content: 'Import devices and orders in bulk from Excel/CSV files. The system validates data, normalizes model names, and creates inventory records.' },
      { title: 'File format', content: 'Download the template for the correct column format. Required fields: Brand, Model, Condition, Cost Price. Optional: IMEI, Color, Storage, SKU.' },
      { title: 'Validation', content: 'The importer validates each row for required fields, data types, and business rules. Failed rows are reported with specific error messages.' },
      { title: 'Batch tracking', content: 'Each import creates a batch record with supplier, invoice number, and lot number. Shipping and other charges can be allocated across the batch.' },
      { title: 'Model normalization', content: 'Device model names are automatically normalized (e.g., "iPhone 15 Pro Max" variations are standardized) for consistent reporting.' },
    ],
  },
  {
    module: 'Suppliers',
    icon: Package,
    category: 'operations',
    description: 'Manage supplier contacts, payment terms, and purchase history.',
    sections: [
      { title: 'Overview', content: 'Maintain a directory of all suppliers with contact details, payment terms, and performance tracking.' },
      { title: 'Adding suppliers', content: 'Create supplier records with name, contact info, and default payment terms. Suppliers are linked to purchase orders, import batches, and AP records.' },
      { title: 'Performance', content: 'Track supplier reliability through on-time delivery rates, quality metrics, and purchase volume history.' },
    ],
  },
  {
    module: 'Customers',
    icon: Users,
    category: 'operations',
    description: 'Track customer information, purchase history, and marketplace sources.',
    sections: [
      { title: 'Overview', content: 'Customer records are auto-created from marketplace orders and manual sales. Track purchase history, total spend, and contact details.' },
      { title: 'Auto-creation', content: 'When a sale is recorded, the system checks for existing customers by email. New customers are created automatically with marketplace source tracking.' },
      { title: 'Customer details', content: 'View complete purchase history, outstanding invoices, and communication notes for each customer.' },
    ],
  },
  {
    module: 'Invoices',
    icon: FileText,
    category: 'operations',
    description: 'Create, send, and track invoices with Canadian tax compliance.',
    sections: [
      { title: 'Overview', content: 'Generate professional invoices with automatic tax calculations. Track payment status and aging.' },
      { title: 'Creating invoices', content: 'Select a customer, add line items (devices or services), and the system calculates GST/HST/QST based on the customer\'s province.' },
      { title: 'Tax treatment', content: 'Each line item can be set as Taxable, Exempt, or Zero-rated. The system applies the correct provincial rates automatically.' },
      { title: 'PDF generation', content: 'Generate PDF invoices with your company letterhead, tax numbers, and payment terms.' },
      { title: 'Payment tracking', content: 'Record payments against invoices. Partial payments are supported. The system updates AR and posts journal entries on payment.' },
    ],
  },
  {
    module: 'Purchase Orders',
    icon: ClipboardCheck,
    category: 'procurement',
    description: 'Create and manage purchase orders for supplier procurement.',
    sections: [
      { title: 'Overview', content: 'Formalize procurement with purchase orders. Track order status from draft through receipt and payment.' },
      { title: 'Creating POs', content: 'Select a supplier, add items with quantities and unit costs. The system generates a PO number and tracks approval status.' },
      { title: 'Approval workflow', content: 'POs can be submitted for approval. Admins can approve or reject with notes.' },
      { title: 'Receiving', content: 'When goods arrive, create a Goods Received Note (GRN) linked to the PO. This updates inventory and triggers AP entries.' },
    ],
  },
  {
    module: 'Goods Received',
    icon: PackageCheck,
    category: 'procurement',
    description: 'Record receipt of purchased goods and link to purchase orders.',
    sections: [
      { title: 'Overview', content: 'Document the physical receipt of goods against purchase orders. Each GRN records quantities received, condition, and any discrepancies.' },
      { title: 'Creating GRNs', content: 'Select a PO, enter received quantities per item, and note any quality issues. Devices are created in inventory upon GRN completion.' },
      { title: 'Accounting impact', content: 'Completing a GRN triggers: Inventory asset increase (DR Inventory), AP liability creation (CR Accounts Payable).' },
    ],
  },
  {
    module: 'Returns / RMA',
    icon: RotateCcw,
    category: 'procurement',
    description: 'Process customer returns and return merchandise authorizations.',
    sections: [
      { title: 'Overview', content: 'Handle customer returns with full accounting reversal. Track return reasons, restocking, and refund processing.' },
      { title: 'Processing returns', content: 'Initiate a return from the original order. Select items being returned, specify reason and condition. The system reverses the sale\'s journal entries.' },
      { title: 'Accounting impact', content: 'Returns reverse: Revenue (DR Sales Returns), COGS (CR COGS, DR Inventory), Tax (DR GST/HST Payable), and AR (CR Accounts Receivable).' },
      { title: 'Restocking', content: 'Returned devices re-enter inventory with updated condition status. Devices in poor condition can be marked for refurbishment or write-off.' },
    ],
  },
  {
    module: 'Expenses',
    icon: Wallet,
    category: 'expenses',
    description: 'Track business expenses with shared allocation and tax deduction tracking.',
    sections: [
      { title: 'Overview', content: 'Record all business expenses with categorization, tax tracking, and inter-company allocation.' },
      { title: 'Adding expenses', content: 'Enter amount, category, vendor, and payment method. Attach receipts for documentation. The system calculates ITC eligibility automatically.' },
      { title: 'Shared expenses', content: 'Enable shared allocation to split expenses between VES and TGW. Set custom percentages or use category-based defaults.' },
      { title: 'Recurring expenses', content: 'Set up recurring expenses for rent, subscriptions, and other fixed costs. The system auto-generates entries on schedule.' },
      { title: 'Approval workflow', content: 'Expenses above a configurable threshold require admin approval. Small expenses can be auto-approved based on settings.' },
      { title: 'Vendor management', content: 'Track vendors with contact details, payment history, and expense trends.' },
    ],
  },
  {
    module: 'Dashboard',
    icon: LayoutDashboard,
    category: 'analytics',
    description: 'Real-time KPIs, revenue charts, and business health overview.',
    sections: [
      { title: 'Overview', content: 'The executive dashboard provides a real-time snapshot of business health. View revenue trends, inventory valuation, profitability KPIs, and cash position.' },
      { title: 'Quick stats', content: 'At-a-glance metrics: Total Revenue, Profit Margin, Active Inventory, and Outstanding AR/AP balances.' },
      { title: 'Charts', content: 'Revenue trend charts, marketplace comparison, top products by profit, and inventory valuation over time.' },
      { title: 'Alerts', content: 'System alerts for low inventory, overdue invoices, upcoming tax deadlines, and reconciliation discrepancies.' },
    ],
  },
  {
    module: 'Financials',
    icon: BarChart3,
    category: 'analytics',
    description: 'Financial statements, chart of accounts, journal entries, and tax center.',
    sections: [
      { title: 'Overview', content: 'Complete financial management: P&L statements, balance sheets, chart of accounts, journal entries, AP/AR management, and tax compliance.' },
      { title: 'Profit & Loss', content: 'Revenue, COGS, gross profit, operating expenses, and net income. Filter by date range and company entity.' },
      { title: 'Balance Sheet', content: 'Assets, liabilities, and equity as of a selected date. Includes cash, inventory, AR, AP, and retained earnings.' },
      { title: 'Chart of Accounts', content: 'Full chart of accounts organized by type (Asset, Liability, Equity, Revenue, Expense). System accounts are auto-created; custom accounts can be added.' },
      { title: 'Journal Entries', content: 'View all journal postings with drill-down to source transactions. Auto-generated entries from sales, expenses, and transfers are flagged.' },
      { title: 'Tax Center', content: 'GST/HST collected, ITCs claimed, net tax liability, and filing period management. Generates filing-ready reports.' },
    ],
  },
  {
    module: 'Cost Ledger',
    icon: Warehouse,
    category: 'analytics',
    description: 'FIFO cost tracking and inventory valuation by lot and device.',
    sections: [
      { title: 'Overview', content: 'Detailed cost tracking using FIFO methodology. View cost layers, lot-level profitability, and landed cost calculations.' },
      { title: 'FIFO layers', content: 'Each import batch creates a cost layer. When devices are sold, the oldest cost layer is consumed first (First In, First Out).' },
      { title: 'Landed costs', content: 'Shipping, customs, and other charges from import batches are allocated across devices to calculate true landed cost.' },
    ],
  },
  {
    module: 'Reports',
    icon: BarChart3,
    category: 'analytics',
    description: 'Executive dashboards, marketplace accounting, reconciliation, and payout tracking.',
    sections: [
      { title: 'Overview', content: 'Comprehensive reporting suite covering sales, inventory, marketplace performance, and financial reconciliation.' },
      { title: 'Executive Dashboard', content: 'High-level KPIs: total revenue, profit margins, order volume, and inventory value across all marketplaces.' },
      { title: 'Marketplace Accounting', content: 'Revenue, fees, and profit per marketplace. Fee ratios, AOV, and channel-specific trends.' },
      { title: 'Reconciliation', content: 'Compare marketplace-reported data against internal records. Variances over $1 are flagged for review.' },
      { title: 'Payout Tracking', content: 'Track marketplace payout accuracy. Compare received payouts against calculated amounts with variance analysis.' },
    ],
  },
  {
    module: 'Forecasting',
    icon: Brain,
    category: 'analytics',
    description: 'AI-powered demand forecasting and inventory planning.',
    sections: [
      { title: 'Overview', content: 'AI-driven forecasting using historical sales data to predict future demand, optimal stock levels, and revenue projections.' },
      { title: 'Demand forecasting', content: 'Analyze sales trends by model, brand, and marketplace to predict future demand and optimize purchasing decisions.' },
      { title: 'Revenue projections', content: 'Project future revenue based on current inventory, historical margins, and seasonal patterns.' },
    ],
  },
  {
    module: 'Integration Health',
    icon: Activity,
    category: 'admin',
    description: 'Monitor marketplace API connections and data sync status.',
    sections: [
      { title: 'Overview', content: 'Monitor the health and status of all marketplace integrations. View sync history, error rates, and connection status.' },
      { title: 'Connection status', content: 'Real-time status of API connections to Amazon, Best Buy, Shopify, and other marketplaces.' },
      { title: 'Data validation', content: 'Automated validation checks flag data quality issues: missing fields, duplicate orders, price mismatches.' },
    ],
  },
  {
    module: 'Team Management',
    icon: Users,
    category: 'admin',
    description: 'Manage users, roles, and company access assignments.',
    sections: [
      { title: 'Overview', content: 'Manage team members, assign roles (Admin/Associate), and control company access. Admins have full access; Associates have operational access.' },
      { title: 'Inviting users', content: 'Invite new team members by email. Assign their role and company access upon invitation.' },
      { title: 'Permissions', content: 'Admin: Full access to all modules. Associate: Access to Operations, Procurement, Expenses, and Help. Analytics & Admin sections are restricted.' },
    ],
  },
  {
    module: 'Audit Logs',
    icon: ClipboardList,
    category: 'admin',
    description: 'Complete audit trail of all system activity and data changes.',
    sections: [
      { title: 'Overview', content: 'Comprehensive audit trail tracking every action in the system. View data changes, user sessions, accounting transactions, and entity relationships.' },
      { title: 'Data changes', content: 'Every create, update, and delete operation is logged with old/new values, user, and timestamp.' },
      { title: 'User sessions', content: 'Track login/logout events, session duration, and per-user activity summaries.' },
      { title: 'Relationships', content: 'Visualize entity chains (Sales → Devices → Journal Entries → AR) and identify broken links or incomplete accounting.' },
    ],
  },
  {
    module: 'Settings',
    icon: Settings,
    category: 'admin',
    description: 'Application configuration, company profiles, and integration setup.',
    sections: [
      { title: 'Overview', content: 'Configure application behavior, company details, notification preferences, and marketplace integrations.' },
      { title: 'Company profile', content: 'Set legal name, address, tax numbers (GST/HST, QST, Business Number), and invoice settings per company entity.' },
      { title: 'App settings', content: 'Configure thresholds (low inventory, large expense), default allocations, and payment terms.' },
      { title: 'Integrations', content: 'Connect Shopify stores, configure API keys, and manage webhook endpoints.' },
    ],
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All Modules' },
  { id: 'general', label: 'General' },
  { id: 'operations', label: 'Operations' },
  { id: 'procurement', label: 'Procurement' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'analytics', label: 'Analytics & Metrics' },
  { id: 'admin', label: 'Admin' },
];

export default function Guides() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filteredGuides = MODULE_GUIDES.filter(guide => {
    const matchesSearch =
      guide.module.toLowerCase().includes(searchTerm.toLowerCase()) ||
      guide.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      guide.sections.some(s =>
        s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.content.toLowerCase().includes(searchTerm.toLowerCase())
      );
    const matchesCategory = selectedCategory === 'all' || guide.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold gradient-text">Module Guides</h1>
          <p className="text-muted-foreground mt-1">
            Detailed documentation for every module in the system
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search across all guides..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1">
            {CATEGORIES.map(cat => (
              <TabsTrigger key={cat.id} value={cat.id} className="text-xs">
                {cat.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="space-y-4">
            {filteredGuides.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No guides match your search.</p>
                </CardContent>
              </Card>
            ) : (
              filteredGuides.map((guide, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <guide.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{guide.module}</CardTitle>
                          <Badge variant="outline" className="capitalize text-[10px]">
                            {guide.category}
                          </Badge>
                        </div>
                        <CardDescription>{guide.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                      {guide.sections.map((section, sIdx) => (
                        <AccordionItem key={sIdx} value={`${index}-${sIdx}`}>
                          <AccordionTrigger className="text-sm font-medium">
                            {section.title}
                          </AccordionTrigger>
                          <AccordionContent>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {section.content}
                            </p>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </Tabs>

        <Card className="bg-muted/30 border-dashed">
          <CardContent className="py-6">
            <p className="text-xs text-muted-foreground text-center">
              <strong>{MODULE_GUIDES.length} modules</strong> documented · {MODULE_GUIDES.reduce((sum, g) => sum + g.sections.length, 0)} sections · Guides update automatically when modules change
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
