import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SalesDashboard } from '@/components/sales/SalesDashboard';
import { ManualSaleDialog } from '@/components/sales/ManualSaleDialog';
import { IntercompanySaleDialog } from '@/components/sales/IntercompanySaleDialog';
import { EditSaleDialog } from '@/components/sales/EditSaleDialog';
import { MarketplaceBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Search, Plus, Filter, TrendingUp, Trash2, Link, MoreHorizontal, 
  Download, ArrowRightLeft, RefreshCw, LayoutDashboard, List,
  FileSpreadsheet, AlertCircle
} from 'lucide-react';

type Marketplace = 'shopify' | 'amazon' | 'bestbuy' | 'other';

interface Sale {
  id: string;
  device_id: string | null;
  order_number: string;
  marketplace: Marketplace;
  sale_price: number;
  shipping_cost: number;
  marketplace_fees: number;
  tax_amount: number;
  profit: number | null;
  sale_date: string;
  customer_name: string | null;
  customer_email: string | null;
  shipping_address: string | null;
  notes: string | null;
  company_id: string | null;
  created_at: string;
  devices?: {
    brand: string;
    model: string;
    cost_price: number;
  } | null;
}

export default function Sales() {
  const { user } = useAuth();
  const { selectedCompany, isSuperAdmin, hasPermission, loading: permLoading } = useCompany();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all');
  const [showManualSale, setShowManualSale] = useState(false);
  const [showIntercompanySale, setShowIntercompanySale] = useState(false);
  const [editingSale, setEditingSale] = useState<{id: string; deviceId: string | null; orderNumber: string} | null>(null);
  const [importingFrom, setImportingFrom] = useState<string | null>(null);

  const canManageSales = hasPermission('sales_manage', 'edit');
  const canViewSales = hasPermission('sales_view', 'view');

  useEffect(() => {
    if (canViewSales || isSuperAdmin) {
      fetchSales();
    }
  }, [marketplaceFilter, selectedCompany, canViewSales, isSuperAdmin]);

  const fetchSales = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('sales')
        .select(`*, devices (brand, model, cost_price)`)
        .order('sale_date', { ascending: false })
        .limit(100);

      if (marketplaceFilter !== 'all') {
        query = query.eq('marketplace', marketplaceFilter as Marketplace);
      }

      if (selectedCompany && !isSuperAdmin) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSales((data || []) as Sale[]);
    } catch (error) {
      console.error('Error fetching sales:', error);
      toast.error('Failed to fetch sales');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSale = async (id: string) => {
    if (!confirm('Are you sure you want to delete this sale record?')) return;

    try {
      const { error } = await supabase.from('sales').delete().eq('id', id);
      if (error) throw error;
      toast.success('Sale deleted');
      fetchSales();
    } catch (error: any) {
      console.error('Error deleting sale:', error);
      toast.error(error.message || 'Failed to delete sale');
    }
  };

  const handleImport = async (source: 'shopify' | 'amazon' | 'bestbuy') => {
    setImportingFrom(source);
    try {
      const functionName = `import-${source}-orders`;
      const { data, error } = await supabase.functions.invoke(functionName);

      if (error) throw error;

      if (data?.success) {
        toast.success(`Imported ${data.imported} orders from ${source.charAt(0).toUpperCase() + source.slice(1)}`);
        fetchSales();
      } else {
        throw new Error(data?.error || 'Import failed');
      }
    } catch (error: any) {
      console.error(`Error importing from ${source}:`, error);
      toast.error(error.message || `Failed to import from ${source}`);
    } finally {
      setImportingFrom(null);
    }
  };

  const handleExport = () => {
    // Export to CSV
    const headers = ['Order Number', 'Marketplace', 'Date', 'Sale Price', 'Fees', 'Shipping', 'Tax', 'Profit', 'Customer', 'Device'];
    const rows = sales.map(sale => [
      sale.order_number,
      sale.marketplace,
      new Date(sale.sale_date).toLocaleDateString(),
      sale.sale_price.toFixed(2),
      sale.marketplace_fees.toFixed(2),
      sale.shipping_cost.toFixed(2),
      sale.tax_amount.toFixed(2),
      (sale.profit || 0).toFixed(2),
      sale.customer_name || '',
      sale.devices ? `${sale.devices.brand} ${sale.devices.model}` : '',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Sales exported to CSV');
  };

  const filteredSales = sales.filter((sale) => {
    const matchesSearch =
      sale.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.devices?.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.devices?.model.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });

  if (permLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!canViewSales && !isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold">Sales</h1>
            <p className="text-muted-foreground">Track and manage your sales</p>
          </div>
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Access Restricted</h3>
                <p className="text-muted-foreground max-w-md">
                  You don't have permission to view sales data.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Sales</h1>
            <p className="text-muted-foreground">
              {selectedCompany ? `${selectedCompany.code} sales data` : 'Track and manage your sales'}
            </p>
          </div>

          <div className="flex gap-2">
            {canManageSales && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <RefreshCw className={`h-4 w-4 mr-2 ${importingFrom ? 'animate-spin' : ''}`} />
                      Import
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                      onClick={() => handleImport('shopify')}
                      disabled={importingFrom !== null}
                    >
                      Import from Shopify (TGW)
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleImport('bestbuy')}
                      disabled={importingFrom !== null}
                    >
                      Import from Best Buy (TGW)
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleImport('amazon')}
                      disabled={importingFrom !== null}
                    >
                      Import from Amazon (VES)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button variant="outline" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>

                {isSuperAdmin && (
                  <Button variant="outline" onClick={() => setShowIntercompanySale(true)}>
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Intercompany
                  </Button>
                )}

                <Button onClick={() => setShowManualSale(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Record Sale
                </Button>
              </>
            )}
          </div>
        </div>

        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="list" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              All Sales
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <SalesDashboard />
          </TabsContent>

          <TabsContent value="list">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search sales..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={marketplaceFilter} onValueChange={setMarketplaceFilter}>
                    <SelectTrigger className="w-40">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Marketplace" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Marketplaces</SelectItem>
                      <SelectItem value="shopify">Shopify</SelectItem>
                      <SelectItem value="amazon">Amazon</SelectItem>
                      <SelectItem value="bestbuy">Best Buy</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : filteredSales.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold">No sales found</h3>
                    <p className="text-muted-foreground">
                      {searchTerm ? 'Try adjusting your search' : 'Record your first sale to get started'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order</TableHead>
                          <TableHead>Device</TableHead>
                          <TableHead>Marketplace</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Sale Price</TableHead>
                          <TableHead className="text-right">Fees</TableHead>
                          <TableHead className="text-right">Profit</TableHead>
                          {canManageSales && <TableHead className="w-[50px]" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSales.map((sale) => (
                          <TableRow key={sale.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{sale.order_number}</p>
                                {sale.customer_name && (
                                  <p className="text-sm text-muted-foreground">{sale.customer_name}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {sale.devices ? (
                                <span className="text-sm">
                                  {sale.devices.brand} {sale.devices.model}
                                </span>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  Not linked
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <MarketplaceBadge marketplace={sale.marketplace} />
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatDate(sale.sale_date)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(sale.sale_price)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground text-sm">
                              {formatCurrency(sale.marketplace_fees)}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={sale.profit && sale.profit > 0 ? 'text-emerald-600' : 'text-red-600'}>
                                {sale.profit !== null ? formatCurrency(sale.profit) : '-'}
                              </span>
                            </TableCell>
                            {canManageSales && (
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {!sale.device_id && (
                                      <DropdownMenuItem
                                        onClick={() => setEditingSale({
                                          id: sale.id,
                                          deviceId: sale.device_id,
                                          orderNumber: sale.order_number
                                        })}
                                      >
                                        <Link className="h-4 w-4 mr-2" />
                                        Link Device
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() => handleDeleteSale(sale.id)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ManualSaleDialog
        open={showManualSale}
        onOpenChange={setShowManualSale}
        onSuccess={fetchSales}
      />

      <IntercompanySaleDialog
        open={showIntercompanySale}
        onOpenChange={setShowIntercompanySale}
        onSuccess={fetchSales}
      />

      {editingSale && (
        <EditSaleDialog
          open={!!editingSale}
          onOpenChange={() => setEditingSale(null)}
          saleId={editingSale.id}
          currentDeviceId={editingSale.deviceId}
          orderNumber={editingSale.orderNumber}
          onSaved={fetchSales}
        />
      )}
    </DashboardLayout>
  );
}
