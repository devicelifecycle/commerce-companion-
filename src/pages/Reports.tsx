import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExecutiveDashboard } from '@/components/reports/ExecutiveDashboard';
import { ProfitLossStatement } from '@/components/reports/ProfitLossStatement';
import { SalesReports } from '@/components/reports/SalesReports';
import { InventoryReports } from '@/components/reports/InventoryReports';
import { ExpenseReports } from '@/components/reports/ExpenseReports';
import { useCompany } from '@/contexts/CompanyContext';
import { 
  LayoutDashboard, FileText, ShoppingCart, Package, Wallet, Building2
} from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export default function Reports() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { companies } = useCompany();
  const [companyView, setCompanyView] = useState<'consolidated' | string>('consolidated');

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">Reports & Analytics</h1>
            <p className="text-muted-foreground mt-1">Comprehensive financial reporting and business insights</p>
          </div>

          {/* Company View Toggle */}
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <ToggleGroup
              type="single"
              value={companyView}
              onValueChange={(v) => { if (v) setCompanyView(v); }}
              className="bg-muted rounded-lg p-1"
            >
              <ToggleGroupItem value="consolidated" className="text-xs px-3 py-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm">
                Consolidated
              </ToggleGroupItem>
              {companies.map(c => (
                <ToggleGroupItem key={c.id} value={c.id} className="text-xs px-3 py-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm">
                  {c.code}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="pnl" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">P&L Statement</span>
            </TabsTrigger>
            <TabsTrigger value="sales" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Sales</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Inventory</span>
            </TabsTrigger>
            <TabsTrigger value="expenses" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Expenses</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <ExecutiveDashboard companyView={companyView} />
          </TabsContent>

          <TabsContent value="pnl" className="space-y-6">
            <ProfitLossStatement companyView={companyView} />
          </TabsContent>

          <TabsContent value="sales" className="space-y-6">
            <SalesReports companyView={companyView} />
          </TabsContent>

          <TabsContent value="inventory" className="space-y-6">
            <InventoryReports companyView={companyView} />
          </TabsContent>

          <TabsContent value="expenses" className="space-y-6">
            <ExpenseReports companyView={companyView} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
