import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, Receipt, MapPin, TrendingUp } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns';
import { getChannelKey, getChannelLabel } from '@/lib/marketplaceAccounts';

interface ProvinceRate {
  province_code: string;
  province_name: string;
  gst_rate: number;
  hst_rate: number | null;
  pst_rate: number | null;
  qst_rate: number | null;
  total_rate: number;
  is_hst_province: boolean;
}

interface TaxByProvince {
  province: string;
  salesCount: number;
  salesTotal: number;
  gstCollected: number;
  hstCollected: number;
  pstCollected: number;
  qstCollected: number;
  totalTax: number;
}

interface TaxByMarketplace {
  marketplace: string;
  salesCount: number;
  taxCollected: number;
  marketplaceCollected: number;
  sellerCollected: number;
}

export function TaxCollectedReport() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [provinceRates, setProvinceRates] = useState<ProvinceRate[]>([]);
  const [taxByProvince, setTaxByProvince] = useState<TaxByProvince[]>([]);
  const [taxByMarketplace, setTaxByMarketplace] = useState<TaxByMarketplace[]>([]);
  const [dateRange, setDateRange] = useState('quarter');
  const [startDate, setStartDate] = useState(format(startOfQuarter(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfQuarter(new Date()), 'yyyy-MM-dd'));

  useEffect(() => {
    fetchProvinceRates();
  }, []);

  useEffect(() => {
    updateDateRange();
  }, [dateRange]);

  useEffect(() => {
    fetchTaxData();
  }, [selectedCompany, startDate, endDate]);

  const fetchProvinceRates = async () => {
    const { data } = await supabase
      .from('provincial_tax_rates')
      .select('*')
      .order('province_name');
    setProvinceRates((data || []) as ProvinceRate[]);
  };

  const updateDateRange = () => {
    const now = new Date();
    switch (dateRange) {
      case 'month':
        setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
        break;
      case 'quarter':
        setStartDate(format(startOfQuarter(now), 'yyyy-MM-dd'));
        setEndDate(format(endOfQuarter(now), 'yyyy-MM-dd'));
        break;
      case 'year':
        setStartDate(format(startOfYear(now), 'yyyy-MM-dd'));
        setEndDate(format(endOfYear(now), 'yyyy-MM-dd'));
        break;
    }
  };

  const fetchTaxData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('sales')
        .select('id, sale_price, tax_amount, marketplace, marketplace_account, shipping_address')
        .gte('sale_date', startDate)
        .lte('sale_date', endDate);

      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }

      const { data: salesData } = await query;

      // Parse province from shipping address and calculate tax by province
      const provinceMap = new Map<string, TaxByProvince>();
      const marketplaceMap = new Map<string, TaxByMarketplace>();

      (salesData || []).forEach(sale => {
        // Extract province from address (simplified - looks for province codes)
        const address = sale.shipping_address || '';
        let province = 'Unknown';
        provinceRates.forEach(rate => {
          if (address.includes(rate.province_code) || address.includes(rate.province_name)) {
            province = rate.province_code;
          }
        });

        // Update province stats
        const existing = provinceMap.get(province) || {
          province,
          salesCount: 0,
          salesTotal: 0,
          gstCollected: 0,
          hstCollected: 0,
          pstCollected: 0,
          qstCollected: 0,
          totalTax: 0,
        };
        
        const taxAmount = Number(sale.tax_amount || 0);
        const rate = provinceRates.find(r => r.province_code === province);
        
        existing.salesCount += 1;
        existing.salesTotal += Number(sale.sale_price || 0);
        existing.totalTax += taxAmount;
        
        // Estimate tax breakdown based on province rates
        if (rate?.is_hst_province) {
          existing.hstCollected += taxAmount;
        } else if (province === 'QC') {
          existing.gstCollected += taxAmount * 0.33; // ~5% of 14.975%
          existing.qstCollected += taxAmount * 0.67; // ~9.975% of 14.975%
        } else {
          existing.gstCollected += taxAmount * 0.5;
          existing.pstCollected += taxAmount * 0.5;
        }
        
        provinceMap.set(province, existing);

        // Update channel stats — Best Buy split into TGW & VES
        const channelKey = getChannelKey(sale.marketplace, (sale as any).marketplace_account);
        const mktExisting = marketplaceMap.get(channelKey) || {
          marketplace: channelKey,
          salesCount: 0,
          taxCollected: 0,
          marketplaceCollected: 0,
          sellerCollected: 0,
        };

        mktExisting.salesCount += 1;
        mktExisting.taxCollected += taxAmount;
        // Marketplace remits tax for Amazon and Best Buy variants
        if (channelKey === 'amazon' || channelKey.startsWith('bestbuy')) {
          mktExisting.marketplaceCollected += taxAmount;
        } else {
          mktExisting.sellerCollected += taxAmount;
        }

        marketplaceMap.set(channelKey, mktExisting);
      });

      setTaxByProvince(Array.from(provinceMap.values()).sort((a, b) => b.totalTax - a.totalTax));
      setTaxByMarketplace(Array.from(marketplaceMap.values()).sort((a, b) => b.taxCollected - a.taxCollected));
    } catch (error) {
      console.error('Error fetching tax data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

  const totalGST = taxByProvince.reduce((sum, p) => sum + p.gstCollected, 0);
  const totalHST = taxByProvince.reduce((sum, p) => sum + p.hstCollected, 0);
  const totalPST = taxByProvince.reduce((sum, p) => sum + p.pstCollected, 0);
  const totalQST = taxByProvince.reduce((sum, p) => sum + p.qstCollected, 0);
  const grandTotal = taxByProvince.reduce((sum, p) => sum + p.totalTax, 0);

  const handleExport = () => {
    const headers = ['Province', 'Sales Count', 'Sales Total', 'GST', 'HST', 'PST', 'QST', 'Total Tax'];
    const rows = taxByProvince.map(p => [
      p.province,
      p.salesCount,
      p.salesTotal.toFixed(2),
      p.gstCollected.toFixed(2),
      p.hstCollected.toFixed(2),
      p.pstCollected.toFixed(2),
      p.qstCollected.toFixed(2),
      p.totalTax.toFixed(2),
    ]);

    rows.push(['TOTALS', '', '', totalGST.toFixed(2), totalHST.toFixed(2), totalPST.toFixed(2), totalQST.toFixed(2), grandTotal.toFixed(2)]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tax-collected-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label>Period:</Label>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {dateRange === 'custom' && (
          <>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[150px]"
            />
            <span>to</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[150px]"
            />
          </>
        )}
        <Button variant="outline" onClick={handleExport} className="ml-auto">
          <Download className="h-4 w-4 mr-2" />
          Export for Filing
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">GST Collected</p>
            <p className="text-xl font-bold">{formatCurrency(totalGST)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">HST Collected</p>
            <p className="text-xl font-bold">{formatCurrency(totalHST)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">PST Collected</p>
            <p className="text-xl font-bold">{formatCurrency(totalPST)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">QST Collected</p>
            <p className="text-xl font-bold">{formatCurrency(totalQST)}</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/10">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Total Tax</p>
            <p className="text-xl font-bold text-primary">{formatCurrency(grandTotal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tax by Province */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Tax Collected by Province
          </CardTitle>
        </CardHeader>
        <CardContent>
          {taxByProvince.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No sales data for this period</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Province</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">HST</TableHead>
                  <TableHead className="text-right">PST</TableHead>
                  <TableHead className="text-right">QST</TableHead>
                  <TableHead className="text-right">Total Tax</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxByProvince.map(row => (
                  <TableRow key={row.province}>
                    <TableCell className="font-medium">{row.province}</TableCell>
                    <TableCell className="text-right">{row.salesCount}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.salesTotal)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.gstCollected)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.hstCollected)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.pstCollected)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.qstCollected)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(row.totalTax)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold bg-muted/50">
                  <TableCell>TOTALS</TableCell>
                  <TableCell className="text-right">{taxByProvince.reduce((s, p) => s + p.salesCount, 0)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(taxByProvince.reduce((s, p) => s + p.salesTotal, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalGST)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalHST)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalPST)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalQST)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(grandTotal)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tax by Marketplace */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Tax by Marketplace
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marketplace</TableHead>
                <TableHead className="text-right">Sales Count</TableHead>
                <TableHead className="text-right">Total Tax</TableHead>
                <TableHead className="text-right">Marketplace Collected</TableHead>
                <TableHead className="text-right">Seller Collected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {taxByMarketplace.map(row => (
                <TableRow key={row.marketplace}>
                  <TableCell>
                    <Badge variant="outline">{getChannelLabel(row.marketplace)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{row.salesCount}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.taxCollected)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.marketplaceCollected)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.sellerCollected)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Provincial Rates Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Provincial Tax Rates Reference
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {provinceRates.map(rate => (
              <div key={rate.province_code} className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="font-semibold">{rate.province_code}</p>
                <p className="text-sm text-muted-foreground">{rate.province_name}</p>
                <p className="text-lg font-bold text-primary">{rate.total_rate}%</p>
                <p className="text-xs text-muted-foreground">
                  {rate.is_hst_province ? 'HST' : 
                    rate.qst_rate ? 'GST+QST' : 
                    rate.pst_rate ? 'GST+PST' : 'GST only'}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
