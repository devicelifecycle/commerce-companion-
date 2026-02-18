import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExecutiveDashboard } from '@/components/reports/ExecutiveDashboard';
import { MarketplaceAccounting } from '@/components/reports/MarketplaceAccounting';
import { MarketplaceReconciliation } from '@/components/reports/MarketplaceReconciliation';
import { MarketplaceFeeAnalytics } from '@/components/reports/MarketplaceFeeAnalytics';
import { PayoutReconciliation } from '@/components/reports/PayoutReconciliation';
import { useCompany } from '@/contexts/CompanyContext';
import { 
  LayoutDashboard, Store, CheckSquare, Building2, Receipt, Banknote
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
              <span className="hidden sm:inline">Executive</span>
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="flex items-center gap-2">
              <Store className="h-4 w-4" />
              <span className="hidden sm:inline">Marketplace</span>
            </TabsTrigger>
            <TabsTrigger value="fees" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:inline">Fees</span>
            </TabsTrigger>
            <TabsTrigger value="reconciliation" className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Reconciliation</span>
            </TabsTrigger>
            <TabsTrigger value="payouts" className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              <span className="hidden sm:inline">Payouts</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <ExecutiveDashboard companyView={companyView} />
          </TabsContent>

          <TabsContent value="marketplace" className="space-y-6">
            <MarketplaceAccounting companyView={companyView} />
          </TabsContent>

          <TabsContent value="fees" className="space-y-6">
            <MarketplaceFeeAnalytics companyView={companyView} />
          </TabsContent>

          <TabsContent value="reconciliation" className="space-y-6">
            <MarketplaceReconciliation companyView={companyView} />
          </TabsContent>

          <TabsContent value="payouts" className="space-y-6">
            <PayoutReconciliation companyView={companyView} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
