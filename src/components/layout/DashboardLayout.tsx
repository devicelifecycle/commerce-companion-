import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Breadcrumbs } from './Breadcrumbs';
import { CommandPalette } from '@/components/CommandPalette';
import { useLocation } from 'react-router-dom';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';

interface DashboardLayoutProps {
  children: ReactNode;
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'Home',
  '/home': 'Home',
  '/dashboard': 'Dashboard',
  '/orders': 'Orders',
  '/inventory': 'Inventory',
  '/import': 'Import Devices',
  '/cost-ledger': 'Cost & Supplier Ledger',
  '/suppliers': 'Suppliers',
  '/customers': 'Customers',
  '/invoices': 'Invoices',
  '/expenses': 'Expenses',
  '/purchase-orders': 'Purchase Orders',
  '/goods-received': 'Goods Received',
  '/returns': 'Returns / RMA',
  '/financials': 'Financials',
  '/reports': 'Reports & Analytics',
  '/forecasting': 'AI Forecasting',
  '/integration-health': 'Integration Health',
  '/team': 'Team',
  '/audit-logs': 'Audit Logs',
  '/settings': 'Settings',
  '/help': 'Help',
};

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  useGlobalShortcuts();
  const pageTitle = PAGE_TITLES[location.pathname] || 'Warehouse';

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 h-12 flex items-center gap-3 border-b border-border/40 bg-background/90 backdrop-blur-xl px-4">
            <SidebarTrigger className="-ml-1 hover:bg-primary/10 hover:text-primary transition-colors rounded-md h-8 w-8" />
            <div className="h-4 w-px bg-border/50" />
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <h2 className="font-display font-semibold text-sm text-foreground">{pageTitle}</h2>
            </div>
            <Breadcrumbs />
            <div className="flex-1" />
            <CommandPalette />
          </header>
          <div className="p-4 lg:p-5">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
