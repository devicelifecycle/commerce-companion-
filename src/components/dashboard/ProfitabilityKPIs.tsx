import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Percent, ArrowDownRight, ArrowUpRight, RefreshCw, BarChart3
} from 'lucide-react';
import { startOfMonth, subMonths, differenceInDays } from 'date-fns';

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

      let salesQuery = supabase
        .from('sales')
        .select('sale_price, profit, marketplace_fees, shipping_cost, tax_amount, device_id')
        .gte('sale_date', monthStart.toISOString());
      if (companyFilter) salesQuery = salesQuery.eq('company_id', companyFilter);
      const { data: sales } = await salesQuery;

      const totalRevenue = sales?.reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;
      const totalProfit = sales?.reduce((sum, s) => sum + Number(s.profit || 0), 0) || 0;
      const totalFees = sales?.reduce((sum, s) => sum + Number(s.marketplace_fees || 0) + Number(s.shipping_cost || 0), 0) || 0;

      const grossMargin = totalRevenue > 0 ? ((totalProfit + totalFees) / totalRevenue) * 100 : 0;
      const netMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

      let apQuery = supabase.from('accounts_payable').select('balance_due').eq('status', 'outstanding');
      if (companyFilter) apQuery = apQuery.eq('company_id', companyFilter);
      const { data: apData } = await apQuery;
      const outstandingAP = apData?.reduce((sum, a) => sum + Number(a.balance_due || 0), 0) || 0;

      let arQuery = supabase.from('accounts_receivable').select('balance_due').eq('status', 'outstanding');
      if (companyFilter) arQuery = arQuery.eq('company_id', companyFilter);
      const { data: arData } = await arQuery;
      const outstandingAR = arData?.reduce((sum, a) => sum + Number(a.balance_due || 0), 0) || 0;

      const threeMonthsAgo = subMonths(new Date(), 3);
      let cogsQuery = supabase.from('sales').select('device_id, devices(cost_price)').gte('sale_date', threeMonthsAgo.toISOString()).not('device_id', 'is', null);
      if (companyFilter) cogsQuery = cogsQuery.eq('company_id', companyFilter);
      const { data: cogsSales } = await cogsQuery;

      const totalCOGS = cogsSales?.reduce((sum, s) => {
        const device = s.devices as any;
        return sum + Number(device?.cost_price || 0);
      }, 0) || 0;

      let invQuery = supabase.from('devices').select('cost_price').eq('status', 'in_stock');
      if (companyFilter) invQuery = invQuery.eq('company_id', companyFilter);
      const { data: inventory } = await invQuery;
      const currentInvValue = inventory?.reduce((sum, d) => sum + Number(d.cost_price), 0) || 0;
      const inventoryTurnover = currentInvValue > 0 ? (totalCOGS * 4) / (currentInvValue * 3) : 0;

      let soldQuery = supabase.from('sales').select('sale_date, devices(created_at)').gte('sale_date', threeMonthsAgo.toISOString()).not('device_id', 'is', null).limit(100);
      if (companyFilter) soldQuery = soldQuery.eq('company_id', companyFilter);
      const { data: soldDevices } = await soldQuery;

      let totalDaysToSell = 0;
      let countSold = 0;
      soldDevices?.forEach(s => {
        const device = s.devices as any;
        if (device?.created_at) {
          const days = differenceInDays(new Date(s.sale_date), new Date(device.created_at));
          if (days >= 0) { totalDaysToSell += days; countSold++; }
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
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-[72px] bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const kpis = [
    { icon: Percent, label: 'Gross Margin', value: `${metrics.grossMargin}%`, sub: 'MTD', color: metrics.grossMargin >= 20 ? 'text-success' : 'text-warning', iconColor: 'text-primary' },
    { icon: Percent, label: 'Net Margin', value: `${metrics.netMargin}%`, sub: 'After fees', color: metrics.netMargin >= 10 ? 'text-success' : metrics.netMargin >= 0 ? 'text-warning' : 'text-destructive', iconColor: 'text-secondary' },
    { icon: RefreshCw, label: 'Turnover', value: `${metrics.inventoryTurnover}x`, sub: 'Annualized', color: '', iconColor: 'text-info' },
    { icon: BarChart3, label: 'Avg Days', value: `${metrics.avgDaysToSell}`, sub: 'To sell', color: metrics.avgDaysToSell <= 30 ? 'text-success' : metrics.avgDaysToSell <= 60 ? 'text-warning' : 'text-destructive', iconColor: 'text-accent' },
    { icon: ArrowUpRight, label: 'AR Owed', value: formatCurrency(metrics.outstandingAR), sub: 'To collect', color: 'text-success', iconColor: 'text-success' },
    { icon: ArrowDownRight, label: 'AP Owed', value: formatCurrency(metrics.outstandingAP), sub: 'To pay', color: 'text-destructive', iconColor: 'text-destructive' },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="bg-card border border-border/60 rounded-lg p-3 hover:border-primary/40 transition-colors">
          <div className="flex items-center gap-1.5 mb-1.5">
            <kpi.icon className={`h-3 w-3 ${kpi.iconColor}`} />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider truncate">{kpi.label}</span>
          </div>
          <p className={`text-lg font-bold font-display leading-tight ${kpi.color}`}>{kpi.value}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>
        </div>
      ))}
    </div>
  );
}
