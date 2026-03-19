import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Search, HelpCircle, MessageCircle, BookOpen, Shield,
  ShoppingCart, Smartphone, Upload, Package, Users, FileText,
  Wallet, ClipboardCheck, PackageCheck, RotateCcw, BarChart3,
  Warehouse, Brain, Settings, Activity, ClipboardList, Home,
  Building2, Cog, Network, ArrowRight, DollarSign, Receipt,
  Calculator, Scale, TrendingUp, ShieldCheck, Zap, GitBranch,
  LayoutDashboard, CheckSquare, Banknote,
} from 'lucide-react';
import { CASH_BASIS_CHART_OF_ACCOUNTS } from '@/lib/accounting/chartOfAccounts';

// ─── FAQ ─────────────────────────────────────────────────────
const FAQ_ITEMS = [
  { question: 'How do I add inventory items?', answer: 'Navigate to the Inventory page and click "Add Device". You can add items individually or use the bulk import feature to upload an Excel file with multiple devices.', category: 'inventory' },
  { question: 'How does the inter-company transfer work?', answer: 'Inter-company transfers allow you to move inventory between Virtual eShop and Tech Genius Warehouse. Go to Inventory, select a device, and click "Transfer". This automatically creates the corresponding accounting entries.', category: 'inventory' },
  { question: 'How are taxes calculated on sales?', answer: "Taxes are automatically calculated based on the customer's province. HST provinces (ON, NB, NS, PE, NL) have combined rates. GST applies in other provinces, with additional PST in BC, SK, MB and QST in Quebec.", category: 'taxes' },
  { question: 'What is an Input Tax Credit (ITC)?', answer: 'ITCs are the GST/HST you pay on business purchases that you can claim back when filing your return. Track them in the Tax Center under "Input Tax Credits".', category: 'taxes' },
  { question: 'How do I reconcile marketplace payments?', answer: 'Use the Reconciliation tab under Financials. Import your marketplace settlement reports and match them against recorded sales. Payout reconciliation is also available for tracking payout accuracy.', category: 'accounting' },
  { question: 'How do shared expenses work?', answer: 'Shared expenses can be split between Virtual eShop and Tech Genius Warehouse. When adding an expense, enable "Shared Expense" and set the allocation percentage. The system will create separate entries for each company.', category: 'expenses' },
  { question: 'Can I import data from Amazon/Shopify/BestBuy?', answer: 'Yes! Go to the Import page and select your marketplace. You can connect directly to Shopify, or upload settlement reports from Amazon and BestBuy.', category: 'import' },
  { question: 'How do I generate reports?', answer: 'Navigate to Reports to view profitability KPIs, marketplace analytics, and channel breakdowns. Financial statements and reconciliation are in the Financials section.', category: 'reports' },
  { question: 'How do user roles and permissions work?', answer: 'Go to Settings > Team to manage users. There are two roles: Admin (full access to all features) and Associate (operational access to orders, inventory, expenses, and invoices).', category: 'team' },
  { question: 'How do I process an expense refund?', answer: 'In Expenses, click the dropdown menu on any expense row and select "Record Refund". You can record full or partial refunds. The system automatically creates reversal journal entries and proportional tax adjustments.', category: 'expenses' },
  { question: 'Where are financial statements?', answer: 'Profit & Loss and Balance Sheet are under Financials > Statements. The Financials hub also includes Cost Ledger, AP/AR, Reconciliation, and Taxes.', category: 'accounting' },
];

// ─── MODULE GUIDES ───────────────────────────────────────────
interface ModuleGuide {
  module: string;
  icon: React.ElementType;
  category: string;
  description: string;
  sections: { title: string; content: string }[];
}

const MODULE_GUIDES: ModuleGuide[] = [
  {
    module: 'Home / Knowledge Hub', icon: Home, category: 'general',
    description: 'Central landing page documenting system rules, accounting principles, and automation logic.',
    sections: [
      { title: 'Overview', content: 'The Knowledge Hub serves as the primary orientation page for all users. It documents IFRS-compliant accounting principles (Accrual-basis, FIFO valuation), Canadian tax flow-through logic (GST/HST/ITC), and automation triggers for journal entries and inter-company transfers.' },
      { title: 'Who uses it', content: 'Both Admin and Associate roles. Associates use it to understand system behavior; Admins use it as a reference for configuration decisions.' },
      { title: 'Key features', content: 'System rules documentation, accounting principle references, automation trigger explanations, tax logic breakdowns, and role-based access summaries.' },
    ],
  },
  {
    module: 'Orders', icon: ShoppingCart, category: 'operations',
    description: 'Record, import, and manage sales across all marketplaces.',
    sections: [
      { title: 'Overview', content: 'The Orders module is the central hub for all sales activity. Record manual sales, import marketplace orders (Amazon, Best Buy, Shopify), and track order status from creation through fulfillment.' },
      { title: 'Manual sales', content: "Click \"Record Sale\" to create a manual order. Select the device(s), customer, and marketplace. The system automatically calculates taxes based on the customer's province and creates the corresponding journal entries." },
      { title: 'Marketplace imports', content: 'Orders from connected marketplaces sync automatically. Amazon and Best Buy orders are imported via settlement reports. Shopify orders sync in real-time via webhook.' },
      { title: 'Inter-company sales', content: 'Transfer inventory between VES and TGW entities. The system creates matching AR/AP entries and journal postings for both companies.' },
      { title: 'Returns', content: 'Process returns directly from an order. The system reverses the original journal entries, updates inventory status, and adjusts tax records.' },
      { title: 'Accounting impact', content: 'Every sale triggers: Revenue recognition (CR Sales), COGS entry (DR COGS, CR Inventory), Tax liability (CR GST/HST Payable), and Accounts Receivable (DR AR).' },
    ],
  },
  {
    module: 'Inventory', icon: Smartphone, category: 'operations',
    description: 'Track devices, stock levels, warehouse locations, and FBA inventory.',
    sections: [
      { title: 'Overview', content: 'Manage all device inventory across warehouses and fulfillment channels. Track individual devices by IMEI, model, condition, and location.' },
      { title: 'Adding devices', content: 'Add devices individually via "Add Device" or bulk import via Excel. Each device gets a unique ID and can be tracked through its entire lifecycle.' },
      { title: 'Stock status', content: 'Devices flow through statuses: In Stock → Listed → Sold → Shipped. Returned devices re-enter as "In Stock" with updated condition.' },
      { title: 'Transfers', content: "Transfer devices between VES and TGW. This creates inter-company accounting entries and updates the device's company assignment." },
      { title: 'FBA tracking', content: 'Track Amazon FBA inventory separately. Monitor inbound shipments, storage fees, and fulfillment status.' },
      { title: 'Aging reports', content: 'Identify slow-moving inventory with aging analysis. Devices held beyond configurable thresholds are flagged for review.' },
      { title: 'Labels', content: 'Generate and print inventory labels with barcodes for physical tracking.' },
    ],
  },
  {
    module: 'Import', icon: Upload, category: 'operations',
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
    module: 'Suppliers', icon: Package, category: 'operations',
    description: 'Manage supplier contacts, payment terms, and purchase history.',
    sections: [
      { title: 'Overview', content: 'Maintain a directory of all suppliers with contact details, payment terms, and performance tracking.' },
      { title: 'Adding suppliers', content: 'Create supplier records with name, contact info, and default payment terms. Suppliers are linked to purchase orders, import batches, and AP records.' },
      { title: 'Performance', content: 'Track supplier reliability through on-time delivery rates, quality metrics, and purchase volume history.' },
    ],
  },
  {
    module: 'Customers', icon: Users, category: 'operations',
    description: 'Track customer information, purchase history, and marketplace sources.',
    sections: [
      { title: 'Overview', content: 'Customer records are auto-created from marketplace orders and manual sales. Track purchase history, total spend, and contact details.' },
      { title: 'Auto-creation', content: 'When a sale is recorded, the system checks for existing customers by email. New customers are created automatically with marketplace source tracking.' },
      { title: 'Customer details', content: 'View complete purchase history, outstanding invoices, and communication notes for each customer.' },
    ],
  },
  {
    module: 'Invoices', icon: FileText, category: 'operations',
    description: 'Create, send, and track invoices with Canadian tax compliance.',
    sections: [
      { title: 'Overview', content: 'Generate professional invoices with automatic tax calculations. Track payment status and aging.' },
      { title: 'Creating invoices', content: "Select a customer, add line items (devices or services), and the system calculates GST/HST/QST based on the customer's province." },
      { title: 'Tax treatment', content: 'Each line item can be set as Taxable, Exempt, or Zero-rated. The system applies the correct provincial rates automatically.' },
      { title: 'PDF generation', content: 'Generate PDF invoices with your company letterhead, tax numbers, and payment terms.' },
      { title: 'Payment tracking', content: 'Record payments against invoices. Partial payments are supported. The system updates AR and posts journal entries on payment.' },
    ],
  },
  {
    module: 'Purchase Orders', icon: ClipboardCheck, category: 'procurement',
    description: 'Create and manage purchase orders for supplier procurement.',
    sections: [
      { title: 'Overview', content: 'Formalize procurement with purchase orders. Track order status from draft through receipt and payment.' },
      { title: 'Creating POs', content: 'Select a supplier, add items with quantities and unit costs. The system generates a PO number and tracks approval status.' },
      { title: 'Approval workflow', content: 'POs can be submitted for approval. Admins can approve or reject with notes.' },
      { title: 'Receiving', content: 'When goods arrive, create a Goods Received Note (GRN) linked to the PO. This updates inventory and triggers AP entries.' },
    ],
  },
  {
    module: 'Goods Received', icon: PackageCheck, category: 'procurement',
    description: 'Record receipt of purchased goods and link to purchase orders.',
    sections: [
      { title: 'Overview', content: 'Document the physical receipt of goods against purchase orders. Each GRN records quantities received, condition, and any discrepancies.' },
      { title: 'Creating GRNs', content: 'Select a PO, enter received quantities per item, and note any quality issues. Devices are created in inventory upon GRN completion.' },
      { title: 'Accounting impact', content: 'Completing a GRN triggers: Inventory asset increase (DR Inventory), AP liability creation (CR Accounts Payable).' },
    ],
  },
  {
    module: 'Returns / RMA', icon: RotateCcw, category: 'procurement',
    description: 'Process customer returns and return merchandise authorizations.',
    sections: [
      { title: 'Overview', content: 'Handle customer returns with full accounting reversal. Track return reasons, restocking, and refund processing.' },
      { title: 'Processing returns', content: "Initiate a return from the original order. Select items being returned, specify reason and condition. The system reverses the sale's journal entries." },
      { title: 'Accounting impact', content: 'Returns reverse: Revenue (DR Sales Returns), COGS (CR COGS, DR Inventory), Tax (DR GST/HST Payable), and AR (CR Accounts Receivable).' },
      { title: 'Restocking', content: 'Returned devices re-enter inventory with updated condition status. Devices in poor condition can be marked for refurbishment or write-off.' },
    ],
  },
  {
    module: 'Expenses', icon: Wallet, category: 'expenses',
    description: 'Track business expenses with shared allocation, refunds, and tax deduction tracking.',
    sections: [
      { title: 'Overview', content: 'Record all business expenses with categorization, tax tracking, and inter-company allocation.' },
      { title: 'Adding expenses', content: 'Enter amount, category, vendor, and payment method. Attach receipts for documentation. The system calculates ITC eligibility automatically.' },
      { title: 'Shared expenses', content: 'Enable shared allocation to split expenses between VES and TGW. Set custom percentages or use category-based defaults.' },
      { title: 'Expense refunds', content: 'Record full or partial refunds against any expense. The system creates a separate refund record linked to the original expense, generates reversal journal entries (DR Cash, CR Expense), and proportionally reverses GST/HST/PST amounts for accurate ITC tracking.' },
      { title: 'Recurring expenses', content: 'Set up recurring expenses for rent, subscriptions, and other fixed costs. The system auto-generates entries on schedule.' },
      { title: 'Approval workflow', content: 'Expenses above a configurable threshold require admin approval. Small expenses can be auto-approved based on settings.' },
      { title: 'Vendor management', content: 'Track vendors with contact details, payment history, and expense trends.' },
    ],
  },
  {
    module: 'Reports', icon: BarChart3, category: 'analytics',
    description: 'Profitability KPIs, marketplace analytics, and channel performance.',
    sections: [
      { title: 'Overview', content: 'The Reports page provides real-time business metrics and analytics. View profitability ratios, revenue trends, and marketplace performance across all channels.' },
      { title: 'Profitability', content: 'Core KPIs: Gross Margin, Net Margin, Inventory Turnover, ROI on Inventory, Expense/Revenue Ratio, and Profit per Unit. Revenue & profit trend charts, marketplace breakdown, top products, expense distribution, and recent activity feed.' },
      { title: 'Marketplace', content: 'Revenue, fees, and profit per marketplace. Fee ratios, AOV, and channel-specific trends via Marketplace Accounting and Fee Analytics views.' },
    ],
  },
  {
    module: 'Financials', icon: Wallet, category: 'analytics',
    description: 'Statements, cost ledger, AP/AR, reconciliation, payouts, and taxes.',
    sections: [
      { title: 'Overview', content: 'The Financials hub consolidates all accounting and transactional finance. It includes five sections: Statements, Cost Ledger, AP/AR, Reconciliation, and Taxes.' },
      { title: 'Statements', content: 'Profit & Loss and Balance Sheet reports. Filter by date range and company entity. Revenue, COGS, gross profit, operating expenses, net income, assets, liabilities, and equity.' },
      { title: 'Cost Ledger', content: 'FIFO cost tracking with KPI tiles (Total Cost, Avg Unit Cost, Logistics, Sold Margin %), import batch history, and supplier cost summaries.' },
      { title: 'AP & AR', content: 'Manage Accounts Payable (bills owed to suppliers) and Accounts Receivable (money owed to you). Record payments, track aging, and view balances by company.' },
      { title: 'Reconciliation', content: 'Marketplace Reconciliation compares marketplace-reported data against internal records — variances over $1 are flagged. Payout Reconciliation tracks payout accuracy with metrics for Accuracy Rate, Net/Absolute Variance, and Fee Delta.' },
      { title: 'Taxes', content: 'Tax Overview dashboard, GST/HST collected report, Input Tax Credits (ITC) tracking, and filing period management with filing-ready reports.' },
    ],
  },
  {
    module: 'Cost Ledger', icon: Warehouse, category: 'analytics',
    description: 'FIFO cost tracking and inventory valuation by lot and device.',
    sections: [
      { title: 'Overview', content: 'Detailed cost tracking using FIFO methodology. View cost layers, lot-level profitability, and landed cost calculations.' },
      { title: 'FIFO layers', content: 'Each import batch creates a cost layer. When devices are sold, the oldest cost layer is consumed first (First In, First Out).' },
      { title: 'Landed costs', content: 'Shipping, customs, and other charges from import batches are allocated across devices to calculate true landed cost.' },
    ],
  },
  {
    module: 'Forecasting', icon: Brain, category: 'analytics',
    description: 'AI-powered demand forecasting and inventory planning.',
    sections: [
      { title: 'Overview', content: 'AI-driven forecasting using historical sales data to predict future demand, optimal stock levels, and revenue projections.' },
      { title: 'Demand forecasting', content: 'Analyze sales trends by model, brand, and marketplace to predict future demand and optimize purchasing decisions.' },
      { title: 'Revenue projections', content: 'Project future revenue based on current inventory, historical margins, and seasonal patterns.' },
    ],
  },
  {
    module: 'Integration Health', icon: Activity, category: 'admin',
    description: 'Monitor marketplace API connections and data sync status.',
    sections: [
      { title: 'Overview', content: 'Monitor the health and status of all marketplace integrations. View sync history, error rates, and connection status.' },
      { title: 'Connection status', content: 'Real-time status of API connections to Amazon, Best Buy, Shopify, and other marketplaces.' },
      { title: 'Data validation', content: 'Automated validation checks flag data quality issues: missing fields, duplicate orders, price mismatches.' },
    ],
  },
  {
    module: 'Team Management', icon: Users, category: 'admin',
    description: 'Manage users, roles, and company access assignments.',
    sections: [
      { title: 'Overview', content: 'Manage team members, assign roles (Admin/Associate), and control company access. Found under Settings. Admins have full access; Associates have operational access.' },
      { title: 'Inviting users', content: 'Invite new team members by email. Assign their role and company access upon invitation.' },
      { title: 'Permissions', content: 'Admin: Full access to all modules. Associate: Access to Operations, Procurement, Expenses, and Help. Analytics & Admin sections are restricted.' },
    ],
  },
  {
    module: 'Audit Logs', icon: ClipboardList, category: 'admin',
    description: 'Complete audit trail of all system activity and data changes.',
    sections: [
      { title: 'Overview', content: 'Comprehensive audit trail tracking every action in the system. View data changes, user sessions, accounting transactions, and entity relationships.' },
      { title: 'Data changes', content: 'Every create, update, and delete operation is logged with old/new values, user, and timestamp.' },
      { title: 'Relationships', content: 'Visualize entity chains (Sales → Devices → Journal Entries → AR) and identify broken links or incomplete accounting.' },
    ],
  },
  {
    module: 'Settings', icon: Settings, category: 'admin',
    description: 'Application configuration, company profiles, and integration setup.',
    sections: [
      { title: 'Overview', content: 'Configure application behavior, company details, notification preferences, and marketplace integrations.' },
      { title: 'Company profile', content: 'Set legal name, address, tax numbers (GST/HST, QST, Business Number), and invoice settings per company entity.' },
      { title: 'App settings', content: 'Configure thresholds (low inventory, large expense), default allocations, and payment terms.' },
      { title: 'Integrations', content: 'Connect Shopify stores, configure API keys, and manage webhook endpoints.' },
    ],
  },
];

const GUIDE_CATEGORIES = [
  { id: 'all', label: 'All Modules' },
  { id: 'general', label: 'General' },
  { id: 'operations', label: 'Operations' },
  { id: 'procurement', label: 'Procurement' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'admin', label: 'Admin' },
];

// ─── ACCOUNTING KNOWLEDGE ────────────────────────────────────
const GENERAL_SECTIONS = [
  { title: 'Accrual-Basis Accounting', icon: <Scale className="h-4 w-4 text-primary" />, content: 'This business uses accrual-basis accounting under IFRS principles. Revenue is recognized when goods are shipped or delivered — not when cash is received. Expenses are recognized when incurred, regardless of payment timing. This means a sale creates revenue and an Accounts Receivable entry immediately, while a purchase creates an expense and an Accounts Payable entry upon receipt of goods.' },
  { title: 'Double-Entry Bookkeeping', icon: <Calculator className="h-4 w-4 text-primary" />, content: 'Every financial transaction is recorded with at least two entries: a debit and a credit of equal value. Assets and expenses increase with debits; liabilities, equity, and revenue increase with credits. The fundamental equation (Assets = Liabilities + Equity) must always balance.' },
  { title: 'FIFO Inventory Valuation', icon: <Package className="h-4 w-4 text-primary" />, content: 'Inventory is valued using the First-In, First-Out (FIFO) method. When devices are sold, the cost of the oldest inventory is recognized as Cost of Goods Sold first. Each import batch creates a "cost layer" — when a device from that batch is sold, its original purchase cost (plus any allocated shipping/charges) becomes COGS.' },
  { title: 'Multi-Entity Structure (VES & TGW)', icon: <Building2 className="h-4 w-4 text-primary" />, content: 'The business operates as two separate legal entities: Virtual eShop (VES) and Tech Genius Warehouse (TGW). Each entity has its own set of books — separate bank accounts, AR/AP, inventory, and tax obligations. VES primarily sells on Amazon; TGW sells on Best Buy and Shopify. Shared expenses are allocated between entities using configurable percentages.' },
  { title: 'Canadian Tax Obligations (GST/HST)', icon: <Receipt className="h-4 w-4 text-primary" />, content: 'As Ontario-based businesses, both entities collect HST at 13% on taxable sales. Tax collected is held as a liability (GST/HST Payable) until remitted to the CRA. Input Tax Credits (ITCs) are claimed on GST/HST paid on business purchases, reducing the net tax owing.' },
  { title: 'Accounts Receivable (AR) Lifecycle', icon: <TrendingUp className="h-4 w-4 text-primary" />, content: 'AR represents money owed to the business. When a sale occurs or an invoice is issued, an AR entry is created with the full amount due. As payments are received, the AR balance decreases. The aging report categorizes outstanding AR by how long it has been unpaid.' },
  { title: 'Accounts Payable (AP) Lifecycle', icon: <DollarSign className="h-4 w-4 text-primary" />, content: 'AP represents money the business owes to suppliers. When goods are received (via GRN) or when an expense uses a non-immediate payment method, an AP entry is created. Payments against AP are recorded individually, and partial payments are supported.' },
  { title: 'Inter-Company Transactions', icon: <GitBranch className="h-4 w-4 text-primary" />, content: 'When inventory moves between VES and TGW, the system creates matching inter-company entries. The selling entity records revenue and an inter-company receivable; the buying entity records inventory and an inter-company payable. These balances must net to zero in consolidated reporting.' },
];

const SYSTEM_SECTIONS = [
  { title: 'Automated Journal Entries', icon: <Zap className="h-4 w-4 text-primary" />, content: 'The system auto-generates journal entries. Sales post: DR AR / CR Revenue / CR GST/HST Payable + DR COGS / CR Inventory. Expenses post: DR Expense / CR Cash (or CR AP). Returns reverse all original entries. Expense refunds create reversal entries: DR Cash / CR Expense with proportional tax reversal.' },
  { title: 'Accounting Status Pipeline', icon: <Cog className="h-4 w-4 text-primary" />, content: 'Every sale has an "accounting_status" field: "unprocessed" → "revenue_only" → "fully_processed". This pipeline ensures no sale falls through the cracks and allows batch-processing of incomplete entries.' },
  { title: 'Lot-Based Cost Tracking', icon: <Package className="h-4 w-4 text-primary" />, content: 'Every import batch is a "lot" with a unique number. Shipping, customs, and other charges are allocated proportionally across devices. When sold, each device\'s specific landed cost is used for COGS — not an average.' },
  { title: 'Shared Expense Allocation', icon: <Wallet className="h-4 w-4 text-primary" />, content: 'Shared expenses are allocated between VES and TGW using configurable split percentages per category. The system creates separate journal entries for each entity. Defaults can be overridden per-expense.' },
  { title: 'Expense Refund System', icon: <RotateCcw className="h-4 w-4 text-primary" />, content: 'Expense refunds are tracked as separate records linked to the original expense (supporting partial/full refunds with audit trail). Each refund auto-generates reversal journal entries and proportionally reverses GST/HST/PST for accurate ITC tracking.' },
  { title: 'Model Normalization', icon: <ShieldCheck className="h-4 w-4 text-primary" />, content: 'Device model names from different sources are automatically normalized to a standard format during import. For example, "Apple iPhone 15 Pro Max 256GB" and "iphone15promax 256" both normalize to "iPhone 15 Pro Max".' },
  { title: 'Payout Reconciliation', icon: <Banknote className="h-4 w-4 text-primary" />, content: 'Marketplace payouts are synced every 6 hours via pg_cron (Amazon SP-API, Shopify Payouts API, Best Buy/Mirakl). Transactions are matched if variance is under $1; otherwise flagged as discrepancies. Metrics track Accuracy Rate, Net/Absolute Variance, and Fee Delta.' },
  { title: 'Duplicate Prevention & Validation', icon: <ShieldCheck className="h-4 w-4 text-primary" />, content: 'Automated validation prevents: duplicate order IDs, IMEI conflicts, missing required fields, and price anomalies. The Integration Health page surfaces these issues for review.' },
  { title: 'Real-Time Audit Trail', icon: <FileText className="h-4 w-4 text-primary" />, content: 'Every action is logged with full before/after data snapshots. Entity relationship chains (Sale → Device → Journal Entry → AR Payment) are traceable end-to-end.' },
];

const ENTITY_RELATIONSHIPS = [
  { source: 'sales', link: 'device_id', target: 'devices', description: 'Each sale links to the device sold' },
  { source: 'sales', link: 'company_id', target: 'companies', description: 'Sale belongs to VES or TGW' },
  { source: 'sales', link: 'customer_id', target: 'customers', description: 'Sale links to customer record' },
  { source: 'devices', link: 'supplier_id', target: 'suppliers', description: 'Device sourced from supplier' },
  { source: 'devices', link: 'import_batch_id', target: 'import_batches', description: 'Device belongs to import lot' },
  { source: 'devices', link: 'company_id', target: 'companies', description: 'Device owned by VES or TGW' },
  { source: 'import_batches', link: 'supplier_id', target: 'suppliers', description: 'Batch purchased from supplier' },
  { source: 'purchase_orders', link: 'supplier_id', target: 'suppliers', description: 'PO issued to supplier' },
  { source: 'purchase_order_items', link: 'purchase_order_id', target: 'purchase_orders', description: 'Line items on a PO' },
  { source: 'goods_received_notes', link: 'purchase_order_id', target: 'purchase_orders', description: 'GRN fulfills a PO' },
  { source: 'grn_items', link: 'grn_id', target: 'goods_received_notes', description: 'Items received in a GRN' },
  { source: 'grn_items', link: 'device_id', target: 'devices', description: 'GRN item creates a device' },
  { source: 'invoices', link: 'company_id', target: 'companies', description: 'Invoice issued by entity' },
  { source: 'invoice_items', link: 'invoice_id', target: 'invoices', description: 'Line items on invoice' },
  { source: 'invoice_items', link: 'device_id', target: 'devices', description: 'Invoice item references device' },
  { source: 'accounts_receivable', link: 'invoice_id', target: 'invoices', description: 'AR entry from invoice' },
  { source: 'ar_payments', link: 'accounts_receivable_id', target: 'accounts_receivable', description: 'Payment against AR' },
  { source: 'accounts_payable', link: 'vendor_id', target: 'vendors', description: 'AP owed to vendor' },
  { source: 'ap_payments', link: 'accounts_payable_id', target: 'accounts_payable', description: 'Payment against AP' },
  { source: 'expenses', link: 'company_id', target: 'companies', description: 'Expense charged to entity' },
  { source: 'expenses', link: 'parent_expense_id', target: 'expenses', description: 'Split expense child' },
  { source: 'expense_refunds', link: 'expense_id', target: 'expenses', description: 'Refund linked to original expense' },
  { source: 'journal_entries', link: 'company_id', target: 'companies', description: 'JE posted for entity' },
  { source: 'journal_entry_lines', link: 'journal_entry_id', target: 'journal_entries', description: 'Debit/credit lines in JE' },
  { source: 'journal_entry_lines', link: 'account_id', target: 'chart_of_accounts', description: 'Line posts to COA account' },
  { source: 'bank_transactions', link: 'bank_account_id', target: 'bank_accounts', description: 'Transaction in bank account' },
  { source: 'bank_transactions', link: 'matched_journal_entry_id', target: 'journal_entries', description: 'Bank txn matched to JE' },
  { source: 'inventory_transfers', link: 'device_id', target: 'devices', description: 'Transfer moves a device' },
  { source: 'inventory_transfers', link: 'from_company_id / to_company_id', target: 'companies', description: 'Transfer between entities' },
  { source: 'input_tax_credits', link: 'expense_id', target: 'expenses', description: 'ITC from expense' },
  { source: 'input_tax_credits', link: 'filing_period_id', target: 'tax_filing_periods', description: 'ITC claimed in filing period' },
  { source: 'marketplace_payouts', link: 'company_id', target: 'companies', description: 'Payout received by entity' },
];

const ACCOUNTING_FLOWS = [
  {
    title: 'Sale Lifecycle', icon: <TrendingUp className="h-4 w-4 text-primary" />,
    steps: [
      'Order recorded (manual or marketplace import)',
      'Status set to "unprocessed"',
      'Revenue & AR journal entries auto-generated → status becomes "revenue_only"',
      'Device linked → COGS & inventory entries posted → status becomes "fully_processed"',
      'Marketplace payout received → AR payment recorded → Cash debited',
    ],
  },
  {
    title: 'Procurement Lifecycle', icon: <Package className="h-4 w-4 text-primary" />,
    steps: [
      'Purchase Order created for supplier',
      'PO approved by admin',
      'Goods arrive → GRN created against PO',
      'GRN finalized → Devices created in inventory (DR Inventory)',
      'AP bill auto-generated (CR Accounts Payable)',
      'Payment recorded → AP cleared (DR AP / CR Cash)',
    ],
  },
  {
    title: 'Return Lifecycle', icon: <RotateCcw className="h-4 w-4 text-primary" />,
    steps: [
      'Return initiated from original order',
      'Reason and condition recorded',
      'Reversal journal entries auto-posted: DR Sales Returns / CR AR',
      'COGS reversed: CR COGS / DR Inventory',
      'Tax reversed: DR GST/HST Payable',
      'Device re-enters inventory with updated condition',
    ],
  },
  {
    title: 'Expense Refund', icon: <Wallet className="h-4 w-4 text-primary" />,
    steps: [
      'Refund initiated from original expense (full or partial amount)',
      'Refund record created with amount, method, reason, and reference',
      'Reversal journal entries auto-posted: DR Cash / CR Expense',
      'GST/HST/PST proportionally reversed for ITC accuracy',
      'Original expense retains full audit trail alongside refund record',
    ],
  },
  {
    title: 'Expense Allocation', icon: <Wallet className="h-4 w-4 text-primary" />,
    steps: [
      'Expense recorded with category and payment method',
      'If shared: allocation percentages applied (VES% / TGW%)',
      'Split child expenses created for each entity',
      'Journal entries posted per entity (DR Expense / CR Cash or AP)',
      'ITC eligibility calculated on GST/HST portion',
    ],
  },
  {
    title: 'Tax Remittance', icon: <Receipt className="h-4 w-4 text-primary" />,
    steps: [
      'Tax collected on sales accumulates in GST/HST Payable',
      'ITCs from purchases offset payable amount',
      'Net tax liability calculated for filing period',
      'Payment recorded → DR GST/HST Payable / CR Cash',
      'Filing period marked as submitted/paid',
    ],
  },
];

const KEYBOARD_SHORTCUTS = [
  { key: '⌘ + K', action: 'Global search' },
  { key: '⌘ + N', action: 'New item (context-aware)' },
  { key: '⌘ + S', action: 'Save changes' },
  { key: 'Esc', action: 'Close dialog' },
  { key: '⌘ + /', action: 'Show shortcuts' },
];

// ─── COMPONENT ───────────────────────────────────────────────
export default function HelpAndGuides() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFaqCategory, setSelectedFaqCategory] = useState('all');
  const [selectedGuideCategory, setSelectedGuideCategory] = useState('all');

  const filteredFAQ = FAQ_ITEMS.filter(item => {
    const matchesSearch = item.question.toLowerCase().includes(searchTerm.toLowerCase()) || item.answer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedFaqCategory === 'all' || item.category === selectedFaqCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredGuides = MODULE_GUIDES.filter(guide => {
    const matchesSearch = !searchTerm ||
      guide.module.toLowerCase().includes(searchTerm.toLowerCase()) ||
      guide.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      guide.sections.some(s => s.title.toLowerCase().includes(searchTerm.toLowerCase()) || s.content.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedGuideCategory === 'all' || guide.category === selectedGuideCategory;
    return matchesSearch && matchesCategory;
  });

  const coaByType = CASH_BASIS_CHART_OF_ACCOUNTS.reduce((acc, account) => {
    const type = account.type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(account);
    return acc;
  }, {} as Record<string, typeof CASH_BASIS_CHART_OF_ACCOUNTS>);

  const typeOrder = ['asset', 'liability', 'equity', 'revenue', 'expense', 'tax_paid'];
  const typeLabels: Record<string, string> = {
    asset: 'Assets (1xxx)', liability: 'Liabilities (2xxx)', equity: 'Equity (3xxx)',
    revenue: 'Revenue (4xxx)', expense: 'Expenses (5xxx–7xxx)', tax_paid: 'Tax Paid / ITCs (8xxx)',
  };

  const filteredCOA = CASH_BASIS_CHART_OF_ACCOUNTS.filter(a =>
    !searchTerm || a.code.includes(searchTerm) || a.name.toLowerCase().includes(searchTerm.toLowerCase()) || (a.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredRelationships = ENTITY_RELATIONSHIPS.filter(r =>
    !searchTerm || r.source.includes(searchTerm.toLowerCase()) || r.target.includes(searchTerm.toLowerCase()) || r.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'inventory': return <Smartphone className="h-4 w-4" />;
      case 'sales': return <TrendingUp className="h-4 w-4" />;
      case 'expenses': return <Wallet className="h-4 w-4" />;
      case 'accounting': return <Calculator className="h-4 w-4" />;
      case 'taxes': return <Receipt className="h-4 w-4" />;
      case 'reports': return <BarChart3 className="h-4 w-4" />;
      case 'import': return <Upload className="h-4 w-4" />;
      case 'team': return <Users className="h-4 w-4" />;
      default: return <HelpCircle className="h-4 w-4" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold gradient-text">Help & Guides</h1>
          <p className="text-muted-foreground mt-1">FAQ, module documentation, accounting knowledge, and shortcuts</p>
        </div>

        {/* Global search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search across all help content..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="faq" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="faq" className="text-xs gap-1.5"><MessageCircle className="h-3.5 w-3.5" />FAQ</TabsTrigger>
            <TabsTrigger value="modules" className="text-xs gap-1.5"><BookOpen className="h-3.5 w-3.5" />Module Guides</TabsTrigger>
            <TabsTrigger value="accounting" className="text-xs gap-1.5"><Calculator className="h-3.5 w-3.5" />Accounting</TabsTrigger>
            <TabsTrigger value="relationships" className="text-xs gap-1.5"><Network className="h-3.5 w-3.5" />Data & Charts</TabsTrigger>
            <TabsTrigger value="shortcuts" className="text-xs gap-1.5"><Shield className="h-3.5 w-3.5" />Shortcuts</TabsTrigger>
          </TabsList>

          {/* ─── FAQ ─── */}
          <TabsContent value="faq" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant={selectedFaqCategory === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setSelectedFaqCategory('all')}>All</Button>
              {['inventory', 'taxes', 'accounting', 'expenses', 'import', 'reports', 'team'].map(cat => (
                <Button key={cat} variant={selectedFaqCategory === cat ? 'default' : 'outline'} size="sm" onClick={() => setSelectedFaqCategory(cat)} className="gap-1">
                  {getCategoryIcon(cat)}
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Button>
              ))}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Frequently Asked Questions</CardTitle>
                <CardDescription>{filteredFAQ.length} results</CardDescription>
              </CardHeader>
              <CardContent>
                {filteredFAQ.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No results found. Try a different search term.</p>
                  </div>
                ) : (
                  <Accordion type="single" collapsible className="w-full">
                    {filteredFAQ.map((item, index) => (
                      <AccordionItem key={index} value={`faq-${index}`}>
                        <AccordionTrigger className="text-left">
                          <div className="flex items-center gap-3">
                            {getCategoryIcon(item.category)}
                            <span>{item.question}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="pl-7 space-y-2">
                            <p className="text-muted-foreground">{item.answer}</p>
                            <Badge variant="outline" className="capitalize">{item.category}</Badge>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── MODULE GUIDES ─── */}
          <TabsContent value="modules" className="space-y-4">
            <div className="flex flex-wrap gap-1">
              {GUIDE_CATEGORIES.map(cat => (
                <Button key={cat.id} variant={selectedGuideCategory === cat.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedGuideCategory(cat.id)} className="text-xs">
                  {cat.label}
                </Button>
              ))}
            </div>
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
                          <Badge variant="outline" className="capitalize text-[10px]">{guide.category}</Badge>
                        </div>
                        <CardDescription>{guide.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                      {guide.sections.map((section, sIdx) => (
                        <AccordionItem key={sIdx} value={`g-${index}-${sIdx}`}>
                          <AccordionTrigger className="text-sm font-medium">{section.title}</AccordionTrigger>
                          <AccordionContent>
                            <p className="text-sm text-muted-foreground leading-relaxed">{section.content}</p>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              ))
            )}
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground text-center">
                  <strong>{MODULE_GUIDES.length} modules</strong> documented · {MODULE_GUIDES.reduce((sum, g) => sum + g.sections.length, 0)} sections · Guides update automatically when modules change
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── ACCOUNTING KNOWLEDGE ─── */}
          <TabsContent value="accounting" className="space-y-4">
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="py-4">
                <p className="text-sm text-muted-foreground">
                  How a multi-entity electronics resale business in Ontario handles accounting — IFRS principles, FIFO inventory, GST/HST, and automated journal entries.
                </p>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">General Accounting Principles</h3>
              {GENERAL_SECTIONS.map((section, i) => (
                <Card key={i}>
                  <Accordion type="single" collapsible>
                    <AccordionItem value={`general-${i}`} className="border-0">
                      <AccordionTrigger className="px-6 py-4 hover:no-underline">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">{section.icon}</div>
                          <span className="font-semibold text-sm">{section.title}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-6 pb-4">
                        <p className="text-sm text-muted-foreground leading-relaxed">{section.content}</p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </Card>
              ))}
            </div>

            <div className="space-y-3 pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">How Our System Works</h3>
              {SYSTEM_SECTIONS.map((section, i) => (
                <Card key={i}>
                  <Accordion type="single" collapsible>
                    <AccordionItem value={`system-${i}`} className="border-0">
                      <AccordionTrigger className="px-6 py-4 hover:no-underline">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">{section.icon}</div>
                          <span className="font-semibold text-sm">{section.title}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-6 pb-4">
                        <p className="text-sm text-muted-foreground leading-relaxed">{section.content}</p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ─── DATA & CHARTS ─── */}
          <TabsContent value="relationships" className="space-y-6">
            {/* Chart of Accounts */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10"><Calculator className="h-5 w-5 text-primary" /></div>
                  <div>
                    <CardTitle className="text-lg">Chart of Accounts</CardTitle>
                    <CardDescription>{CASH_BASIS_CHART_OF_ACCOUNTS.length} accounts · Live-synced from system configuration</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {typeOrder.map(type => {
                  const accounts = (coaByType[type] || []).filter(a => filteredCOA.includes(a));
                  if (accounts.length === 0) return null;
                  return (
                    <Accordion key={type} type="single" collapsible>
                      <AccordionItem value={type} className="border rounded-lg">
                        <AccordionTrigger className="px-4 py-3 hover:no-underline">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] font-mono">{accounts.length}</Badge>
                            <span className="font-semibold text-sm capitalize">{typeLabels[type] || type}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-20">Code</TableHead>
                                <TableHead>Account Name</TableHead>
                                <TableHead className="w-24">Entity</TableHead>
                                <TableHead className="w-20">Normal</TableHead>
                                <TableHead className="hidden lg:table-cell">Description</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {accounts.map(a => (
                                <TableRow key={a.code}>
                                  <TableCell className="font-mono text-xs">{a.code}</TableCell>
                                  <TableCell className="text-sm font-medium">{a.name}</TableCell>
                                  <TableCell><Badge variant="outline" className="text-[10px] capitalize">{a.company || 'shared'}</Badge></TableCell>
                                  <TableCell className="text-xs capitalize">{a.normalBalance}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{a.description}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  );
                })}
              </CardContent>
            </Card>

            {/* Entity Relationships */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10"><Network className="h-5 w-5 text-primary" /></div>
                  <div>
                    <CardTitle className="text-lg">Entity Relationship Map</CardTitle>
                    <CardDescription>{ENTITY_RELATIONSHIPS.length} foreign-key relationships across all tables</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source Table</TableHead>
                      <TableHead className="w-12 text-center"></TableHead>
                      <TableHead>Target Table</TableHead>
                      <TableHead className="hidden md:table-cell">Link Column</TableHead>
                      <TableHead className="hidden lg:table-cell">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRelationships.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{r.source}</TableCell>
                        <TableCell className="text-center"><ArrowRight className="h-3.5 w-3.5 text-muted-foreground mx-auto" /></TableCell>
                        <TableCell className="font-mono text-xs">{r.target}</TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground hidden md:table-cell">{r.link}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{r.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Accounting Flows */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10"><GitBranch className="h-5 w-5 text-primary" /></div>
                  <div>
                    <CardTitle className="text-lg">Accounting Flow Diagrams</CardTitle>
                    <CardDescription>Step-by-step lifecycle for each major process</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {ACCOUNTING_FLOWS.map((flow, fi) => (
                  <Accordion key={fi} type="single" collapsible>
                    <AccordionItem value={`flow-${fi}`} className="border rounded-lg">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex items-center gap-3">
                          {flow.icon}
                          <span className="font-semibold text-sm">{flow.title}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        <div className="space-y-2">
                          {flow.steps.map((step, si) => (
                            <div key={si} className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                                <span className="text-[10px] font-bold text-primary">{si + 1}</span>
                              </div>
                              <p className="text-sm text-muted-foreground leading-relaxed">{step}</p>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── SHORTCUTS ─── */}
          <TabsContent value="shortcuts">
            <Card>
              <CardHeader>
                <CardTitle>Keyboard Shortcuts</CardTitle>
                <CardDescription>Speed up your workflow with these shortcuts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 max-w-md">
                  {KEYBOARD_SHORTCUTS.map((shortcut, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                      <span className="text-sm">{shortcut.action}</span>
                      <kbd className="px-2 py-1 rounded bg-muted text-xs font-mono">{shortcut.key}</kbd>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Contact Support */}
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center text-center">
              <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Still need help?</h3>
              <p className="text-muted-foreground max-w-md mb-4">Can't find what you're looking for? Our support team is here to help.</p>
              <Button><MessageCircle className="h-4 w-4 mr-2" />Contact Support</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-dashed">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground text-center">
              <strong>{MODULE_GUIDES.length} modules</strong> · {CASH_BASIS_CHART_OF_ACCOUNTS.length} accounts · {ENTITY_RELATIONSHIPS.length} relationships · {ACCOUNTING_FLOWS.length} flow diagrams · Content auto-updates with system changes
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
