import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle, AlertCircle, CheckCircle, Clock, Package, Receipt,
  TrendingDown, Calendar, ChevronRight, Bell
} from 'lucide-react';
import { format, addDays, differenceInDays, startOfMonth } from 'date-fns';
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
      // 1. Check for tax payment due dates (assuming quarterly filing)
      const currentMonth = new Date().getMonth();
      const taxDueMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct
      const nextTaxMonth = taxDueMonths.find(m => m > currentMonth) || 0;
      const taxDueDate = new Date(new Date().getFullYear() + (nextTaxMonth === 0 && currentMonth >= 9 ? 1 : 0), nextTaxMonth, 30);
      const daysUntilTax = differenceInDays(taxDueDate, new Date());
      
      if (daysUntilTax <= 30 && daysUntilTax > 0) {
        newAlerts.push({
          id: 'tax-due',
          type: daysUntilTax <= 7 ? 'critical' : 'warning',
          category: 'tax',
          title: 'GST/HST Filing Due',
          message: `Tax payment due in ${daysUntilTax} days (${format(taxDueDate, 'MMM d, yyyy')})`,
          link: '/taxes',
          timestamp: new Date(),
        });
      }

      // 2. Check for slow-moving inventory (90+ days)
      let inventoryQuery = supabase
        .from('devices')
        .select('id, brand, model, created_at')
        .eq('status', 'in_stock');
      
      if (selectedCompany) {
        inventoryQuery = inventoryQuery.eq('company_id', selectedCompany.id);
      }

      const { data: devices } = await inventoryQuery;
      const slowMoving = devices?.filter(d => 
        differenceInDays(new Date(), new Date(d.created_at)) >= 90
      ) || [];

      if (slowMoving.length > 0) {
        newAlerts.push({
          id: 'slow-inventory',
          type: slowMoving.length >= 10 ? 'critical' : 'warning',
          category: 'inventory',
          title: 'Slow-Moving Inventory',
          message: `${slowMoving.length} device${slowMoving.length > 1 ? 's' : ''} in stock for 90+ days`,
          link: '/inventory',
          timestamp: new Date(),
        });
      }

      // 3. Check for pending supplier payments (AP)
      let apQuery = supabase
        .from('accounts_payable')
        .select('id, vendor_name, balance_due, due_date')
        .eq('status', 'unpaid')
        .gt('balance_due', 0);

      if (selectedCompany) {
        apQuery = apQuery.eq('company_id', selectedCompany.id);
      }

      const { data: pendingAP } = await apQuery;
      const overdueAP = pendingAP?.filter(ap => new Date(ap.due_date) < new Date()) || [];
      const upcomingAP = pendingAP?.filter(ap => {
        const dueDate = new Date(ap.due_date);
        return dueDate >= new Date() && differenceInDays(dueDate, new Date()) <= 7;
      }) || [];

      if (overdueAP.length > 0) {
        const totalOverdue = overdueAP.reduce((sum, ap) => sum + Number(ap.balance_due || 0), 0);
        newAlerts.push({
          id: 'overdue-payments',
          type: 'critical',
          category: 'payment',
          title: 'Overdue Payments',
          message: `${overdueAP.length} overdue payment${overdueAP.length > 1 ? 's' : ''} totaling $${totalOverdue.toLocaleString()}`,
          link: '/accounting',
          timestamp: new Date(),
        });
      }

      if (upcomingAP.length > 0) {
        const totalUpcoming = upcomingAP.reduce((sum, ap) => sum + Number(ap.balance_due || 0), 0);
        newAlerts.push({
          id: 'upcoming-payments',
          type: 'warning',
          category: 'payment',
          title: 'Payments Due Soon',
          message: `${upcomingAP.length} payment${upcomingAP.length > 1 ? 's' : ''} due within 7 days ($${totalUpcoming.toLocaleString()})`,
          link: '/accounting',
          timestamp: new Date(),
        });
      }

      // 4. Check profit margin decline
      const mtdStart = startOfMonth(new Date());
      let salesQuery = supabase
        .from('sales')
        .select('sale_price, profit')
        .gte('sale_date', mtdStart.toISOString());

      if (selectedCompany) {
        salesQuery = salesQuery.eq('company_id', selectedCompany.id);
      }

      const { data: mtdSales } = await salesQuery;
      const mtdRevenue = mtdSales?.reduce((sum, s) => sum + Number(s.sale_price), 0) || 0;
      const mtdProfit = mtdSales?.reduce((sum, s) => sum + Number(s.profit || 0), 0) || 0;
      const mtdMargin = mtdRevenue > 0 ? (mtdProfit / mtdRevenue) * 100 : 0;

      if (mtdMargin < 15 && mtdRevenue > 1000) {
        newAlerts.push({
          id: 'low-margin',
          type: 'warning',
          category: 'margin',
          title: 'Low Profit Margin',
          message: `Month-to-date margin is ${mtdMargin.toFixed(1)}% (target: 20%+)`,
          link: '/reports',
          timestamp: new Date(),
        });
      }

      // 5. Check low inventory
      const inStockCount = devices?.length || 0;
      if (inStockCount < 10 && inStockCount > 0) {
        newAlerts.push({
          id: 'low-inventory',
          type: 'warning',
          category: 'inventory',
          title: 'Low Inventory',
          message: `Only ${inStockCount} device${inStockCount > 1 ? 's' : ''} in stock`,
          link: '/inventory',
          timestamp: new Date(),
        });
      }

      // Positive alerts
      if (mtdMargin >= 25 && mtdRevenue > 5000) {
        newAlerts.push({
          id: 'good-margin',
          type: 'info',
          category: 'margin',
          title: 'Strong Performance',
          message: `Profit margin at ${mtdMargin.toFixed(1)}% this month`,
          link: '/reports',
          timestamp: new Date(),
        });
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
      case 'critical': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'info': return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    }
  };

  const getAlertBadge = (type: Alert['type']) => {
    switch (type) {
      case 'critical': return <Badge variant="destructive" className="text-xs">Action Required</Badge>;
      case 'warning': return <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/50">Warning</Badge>;
      case 'info': return <Badge variant="outline" className="text-xs text-emerald-500 border-emerald-500/50">Info</Badge>;
    }
  };

  const criticalCount = alerts.filter(a => a.type === 'critical').length;
  const warningCount = alerts.filter(a => a.type === 'warning').length;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-12 bg-muted rounded" />
            <div className="h-12 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Alerts & Notifications
          </div>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive">{criticalCount} Critical</Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="outline" className="text-amber-500 border-amber-500/50">
                {warningCount} Warning
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle className="h-10 w-10 text-emerald-500 mb-2" />
            <p className="font-medium text-emerald-500">All Clear!</p>
            <p className="text-sm text-muted-foreground">No alerts or issues to report</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    alert.type === 'critical' ? 'bg-red-500/5 border-red-500/20' :
                    alert.type === 'warning' ? 'bg-amber-500/5 border-amber-500/20' :
                    'bg-emerald-500/5 border-emerald-500/20'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getAlertIcon(alert.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{alert.title}</span>
                        {getAlertBadge(alert.type)}
                      </div>
                      <p className="text-sm text-muted-foreground">{alert.message}</p>
                    </div>
                    {alert.link && (
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={alert.link}>
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
