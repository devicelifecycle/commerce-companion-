import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { toast } from 'sonner';
import { 
  Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, 
  Download, AlertTriangle, Building2 
} from 'lucide-react';

interface ExcelRow {
  [key: string]: string | number | null;
}

interface ColumnMapping {
  imei: string;
  sku: string;
  category: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  condition: string;
  cost_price: string;
  sale_price: string;
  supplier: string;
  purchase_date: string;
  warehouse_location: string;
  notes: string;
}

interface ValidationResult {
  row: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  data: ExcelRow;
}

interface ImportResult {
  success: boolean;
  row: number;
  message: string;
  data?: ExcelRow;
}

const CATEGORIES = ['phone', 'laptop', 'tablet', 'accessory', 'smartwatch', 'other'];

export default function Import() {
  const { user } = useAuth();
  const { selectedCompany, companies, isSuperAdmin } = useCompany();
  const [file, setFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<ExcelRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [targetCompanyId, setTargetCompanyId] = useState<string>(selectedCompany?.id || '');
  const [updateExisting, setUpdateExisting] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping>({
    imei: '',
    sku: '',
    category: '',
    brand: '',
    model: '',
    storage: '',
    color: '',
    condition: '',
    cost_price: '',
    sale_price: '',
    supplier: '',
    purchase_date: '',
    warehouse_location: '',
    notes: '',
  });
  const [isImporting, setIsImporting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [step, setStep] = useState<'upload' | 'map' | 'validate' | 'preview' | 'results'>('upload');

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const binaryStr = event.target?.result;
        const workbook = XLSX.read(binaryStr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

        if (data.length === 0) {
          toast.error('The uploaded file contains no data');
          return;
        }

        const cols = Object.keys(data[0]);
        setColumns(cols);
        setExcelData(data);
        setStep('map');

        // Auto-map columns
        const autoMapping: ColumnMapping = { ...mapping };
        cols.forEach((col) => {
          const lowerCol = col.toLowerCase();
          if (lowerCol.includes('imei') || lowerCol.includes('serial')) autoMapping.imei = col;
          else if (lowerCol.includes('sku') || lowerCol.includes('product code')) autoMapping.sku = col;
          else if (lowerCol.includes('category') || lowerCol.includes('type')) autoMapping.category = col;
          else if (lowerCol.includes('brand') || lowerCol.includes('make')) autoMapping.brand = col;
          else if (lowerCol.includes('model')) autoMapping.model = col;
          else if (lowerCol.includes('storage') || lowerCol.includes('capacity')) autoMapping.storage = col;
          else if (lowerCol.includes('color') || lowerCol.includes('colour')) autoMapping.color = col;
          else if (lowerCol.includes('condition')) autoMapping.condition = col;
          else if (lowerCol.includes('cost') || lowerCol.includes('purchase price')) autoMapping.cost_price = col;
          else if (lowerCol.includes('sale') || lowerCol.includes('sell')) autoMapping.sale_price = col;
          else if (lowerCol.includes('supplier') || lowerCol.includes('vendor')) autoMapping.supplier = col;
          else if (lowerCol.includes('date')) autoMapping.purchase_date = col;
          else if (lowerCol.includes('location') || lowerCol.includes('warehouse')) autoMapping.warehouse_location = col;
          else if (lowerCol.includes('note')) autoMapping.notes = col;
        });
        setMapping(autoMapping);
      } catch (error) {
        console.error('Error parsing file:', error);
        toast.error('Could not parse the uploaded file');
      }
    };

    reader.readAsBinaryString(uploadedFile);
  }, [mapping]);

  const validateData = async () => {
    if (!mapping.brand || !mapping.model || !mapping.cost_price) {
      toast.error('Please map Brand, Model, and Cost Price columns');
      return;
    }

    if (!targetCompanyId) {
      toast.error('Please select a target company');
      return;
    }

    setIsValidating(true);
    const results: ValidationResult[] = [];

    // Get existing IMEIs for duplicate check
    const existingImeis = new Set<string>();
    if (mapping.imei) {
      const { data: devices } = await supabase
        .from('devices')
        .select('imei')
        .eq('company_id', targetCompanyId)
        .not('imei', 'is', null);
      
      devices?.forEach(d => {
        if (d.imei) existingImeis.add(d.imei.toLowerCase());
      });
    }

    // Check for duplicates within the file
    const fileImeis = new Map<string, number>();

    for (let i = 0; i < excelData.length; i++) {
      const row = excelData[i];
      const errors: string[] = [];
      const warnings: string[] = [];

      // Required field validation
      const brand = mapping.brand ? String(row[mapping.brand] || '').trim() : '';
      const model = mapping.model ? String(row[mapping.model] || '').trim() : '';
      const costPrice = mapping.cost_price ? String(row[mapping.cost_price] || '') : '';

      if (!brand) errors.push('Brand is required');
      if (!model) errors.push('Model is required');
      if (!costPrice || isNaN(parseFloat(costPrice))) errors.push('Valid cost price is required');

      // IMEI validation
      if (mapping.imei) {
        const imei = String(row[mapping.imei] || '').trim().toLowerCase();
        if (imei) {
          // Check if duplicate in database
          if (existingImeis.has(imei)) {
            if (updateExisting) {
              warnings.push('IMEI exists - will update');
            } else {
              errors.push('Duplicate IMEI in database');
            }
          }
          // Check if duplicate in file
          if (fileImeis.has(imei)) {
            warnings.push(`Duplicate IMEI with row ${fileImeis.get(imei)}`);
          }
          fileImeis.set(imei, i + 1);
        }
      }

      // Category validation
      if (mapping.category) {
        const category = String(row[mapping.category] || '').toLowerCase();
        if (category && !CATEGORIES.includes(category)) {
          warnings.push(`Unknown category "${category}" - will default to "phone"`);
        }
      }

      results.push({
        row: i + 1,
        valid: errors.length === 0,
        errors,
        warnings,
        data: row,
      });
    }

    setValidationResults(results);
    setStep('validate');
    setIsValidating(false);
  };

  const parseCondition = (value: string | null): 'new' | 'refurbished' | 'used' | 'damaged' => {
    if (!value) return 'new';
    const lower = value.toString().toLowerCase();
    if (lower.includes('refurb')) return 'refurbished';
    if (lower.includes('used')) return 'used';
    if (lower.includes('damage')) return 'damaged';
    return 'new';
  };

  const parseCategory = (value: string | null): string => {
    if (!value) return 'phone';
    const lower = value.toString().toLowerCase();
    if (CATEGORIES.includes(lower)) return lower;
    return 'phone';
  };

  const handleImport = async () => {
    const validRows = validationResults.filter(r => r.valid);
    if (validRows.length === 0) {
      toast.error('No valid rows to import');
      return;
    }

    setIsImporting(true);
    setStep('results');
    const results: ImportResult[] = [];

    // Create import batch
    const { data: batchData } = await supabase
      .from('import_batches')
      .insert({
        file_name: file?.name || 'unknown',
        total_rows: validRows.length,
        imported_by: user?.id,
      })
      .select()
      .single();

    for (const validation of validRows) {
      const row = validation.data;
      try {
        const deviceData = {
          imei: mapping.imei ? String(row[mapping.imei] || '').trim() || null : null,
          sku: mapping.sku ? String(row[mapping.sku] || '').trim() || null : null,
          category: parseCategory(mapping.category ? String(row[mapping.category] || '') : null),
          brand: String(row[mapping.brand] || '').trim(),
          model: String(row[mapping.model] || '').trim(),
          storage: mapping.storage ? String(row[mapping.storage] || '').trim() || null : null,
          color: mapping.color ? String(row[mapping.color] || '').trim() || null : null,
          condition: parseCondition(mapping.condition ? String(row[mapping.condition] || '') : null),
          cost_price: parseFloat(String(row[mapping.cost_price] || '0')),
          sale_price: mapping.sale_price && row[mapping.sale_price] ? parseFloat(String(row[mapping.sale_price])) : null,
          warehouse_location: mapping.warehouse_location ? String(row[mapping.warehouse_location] || '').trim() || null : null,
          notes: mapping.notes ? String(row[mapping.notes] || '').trim() || null : null,
          purchase_date: mapping.purchase_date && row[mapping.purchase_date]
            ? new Date(row[mapping.purchase_date] as string).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
          company_id: targetCompanyId,
          created_by: user?.id,
          status: 'in_stock' as const,
        };

        // Check if we should update existing
        if (updateExisting && deviceData.imei) {
          const { data: existing } = await supabase
            .from('devices')
            .select('id')
            .eq('imei', deviceData.imei)
            .eq('company_id', targetCompanyId)
            .maybeSingle();

          if (existing) {
            const { error } = await supabase
              .from('devices')
              .update(deviceData)
              .eq('id', existing.id);

            if (error) throw error;
            results.push({ success: true, row: validation.row, message: 'Updated', data: row });
            continue;
          }
        }

        const { error } = await supabase.from('devices').insert(deviceData);
        if (error) throw error;

        results.push({ success: true, row: validation.row, message: 'Imported', data: row });
      } catch (error: any) {
        results.push({ success: false, row: validation.row, message: error.message || 'Error', data: row });
      }
    }

    // Update batch
    if (batchData) {
      await supabase
        .from('import_batches')
        .update({
          successful_rows: results.filter(r => r.success).length,
          failed_rows: results.filter(r => !r.success).length,
        })
        .eq('id', batchData.id);
    }

    setImportResults(results);
    setIsImporting(false);

    const successCount = results.filter(r => r.success).length;
    toast.success(`Imported ${successCount} of ${results.length} devices`);
  };

  const downloadTemplate = () => {
    const template = [
      {
        Company: 'VES',
        Category: 'phone',
        Brand: 'Apple',
        Model: 'iPhone 15 Pro',
        IMEI: '123456789012345',
        SKU: 'IP15P-256-BLK',
        Storage: '256GB',
        Color: 'Space Black',
        Condition: 'new',
        Cost_Price: 800,
        Sale_Price: 999,
        Supplier: 'Supplier Name',
        Purchase_Date: '2024-01-15',
        Warehouse_Location: 'Warehouse A',
        Notes: 'Sample notes',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'inventory_import_template.xlsx');
  };

  const resetImport = () => {
    setFile(null);
    setExcelData([]);
    setColumns([]);
    setMapping({
      imei: '', sku: '', category: '', brand: '', model: '', storage: '',
      color: '', condition: '', cost_price: '', sale_price: '',
      supplier: '', purchase_date: '', warehouse_location: '', notes: '',
    });
    setValidationResults([]);
    setImportResults([]);
    setStep('upload');
  };

  const fieldLabels: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
    { key: 'brand', label: 'Brand', required: true },
    { key: 'model', label: 'Model', required: true },
    { key: 'cost_price', label: 'Cost Price', required: true },
    { key: 'imei', label: 'IMEI/Serial Number' },
    { key: 'sku', label: 'SKU/Product Code' },
    { key: 'category', label: 'Category' },
    { key: 'storage', label: 'Storage' },
    { key: 'color', label: 'Color' },
    { key: 'condition', label: 'Condition' },
    { key: 'sale_price', label: 'Sale Price' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'purchase_date', label: 'Purchase Date' },
    { key: 'warehouse_location', label: 'Warehouse Location' },
    { key: 'notes', label: 'Notes' },
  ];

  const validCount = validationResults.filter(r => r.valid).length;
  const errorCount = validationResults.filter(r => !r.valid).length;
  const warningCount = validationResults.filter(r => r.warnings.length > 0).length;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Import Devices</h1>
          <p className="text-muted-foreground">Upload an Excel file to bulk import devices</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm">
          {['upload', 'map', 'validate', 'preview', 'results'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === s ? 'bg-primary text-primary-foreground' :
                ['upload', 'map', 'validate', 'preview', 'results'].indexOf(step) > i 
                  ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {i + 1}
              </div>
              {i < 4 && <div className="w-8 h-0.5 bg-muted" />}
            </div>
          ))}
        </div>

        {step === 'upload' && (
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Excel File
                </CardTitle>
                <CardDescription>
                  Upload an Excel file containing your device inventory
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                  <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <Label htmlFor="file-upload" className="cursor-pointer">
                    <span className="text-primary hover:underline">Click to upload</span>
                    <span className="text-muted-foreground"> or drag and drop</span>
                  </Label>
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    Supports .xlsx, .xls, and .csv files
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Download Template
                </CardTitle>
                <CardDescription>
                  Download a template to ensure correct formatting
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Required fields:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>Brand (e.g., Apple, Samsung)</li>
                  <li>Model (e.g., iPhone 15 Pro)</li>
                  <li>Cost Price (purchase price)</li>
                </ul>
                <Button onClick={downloadTemplate} variant="outline" className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {step === 'map' && (
          <Card>
            <CardHeader>
              <CardTitle>Map Columns & Settings</CardTitle>
              <CardDescription>Match your columns and configure import settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Company Selection */}
              <div className="p-4 rounded-lg border bg-muted/30 space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <Label className="text-base font-medium">Import Settings</Label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Target Company *</Label>
                    <Select value={targetCompanyId} onValueChange={setTargetCompanyId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select company" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.code} - {c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2 pt-6">
                    <Checkbox 
                      id="update-existing" 
                      checked={updateExisting}
                      onCheckedChange={(checked) => setUpdateExisting(checked as boolean)}
                    />
                    <Label htmlFor="update-existing" className="text-sm">
                      Update existing devices (match by IMEI)
                    </Label>
                  </div>
                </div>
              </div>

              {/* Column Mapping */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {fieldLabels.map(({ key, label, required }) => (
                  <div key={key} className="space-y-2">
                    <Label>
                      {label}
                      {required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <Select
                      value={mapping[key]}
                      onValueChange={(value) => setMapping({ ...mapping, [key]: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">-- None --</SelectItem>
                        {columns.map((col) => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="flex gap-4">
                <Button variant="outline" onClick={resetImport}>Cancel</Button>
                <Button onClick={validateData} disabled={isValidating}>
                  {isValidating ? 'Validating...' : 'Validate Data'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'validate' && (
          <Card>
            <CardHeader>
              <CardTitle>Validation Results</CardTitle>
              <CardDescription>Review issues before importing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary */}
              <div className="flex flex-wrap gap-4">
                <Badge variant="outline" className="text-emerald-600 border-emerald-500 px-3 py-1">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {validCount} Valid
                </Badge>
                {errorCount > 0 && (
                  <Badge variant="outline" className="text-red-600 border-red-500 px-3 py-1">
                    <XCircle className="h-4 w-4 mr-1" />
                    {errorCount} Errors
                  </Badge>
                )}
                {warningCount > 0 && (
                  <Badge variant="outline" className="text-amber-600 border-amber-500 px-3 py-1">
                    <AlertTriangle className="h-4 w-4 mr-1" />
                    {warningCount} Warnings
                  </Badge>
                )}
              </div>

              {errorCount > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Validation Errors</AlertTitle>
                  <AlertDescription>
                    {errorCount} row(s) have errors and will be skipped during import.
                  </AlertDescription>
                </Alert>
              )}

              {/* Issues Table */}
              {validationResults.filter(r => !r.valid || r.warnings.length > 0).length > 0 && (
                <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead>Device</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validationResults
                        .filter(r => !r.valid || r.warnings.length > 0)
                        .slice(0, 20)
                        .map((result) => (
                          <TableRow key={result.row}>
                            <TableCell>{result.row}</TableCell>
                            <TableCell>
                              {mapping.brand && result.data[mapping.brand]} {mapping.model && result.data[mapping.model]}
                            </TableCell>
                            <TableCell>
                              {result.valid ? (
                                <Badge variant="outline" className="text-amber-600">Warning</Badge>
                              ) : (
                                <Badge variant="destructive">Error</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {[...result.errors, ...result.warnings].join(', ')}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex gap-4">
                <Button variant="outline" onClick={() => setStep('map')}>Back to Mapping</Button>
                <Button onClick={() => setStep('preview')} disabled={validCount === 0}>
                  Preview Import ({validCount} items)
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'preview' && (
          <Card>
            <CardHeader>
              <CardTitle>Preview Import</CardTitle>
              <CardDescription>
                Review the first 10 valid rows. Total: {validCount} devices will be imported.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>IMEI/SKU</TableHead>
                      <TableHead>Storage</TableHead>
                      <TableHead>Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationResults.filter(r => r.valid).slice(0, 10).map((result) => {
                      const row = result.data;
                      return (
                        <TableRow key={result.row}>
                          <TableCell>{mapping.brand ? String(row[mapping.brand] || '-') : '-'}</TableCell>
                          <TableCell>{mapping.model ? String(row[mapping.model] || '-') : '-'}</TableCell>
                          <TableCell className="capitalize">
                            {mapping.category ? String(row[mapping.category] || 'phone') : 'phone'}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {mapping.imei ? String(row[mapping.imei] || '-') : (mapping.sku ? String(row[mapping.sku] || '-') : '-')}
                          </TableCell>
                          <TableCell>{mapping.storage ? String(row[mapping.storage] || '-') : '-'}</TableCell>
                          <TableCell>${row[mapping.cost_price]}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex gap-4 mt-6">
                <Button variant="outline" onClick={() => setStep('validate')}>Back</Button>
                <Button onClick={handleImport} disabled={isImporting}>
                  {isImporting ? 'Importing...' : `Import ${validCount} Devices`}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'results' && (
          <Card>
            <CardHeader>
              <CardTitle>Import Results</CardTitle>
              <CardDescription>
                {importResults.filter(r => r.success).length} of {importResults.length} imported successfully
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isImporting ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                    <p className="text-muted-foreground">Importing devices...</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-4 mb-4">
                    <Badge variant="outline" className="text-emerald-600 border-emerald-500 px-3 py-1">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      {importResults.filter(r => r.success).length} Imported
                    </Badge>
                    {importResults.filter(r => !r.success).length > 0 && (
                      <Badge variant="outline" className="text-red-600 border-red-500 px-3 py-1">
                        <XCircle className="h-4 w-4 mr-1" />
                        {importResults.filter(r => !r.success).length} Failed
                      </Badge>
                    )}
                  </div>

                  {importResults.filter(r => !r.success).length > 0 && (
                    <div className="border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto mb-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Row</TableHead>
                            <TableHead>Error</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importResults.filter(r => !r.success).map((result) => (
                            <TableRow key={result.row}>
                              <TableCell>{result.row}</TableCell>
                              <TableCell className="text-sm text-red-600">{result.message}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <Button onClick={resetImport}>Import Another File</Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
