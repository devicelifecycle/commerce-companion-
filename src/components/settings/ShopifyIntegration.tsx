import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { ShoppingBag, RefreshCw, Loader2, CheckCircle2, XCircle, Clock, ExternalLink, Package, Users, DollarSign } from 'lucide-react';

interface SyncResult {
  success: boolean;
  imported?: number;
  skipped?: number;
  errors?: number;
  error?: string;
  details?: {
    imported?: string[];
    skipped?: string[];
    errors?: string[];
  };
}

export function ShopifyIntegration() {
  const { selectedCompany } = useCompany();
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [stats, setStats] = useState<{ totalOrders: number; totalRevenue: number; totalCustomers: number } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const fetchStats = async () => {
    if (!selectedCompany) return;
    setLoadingStats(true);
    try {
      const [salesRes, customersRes] = await Promise.all([
        supabase
          .from('sales')
          .select('sale_price')
          .eq('marketplace', 'shopify')
          .eq('company_id', selectedCompany.id),
        supabase
          .from('customers')
          .select('id')
          .eq('marketplace_source', 'shopify')
          .eq('company_id', selectedCompany.id),
      ]);

      const orders = salesRes.data || [];
      const totalRevenue = orders.reduce((sum, s) => sum + (Number(s.sale_price) || 0), 0);

      setStats({
        totalOrders: orders.length,
        totalRevenue,
        totalCustomers: (customersRes.data || []).length,
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('import-shopify-orders');
      
      if (error) throw error;
      
      setLastResult(data as SyncResult);
      
      if (data?.success) {
        toast.success(`Shopify sync complete: ${data.imported} imported, ${data.skipped} skipped`);
        fetchStats();
      } else {
        toast.error(data?.error || 'Sync failed');
      }
    } catch (err: any) {
      console.error('Sync error:', err);
      toast.error(err.message || 'Failed to sync with Shopify');
      setLastResult({ success: false, error: err.message });
    } finally {
      setSyncing(false);
    }
  };

  // Fetch stats on mount
  useEffect(() => {
    fetchStats();
  }, [selectedCompany]);

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShoppingBag className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Shopify</CardTitle>
                <CardDescription>Order sync & reporting integration</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-primary border-primary/30">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Shopify orders are automatically synced via webhook when new orders are placed. 
              You can also trigger a manual sync to import orders from the last 7 days.
            </p>

            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border p-3 text-center">
                  <Package className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-2xl font-bold">{stats.totalOrders}</p>
                  <p className="text-xs text-muted-foreground">Orders Synced</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <DollarSign className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-2xl font-bold">${stats.totalRevenue.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-xs text-muted-foreground">Total Revenue</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-2xl font-bold">{stats.totalCustomers}</p>
                  <p className="text-xs text-muted-foreground">Customers</p>
                </div>
              </div>
            )}
            {loadingStats && !stats && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            <Separator />

            {/* Sync Controls */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Manual Sync</p>
                <p className="text-xs text-muted-foreground">Import orders from the last 7 days</p>
              </div>
              <Button onClick={triggerSync} disabled={syncing} variant="outline" size="sm">
                {syncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {syncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            </div>

            {/* Sync Results */}
            {lastResult && (
              <div className={`rounded-lg border p-4 ${lastResult.success ? 'bg-accent/50 border-primary/20' : 'bg-destructive/5 border-destructive/20'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {lastResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm font-medium">
                    {lastResult.success ? 'Sync Completed' : 'Sync Failed'}
                  </span>
                </div>
                
                {lastResult.success ? (
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-primary" />
                      <span>{lastResult.imported} imported</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span>{lastResult.skipped} skipped</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <XCircle className="h-3 w-3 text-destructive" />
                      <span>{lastResult.errors} errors</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-destructive">{lastResult.error}</p>
                )}

                {lastResult.details?.errors && lastResult.details.errors.length > 0 && (
                  <div className="mt-2 text-xs text-destructive">
                    {lastResult.details.errors.map((e, i) => (
                      <p key={i}>{e}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Integration Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integration Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sync Method</span>
              <span className="font-medium">Webhook + Manual Import</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Webhook Event</span>
              <Badge variant="secondary">orders/create</Badge>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order Prefix</span>
              <code className="text-xs bg-muted px-2 py-0.5 rounded">SHOP-</code>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Company</span>
              <span className="font-medium">{selectedCompany?.name || 'TGW'}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Device Matching</span>
              <span className="font-medium">SKU → IMEI</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fee Estimation</span>
              <span className="font-medium">2.9% + $0.30</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
