import { useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Smartphone,
  Upload,
  TrendingUp,
  Users,
  Settings,
  LogOut,
  Package,
  Receipt,
  FileText,
  Calculator,
  BarChart3,
  Wallet,
  Brain,
  Target,
  UserCircle,
  ClipboardList,
  HelpCircle,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/lib/auth';
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

const mainNavItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Inventory', url: '/inventory', icon: Smartphone },
  { title: 'Sales', url: '/sales', icon: TrendingUp },
  { title: 'Customers', url: '/customers', icon: UserCircle },
  { title: 'Import', url: '/import', icon: Upload },
];

const financeNavItems = [
  { title: 'Accounting', url: '/accounting', icon: Calculator },
  { title: 'Expenses', url: '/expenses', icon: Wallet },
  { title: 'Tax Center', url: '/taxes', icon: Receipt },
  { title: 'Invoices', url: '/invoices', icon: FileText },
  { title: 'Goals', url: '/goals', icon: Target },
  { title: 'Forecasting', url: '/forecasting', icon: Brain },
  { title: 'Reports', url: '/reports', icon: BarChart3 },
];

const settingsNavItems = [
  { title: 'Suppliers', url: '/suppliers', icon: Package },
  { title: 'Team', url: '/team', icon: Users },
  { title: 'Audit Logs', url: '/audit-logs', icon: ClipboardList },
  { title: 'Settings', url: '/settings', icon: Settings },
  { title: 'Help', url: '/help', icon: HelpCircle },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut, user } = useAuth();

  const isActive = (path: string) => location.pathname === path;

  const renderNavItems = (items: typeof mainNavItems) => (
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
    <Sidebar className={collapsed ? 'w-16' : 'w-64'} collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
            <Smartphone className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="font-display font-bold text-foreground tracking-tight">PhoneStock</h2>
              <p className="text-xs text-muted-foreground">Pro Accounting</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1">
              <CompanySelector />
            </div>
            <NotificationCenter />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Overview
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {renderNavItems(mainNavItems)}
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-3 bg-border/50" />

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Finance
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {renderNavItems(financeNavItems)}
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-3 bg-border/50" />

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Settings
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {renderNavItems(settingsNavItems)}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border/50">
        {!collapsed && user && (
          <div className="mb-3 px-2 py-2 rounded-lg bg-muted/30">
            <p className="text-sm font-medium truncate">{user.email}</p>
            <p className="text-xs text-muted-foreground">Team Member</p>
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'default'}
          onClick={signOut}
          className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
