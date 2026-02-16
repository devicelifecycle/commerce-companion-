import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle, AlertCircle, CheckCircle, Package,
  ChevronRight, Bell
} from 'lucide-react';
import { format, differenceInDays, startOfMonth } from 'date-fns';
import { Link } from 'react-router-dom';

interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  category: 'tax' | 'inventory' | 'payment' | 'margin' | 'other';
  title: string;
  message: string;
  link?: string;
  timestamp: Date;
}

export function AlertsPanel() {
  const { selectedCompany } = useCompany();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
  }, [selectedCompany]);

  const fetchAlerts = async () => {
    setLoading(true);
    const newAlerts: Alert[] = [];

    try {
      const currentMonth = new Date().getMonth();
      const taxDueMonths = [0, 3, 6, 9];
      const nextTaxMonth = taxDueMonths.find(m => m > currentMonth) || 0;
      const taxDueDate = new Date(new Date().getFullYear() + (nextTaxMonth === 0 && currentMonth >= 9 ? 1 : 0), nextTaxMonth, 30);
      const daysUntilTax = differenceInDays(taxDueDate, new Date());
      
      if (daysUntilTax <= 30 && daysUntilTax > 0) {
        newAlerts.push({ id: 'tax-due', type: daysUntilTax <= 7 ? 'critical' : 'warning', category: 'tax', title: 'GST/HST Filing Due', message: `Due in ${daysUntilTax}d (${format(taxDueDate, 'MMM d')})`, link: '/taxes', timestamp: new Date() });
      }

      let inventoryQuery = supabase.from('devices').select('id, created_at').eq('status', 'in_stock');
      if (selectedCompany) inventoryQuery = inventoryQuery.eq('company_id', selectedCompany.id);
      const { data: devices } = await inventoryQuery;
      
      const slowMoving = devices?.filter(d => differenceInDays(new Date(), new Date(d.created_at)) >= 90) || [];
      if (slowMoving.length > 0) {
        newAlerts.push({ id: 'slow-inventory', type: slowMoving.length >= 10 ? 'critical' : 'warning', category: 'inventory', title: 'Slow Inventory', message: `${slowMoving.length} items 90+ days`, link: '/inventory', timestamp: new Date() });
      }

      let apQuery = supabase.from('accounts_payable').select('id, vendor_name, balance_due, due_date').eq('status', 'unpaid').gt('balance_due', 0);
      if (selectedCompany) apQuery = apQuery.eq('company_id', selectedCompany.id);
      const { data: pendingAP } = await apQuery;
      
      const overdueAP = pendingAP?.filter(ap => new Date(ap.due_date) < new Date()) || [];
      if (overdueAP.length > 0) {
        const total = overdueAP.reduce((sum, ap) => sum + Number(ap.balance_due || 0), 0);
        newAlerts.push({ id: 'overdue-payments', type: 'critical', category: 'payment', title: 'Overdue AP', message: `${overdueAP.length} totaling $${total.toLocaleString()}`, link: '/accounting/ap', timestamp: new Date() });
      }

      const upcomingAP = pendingAP?.filter(ap => { const d = new Date(ap.due_date); return d >= new Date() && differenceInDays(d, new Date()) <= 7; }) || [];
      if (upcomingAP.length > 0) {
        newAlerts.push({ id: 'upcoming-payments', type: 'warning', category: 'payment', title: 'AP Due Soon', message: `${upcomingAP.length} within 7 days`, link: '/accounting/ap', timestamp: new Date() });
      }

      const mtdStart = startOfMonth(new Date());
      let salesQuery = supabase.from('sales').select('sale_price, profit').gte('sale_date', mtdStart.toISOString());
      if (selectedCompany) salesQuery = salesQuery.eq('company_id', selectedCompany.id);
      const { data: mtdSales } = await salesQuery;
      
      const mtdRevenue = mtdSales?.reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;
      const mtdProfit = mtdSales?.reduce((sum, s) => sum + Number(s.profit || 0), 0) || 0;
      const mtdMargin = mtdRevenue > 0 ? (mtdProfit / mtdRevenue) * 100 : 0;

      if (mtdMargin < 15 && mtdRevenue > 1000) {
        newAlerts.push({ id: 'low-margin', type: 'warning', category: 'margin', title: 'Low Margin', message: `MTD ${mtdMargin.toFixed(1)}% (target 20%+)`, link: '/reports', timestamp: new Date() });
      }

      const inStockCount = devices?.length || 0;
      if (inStockCount < 10 && inStockCount > 0) {
        newAlerts.push({ id: 'low-inventory', type: 'warning', category: 'inventory', title: 'Low Stock', message: `Only ${inStockCount} in stock`, link: '/inventory', timestamp: new Date() });
      }

      if (mtdMargin >= 25 && mtdRevenue > 5000) {
        newAlerts.push({ id: 'good-margin', type: 'info', category: 'margin', title: 'Strong Margin', message: `${mtdMargin.toFixed(1)}% this month`, link: '/reports', timestamp: new Date() });
      }

      setAlerts(newAlerts.sort((a, b) => {
        const priority = { critical: 0, warning: 1, info: 2 };
        return priority[a.type] - priority[b.type];
      }));
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
      case 'critical': return <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;
      case 'warning': return <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />;
      case 'info': return <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" />;
    }
  };

  const criticalCount = alerts.filter(a => a.type === 'critical').length;

  if (loading) {
    return <div className="bg-card border border-border/60 rounded-lg h-full"><div className="p-3 animate-pulse"><div className="h-4 bg-muted rounded w-24 mb-3" /><div className="space-y-2"><div className="h-8 bg-muted rounded" /><div className="h-8 bg-muted rounded" /></div></div></div>;
  }

  return (
    <div className="bg-card border border-border/60 rounded-lg h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <div className="flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alerts</span>
        </div>
        {criticalCount > 0 && (
          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">{criticalCount}</Badge>
        )}
      </div>
      
      {alerts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-4">
          <div className="text-center">
            <CheckCircle className="h-6 w-6 text-success mx-auto mb-1" />
            <p className="text-xs font-medium text-success">All Clear</p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1 max-h-[220px]">
          <div className="divide-y divide-border/30">
            {alerts.map((alert) => (
              <div key={alert.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors">
                {getAlertIcon(alert.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-tight">{alert.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{alert.message}</p>
                </div>
                {alert.link && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" asChild>
                    <Link to={alert.link}><ChevronRight className="h-3 w-3" /></Link>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
