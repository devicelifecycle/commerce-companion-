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
  Wallet, TrendingUp, Building2, DollarSign, BarChart3, Brain,
  ArrowDownRight, ArrowUpRight, Receipt, BookOpen, Users, ClipboardList,
  Settings, HelpCircle, Search,
} from 'lucide-react';

const routes = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard, group: 'Analytics' },
  { title: 'Orders', url: '/orders', icon: ShoppingCart, group: 'Operations' },
  { title: 'Inventory', url: '/inventory', icon: Smartphone, group: 'Operations' },
  { title: 'Import Devices', url: '/import', icon: Upload, group: 'Operations' },
  { title: 'Suppliers', url: '/suppliers', icon: Package, group: 'Operations' },
  { title: 'Invoices', url: '/invoices', icon: FileText, group: 'Operations' },
  { title: 'Expenses', url: '/expenses', icon: Wallet, group: 'Expenses' },
  { title: 'Profit & Loss', url: '/statements/profit-loss', icon: TrendingUp, group: 'Analytics' },
  { title: 'Balance Sheet', url: '/statements/balance-sheet', icon: Building2, group: 'Analytics' },
  { title: 'Cash Flow', url: '/statements/cash-flow', icon: DollarSign, group: 'Analytics' },
  { title: 'Reports', url: '/reports', icon: BarChart3, group: 'Analytics' },
  { title: 'Forecasting', url: '/forecasting', icon: Brain, group: 'Analytics' },
  { title: 'Accounts Payable', url: '/accounting/ap', icon: ArrowDownRight, group: 'Finance' },
  { title: 'Accounts Receivable', url: '/accounting/ar', icon: ArrowUpRight, group: 'Finance' },
  { title: 'Tax Center', url: '/taxes', icon: Receipt, group: 'Finance' },
  { title: 'Accounting Guide', url: '/accounting/knowledge', icon: BookOpen, group: 'Finance' },
  { title: 'Team', url: '/team', icon: Users, group: 'Admin' },
  { title: 'Audit Logs', url: '/audit-logs', icon: ClipboardList, group: 'Admin' },
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

  const groups = ['Operations', 'Expenses', 'Analytics', 'Finance', 'Admin'];

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
        <CommandInput placeholder="Search pages, features..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
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
