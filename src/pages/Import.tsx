import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useToast } from '@/hooks/use-toast';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Download } from 'lucide-react';

interface ExcelRow {
  [key: string]: string | number | null;
}

interface ColumnMapping {
  imei: string;
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

interface ImportResult {
  success: boolean;
  row: number;
  message: string;
  data?: ExcelRow;
}

export default function Import() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<ExcelRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    imei: '',
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
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'results'>('upload');

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
          toast({
            title: 'Empty file',
            description: 'The uploaded file contains no data.',
            variant: 'destructive',
          });
          return;
        }

        const cols = Object.keys(data[0]);
        setColumns(cols);
        setExcelData(data);
        setStep('map');

        // Auto-map columns with similar names
        const autoMapping: ColumnMapping = { ...mapping };
        cols.forEach((col) => {
          const lowerCol = col.toLowerCase();
          if (lowerCol.includes('imei')) autoMapping.imei = col;
          else if (lowerCol.includes('brand') || lowerCol.includes('make')) autoMapping.brand = col;
          else if (lowerCol.includes('model')) autoMapping.model = col;
          else if (lowerCol.includes('storage') || lowerCol.includes('capacity')) autoMapping.storage = col;
          else if (lowerCol.includes('color') || lowerCol.includes('colour')) autoMapping.color = col;
          else if (lowerCol.includes('condition')) autoMapping.condition = col;
          else if (lowerCol.includes('cost') || lowerCol.includes('purchase')) autoMapping.cost_price = col;
          else if (lowerCol.includes('sale') || lowerCol.includes('sell')) autoMapping.sale_price = col;
          else if (lowerCol.includes('supplier') || lowerCol.includes('vendor')) autoMapping.supplier = col;
          else if (lowerCol.includes('date')) autoMapping.purchase_date = col;
          else if (lowerCol.includes('location') || lowerCol.includes('warehouse')) autoMapping.warehouse_location = col;
          else if (lowerCol.includes('note')) autoMapping.notes = col;
        });
        setMapping(autoMapping);
      } catch (error) {
        console.error('Error parsing file:', error);
        toast({
          title: 'Error parsing file',
          description: 'Could not parse the uploaded file. Please ensure it is a valid Excel file.',
          variant: 'destructive',
        });
      }
    };

    reader.readAsBinaryString(uploadedFile);
  }, [toast, mapping]);

  const parseCondition = (value: string | null): 'new' | 'refurbished' | 'used' | 'damaged' => {
    if (!value) return 'new';
    const lower = value.toString().toLowerCase();
    if (lower.includes('refurb')) return 'refurbished';
    if (lower.includes('used')) return 'used';
    if (lower.includes('damage')) return 'damaged';
    return 'new';
  };

  const handleImport = async () => {
    if (!mapping.brand || !mapping.model || !mapping.cost_price) {
      toast({
        title: 'Required fields missing',
        description: 'Please map Brand, Model, and Cost Price columns.',
        variant: 'destructive',
      });
      return;
    }

    setIsImporting(true);
    setStep('results');
    const results: ImportResult[] = [];

    // Create import batch record
    const { data: batchData, error: batchError } = await supabase
      .from('import_batches')
      .insert({
        file_name: file?.name || 'unknown',
        total_rows: excelData.length,
        imported_by: user?.id,
      })
      .select()
      .single();

    if (batchError) {
      console.error('Error creating batch:', batchError);
    }

    for (let i = 0; i < excelData.length; i++) {
      const row = excelData[i];
      try {
        const deviceData = {
          imei: mapping.imei ? String(row[mapping.imei] || '') : null,
          brand: String(row[mapping.brand] || ''),
          model: String(row[mapping.model] || ''),
          storage: mapping.storage ? String(row[mapping.storage] || '') : null,
          color: mapping.color ? String(row[mapping.color] || '') : null,
          condition: parseCondition(mapping.condition ? String(row[mapping.condition] || '') : null),
          cost_price: parseFloat(String(row[mapping.cost_price] || '0')),
          sale_price: mapping.sale_price && row[mapping.sale_price] ? parseFloat(String(row[mapping.sale_price])) : null,
          warehouse_location: mapping.warehouse_location ? String(row[mapping.warehouse_location] || '') : null,
          notes: mapping.notes ? String(row[mapping.notes] || '') : null,
          purchase_date: mapping.purchase_date && row[mapping.purchase_date] 
            ? new Date(row[mapping.purchase_date] as string).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
          created_by: user?.id,
          status: 'in_stock' as const,
        };

        if (!deviceData.brand || !deviceData.model || isNaN(deviceData.cost_price)) {
          throw new Error('Missing required fields');
        }

        const { error } = await supabase.from('devices').insert(deviceData);
        
        if (error) throw error;

        results.push({
          success: true,
          row: i + 1,
          message: 'Imported successfully',
          data: row,
        });
      } catch (error: any) {
        results.push({
          success: false,
          row: i + 1,
          message: error.message || 'Unknown error',
          data: row,
        });
      }
    }

    // Update batch with results
    if (batchData) {
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      await supabase
        .from('import_batches')
        .update({
          successful_rows: successCount,
          failed_rows: failCount,
        })
        .eq('id', batchData.id);
    }

    setImportResults(results);
    setIsImporting(false);

    const successCount = results.filter(r => r.success).length;
    toast({
      title: 'Import complete',
      description: `Successfully imported ${successCount} of ${results.length} devices.`,
    });
  };

  const downloadTemplate = () => {
    const template = [
      {
        IMEI: '123456789012345',
        Brand: 'Apple',
        Model: 'iPhone 15 Pro',
        Storage: '256GB',
        Color: 'Space Black',
        Condition: 'new',
        Cost_Price: 800,
        Sale_Price: 999,
        Supplier: 'Supplier Name',
        Purchase_Date: '2024-01-15',
        Warehouse_Location: 'Warehouse A, Shelf 1',
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
      imei: '',
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
    setImportResults([]);
    setStep('upload');
  };

  const fieldLabels: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
    { key: 'brand', label: 'Brand', required: true },
    { key: 'model', label: 'Model', required: true },
    { key: 'cost_price', label: 'Cost Price', required: true },
    { key: 'imei', label: 'IMEI' },
    { key: 'storage', label: 'Storage' },
    { key: 'color', label: 'Color' },
    { key: 'condition', label: 'Condition' },
    { key: 'sale_price', label: 'Sale Price' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'purchase_date', label: 'Purchase Date' },
    { key: 'warehouse_location', label: 'Warehouse Location' },
    { key: 'notes', label: 'Notes' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Import Devices</h1>
          <p className="text-muted-foreground">Upload an Excel file to bulk import devices</p>
        </div>

        {step === 'upload' && (
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Excel File
                </CardTitle>
                <CardDescription>
                  Upload an Excel file (.xlsx, .xls) containing your device inventory
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                  <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <div className="space-y-2">
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
                    <p className="text-sm text-muted-foreground">
                      Supports .xlsx, .xls, and .csv files
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Download Template
                </CardTitle>
                <CardDescription>
                  Download a sample template to ensure your data is formatted correctly
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    The template includes all supported columns with sample data. Required fields are:
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                    <li>Brand (e.g., Apple, Samsung)</li>
                    <li>Model (e.g., iPhone 15 Pro)</li>
                    <li>Cost Price (purchase price in USD)</li>
                  </ul>
                  <Button onClick={downloadTemplate} variant="outline" className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Download Template
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {step === 'map' && (
          <Card>
            <CardHeader>
              <CardTitle>Map Columns</CardTitle>
              <CardDescription>
                Match your Excel columns to the device fields. Required fields are marked with *.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="flex gap-4 mt-6">
                <Button variant="outline" onClick={resetImport}>
                  Cancel
                </Button>
                <Button onClick={() => setStep('preview')}>
                  Preview Import
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
                Review the first 5 rows before importing. Total rows: {excelData.length}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>IMEI</TableHead>
                      <TableHead>Storage</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {excelData.slice(0, 5).map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{mapping.brand ? String(row[mapping.brand] || '-') : '-'}</TableCell>
                        <TableCell>{mapping.model ? String(row[mapping.model] || '-') : '-'}</TableCell>
                        <TableCell>{mapping.imei ? String(row[mapping.imei] || '-') : '-'}</TableCell>
                        <TableCell>{mapping.storage ? String(row[mapping.storage] || '-') : '-'}</TableCell>
                        <TableCell>{mapping.color ? String(row[mapping.color] || '-') : '-'}</TableCell>
                        <TableCell>{mapping.cost_price ? `$${row[mapping.cost_price]}` : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex gap-4 mt-6">
                <Button variant="outline" onClick={() => setStep('map')}>
                  Back to Mapping
                </Button>
                <Button onClick={handleImport} disabled={isImporting}>
                  {isImporting ? 'Importing...' : `Import ${excelData.length} Devices`}
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
                {importResults.filter(r => r.success).length} of {importResults.length} devices imported successfully
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isImporting ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
                  <p className="text-muted-foreground">Importing devices...</p>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-3 mb-6">
                    <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-success" />
                        <span className="font-medium">Successful</span>
                      </div>
                      <p className="text-2xl font-bold mt-2">
                        {importResults.filter(r => r.success).length}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-destructive" />
                        <span className="font-medium">Failed</span>
                      </div>
                      <p className="text-2xl font-bold mt-2">
                        {importResults.filter(r => !r.success).length}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted border border-border">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium">Total</span>
                      </div>
                      <p className="text-2xl font-bold mt-2">{importResults.length}</p>
                    </div>
                  </div>

                  {importResults.filter(r => !r.success).length > 0 && (
                    <div className="mb-6">
                      <h4 className="font-medium mb-2">Failed Rows</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {importResults
                          .filter(r => !r.success)
                          .map((result) => (
                            <div
                              key={result.row}
                              className="flex items-center gap-2 p-2 rounded bg-destructive/10 text-sm"
                            >
                              <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                              <span>Row {result.row}: {result.message}</span>
                            </div>
                          ))}
                      </div>
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
