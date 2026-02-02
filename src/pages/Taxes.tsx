import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TaxDashboard } from '@/components/taxes/TaxDashboard';
import { TaxCollectedReport } from '@/components/taxes/TaxCollectedReport';
import { InputTaxCredits } from '@/components/taxes/InputTaxCredits';
import { TaxFilingReport } from '@/components/taxes/TaxFilingReport';
import { 
  LayoutDashboard, Receipt, Calculator, FileText
} from 'lucide-react';

export default function Taxes() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold gradient-text">Tax Center</h1>
          <p className="text-muted-foreground mt-1">Canadian tax compliance and CRA filing</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="collected" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:inline">Tax Collected</span>
            </TabsTrigger>
            <TabsTrigger value="itc" className="flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              <span className="hidden sm:inline">ITCs</span>
            </TabsTrigger>
            <TabsTrigger value="filing" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Filing</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <TaxDashboard />
          </TabsContent>

          <TabsContent value="collected" className="space-y-6">
            <TaxCollectedReport />
          </TabsContent>

          <TabsContent value="itc" className="space-y-6">
            <InputTaxCredits />
          </TabsContent>

          <TabsContent value="filing" className="space-y-6">
            <TaxFilingReport />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
