import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { useDataRefetch } from '@/hooks/useDataRefetch';
import {
  format, subMonths, startOfMonth, endOfMonth, startOfQuarter, startOfYear,
  endOfYear, endOfQuarter, differenceInDays
} from 'date-fns';
import { normalizeExpenseAccountCode } from '@/lib/accounting/expenseAccountCodes';
import { getChannelKey, getChannelLabel, getChannelColor } from '@/lib/marketplaceAccounts';

export interface LedgerMetrics {
  // P&L (ledger-sourced)
  revenue: number;
  revenueByMarketplace: Record<string, number>;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: number;
  operatingExpensesByCategory: Record<string, number>;
  marketplaceFees: number;
  netProfit: number;
  netMargin: number;
  otherIncome: number;
  // Balance sheet / operational
  cashPosition: number;
  inventoryValue: number;
  inventoryCount: number;
  outstandingAR: number;
  outstandingAP: number;
  // Operational
  totalOrders: number;
  avgOrderValue: number;
  avgProfitPerUnit: number;
  avgDaysToSell: number;
  inventoryTurnover: number;
  returnOnInventory: number;
  expenseToRevenueRatio: number;
  // Period comparisons
  prevRevenue: number;
  prevGrossProfit: number;
  prevNetProfit: number;
  prevTotalOrders: number;
  // Monthly trend
  monthlyTrend: Array<{
    month: string;
    monthKey: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    opex: number;
    netProfit: number;
    margin: number;
    orders: number;
  }>;
  // Marketplace data
  marketplaceBreakdown: Array<{
    name: string;
    revenue: number;
    orders: number;
    fees: number;
    shipping: number;
    netRevenue: number;
    feeRate: number;
    color: string;
  }>;
  // Top products
  topProducts: Array<{
    name: string;
    sold: number;
    revenue: number;
    profit: number;
    margin: string;
  }>;
  // Expense breakdown
  expenseBreakdown: Array<{
    name: string;
    value: number;
    fill: string;
  }>;
  // Recent activity
  recentActivity: Array<{
    id: string;
    type: 'sale' | 'expense';
    description: string;
    amount: number;
    timestamp: Date;
    marketplace?: string;
  }>;
  // Refurb
  refurbQueueSize: number;
  refurbCompletedThisMonth: number;
  refurbAvgDays: number;
  fbaCount: number;
  localCount: number;
  // Timestamp
  lastUpdated: Date;
}

const MARKETPLACE_COLORS: Record<string, string> = {
  amazon: '#FB923C', bestbuy: '#3B82F6', shopify: '#6EE7B7', temu: '#EC4899',
  invoices: '#A78BFA', other: '#94A3B8',
};
const EXPENSE_COLORS = [
  'hsl(var(--primary))', 'hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)',
  'hsl(280, 65%, 60%)', 'hsl(25, 95%, 53%)', 'hsl(340, 82%, 52%)',
  'hsl(190, 80%, 50%)', 'hsl(45, 90%, 50%)',
];

type DateRange = 'mtd' | 'qtd' | 'ytd' | '1' | '3' | '6' | '12' | '24';

function getDateBounds(range: DateRange, now: Date) {
  const months = parseInt(range);
  if (range === 'mtd') return { start: startOfMonth(now), end: now };
  if (range === 'qtd') return { start: startOfQuarter(now), end: now };
  if (range === 'ytd') return { start: startOfYear(now), end: now };
  return { start: startOfMonth(subMonths(now, months - 1)), end: now };
}

function getPrevDateBounds(range: DateRange, now: Date) {
  const months = parseInt(range);
  if (range === 'mtd') {
    const prevMonth = subMonths(now, 1);
    return { start: startOfMonth(prevMonth), end: endOfMonth(prevMonth) };
  }
  if (range === 'qtd') {
    const prevQ = subMonths(now, 3);
    return { start: startOfQuarter(prevQ), end: endOfQuarter(prevQ) };
  }
  if (range === 'ytd') {
    const prevY = subMonths(now, 12);
    return { start: startOfYear(prevY), end: endOfYear(prevY) };
  }
  return {
    start: startOfMonth(subMonths(now, months * 2 - 1)),
    end: endOfMonth(subMonths(now, months)),
  };
}

async function fetchLedgerForPeriod(
  startDate: Date, endDate: Date, companyId: string | null, companies: any[]
) {
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  let jeQuery = supabase
    .from('journal_entries')
    .select('id, company_id')
    .gte('entry_date', startStr)
    .lte('entry_date', endStr)
    .limit(5000);
  if (companyId) jeQuery = jeQuery.eq('company_id', companyId);
  const { data: journalEntries } = await jeQuery;
  const jeIds = journalEntries?.map(j => j.id) || [];

  let lines: Array<{
    debit_amount: number | null;
    credit_amount: number | null;
    chart_of_accounts: {
      account_code: string;
      account_name: string;
      account_type: string;
      account_subtype: string | null;
    } | null;
  }> = [];

  for (let i = 0; i < jeIds.length; i += 200) {
    const chunk = jeIds.slice(i, i + 200);
    const { data: chunkLines } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount, credit_amount, chart_of_accounts!inner(account_code, account_name, account_type, account_subtype)')
      .in('journal_entry_id', chunk);
    if (chunkLines) lines = lines.concat(chunkLines as any);
  }

  const revenueByMarketplace: Record<string, number> = {};
  let totalRevenue = 0;
  let totalCOGS = 0;
  let marketplaceFees = 0;
  let otherIncome = 0;
  const opexByCategory: Record<string, number> = {};

  for (const line of lines) {
    const acct = line.chart_of_accounts;
    if (!acct) continue;
    const debit = Number(line.debit_amount || 0);
    const credit = Number(line.credit_amount || 0);

    if (acct.account_type === 'revenue') {
      const amount = credit - debit;
      if (acct.account_subtype === 'Tax Revenue') continue;
      if (acct.account_subtype === 'Other Income') {
        otherIncome += amount;
        continue;
      }
      const name = acct.account_name.toLowerCase();
      let mp = 'other';
      if (name.includes('amazon')) mp = 'amazon';
      else if (name.includes('bestbuy') || name.includes('best buy')) mp = 'bestbuy';
      else if (name.includes('shopify')) mp = 'shopify';
      else if (name.includes('direct') || name.includes('invoice')) mp = 'invoices';
      else if (name.includes('temu')) mp = 'temu';
      revenueByMarketplace[mp] = (revenueByMarketplace[mp] || 0) + amount;
      totalRevenue += amount;
    } else if (acct.account_type === 'expense') {
      const amount = debit - credit;
      if (acct.account_subtype === 'COGS') {
        totalCOGS += amount;
      } else {
        const code = normalizeExpenseAccountCode(acct.account_code);
        let cat = 'other';
        if (code === '6000') { cat = 'marketplace_fees'; marketplaceFees += amount; }
        else if (code.startsWith('61')) cat = 'shipping';
        else if (code === '6200') cat = 'utilities';
        else if (code === '6300') cat = 'payroll';
        else if (code === '6400') cat = 'marketing';
        else if (code === '6500') cat = 'office';
        else if (code === '6600') cat = 'professional_services';
        else if (code === '6700') cat = 'insurance';
        else if (code === '6800') cat = 'other';
        else if (code === '6900') cat = 'software';
        else if (code === '7000') cat = 'utilities';
        else if (code === '7100') cat = 'other';
        opexByCategory[cat] = (opexByCategory[cat] || 0) + amount;
      }
    }
  }

  // Fallback for unbooked expenses
  let expQ = supabase
    .from('expenses')
    .select('id, amount, gst_hst_amount, pst_amount, category, company_id, is_shared, allocation_ves, allocation_tgw')
    .gte('expense_date', startStr)
    .lte('expense_date', endStr)
    .limit(5000);
  if (companyId) expQ = expQ.or(`company_id.eq.${companyId},is_shared.eq.true`);
  const { data: expenses } = await expQ;

  const expenseIds = expenses?.map(e => e.id) || [];
  const expensesWithJEs = new Set<string>();
  for (let i = 0; i < expenseIds.length; i += 200) {
    const chunk = expenseIds.slice(i, i + 200);
    const { data: existingJEs } = await supabase
      .from('journal_entries')
      .select('reference_id')
      .in('reference_id', chunk);
    existingJEs?.forEach(je => { if (je.reference_id) expensesWithJEs.add(je.reference_id); });
  }

  const vesCompany = companies.find((c: any) => c.code === 'VES');
  const getEffExp = (e: any) => {
    const total = (e.amount || 0) + (e.gst_hst_amount || 0) + (e.pst_amount || 0);
    if (!e.is_shared || !companyId) return total;
    return companyId === vesCompany?.id
      ? total * ((e.allocation_ves || 0) / 100)
      : total * ((e.allocation_tgw || 0) / 100);
  };

  expenses?.filter(e => !expensesWithJEs.has(e.id) && e.category !== 'inventory').forEach(e => {
    const cat = e.category;
    const amount = getEffExp(e);
    opexByCategory[cat] = (opexByCategory[cat] || 0) + amount;
  });

  const opex = Object.values(opexByCategory).reduce((s, v) => s + v, 0);
  const grossProfit = totalRevenue - totalCOGS;
  const netProfit = grossProfit - opex + otherIncome;

  return { totalRevenue, totalCOGS, grossProfit, netProfit, opex, revenueByMarketplace, opexByCategory, marketplaceFees, otherIncome };
}

export function useLedgerMetrics(dateRange: DateRange, companyFilter: string | null) {
  const { companies } = useCompany();
  const [metrics, setMetrics] = useState<LedgerMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef(0);

  const fetchAll = useCallback(async () => {
    const fetchId = ++fetchRef.current;
    setLoading(true);

    try {
      const now = new Date();
      const { start, end } = getDateBounds(dateRange, now);
      const { start: prevStart, end: prevEnd } = getPrevDateBounds(dateRange, now);
      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];

      // Parallel: ledger for current + previous period
      const [currentLedger, prevLedger] = await Promise.all([
        fetchLedgerForPeriod(start, end, companyFilter, companies),
        fetchLedgerForPeriod(prevStart, prevEnd, companyFilter, companies),
      ]);

      if (fetchId !== fetchRef.current) return; // stale

      // Sales data for operational metrics + marketplace breakdown + top products + activity
      let salesQ = supabase.from('sales')
        .select('id, sale_price, profit, marketplace, marketplace_account, sale_date, marketplace_fees, shipping_cost, company_id, devices(brand, model, cost_price, created_at)')
        .gte('sale_date', start.toISOString())
        .limit(5000);
      if (companyFilter) salesQ = salesQ.eq('company_id', companyFilter);
      const { data: sales } = await salesQ;

      // Inventory, AP, AR, Bank, Refurb — all in parallel
      let invQ = supabase.from('devices').select('id, cost_price, status, fulfillment_channel, refurbishment_status, refurbishment_started_at, refurbishment_completed_at, created_at').eq('is_partner_owned', false).limit(5000);
      if (companyFilter) invQ = invQ.eq('company_id', companyFilter);

      let apQ = supabase.from('accounts_payable').select('balance_due').eq('status', 'outstanding');
      if (companyFilter) apQ = apQ.eq('company_id', companyFilter);

      let arQ = supabase.from('accounts_receivable').select('balance_due').eq('status', 'outstanding');
      if (companyFilter) arQ = arQ.eq('company_id', companyFilter);

      let bankQ = supabase.from('bank_accounts').select('current_balance').eq('is_active', true);
      if (companyFilter) bankQ = bankQ.eq('company_id', companyFilter);

      // Recent expenses for activity feed
      let recentExpQ = supabase.from('expenses')
        .select('id, description, amount, expense_date, category')
        .gte('expense_date', startStr)
        .order('expense_date', { ascending: false })
        .limit(20);
      if (companyFilter) recentExpQ = recentExpQ.eq('company_id', companyFilter);

      const [invRes, apRes, arRes, bankRes, recentExpRes] = await Promise.all([
        invQ, apQ, arQ, bankQ, recentExpQ,
      ]);

      if (fetchId !== fetchRef.current) return;

      const allDevices = invRes.data || [];
      const inStock = allDevices.filter(d => d.status === 'in_stock');
      const inventoryValue = inStock.reduce((s, d) => s + Number(d.cost_price || 0), 0);
      const inventoryCount = inStock.length;
      const fbaCount = inStock.filter(d => d.fulfillment_channel === 'fba').length;
      const localCount = inStock.length - fbaCount;
      const outstandingAP = apRes.data?.reduce((s, a) => s + Number(a.balance_due || 0), 0) || 0;
      const outstandingAR = arRes.data?.reduce((s, a) => s + Number(a.balance_due || 0), 0) || 0;
      const cashPosition = bankRes.data?.reduce((s, b) => s + Number(b.current_balance || 0), 0) || 0;

      // Refurb metrics
      const refurbQueue = allDevices.filter(d => d.refurbishment_status === 'pending' || d.refurbishment_status === 'in_progress');
      const monthStart = startOfMonth(now);
      const completedThisMonth = allDevices.filter(d =>
        d.refurbishment_status === 'completed' && d.refurbishment_completed_at && new Date(d.refurbishment_completed_at) >= monthStart
      );
      let totalRefurbDays = 0, refurbCount = 0;
      allDevices.forEach(d => {
        if (d.refurbishment_started_at && d.refurbishment_completed_at) {
          const days = differenceInDays(new Date(d.refurbishment_completed_at), new Date(d.refurbishment_started_at));
          if (days >= 0) { totalRefurbDays += days; refurbCount++; }
        }
      });

      // Operational metrics from sales
      const totalOrders = sales?.length || 0;
      const avgOrderValue = totalOrders > 0 ? currentLedger.totalRevenue / totalOrders : 0;
      const avgProfitPerUnit = totalOrders > 0 ? currentLedger.netProfit / totalOrders : 0;

      let totalDays = 0, countSold = 0;
      sales?.forEach(s => {
        const d = s.devices as any;
        if (d?.created_at) {
          const days = differenceInDays(new Date(s.sale_date), new Date(d.created_at));
          if (days >= 0) { totalDays += days; countSold++; }
        }
      });
      const avgDaysToSell = countSold > 0 ? Math.round(totalDays / countSold) : 0;

      const inventoryTurnover = inventoryValue > 0 ? currentLedger.totalCOGS / inventoryValue : 0;
      const returnOnInventory = inventoryValue > 0 ? (currentLedger.netProfit / inventoryValue) * 100 : 0;
      const expenseToRevenueRatio = currentLedger.totalRevenue > 0 ? (currentLedger.opex / currentLedger.totalRevenue) * 100 : 0;

      // Monthly trend
      const months = parseInt(dateRange);
      const bucketCount = !isNaN(months) ? months : Math.max(1, Math.ceil(differenceInDays(now, start) / 30));
      const monthlyTrend: LedgerMetrics['monthlyTrend'] = [];

      // We need per-month ledger data. For efficiency, build from sales + current ledger proportions
      // Actually, let's build monthly trend from individual month ledger queries for accuracy
      // But that would be too many queries. Instead, bucket from sales data and apportion ledger totals
      const monthBuckets: Record<string, { revenue: number; cogs: number; profit: number; opex: number; orders: number }> = {};
      for (let i = 0; i < bucketCount; i++) {
        const date = subMonths(now, bucketCount - 1 - i);
        const key = format(date, 'yyyy-MM');
        monthBuckets[key] = { revenue: 0, cogs: 0, profit: 0, opex: 0, orders: 0 };
      }

      sales?.forEach(s => {
        const key = format(new Date(s.sale_date), 'yyyy-MM');
        if (monthBuckets[key]) {
          monthBuckets[key].revenue += Number(s.sale_price);
          monthBuckets[key].profit += Number(s.profit || 0);
          const d = s.devices as any;
          monthBuckets[key].cogs += Number(d?.cost_price || 0);
          monthBuckets[key].orders += 1;
        }
      });

      // Distribute opex by month from expenses
      const recentExps = recentExpRes.data || [];
      let expAllQ = supabase.from('expenses')
        .select('amount, gst_hst_amount, pst_amount, expense_date, category')
        .gte('expense_date', startStr)
        .lte('expense_date', endStr)
        .limit(5000);
      if (companyFilter) expAllQ = expAllQ.eq('company_id', companyFilter);
      const { data: allExpenses } = await expAllQ;

      allExpenses?.forEach(e => {
        const key = format(new Date(e.expense_date), 'yyyy-MM');
        if (monthBuckets[key]) {
          monthBuckets[key].opex += (Number(e.amount) || 0) + (Number(e.gst_hst_amount) || 0) + (Number(e.pst_amount) || 0);
        }
      });

      for (const [key, d] of Object.entries(monthBuckets)) {
        const date = new Date(key + '-01');
        monthlyTrend.push({
          month: format(date, 'MMM'),
          monthKey: key,
          revenue: d.revenue,
          cogs: d.cogs,
          grossProfit: d.revenue - d.cogs,
          opex: d.opex,
          netProfit: d.revenue - d.cogs - d.opex,
          margin: d.revenue > 0 ? ((d.revenue - d.cogs) / d.revenue) * 100 : 0,
          orders: d.orders,
        });
      }

      // Marketplace breakdown — split Best Buy by account (TGW/VES)
      const mpTotals: Record<string, { revenue: number; orders: number; fees: number; shipping: number }> = {};
      sales?.forEach(s => {
        const ck = getChannelKey(s.marketplace, (s as any).marketplace_account);
        if (!mpTotals[ck]) mpTotals[ck] = { revenue: 0, orders: 0, fees: 0, shipping: 0 };
        mpTotals[ck].revenue += Number(s.sale_price);
        mpTotals[ck].orders += 1;
        mpTotals[ck].fees += Number(s.marketplace_fees || 0);
        mpTotals[ck].shipping += Number(s.shipping_cost || 0);
      });
      const marketplaceBreakdown = Object.entries(mpTotals).map(([ck, d]) => ({
        name: getChannelLabel(ck),
        revenue: d.revenue,
        orders: d.orders,
        fees: d.fees,
        shipping: d.shipping,
        netRevenue: d.revenue - d.fees - d.shipping,
        feeRate: d.revenue > 0 ? (d.fees / d.revenue) * 100 : 0,
        color: getChannelColor(ck),
      })).sort((a, b) => b.revenue - a.revenue);

      // Top products
      const productTotals: Record<string, { sold: number; revenue: number; profit: number }> = {};
      sales?.forEach(s => {
        const d = s.devices as any;
        if (d) {
          const key = `${d.brand} ${d.model}`;
          if (!productTotals[key]) productTotals[key] = { sold: 0, revenue: 0, profit: 0 };
          productTotals[key].sold += 1;
          productTotals[key].revenue += Number(s.sale_price);
          productTotals[key].profit += Number(s.profit || 0);
        }
      });
      const topProducts = Object.entries(productTotals)
        .map(([name, d]) => ({ name, ...d, margin: d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : '0' }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 10);

      // Expense breakdown from ledger
      const expenseBreakdown = Object.entries(currentLedger.opexByCategory)
        .map(([name, value], i) => ({
          name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          value,
          fill: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
        }))
        .sort((a, b) => b.value - a.value);

      // Recent activity
      const recentActivity: LedgerMetrics['recentActivity'] = [];
      const recentSales = sales?.sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime()).slice(0, 15) || [];
      recentSales.forEach(s => {
        const d = s.devices as any;
        recentActivity.push({
          id: `s-${s.id}`,
          type: 'sale',
          description: d ? `${d.brand} ${d.model}` : `Order #${s.id.slice(0, 6)}`,
          amount: Number(s.sale_price),
          timestamp: new Date(s.sale_date),
          marketplace: getChannelKey(s.marketplace, (s as any).marketplace_account),
        });
      });
      recentExps.forEach(e => {
        recentActivity.push({
          id: `e-${e.id}`,
          type: 'expense',
          description: e.description,
          amount: Number(e.amount),
          timestamp: new Date(e.expense_date),
        });
      });
      recentActivity.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      const grossMargin = currentLedger.totalRevenue > 0 ? (currentLedger.grossProfit / currentLedger.totalRevenue) * 100 : 0;
      const netMargin = currentLedger.totalRevenue > 0 ? (currentLedger.netProfit / currentLedger.totalRevenue) * 100 : 0;

      setMetrics({
        revenue: currentLedger.totalRevenue,
        revenueByMarketplace: currentLedger.revenueByMarketplace,
        cogs: currentLedger.totalCOGS,
        grossProfit: currentLedger.grossProfit,
        grossMargin,
        operatingExpenses: currentLedger.opex,
        operatingExpensesByCategory: currentLedger.opexByCategory,
        marketplaceFees: currentLedger.marketplaceFees,
        netProfit: currentLedger.netProfit,
        netMargin,
        otherIncome: currentLedger.otherIncome,
        cashPosition,
        inventoryValue,
        inventoryCount,
        outstandingAR,
        outstandingAP,
        totalOrders,
        avgOrderValue,
        avgProfitPerUnit,
        avgDaysToSell,
        inventoryTurnover,
        returnOnInventory,
        expenseToRevenueRatio,
        prevRevenue: prevLedger.totalRevenue,
        prevGrossProfit: prevLedger.grossProfit,
        prevNetProfit: prevLedger.netProfit,
        prevTotalOrders: 0, // would need prev sales count
        monthlyTrend,
        marketplaceBreakdown,
        topProducts,
        expenseBreakdown,
        recentActivity: recentActivity.slice(0, 20),
        refurbQueueSize: refurbQueue.length,
        refurbCompletedThisMonth: completedThisMonth.length,
        refurbAvgDays: refurbCount > 0 ? Math.round(totalRefurbDays / refurbCount) : 0,
        fbaCount,
        localCount,
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error('Error fetching ledger metrics:', error);
    } finally {
      if (fetchId === fetchRef.current) setLoading(false);
    }
  }, [dateRange, companyFilter, companies]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Listen for data changes from other parts of the app
  useDataRefetch(['dashboard', 'financials', 'sales', 'expenses', 'inventory', 'invoices', 'purchase_orders'], fetchAll);

  // Realtime subscriptions
  useEffect(() => {
    const channels = ['sales', 'devices', 'expenses', 'journal_entries'].map(table => {
      return supabase
        .channel(`dashboard-rt-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          fetchAll();
        })
        .subscribe();
    });

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [fetchAll]);

  return { metrics, loading, refetch: fetchAll };
}
