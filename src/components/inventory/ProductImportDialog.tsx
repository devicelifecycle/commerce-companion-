import { useState, useCallback } from 'react';
import ExcelJS from 'exceljs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Upload, CheckCircle, XCircle, FileSpreadsheet, Download } from 'lucide-react';
import { emitRefetch } from '@/hooks/useDataRefetch';

interface ProductImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ExcelRow {
  [key: string]: string | number | null;
}

interface ColumnMapping {
  name: string;
  description: string;
  sku: string;
  barcode: string;
  unit_of_measure: string;
  cost_price: string;
  sale_price: string;
  quantity: string;
  category: string;
  reorder_point: string;
}

interface ParsedProduct {
  row: number;
  name: string;
  description: string;
  sku: string;
  barcode: string;
  unit_of_measure: string;
  cost_price: number;
  sale_price: number | null;
  quantity: number;
  category: string;
  reorder_point: number;
  valid: boolean;
  errors: string[];
}

export function ProductImportDialog({ open, onOpenChange, onSuccess }: ProductImportDialogProps) {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'results'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [excelData, setExcelData] = useState<ExcelRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    name: '', description: '', sku: '', barcode: '', unit_of_measure: '',
    cost_price: '', sale_price: '', quantity: '', category: '', reorder_point: '',
  });
  const [parsedProducts, setParsedProducts] = useState<ParsedProduct[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);

    try {
      const arrayBuffer = await uploadedFile.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) { toast.error('No worksheets found'); return; }

      const headers: string[] = [];
      worksheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber - 1] = String(cell.value ?? '');
      });

      const data: ExcelRow[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const rowObj: ExcelRow = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) rowObj[header] = cell.value as string | number;
        });
        data.push(rowObj);
      });

      setColumns(headers.filter(Boolean));
      setExcelData(data);

      // Auto-map common column names
      const autoMap = { ...mapping };
      const lowerHeaders = headers.map(h => h.toLowerCase());
      const tryMap = (field: keyof ColumnMapping, ...patterns: string[]) => {
        for (const p of patterns) {
          const idx = lowerHeaders.findIndex(h => h.includes(p));
          if (idx >= 0 && headers[idx]) { autoMap[field] = headers[idx]; return; }
        }
      };
      tryMap('name', 'name', 'product', 'item', 'title');
      tryMap('description', 'description', 'desc');
      tryMap('sku', 'sku');
      tryMap('barcode', 'barcode', 'upc', 'ean');
      tryMap('cost_price', 'cost', 'price');
      tryMap('sale_price', 'sale', 'sell', 'retail');
      tryMap('quantity', 'qty', 'quantity', 'stock', 'count');
      tryMap('category', 'category', 'type');
      tryMap('unit_of_measure', 'unit', 'uom');
      tryMap('reorder_point', 'reorder', 'min');
      setMapping(autoMap);
      setStep('map');
    } catch (error) {
      toast.error('Failed to parse Excel file');
    }
  }, []);

  const handleValidate = () => {
    const parsed: ParsedProduct[] = excelData.map((row, idx) => {
      const errors: string[] = [];
      const name = String(row[mapping.name] || '').trim();
      if (!name) errors.push('Name is required');
      const costStr = String(row[mapping.cost_price] || '0');
      const cost = parseFloat(costStr);
      if (isNaN(cost) || cost < 0) errors.push('Invalid cost price');
      const qtyStr = String(row[mapping.quantity] || '0');
      const qty = parseInt(qtyStr) || 0;

      return {
        row: idx + 2,
        name,
        description: String(row[mapping.description] || '').trim(),
        sku: String(row[mapping.sku] || '').trim(),
        barcode: String(row[mapping.barcode] || '').trim(),
        unit_of_measure: String(row[mapping.unit_of_measure] || 'unit').trim() || 'unit',
        cost_price: isNaN(cost) ? 0 : cost,
        sale_price: mapping.sale_price ? (parseFloat(String(row[mapping.sale_price] || '')) || null) : null,
        quantity: qty,
        category: String(row[mapping.category] || '').trim(),
        reorder_point: mapping.reorder_point ? (parseInt(String(row[mapping.reorder_point] || '0')) || 0) : 0,
        valid: errors.length === 0,
        errors,
      };
    });

    setParsedProducts(parsed);
    setStep('preview');
  };

  const handleImport = async () => {
    if (!selectedCompany) { toast.error('Select a company'); return; }
    const validProducts = parsedProducts.filter(p => p.valid);
    if (validProducts.length === 0) { toast.error('No valid products to import'); return; }

    setImporting(true);
    let success = 0;
    let failed = 0;

    try {
      // Get/create categories
      const uniqueCategories = [...new Set(validProducts.map(p => p.category).filter(Boolean))];
      const categoryMap: Record<string, string> = {};

      for (const catName of uniqueCategories) {
        const { data: existing } = await supabase
          .from('product_categories')
          .select('id')
          .eq('company_id', selectedCompany.id)
          .ilike('name', catName)
          .maybeSingle();

        if (existing) {
          categoryMap[catName] = existing.id;
        } else {
          const { data: created } = await supabase
            .from('product_categories')
            .insert({ company_id: selectedCompany.id, name: catName })
            .select('id')
            .single();
          if (created) categoryMap[catName] = created.id;
        }
      }

      // Insert products in batches
      const batch = validProducts.map(p => ({
        company_id: selectedCompany.id,
        name: p.name,
        description: p.description || null,
        sku: p.sku || null,
        barcode: p.barcode || null,
        unit_of_measure: p.unit_of_measure,
        cost_price: p.cost_price,
        sale_price: p.sale_price,
        quantity_on_hand: p.quantity,
        reorder_point: p.reorder_point,
        category_id: p.category ? (categoryMap[p.category] || null) : null,
        status: 'active',
        created_by: user?.id,
      }));

      const { data: inserted, error } = await supabase.from('products').insert(batch).select('id');
      if (error) throw error;
      success = inserted?.length || 0;
      failed = validProducts.length - success;
    } catch (error: any) {
      console.error('Import error:', error);
      failed = validProducts.length;
      toast.error(error.message || 'Import failed');
    }

    setResults({ success, failed });
    setImporting(false);
    setStep('results');
    if (success > 0) { onSuccess(); emitRefetch('products'); }
  };

  const downloadTemplate = () => {
    const csv = 'Name,Description,SKU,Barcode,Category,Unit,Cost Price,Sale Price,Quantity,Reorder Point\nProtein Bar,High protein snack,SNK-001,123456789,Food & Beverage,unit,2.50,4.99,100,20\nHDMI Cable 2m,High-speed HDMI cable,ACC-001,,General Merchandise,piece,5.00,12.99,50,10';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'product-import-template.csv'; a.click();
  };

  const handleClose = () => {
    setStep('upload');
    setFile(null);
    setExcelData([]);
    setColumns([]);
    setParsedProducts([]);
    setResults({ success: 0, failed: 0 });
    onOpenChange(false);
  };

  const MappingSelect = ({ field, label, required }: { field: keyof ColumnMapping; label: string; required?: boolean }) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}{required && ' *'}</Label>
      <Select value={mapping[field]} onValueChange={v => setMapping(prev => ({ ...prev, [field]: v }))}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select column..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Skip —</SelectItem>
          {columns.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Products from Excel
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file to bulk-add products to your inventory
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">Upload an Excel (.xlsx) or CSV file</p>
              <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="max-w-xs mx-auto" />
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-1" /> Download Template
            </Button>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Map your columns to product fields. Found <Badge variant="secondary">{excelData.length} rows</Badge> in {file?.name}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <MappingSelect field="name" label="Product Name" required />
              <MappingSelect field="description" label="Description" />
              <MappingSelect field="sku" label="SKU" />
              <MappingSelect field="barcode" label="Barcode / UPC" />
              <MappingSelect field="category" label="Category" />
              <MappingSelect field="unit_of_measure" label="Unit of Measure" />
              <MappingSelect field="cost_price" label="Cost Price" required />
              <MappingSelect field="sale_price" label="Sale Price" />
              <MappingSelect field="quantity" label="Quantity" />
              <MappingSelect field="reorder_point" label="Reorder Point" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
              <Button onClick={handleValidate} disabled={!mapping.name || !mapping.cost_price}>Validate & Preview</Button>
            </DialogFooter>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Badge variant="default">{parsedProducts.filter(p => p.valid).length} valid</Badge>
              <Badge variant="destructive">{parsedProducts.filter(p => !p.valid).length} errors</Badge>
            </div>
            <div className="max-h-[400px] overflow-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="w-10">✓</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedProducts.slice(0, 100).map(p => (
                    <TableRow key={p.row} className={!p.valid ? 'bg-destructive/5' : ''}>
                      <TableCell className="text-xs">{p.row}</TableCell>
                      <TableCell className="text-sm font-medium">{p.name || '—'}</TableCell>
                      <TableCell className="text-xs font-mono">{p.sku || '—'}</TableCell>
                      <TableCell className="text-xs">{p.category || '—'}</TableCell>
                      <TableCell className="text-right text-xs">${p.cost_price.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-xs">{p.quantity}</TableCell>
                      <TableCell>
                        {p.valid ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : (
                          <span title={p.errors.join(', ')}><XCircle className="h-4 w-4 text-destructive" /></span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('map')}>Back</Button>
              <Button onClick={handleImport} disabled={importing || parsedProducts.filter(p => p.valid).length === 0}>
                {importing ? 'Importing...' : `Import ${parsedProducts.filter(p => p.valid).length} Products`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'results' && (
          <div className="space-y-4 text-center py-6">
            <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto" />
            <h3 className="text-lg font-semibold">Import Complete</h3>
            <div className="flex justify-center gap-4">
              <Badge variant="default" className="text-sm">{results.success} imported</Badge>
              {results.failed > 0 && <Badge variant="destructive" className="text-sm">{results.failed} failed</Badge>}
            </div>
            <DialogFooter className="justify-center">
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
