import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  LayoutDashboard, ShoppingCart, Smartphone, Upload, Package, FileText,
  Wallet, BarChart3, Brain, Users, ClipboardList, Activity,
  Settings, HelpCircle, Search, ClipboardCheck, PackageCheck, RotateCcw,
  Plus, Receipt, Warehouse,
} from 'lucide-react';
import { dispatchQuickAction } from '@/hooks/useGlobalShortcuts';

const quickActions = [
  { title: 'Record a Sale', icon: ShoppingCart, url: '/orders', action: 'add-sale' as const, shortcut: 'Alt+S' },
  { title: 'Add Expense', icon: Receipt, url: '/expenses', action: 'add-expense' as const, shortcut: 'Alt+E' },
  { title: 'Import Devices', icon: Upload, url: '/import', action: undefined, shortcut: 'Alt+I' },
  { title: 'Create Invoice', icon: FileText, url: '/invoices', action: 'create-invoice' as const, shortcut: 'Alt+N' },
  { title: 'Create Purchase Order', icon: ClipboardCheck, url: '/purchase-orders', action: 'create-po' as const, shortcut: 'Alt+P' },
];

const routes = [
  { title: 'Reports', url: '/dashboard', icon: LayoutDashboard, group: 'Analytics', shortcut: 'Alt+D' },
  { title: 'Financials', url: '/financials', icon: BarChart3, group: 'Analytics' },
  { title: 'Forecasting', url: '/forecasting', icon: Brain, group: 'Analytics' },
  { title: 'Orders', url: '/orders', icon: ShoppingCart, group: 'Operations', shortcut: 'Alt+O' },
  { title: 'Inventory', url: '/inventory', icon: Smartphone, group: 'Operations', shortcut: 'Alt+V' },
  { title: 'Import Devices', url: '/import', icon: Upload, group: 'Operations' },
  { title: 'Suppliers', url: '/suppliers', icon: Package, group: 'Operations' },
  { title: 'Customers', url: '/customers', icon: Users, group: 'Operations' },
  { title: 'Invoices', url: '/invoices', icon: FileText, group: 'Operations' },
  { title: 'Expenses', url: '/expenses', icon: Wallet, group: 'Expenses' },
  { title: 'PO & GRN', url: '/purchase-orders', icon: ClipboardCheck, group: 'Procurement' },
  { title: 'Returns / RMA', url: '/returns', icon: RotateCcw, group: 'Procurement' },
  { title: 'Integration Health', url: '/integration-health', icon: Activity, group: 'Admin' },
  { title: 'Settings', url: '/settings', icon: Settings, group: 'Admin' },
  { title: 'Help', url: '/help', icon: HelpCircle, group: 'Admin' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = (url: string) => {
    setOpen(false);
    navigate(url);
  };

  const handleQuickAction = (action: typeof quickActions[number]) => {
    setOpen(false);
    navigate(action.url);
    if (action.action) {
      // Small delay to let the page mount before dispatching
      setTimeout(() => dispatchQuickAction(action.action!), 150);
    }
  };

  const groups = ['Analytics', 'Operations', 'Procurement', 'Expenses', 'Admin'];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/50 bg-muted/30 text-muted-foreground text-xs hover:bg-muted/50 transition-colors"
      >
        <Search className="h-3 w-3" />
        <span>Search...</span>
        <kbd className="ml-2 inline-flex h-5 items-center gap-0.5 rounded border border-border/50 bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages, actions..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* Quick Actions */}
          <CommandGroup heading="Quick Actions">
            {quickActions.map((action) => (
              <CommandItem
                key={action.title}
                value={action.title}
                onSelect={() => handleQuickAction(action)}
                className="cursor-pointer"
              >
                <Plus className="mr-2 h-3 w-3 text-primary" />
                <action.icon className="mr-2 h-4 w-4" />
                <span>{action.title}</span>
                <kbd className="ml-auto inline-flex h-5 items-center rounded border border-border/50 bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                  {action.shortcut}
                </kbd>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          {/* Navigation */}
          {groups.map((group, i) => {
            const items = routes.filter((r) => r.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                {i > 0 && <CommandSeparator />}
                <CommandGroup heading={group}>
                  {items.map((route) => (
                    <CommandItem
                      key={route.url}
                      value={route.title}
                      onSelect={() => handleSelect(route.url)}
                      className="cursor-pointer"
                    >
                      <route.icon className="mr-2 h-4 w-4" />
                      <span>{route.title}</span>
                      {'shortcut' in route && route.shortcut && (
                        <kbd className="ml-auto inline-flex h-5 items-center rounded border border-border/50 bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                          {route.shortcut}
                        </kbd>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
