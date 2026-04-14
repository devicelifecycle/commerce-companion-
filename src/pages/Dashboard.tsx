import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SystemAlertsBanner } from '@/components/alerts/SystemAlertsBanner';
import { useLedgerMetrics } from '@/hooks/useLedgerMetrics';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Percent, ShoppingCart, Package,
  Wallet, Activity, ArrowUpRight, ArrowDownRight, RefreshCw, Building2,
  BarChart3, Store, Clock, Target, Receipt, Wrench, Info, ShieldCheck
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

type DateRange = 'mtd' | 'qtd' | 'ytd' | '1' | '3' | '6' | '12' | '24';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedCompany, companies, isSuperAdmin, assignments } = useCompany();
  const isAdmin = isSuperAdmin || assignments.some(a => a.role === 'admin');
  const [dateRange, setDateRange] = useState<DateRange>('6');
  const [companyView, setCompanyView] = useState<'consolidated' | string>('consolidated');

  const getCompanyFilter = () => {
    if (companyView !== 'consolidated') return companyView;
    return selectedCompany?.id || null;
  };

  const { metrics, loading, refetch } = useLedgerMetrics(dateRange, getCompanyFilter());

  const fmt = (v: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(v);
  const fmtPct = (v: number) => `${v.toFixed(1)}%`;

  const pctChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  const ChangeIndicator = ({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) => {
    const change = pctChange(current, previous);
    if (previous === 0 && current === 0) return null;
    const isPositive = invert ? change < 0 : change > 0;
    return (
      <span className={`text-[10px] font-medium flex items-center gap-0.5 ${isPositive ? 'text-success' : 'text-destructive'}`}>
        {change > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {Math.abs(change).toFixed(1)}%
      </span>
    );
  };

  if (loading || !metrics) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-lg" />)}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[...Array(8)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-lg" />)}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const m = metrics;

  return (
    <DashboardLayout>
      <div className="space-y-3 animate-fade-in">
        <SystemAlertsBanner />

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-display font-bold gradient-text">Dashboard</h1>
            <p className="text-[11px] text-muted-foreground">
              Ledger-sourced metrics · {format(new Date(), 'EEEE, MMM d, yyyy')}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {companies.length > 1 && (
              <ToggleGroup type="single" value={companyView} onValueChange={(v) => { if (v) setCompanyView(v); }} className="bg-muted rounded-lg p-0.5">
                <ToggleGroupItem value="consolidated" className="text-[10px] px-2 py-1 h-7 data-[state=on]:bg-primary/15 data-[state=on]:text-primary data-[state=on]:shadow-sm">All</ToggleGroupItem>
                {companies.map(c => (
                  <ToggleGroupItem key={c.id} value={c.id} className="text-[10px] px-2 py-1 h-7 data-[state=on]:bg-primary/15 data-[state=on]:text-primary data-[state=on]:shadow-sm">{c.code}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="w-[110px] h-7 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mtd">Month to Date</SelectItem>
                <SelectItem value="qtd">Quarter to Date</SelectItem>
                <SelectItem value="ytd">Year to Date</SelectItem>
                <SelectItem value="1">30 days</SelectItem>
                <SelectItem value="3">3 months</SelectItem>
                <SelectItem value="6">6 months</SelectItem>
                <SelectItem value="12">12 months</SelectItem>
                <SelectItem value="24">24 months</SelectItem>
              </SelectContent>
            </Select>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refetch}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Refresh data</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-success/10 border border-success/30 cursor-help">
                    <ShieldCheck className="h-3 w-3 text-success" />
                    <span className="text-[10px] font-medium text-success">Ledger</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px]">
                  <p className="text-xs">All financial metrics are sourced from the general ledger (journal entries), matching P&L and Balance Sheet exactly.</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Updated {formatDistanceToNow(m.lastUpdated, { addSuffix: true })}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Row 1: Core profitability ratios with period comparison */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { icon: DollarSign, label: 'Revenue', value: fmt(m.revenue), prev: m.prevRevenue, color: 'text-primary', href: '/financials' },
            { icon: Percent, label: 'Gross Margin', value: fmtPct(m.grossMargin), sub: fmt(m.grossProfit), color: m.grossMargin >= 20 ? 'text-success' : 'text-warning', href: '/financials' },
            { icon: Percent, label: 'Net Margin', value: fmtPct(m.netMargin), sub: fmt(m.netProfit), color: m.netMargin >= 10 ? 'text-success' : m.netMargin >= 0 ? 'text-warning' : 'text-destructive', href: '/financials' },
            { icon: Target, label: 'ROI on Inv', value: fmtPct(m.returnOnInventory), sub: fmt(m.inventoryValue), color: m.returnOnInventory > 0 ? 'text-success' : 'text-destructive', href: '/inventory' },
            { icon: TrendingDown, label: 'Exp/Rev Ratio', value: fmtPct(m.expenseToRevenueRatio), sub: fmt(m.operatingExpenses), color: m.expenseToRevenueRatio < 15 ? 'text-success' : 'text-warning', href: '/expenses', invert: true },
            { icon: DollarSign, label: 'Profit/Unit', value: fmt(m.avgProfitPerUnit), sub: `${m.totalOrders} sold`, color: m.avgProfitPerUnit > 0 ? 'text-success' : 'text-destructive', href: '/orders' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-card border border-border/60 rounded-lg p-2.5 hover:border-primary/40 transition-colors cursor-pointer" onClick={() => navigate(kpi.href)}>
              <div className="flex items-center gap-1.5 mb-1">
                <kpi.icon className={`h-3 w-3 ${kpi.color}`} />
                <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider truncate">{kpi.label}</span>
              </div>
              <p className={`text-lg font-bold font-display leading-tight ${kpi.color}`}>{kpi.value}</p>
              <div className="flex items-center gap-1 mt-0.5">
                {kpi.sub && <span className="text-[10px] text-muted-foreground truncate">{kpi.sub}</span>}
                {kpi.prev !== undefined && <ChangeIndicator current={kpi.label === 'Revenue' ? m.revenue : 0} previous={kpi.prev} invert={kpi.invert} />}
              </div>
            </div>
          ))}
        </div>

        {/* Row 2: Financial snapshot */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { label: 'Revenue', value: fmt(m.revenue), icon: TrendingUp, ic: 'text-primary', href: '/financials' },
            { label: 'COGS', value: fmt(m.cogs), icon: Package, ic: 'text-secondary', href: '/financials' },
            { label: 'Gross Profit', value: fmt(m.grossProfit), icon: DollarSign, ic: 'text-success', href: '/financials' },
            { label: 'OpEx', value: fmt(m.operatingExpenses), icon: Wallet, ic: 'text-warning', href: '/expenses' },
            { label: 'Net Profit', value: fmt(m.netProfit), icon: DollarSign, ic: m.netProfit >= 0 ? 'text-success' : 'text-destructive', href: '/financials' },
            { label: 'Cash', value: fmt(m.cashPosition), icon: Wallet, ic: 'text-primary', href: '/financials' },
            { label: 'AR Owed', value: fmt(m.outstandingAR), icon: ArrowUpRight, ic: 'text-success', href: '/financials' },
            { label: 'AP Owed', value: fmt(m.outstandingAP), icon: ArrowDownRight, ic: 'text-destructive', href: '/financials' },
          ].map(tile => (
            <div key={tile.label} className="bg-card border border-border/60 rounded-lg p-2.5 cursor-pointer hover:border-primary/40 transition-colors" onClick={() => navigate(tile.href)}>
              <div className="flex items-center gap-1 mb-1">
                <tile.icon className={`h-3 w-3 ${tile.ic}`} />
                <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">{tile.label}</span>
              </div>
              <p className="text-sm font-bold font-display tabular-nums">{tile.value}</p>
            </div>
          ))}
        </div>

        {/* Row 3: Operational KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {[
            { icon: RefreshCw, label: 'Inv Turnover', value: `${m.inventoryTurnover.toFixed(1)}x`, sub: `${m.inventoryCount} items · ${fmt(m.inventoryValue)}`, color: '', ic: 'text-info' },
            { icon: Clock, label: 'Avg Days to Sell', value: `${m.avgDaysToSell}d`, sub: `${m.totalOrders} sold in period`, color: m.avgDaysToSell <= 30 ? 'text-success' : m.avgDaysToSell <= 60 ? 'text-warning' : 'text-destructive', ic: 'text-info' },
            { icon: Wrench, label: 'Refurb Queue', value: `${m.refurbQueueSize}`, sub: `${m.refurbCompletedThisMonth}/mo · ${m.refurbAvgDays}d avg`, color: m.refurbQueueSize > 10 ? 'text-warning' : '', ic: 'text-warning' },
            { icon: Package, label: 'FBA vs Local', value: `${m.fbaCount} / ${m.localCount}`, sub: `${m.inventoryCount > 0 ? ((m.fbaCount / m.inventoryCount) * 100).toFixed(0) : 0}% FBA`, color: '', ic: 'text-primary' },
            { icon: ShoppingCart, label: 'Avg Order Value', value: fmt(m.avgOrderValue), sub: `${m.totalOrders} orders`, color: '', ic: 'text-secondary' },
            { icon: Receipt, label: 'Mktplace Fees', value: fmt(m.marketplaceFees), sub: m.revenue > 0 ? `${((m.marketplaceFees / m.revenue) * 100).toFixed(1)}% of rev` : '-', color: m.revenue > 0 && (m.marketplaceFees / m.revenue) > 0.15 ? 'text-destructive' : '', ic: 'text-destructive' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-card border border-border/60 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <kpi.icon className={`h-3 w-3 ${kpi.ic}`} />
                <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider truncate">{kpi.label}</span>
              </div>
              <p className={`text-lg font-bold font-display leading-tight ${kpi.color}`}>{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Row 4: Period comparison */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-card border border-border/60 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Revenue</p>
            <p className="text-xl font-bold font-display">{fmt(m.revenue)}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-muted-foreground">vs prior period</span>
              <ChangeIndicator current={m.revenue} previous={m.prevRevenue} />
            </div>
          </div>
          <div className="bg-card border border-border/60 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Gross Profit</p>
            <p className="text-xl font-bold font-display">{fmt(m.grossProfit)}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-muted-foreground">vs prior period</span>
              <ChangeIndicator current={m.grossProfit} previous={m.prevGrossProfit} />
            </div>
          </div>
          <div className="bg-card border border-border/60 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Net Profit</p>
            <p className={`text-xl font-bold font-display ${m.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(m.netProfit)}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-muted-foreground">vs prior period</span>
              <ChangeIndicator current={m.netProfit} previous={m.prevNetProfit} />
            </div>
          </div>
        </div>

        {/* Row 5: Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Revenue & Profit Trend */}
          <div className="lg:col-span-2 bg-card border border-border/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revenue, COGS & Net Profit Trend</span>
            </div>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={m.monthlyTrend} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cProf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <RTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }} formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={1.5} fillOpacity={1} fill="url(#cRev)" name="Revenue" />
                  <Area type="monotone" dataKey="cogs" stroke="hsl(var(--secondary))" strokeWidth={1} fillOpacity={0} name="COGS" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="netProfit" stroke="hsl(var(--success))" strokeWidth={1.5} fillOpacity={1} fill="url(#cProf)" name="Net Profit" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Marketplace breakdown */}
          <div className="bg-card border border-border/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Store className="h-3.5 w-3.5 text-info" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">By Channel</span>
            </div>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={m.marketplaceBreakdown} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={4} dataKey="revenue">
                    {m.marketplaceBreakdown.map(e => <Cell key={e.name} fill={e.color} />)}
                  </Pie>
                  <RTooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: '11px', backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1 mt-1">
              {m.marketplaceBreakdown.map(mp => (
                <div key={mp.name} className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: mp.color }} />
                    <span>{mp.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{mp.orders} orders</span>
                    <span className="font-medium">{fmt(mp.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 6: Margin trend bar chart */}
        <div className="bg-card border border-border/60 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Percent className="h-3.5 w-3.5 text-warning" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gross Margin % by Month</span>
          </div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.monthlyTrend} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" domain={[0, 'auto']} />
                <RTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }} formatter={(v: number) => `${v.toFixed(1)}%`} />
                <Bar dataKey="margin" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Gross Margin %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Row 7: Fees & Commissions */}
        {m.marketplaceBreakdown.length > 0 && (
          <div className="bg-card border border-border/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Receipt className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fees & Commissions by Channel</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-3">
              {(() => {
                const totalFees = m.marketplaceBreakdown.reduce((s, mp) => s + mp.fees, 0);
                const totalShipping = m.marketplaceBreakdown.reduce((s, mp) => s + mp.shipping, 0);
                const totalRev = m.marketplaceBreakdown.reduce((s, mp) => s + mp.revenue, 0);
                const totalNetRev = m.marketplaceBreakdown.reduce((s, mp) => s + mp.netRevenue, 0);
                const totalOrders = m.marketplaceBreakdown.reduce((s, mp) => s + mp.orders, 0);
                return [
                  { label: 'Total Fees', value: fmt(totalFees), color: 'text-destructive' },
                  { label: 'Total Shipping', value: fmt(totalShipping), color: 'text-warning' },
                  { label: 'Avg Fee Rate', value: fmtPct(totalRev > 0 ? (totalFees / totalRev) * 100 : 0), color: 'text-destructive' },
                  { label: 'Revenue After Fees', value: fmt(totalNetRev), color: 'text-success' },
                  { label: 'Avg Fee/Order', value: fmt(totalOrders > 0 ? totalFees / totalOrders : 0), color: 'text-muted-foreground' },
                ].map(t => (
                  <div key={t.label} className="p-2 rounded-md bg-muted/30 border border-border/30">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">{t.label}</p>
                    <p className={`text-sm font-bold font-display tabular-nums ${t.color}`}>{t.value}</p>
                  </div>
                ));
              })()}
            </div>
            <div className="space-y-1.5">
              {m.marketplaceBreakdown.map(mp => {
                const maxFees = Math.max(...m.marketplaceBreakdown.map(x => x.fees));
                const barWidth = maxFees > 0 ? (mp.fees / maxFees) * 100 : 0;
                return (
                  <div key={mp.name} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: mp.color }} />
                        <span className="font-medium">{mp.name}</span>
                        <span className="text-muted-foreground">{mp.orders} orders</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-destructive font-medium tabular-nums">{fmt(mp.fees)}</span>
                        <Badge variant={mp.feeRate > 15 ? 'destructive' : 'secondary'} className="text-[9px] px-1 py-0 h-4">
                          {mp.feeRate.toFixed(1)}%
                        </Badge>
                        <span className="text-success text-[10px] tabular-nums">{fmt(mp.netRevenue)} net</span>
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-destructive/60 transition-all" style={{ width: `${barWidth}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Row 8: Top Products + Expenses + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Top products */}
          <div className="bg-card border border-border/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-3.5 w-3.5 text-success" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Products (Profit)</span>
            </div>
            {m.topProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No data</p>
            ) : (
              <div className="space-y-1.5">
                {m.topProducts.map((p, i) => (
                  <div key={p.name} className="flex items-center justify-between text-[11px] py-1 border-b border-border/20 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-muted-foreground w-4">{i + 1}.</span>
                      <span className="font-medium truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-muted-foreground">{p.sold} sold</span>
                      <span className="text-success font-medium tabular-nums">{fmt(p.profit)}</span>
                      <span className="text-[10px] text-muted-foreground">{p.margin}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expense breakdown (ledger-sourced) */}
          <div className="bg-card border border-border/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-3.5 w-3.5 text-warning" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expenses (Ledger)</span>
            </div>
            {m.expenseBreakdown.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No expenses</p>
            ) : (
              <div className="space-y-1.5">
                {m.expenseBreakdown.slice(0, 10).map(e => {
                  const pct = m.operatingExpenses > 0 ? (e.value / m.operatingExpenses * 100) : 0;
                  return (
                    <div key={e.name} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="truncate">{e.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-medium tabular-nums">{fmt(e.value)}</span>
                          <span className="text-[10px] text-muted-foreground w-8 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: e.fill }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Activity feed */}
          <div className="bg-card border border-border/60 rounded-lg">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
              <Activity className="h-3.5 w-3.5 text-success" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</span>
            </div>
            {m.recentActivity.length === 0 ? (
              <p className="text-center py-6 text-xs text-muted-foreground">No recent activity</p>
            ) : (
              <ScrollArea className="h-[280px]">
                <div className="divide-y divide-border/30">
                  {m.recentActivity.map(a => (
                    <div key={a.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        {a.type === 'sale' ? <ShoppingCart className="h-3 w-3 text-success shrink-0" /> : <DollarSign className="h-3 w-3 text-warning shrink-0" />}
                        <span className="text-[11px] font-medium truncate">{a.description}</span>
                        {a.marketplace && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 shrink-0 capitalize">{a.marketplace}</Badge>
                        )}
                      </div>
                      <span className={`text-[11px] font-medium tabular-nums shrink-0 ml-2 ${a.type === 'sale' ? 'text-success' : 'text-warning'}`}>
                        {a.type === 'sale' ? '+' : '-'}{fmt(a.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        {/* Row 9: Orders by month bar chart */}
        <div className="bg-card border border-border/60 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="h-3.5 w-3.5 text-secondary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Orders by Month</span>
          </div>
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.monthlyTrend} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <RTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }} />
                <Bar dataKey="orders" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} name="Orders" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Footer: data integrity note */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground py-1">
          <Info className="h-3 w-3" />
          <span>Financial metrics sourced from general ledger (journal entries) — matches P&L and Balance Sheet. Operational metrics from device and sales records. Auto-refreshes on data changes.</span>
        </div>
      </div>
    </DashboardLayout>
  );
}
