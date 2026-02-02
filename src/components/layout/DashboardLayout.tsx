import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { useLocation } from 'react-router-dom';

interface DashboardLayoutProps {
  children: ReactNode;
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/inventory': 'Inventory',
  '/sales': 'Sales',
  '/customers': 'Customers',
  '/import': 'Import Devices',
  '/accounting': 'Accounting',
  '/expenses': 'Expenses',
  '/taxes': 'Tax Center',
  '/invoices': 'Invoices',
  '/goals': 'Profit Goals',
  '/forecasting': 'AI Forecasting',
  '/reports': 'Reports',
  '/suppliers': 'Suppliers',
  '/team': 'Team',
  '/audit-logs': 'Audit Logs',
  '/settings': 'Settings',
};

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] || 'PhoneStock';

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 h-16 flex items-center gap-4 border-b border-border/40 bg-background/90 backdrop-blur-xl px-6">
            <SidebarTrigger className="-ml-2 hover:bg-primary/10 hover:text-primary transition-colors rounded-lg" />
            <div className="h-6 w-px bg-border/50" />
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <h2 className="font-display font-semibold text-lg text-foreground">{pageTitle}</h2>
            </div>
            <div className="flex-1" />
          </header>
          <div className="p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
