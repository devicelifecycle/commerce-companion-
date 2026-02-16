import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import { 
  Percent, ArrowDownRight, ArrowUpRight, RefreshCw, BarChart3
} from 'lucide-react';
import { startOfMonth, subMonths, format, differenceInDays } from 'date-fns';

export function ProfitabilityKPIs() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    grossMargin: 0,
    netMargin: 0,
    inventoryTurnover: 0,
    outstandingAP: 0,
    outstandingAR: 0,
    avgDaysToSell: 0,
  });

  useEffect(() => {
    fetchMetrics();
  }, [selectedCompany]);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const monthStart = startOfMonth(new Date());
      const companyFilter = selectedCompany?.id;

      // MTD Sales for margin calculations
      let salesQuery = supabase
        .from('sales')
        .select('sale_price, profit, marketplace_fees, shipping_cost, tax_amount, device_id')
        .gte('sale_date', monthStart.toISOString());
      if (companyFilter) salesQuery = salesQuery.eq('company_id', companyFilter);
      const { data: sales } = await salesQuery;

      const totalRevenue = sales?.reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;
      const totalProfit = sales?.reduce((sum, s) => sum + Number(s.profit || 0), 0) || 0;
      const totalFees = sales?.reduce((sum, s) => sum + Number(s.marketplace_fees || 0) + Number(s.shipping_cost || 0), 0) || 0;

      // Gross margin = (revenue - COGS) / revenue
      // Net margin = profit / revenue (after fees, shipping, tax)
      const grossMargin = totalRevenue > 0 ? ((totalProfit + totalFees) / totalRevenue) * 100 : 0;
      const netMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

      // Outstanding AP
      let apQuery = supabase
        .from('accounts_payable')
        .select('balance_due')
        .eq('status', 'outstanding');
      if (companyFilter) apQuery = apQuery.eq('company_id', companyFilter);
      const { data: apData } = await apQuery;
      const outstandingAP = apData?.reduce((sum, a) => sum + Number(a.balance_due || 0), 0) || 0;

      // Outstanding AR
      let arQuery = supabase
        .from('accounts_receivable')
        .select('balance_due')
        .eq('status', 'outstanding');
      if (companyFilter) arQuery = arQuery.eq('company_id', companyFilter);
      const { data: arData } = await arQuery;
      const outstandingAR = arData?.reduce((sum, a) => sum + Number(a.balance_due || 0), 0) || 0;

      // Inventory turnover: COGS (last 3 months) / Avg inventory value
      const threeMonthsAgo = subMonths(new Date(), 3);
      let cogsQuery = supabase
        .from('sales')
        .select('device_id, devices(cost_price)')
        .gte('sale_date', threeMonthsAgo.toISOString())
        .not('device_id', 'is', null);
      if (companyFilter) cogsQuery = cogsQuery.eq('company_id', companyFilter);
      const { data: cogsSales } = await cogsQuery;

      const totalCOGS = cogsSales?.reduce((sum, s) => {
        const device = s.devices as any;
        return sum + Number(device?.cost_price || 0);
      }, 0) || 0;

      let invQuery = supabase
        .from('devices')
        .select('cost_price')
        .eq('status', 'in_stock');
      if (companyFilter) invQuery = invQuery.eq('company_id', companyFilter);
      const { data: inventory } = await invQuery;
      const currentInvValue = inventory?.reduce((sum, d) => sum + Number(d.cost_price), 0) || 0;

      // Annualized turnover: (quarterly COGS * 4) / current inventory
      const inventoryTurnover = currentInvValue > 0 ? (totalCOGS * 4) / (currentInvValue * 3) : 0;

      // Avg days to sell: from sold devices
      let soldQuery = supabase
        .from('sales')
        .select('sale_date, devices(created_at)')
        .gte('sale_date', threeMonthsAgo.toISOString())
        .not('device_id', 'is', null)
        .limit(100);
      if (companyFilter) soldQuery = soldQuery.eq('company_id', companyFilter);
      const { data: soldDevices } = await soldQuery;

      let totalDaysToSell = 0;
      let countSold = 0;
      soldDevices?.forEach(s => {
        const device = s.devices as any;
        if (device?.created_at) {
          const days = differenceInDays(new Date(s.sale_date), new Date(device.created_at));
          if (days >= 0) {
            totalDaysToSell += days;
            countSold++;
          }
        }
      });

      setMetrics({
        grossMargin: Math.round(grossMargin * 10) / 10,
        netMargin: Math.round(netMargin * 10) / 10,
        inventoryTurnover: Math.round(inventoryTurnover * 10) / 10,
        outstandingAP,
        outstandingAR,
        avgDaysToSell: countSold > 0 ? Math.round(totalDaysToSell / countSold) : 0,
      });
    } catch (error) {
      console.error('Error fetching profitability KPIs:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(value);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse"><CardContent className="h-24" /></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center gap-2 mb-2">
            <Percent className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Gross Margin</span>
          </div>
          <p className={`text-2xl font-bold ${metrics.grossMargin >= 20 ? 'text-success' : 'text-warning'}`}>
            {metrics.grossMargin}%
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">MTD</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center gap-2 mb-2">
            <Percent className="h-4 w-4 text-secondary" />
            <span className="text-xs text-muted-foreground font-medium">Net Margin</span>
          </div>
          <p className={`text-2xl font-bold ${metrics.netMargin >= 10 ? 'text-success' : metrics.netMargin >= 0 ? 'text-warning' : 'text-destructive'}`}>
            {metrics.netMargin}%
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">MTD after fees</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw className="h-4 w-4 text-info" />
            <span className="text-xs text-muted-foreground font-medium">Inv. Turnover</span>
          </div>
          <p className="text-2xl font-bold">{metrics.inventoryTurnover}x</p>
          <p className="text-[10px] text-muted-foreground mt-1">Annualized</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground font-medium">Avg. Days to Sell</span>
          </div>
          <p className={`text-2xl font-bold ${metrics.avgDaysToSell <= 30 ? 'text-success' : metrics.avgDaysToSell <= 60 ? 'text-warning' : 'text-destructive'}`}>
            {metrics.avgDaysToSell}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Last 90 days</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpRight className="h-4 w-4 text-success" />
            <span className="text-xs text-muted-foreground font-medium">Outstanding AR</span>
          </div>
          <p className="text-2xl font-bold text-success">{formatCurrency(metrics.outstandingAR)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Owed to you</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownRight className="h-4 w-4 text-destructive" />
            <span className="text-xs text-muted-foreground font-medium">Outstanding AP</span>
          </div>
          <p className="text-2xl font-bold text-destructive">{formatCurrency(metrics.outstandingAP)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">You owe</p>
        </CardContent>
      </Card>
    </div>
  );
}
