import { useLocation } from 'react-router-dom';
import {
  Home,
  LayoutDashboard,
  Warehouse,
  Upload,
  Users,
  Settings,
  LogOut,
  Package,
  FileText,
  BarChart3,
  Wallet,
  Brain,
  ClipboardList,
  HelpCircle,
  Smartphone,
  ShoppingCart,
  ClipboardCheck,
  RotateCcw,
  Activity,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { CompanySelector } from './CompanySelector';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const mainNav = [
  { title: 'Home', url: '/home', icon: Home },
];

const operationsNav = [
  { title: 'Orders', url: '/orders', icon: ShoppingCart },
  { title: 'Inventory', url: '/inventory', icon: Smartphone },
  { title: 'Import', url: '/import', icon: Upload },
  { title: 'PO & GRN', url: '/purchase-orders', icon: ClipboardCheck },
  { title: 'Returns / RMA', url: '/returns', icon: RotateCcw },
  { title: 'Suppliers', url: '/suppliers', icon: Package },
  { title: 'Customers', url: '/customers', icon: Users },
  { title: 'Invoices', url: '/invoices', icon: FileText },
  { title: 'Expenses', url: '/expenses', icon: Wallet },
];

const analyticsNav = [
  { title: 'Reports', url: '/dashboard', icon: BarChart3 },
  { title: 'Financials', url: '/financials', icon: Wallet },
  { title: 'Forecasting', url: '/forecasting', icon: Brain },
];

const adminNav = [
  { title: 'Integration Health', url: '/integration-health', icon: Activity },
  { title: 'Audit Logs', url: '/audit-logs', icon: ClipboardList },
  { title: 'Settings', url: '/settings', icon: Settings },
];

const helpNav = [
  { title: 'Help & Guides', url: '/help', icon: HelpCircle },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { isSuperAdmin, assignments } = useCompany();

  const isAdmin = isSuperAdmin || assignments.some(a => a.role === 'admin');

  const isActive = (path: string) => location.pathname === path;

  const renderNavItems = (items: typeof operationsNav) => (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild isActive={isActive(item.url)}>
            <NavLink
              to={item.url}
              end
              className="flex items-center gap-3 transition-all duration-200"
              activeClassName="bg-primary/10 text-primary border-l-2 border-primary"
            >
              <item.icon className="h-4 w-4" />
              {!collapsed && <span className="font-medium">{item.title}</span>}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  return (
    <Sidebar className={collapsed ? 'w-14' : 'w-56'} collapsible="icon">
      <SidebarHeader className="p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
            <Warehouse className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <h2 className="font-display font-bold text-sm text-foreground tracking-tight">Warehouse</h2>
          )}
        </div>
        {!collapsed && (
          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex-1">
              <CompanySelector />
            </div>
            <NotificationCenter />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-1.5">
        <SidebarGroup>
          <SidebarGroupContent>
            {renderNavItems(mainNav)}
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-1.5 bg-border/50" />

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
            Operations
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {renderNavItems(operationsNav)}
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-1.5 bg-border/50" />

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
            Expenses
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {renderNavItems(expenseNav)}
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <>
            <Separator className="my-1.5 bg-border/50" />

            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                Analytics & Metrics
              </SidebarGroupLabel>
              <SidebarGroupContent>
                {renderNavItems(analyticsNav)}
              </SidebarGroupContent>
            </SidebarGroup>

            <Separator className="my-1.5 bg-border/50" />

            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                Admin
              </SidebarGroupLabel>
              <SidebarGroupContent>
                {renderNavItems(adminNav)}
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        <Separator className="my-1.5 bg-border/50" />

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
            Help & Support
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {renderNavItems(helpNav)}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-border/50">
        {!collapsed && user && (
          <div className="mb-2 px-2 py-1.5 rounded-md bg-muted/30">
            <p className="text-xs font-medium truncate">{user.email}</p>
            <p className="text-[10px] text-muted-foreground">
              {isSuperAdmin ? 'Super Admin' : assignments.length > 0 
                ? assignments[0].role.charAt(0).toUpperCase() + assignments[0].role.slice(1)
                : 'Team Member'}
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'sm'}
          onClick={signOut}
          className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-destructive/10 h-8"
        >
          <LogOut className="h-3.5 w-3.5" />
          {!collapsed && <span className="ml-1.5 text-xs">Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
