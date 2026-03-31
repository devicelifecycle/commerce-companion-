import { useLocation, Link } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

const ROUTE_LABELS: Record<string, string> = {
  '': 'Dashboard',
  'home': 'Home',
  'dashboard': 'Dashboard',
  'orders': 'Orders',
  'inventory': 'Inventory',
  'import': 'Import',
  'suppliers': 'Suppliers',
  'customers': 'Customers',
  'invoices': 'Invoices',
  'expenses': 'Expenses',
  'purchase-orders': 'PO & GRN',
  'goods-received': 'PO & GRN',
  'returns': 'Returns / RMA',
  'statements': 'Statements',
  'profit-loss': 'Profit & Loss',
  'balance-sheet': 'Balance Sheet',
  'cash-flow': 'Cash Flow',
  'financials': 'Financials',
  'cost-ledger': 'Cost Ledger',
  'accounting': 'Accounting',
  'ap': 'Accounts Payable',
  'ar': 'Accounts Receivable',
  'knowledge': 'Guide',
  'taxes': 'Tax Center',
  'reports': 'Reports',
  'forecasting': 'Forecasting',
  'integration-health': 'Integration Health',
  'team': 'Team',
  
  'settings': 'Settings',
  'help': 'Help',
};

export function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length <= 1) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/" className="text-xs">Home</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {segments.map((segment, index) => {
          const path = '/' + segments.slice(0, index + 1).join('/');
          const label = ROUTE_LABELS[segment] || segment;
          const isLast = index === segments.length - 1;

          return (
            <div key={path} className="contents">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="text-xs">{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={path} className="text-xs">{label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </div>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
