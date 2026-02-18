import { useState, useCallback, useEffect } from 'react';
import { ImportGuide } from '@/components/guides/ImportGuide';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { 
  Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, 
  Download, AlertTriangle, Building2, Info, ChevronDown, ChevronUp, DollarSign
} from 'lucide-react';
import { createPurchaseOrder, createGoodsReceivedNote } from '@/lib/import/automatedImport';
import { createPurchaseJournalEntry } from '@/lib/accounting/journalAutomation';

interface ExcelRow {
  [key: string]: string | number | null;
}

interface ColumnMapping {
  company: string;
  category: string;
  brand: string;
  model: string;
  imei: string;
  storage: string;
  color: string;
  cost_price: string;
  notes: string;
  supplier_id_code: string;
  supplier_invoice_number: string;
  purchase_date: string;
  tax_status: string;
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

interface SupplierInfo {
  id: string;
  supplier_code: string;
  name: string;
}

const CATEGORIES = ['phone', 'laptop', 'tablet', 'accessory', 'smartwatch', 'other'];
const VALID_TAX_STATUSES = ['Tax Included', 'Zero-Rated', 'GST Paid', 'HST Paid'];
const TAX_STATUS_DB_MAP: Record<string, string> = {
  'Tax Included': 'tax_included',
  'Zero-Rated': 'zero_rated',
  'GST Paid': 'gst_paid',
  'HST Paid': 'hst_paid',
};

const KNOWN_BRANDS = [
  'Apple', 'Samsung', 'Google', 'OnePlus', 'Xiaomi', 'Huawei', 'Sony', 'LG',
  'Motorola', 'Nokia', 'Asus', 'Lenovo', 'Dell', 'HP', 'Microsoft', 'Acer',
  'Razer', 'Nothing', 'Oppo', 'Vivo', 'Realme', 'TCL', 'ZTE', 'BlackBerry',
];

function generateSKU(brand: string, model: string, storage: string | null, sequence: number): string {
  const brandAbbr = brand.substring(0, 3).toUpperCase();
  const modelWords = model.split(/\s+/);
  const modelAbbr = modelWords.map(w => {
    if (/^\d+$/.test(w)) return w;
    return w.substring(0, 2).toUpperCase();
  }).join('').substring(0, 8);
  const storagePart = storage ? `-${storage.replace(/\s/g, '')}` : '';
  return `${brandAbbr}-${modelAbbr}${storagePart}-${String(sequence).padStart(3, '0')}`;
}

export default function Import() {
  const { user } = useAuth();
  const { selectedCompany, companies } = useCompany();
  const [file, setFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<ExcelRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierInfo[]>([]);
  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping>({
    company: '',
    category: '',
    brand: '',
    model: '',
    imei: '',
    storage: '',
    color: '',
    cost_price: '',
    notes: '',
    supplier_id_code: '',
    supplier_invoice_number: '',
    purchase_date: '',
    tax_status: '',
  });
  const [isImporting, setIsImporting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [step, setStep] = useState<'upload' | 'map' | 'validate' | 'preview' | 'results' | 'review'>('upload');

  // Review screen state
  const [batchId, setBatchId] = useState<string | null>(null);
  const [shippingCost, setShippingCost] = useState('0');
  const [otherCharges, setOtherCharges] = useState('0');
  const [reviewInvoiceNumber, setReviewInvoiceNumber] = useState('');
  const [isFinalizingAP, setIsFinalizingAP] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<{
    apId: string;
    poNumber: string;
    grnNumber: string;
    invoiceTotal: number;
    supplierName: string;
  } | null>(null);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    const { data } = await supabase
      .from('suppliers')
      .select('id, supplier_code, name')
      .order('supplier_code');
    if (data) setSuppliers(data);
  };

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
          const lowerCol = col.toLowerCase().replace(/[_\s-]/g, '');
          if (lowerCol.includes('imei') || lowerCol.includes('serial') || lowerCol.includes('uniqueid')) autoMapping.imei = col;
          else if (lowerCol === 'company' || lowerCol.includes('company')) autoMapping.company = col;
          else if (lowerCol.includes('category') || lowerCol.includes('type')) autoMapping.category = col;
          else if (lowerCol.includes('brand') || lowerCol.includes('make')) autoMapping.brand = col;
          else if (lowerCol.includes('model')) autoMapping.model = col;
          else if (lowerCol.includes('storage') || lowerCol.includes('capacity')) autoMapping.storage = col;
          else if (lowerCol.includes('color') || lowerCol.includes('colour')) autoMapping.color = col;
          else if (lowerCol.includes('costprice') || lowerCol.includes('cost') || lowerCol.includes('purchaseprice')) autoMapping.cost_price = col;
          else if (lowerCol.includes('supplierid') || lowerCol === 'supplierid') autoMapping.supplier_id_code = col;
          else if (lowerCol.includes('supplierinvoice') || lowerCol.includes('invoicenumber')) autoMapping.supplier_invoice_number = col;
          else if (lowerCol.includes('taxstatus') || lowerCol.includes('tax')) autoMapping.tax_status = col;
          else if (lowerCol.includes('date') || lowerCol.includes('purchasedate')) autoMapping.purchase_date = col;
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
    if (!mapping.brand || !mapping.model || !mapping.cost_price || !mapping.imei) {
      toast.error('Please map Brand, Model, Cost Price, and IMEI/Serial columns');
      return;
    }

    setIsValidating(true);
    const results: ValidationResult[] = [];

    // Get existing IMEIs for duplicate check
    const existingImeis = new Set<string>();
    const { data: devices } = await supabase
      .from('devices')
      .select('imei')
      .not('imei', 'is', null);
    devices?.forEach(d => {
      if (d.imei) existingImeis.add(d.imei);
    });

    // Build supplier code lookup
    const supplierCodeMap = new Map(suppliers.map(s => [s.supplier_code, s]));

    // Check for duplicates within the file
    const fileImeis = new Map<string, number>();

    for (let i = 0; i < excelData.length; i++) {
      const row = excelData[i];
      const errors: string[] = [];
      const warnings: string[] = [];

      // Required fields
      const brand = mapping.brand ? String(row[mapping.brand] || '').trim() : '';
      const model = mapping.model ? String(row[mapping.model] || '').trim() : '';
      const costPrice = mapping.cost_price ? String(row[mapping.cost_price] || '') : '';
      const imei = mapping.imei ? String(row[mapping.imei] || '').trim() : '';

      if (!brand) errors.push('Brand is required');
      if (!model) errors.push('Model is required');
      if (!costPrice || isNaN(parseFloat(costPrice))) errors.push('Valid cost price is required');
      if (!imei) errors.push('IMEI/Serial/Unique ID is required');

      // Company validation
      if (mapping.company) {
        const company = String(row[mapping.company] || '').trim().toUpperCase();
        if (company && company !== 'VES' && company !== 'TGW') {
          errors.push('Company must be exactly "VES" or "TGW"');
        }
      }

      // Brand casing validation
      if (brand) {
        const knownBrand = KNOWN_BRANDS.find(b => b.toLowerCase() === brand.toLowerCase());
        if (knownBrand && knownBrand !== brand) {
          errors.push(`Brand should be "${knownBrand}" (case-sensitive)`);
        }
      }

      // IMEI uniqueness
      if (imei) {
        if (existingImeis.has(imei)) {
          if (updateExisting) {
            warnings.push('IMEI exists — will update');
          } else {
            errors.push('Duplicate IMEI/Serial in database');
          }
        }
        if (fileImeis.has(imei)) {
          errors.push(`Duplicate IMEI/Serial with row ${fileImeis.get(imei)}`);
        }
        fileImeis.set(imei, i + 1);
      }

      // Supplier ID validation
      if (mapping.supplier_id_code) {
        const supplierCode = String(row[mapping.supplier_id_code] || '').trim().replace(/^S-/i, '').padStart(3, '0');
        if (supplierCode && supplierCode !== '000') {
          if (!supplierCodeMap.has(supplierCode)) {
            errors.push(`Supplier ID "${supplierCode}" not found. Check the Suppliers section.`);
          }
        } else if (!supplierCode || supplierCode === '000') {
          errors.push('Supplier ID is required');
        }
      } else {
        errors.push('Supplier ID column must be mapped');
      }

      // Tax Status validation
      if (mapping.tax_status) {
        const taxStatus = String(row[mapping.tax_status] || '').trim();
        if (taxStatus && !VALID_TAX_STATUSES.includes(taxStatus)) {
          errors.push(`Tax Status must be one of: ${VALID_TAX_STATUSES.join(', ')}`);
        }
      }

      // Category validation
      if (mapping.category) {
        const category = String(row[mapping.category] || '').toLowerCase();
        if (category && !CATEGORIES.includes(category)) {
          warnings.push(`Unknown category "${category}" — will default to "phone"`);
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

    // Determine company from first row
    let targetCompanyId = selectedCompany?.id || '';
    if (mapping.company && validRows[0]) {
      const companyCode = String(validRows[0].data[mapping.company] || '').trim().toUpperCase();
      const matchedCompany = companies.find(c => c.code === companyCode);
      if (matchedCompany) targetCompanyId = matchedCompany.id;
    }

    // Determine supplier from first row
    let batchSupplierId: string | null = null;
    let batchInvoiceNumber = '';
    if (mapping.supplier_id_code && validRows[0]) {
      const code = String(validRows[0].data[mapping.supplier_id_code] || '').trim().replace(/^S-/i, '').padStart(3, '0');
      const supplier = suppliers.find(s => s.supplier_code === code);
      if (supplier) batchSupplierId = supplier.id;
    }
    if (mapping.supplier_invoice_number && validRows[0]) {
      batchInvoiceNumber = String(validRows[0].data[mapping.supplier_invoice_number] || '').trim();
    }

    // Create import batch
    const { data: batchData } = await supabase
      .from('import_batches')
      .insert({
        file_name: file?.name || 'unknown',
        total_rows: validRows.length,
        imported_by: user?.id,
        company_id: targetCompanyId,
        supplier_id: batchSupplierId,
        supplier_invoice_number: batchInvoiceNumber || null,
      })
      .select()
      .single();

    const currentBatchId = batchData?.id || null;
    setBatchId(currentBatchId);
    if (batchInvoiceNumber) setReviewInvoiceNumber(batchInvoiceNumber);

    // Get existing SKU count for sequence
    const { count: skuCount } = await supabase
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', targetCompanyId);
    let skuSequence = (skuCount || 0) + 1;

    const supplierCodeMap = new Map(suppliers.map(s => [s.supplier_code, s]));

    for (const validation of validRows) {
      const row = validation.data;
      try {
        const brand = String(row[mapping.brand] || '').trim();
        const model = String(row[mapping.model] || '').trim();
        const storage = mapping.storage ? String(row[mapping.storage] || '').trim() || null : null;
        const imei = mapping.imei ? String(row[mapping.imei] || '').trim() || null : null;

        // Resolve company per row
        let rowCompanyId = targetCompanyId;
        if (mapping.company) {
          const companyCode = String(row[mapping.company] || '').trim().toUpperCase();
          const matchedCompany = companies.find(c => c.code === companyCode);
          if (matchedCompany) rowCompanyId = matchedCompany.id;
        }

        // Resolve supplier per row
        let rowSupplierId: string | null = null;
        if (mapping.supplier_id_code) {
          const code = String(row[mapping.supplier_id_code] || '').trim().replace(/^S-/i, '').padStart(3, '0');
          const supplier = supplierCodeMap.get(code);
          if (supplier) rowSupplierId = supplier.id;
        }

        // Tax status
        let taxStatusDb: string | null = null;
        if (mapping.tax_status) {
          const ts = String(row[mapping.tax_status] || '').trim();
          if (ts && TAX_STATUS_DB_MAP[ts]) taxStatusDb = TAX_STATUS_DB_MAP[ts];
        }

        const autoSku = generateSKU(brand, model, storage, skuSequence);
        skuSequence++;

        const deviceData: any = {
          imei,
          sku: autoSku,
          category: parseCategory(mapping.category ? String(row[mapping.category] || '') : null),
          brand,
          model,
          storage,
          color: mapping.color ? String(row[mapping.color] || '').trim() || null : null,
          condition: 'new' as const,
          cost_price: parseFloat(String(row[mapping.cost_price] || '0')),
          notes: mapping.notes ? String(row[mapping.notes] || '').trim() || null : null,
          purchase_date: mapping.purchase_date && row[mapping.purchase_date]
            ? new Date(row[mapping.purchase_date] as string).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
          company_id: rowCompanyId,
          supplier_id: rowSupplierId,
          supplier_invoice_number: mapping.supplier_invoice_number ? String(row[mapping.supplier_invoice_number] || '').trim() || null : null,
          tax_status: taxStatusDb,
          import_batch_id: currentBatchId,
          created_by: user?.id,
          status: 'in_stock' as const,
        };

        // Check if we should update existing
        if (updateExisting && deviceData.imei) {
          const { data: existing } = await supabase
            .from('devices')
            .select('id')
            .eq('imei', deviceData.imei)
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
    if (currentBatchId) {
      await supabase
        .from('import_batches')
        .update({
          successful_rows: results.filter(r => r.success).length,
          failed_rows: results.filter(r => !r.success).length,
        })
        .eq('id', currentBatchId);
    }

    setImportResults(results);
    setIsImporting(false);

    const successCount = results.filter(r => r.success).length;
    toast.success(`Imported ${successCount} of ${results.length} devices`);

    // Auto-advance to review if there are successful imports
    if (successCount > 0) {
      setStep('review');
    }
  };

  const getImportedSummary = () => {
    const successfulRows = importResults.filter(r => r.success);
    const subtotal = successfulRows.reduce((sum, r) => {
      const cost = mapping.cost_price && r.data ? parseFloat(String(r.data[mapping.cost_price] || '0')) : 0;
      return sum + cost;
    }, 0);

    // Group by supplier
    const supplierGroups = new Map<string, { name: string; count: number; subtotal: number; id: string | null }>();
    for (const r of successfulRows) {
      if (!r.data) continue;
      const code = mapping.supplier_id_code
        ? String(r.data[mapping.supplier_id_code] || '').trim().replace(/^S-/i, '').padStart(3, '0')
        : '000';
      const supplier = suppliers.find(s => s.supplier_code === code);
      const name = supplier?.name || 'Unknown';
      const existing = supplierGroups.get(code) || { name, count: 0, subtotal: 0, id: supplier?.id || null };
      existing.count++;
      existing.subtotal += mapping.cost_price ? parseFloat(String(r.data[mapping.cost_price] || '0')) : 0;
      supplierGroups.set(code, existing);
    }

    // Tax breakdown
    let taxIncludedCount = 0, zeroRatedCount = 0, gstPaidCount = 0, hstPaidCount = 0;
    let estimatedTax = 0;
    for (const r of successfulRows) {
      if (!r.data || !mapping.tax_status) continue;
      const ts = String(r.data[mapping.tax_status] || '').trim();
      const cost = mapping.cost_price ? parseFloat(String(r.data[mapping.cost_price] || '0')) : 0;
      if (ts === 'Tax Included') taxIncludedCount++;
      else if (ts === 'Zero-Rated') { zeroRatedCount++; estimatedTax += cost * 0.05; }
      else if (ts === 'GST Paid') { gstPaidCount++; estimatedTax += cost * 0.05; }
      else if (ts === 'HST Paid') { hstPaidCount++; estimatedTax += cost * 0.13; }
    }

    return { subtotal, supplierGroups, taxIncludedCount, zeroRatedCount, gstPaidCount, hstPaidCount, totalItems: successfulRows.length, estimatedTax };
  };


  const handleFinalizeAP = async () => {
    if (!batchId) return;
    setIsFinalizingAP(true);
    setFinalizeResult(null);

    try {
      const summary = getImportedSummary();
      const shipping = parseFloat(shippingCost) || 0;
      const other = parseFloat(otherCharges) || 0;
      const estimatedGstHst = summary.estimatedTax;
      const invoiceTotal = summary.subtotal + estimatedGstHst + shipping + other;

      // Update batch with charges and lock it
      await supabase
        .from('import_batches')
        .update({
          shipping_cost: shipping,
          other_charges: other,
          supplier_invoice_number: reviewInvoiceNumber || null,
          is_finalized: true,
        })
        .eq('id', batchId);

      // Get the batch info
      const { data: batchInfo } = await supabase
        .from('import_batches')
        .select('company_id, supplier_id')
        .eq('id', batchId)
        .single();

      if (!batchInfo?.company_id) throw new Error('No company linked to this batch');

      // Get supplier name
      let supplierName = 'Unknown Supplier';
      if (batchInfo.supplier_id) {
        const { data: supplierData } = await supabase
          .from('suppliers')
          .select('name')
          .eq('id', batchInfo.supplier_id)
          .single();
        if (supplierData) supplierName = supplierData.name;
      }

      // Create AP record
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const { data: apRecord, error: apError } = await supabase.from('accounts_payable').insert({
        company_id: batchInfo.company_id,
        vendor_name: supplierName,
        vendor_id: batchInfo.supplier_id,
        bill_number: reviewInvoiceNumber || null,
        bill_date: new Date().toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        original_amount: invoiceTotal,
        gst_hst_amount: estimatedGstHst,
        pst_amount: 0,
        category: 'inventory_purchase',
        description: `Inventory purchase — ${summary.totalItems} devices`,
        status: 'outstanding',
        created_by: user?.id,
      }).select('id').single();

      if (apError) throw apError;

      // Build device data for PO items with proper tax per item
      const successfulRows = importResults.filter(r => r.success);
      const poItems: Array<{
        description: string;
        quantity: number;
        unitCost: number;
        gstHstAmount: number;
        pstQstAmount: number;
      }> = [];

      for (const r of successfulRows) {
        if (!r.data) continue;
        const brand = mapping.brand ? String(r.data[mapping.brand] || '').trim() : '';
        const model = mapping.model ? String(r.data[mapping.model] || '').trim() : '';
        const cost = mapping.cost_price ? parseFloat(String(r.data[mapping.cost_price] || '0')) : 0;
        let itemGst = 0;
        if (mapping.tax_status) {
          const ts = String(r.data[mapping.tax_status] || '').trim();
          if (ts === 'Zero-Rated' || ts === 'GST Paid') itemGst = cost * 0.05;
          else if (ts === 'HST Paid') itemGst = cost * 0.13;
        }
        poItems.push({
          description: `${brand} ${model}`,
          quantity: 1,
          unitCost: cost,
          gstHstAmount: itemGst,
          pstQstAmount: 0,
        });
      }

      // Get company code
      const { data: company } = await supabase
        .from('companies')
        .select('code')
        .eq('id', batchInfo.company_id)
        .single();

      let poNumber = '';
      let grnNumber = '';

      if (company && poItems.length > 0) {
        const { purchaseOrder, poNumber: pn } = await createPurchaseOrder({
          companyId: batchInfo.company_id,
          supplierId: batchInfo.supplier_id || undefined,
          supplierName,
          items: poItems,
          createdBy: user?.id,
        });
        poNumber = pn;

        const { grnNumber: gn } = await createGoodsReceivedNote({
          companyId: batchInfo.company_id,
          purchaseOrderId: purchaseOrder.id,
          supplierId: batchInfo.supplier_id || undefined,
          items: poItems.map(() => ({
            quantityReceived: 1,
            conditionStatus: 'passed' as const,
          })),
          receivedBy: user?.id,
        });
        grnNumber = gn;
      }

      // Create journal entry: Dr. Inventory + Dr. GST/HST Paid → Cr. Accounts Payable
      const isVES = company?.code === 'VES';
      try {
        await createPurchaseJournalEntry({
          companyId: batchInfo.company_id,
          purchaseId: apRecord.id,
          receiveDate: new Date().toISOString().split('T')[0],
          supplierName,
          poNumber,
          unitCost: summary.subtotal + shipping + other,
          gstHstAmount: estimatedGstHst,
          qstAmount: 0,
          totalAmount: invoiceTotal,
          deviceDescription: `${summary.totalItems} devices (Batch import)`,
          isVES,
        });
      } catch (jeError) {
        console.error('Journal entry creation failed:', jeError);
      }

      setFinalizeResult({
        apId: apRecord.id,
        poNumber,
        grnNumber,
        invoiceTotal,
        supplierName,
      });

      toast.success('AP, Purchase Order, GRN, and Journal Entry created — batch locked!');
    } catch (error: any) {
      console.error('Finalize error:', error);
      toast.error(error.message || 'Failed to finalize');
    } finally {
      setIsFinalizingAP(false);
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        Company: 'VES',
        Category: 'phone',
        Brand: 'Apple',
        Model: 'iPhone 15 Pro Max',
        'IMEI/Serial/Unique ID': '123456789012345',
        Storage: '256GB',
        Colour: 'Space Black',
        'Cost Price': 800,
        Notes: '',
        'Supplier ID': '001',
        'Supplier Invoice Number': 'INV-2026-001',
        'Purchase Date': '2026-02-16',
        'Tax Status': 'Zero-Rated',
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
      company: '', category: '', brand: '', model: '', imei: '', storage: '',
      color: '', cost_price: '', notes: '',
      supplier_id_code: '', supplier_invoice_number: '', purchase_date: '', tax_status: '',
    });
    setValidationResults([]);
    setImportResults([]);
    setBatchId(null);
    setShippingCost('0');
    setOtherCharges('0');
    setReviewInvoiceNumber('');
    setFinalizeResult(null);
    setStep('upload');
  };

  const fieldLabels: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
    { key: 'company', label: 'Company (VES/TGW)', required: true },
    { key: 'brand', label: 'Brand', required: true },
    { key: 'model', label: 'Model', required: true },
    { key: 'cost_price', label: 'Cost Price', required: true },
    { key: 'imei', label: 'IMEI/Serial/Unique ID', required: true },
    { key: 'supplier_id_code', label: 'Supplier ID', required: true },
    { key: 'category', label: 'Category' },
    { key: 'storage', label: 'Storage' },
    { key: 'color', label: 'Colour' },
    { key: 'notes', label: 'Notes' },
    { key: 'supplier_invoice_number', label: 'Supplier Invoice Number' },
    { key: 'purchase_date', label: 'Purchase Date' },
    { key: 'tax_status', label: 'Tax Status' },
  ];

  const validCount = validationResults.filter(r => r.valid).length;
  const errorCount = validationResults.filter(r => !r.valid).length;
  const warningCount = validationResults.filter(r => r.warnings.length > 0).length;

  const stepLabels = ['Upload', 'Map', 'Validate', 'Preview', 'Import', 'Review'];
  const stepKeys = ['upload', 'map', 'validate', 'preview', 'results', 'review'];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Import Devices</h1>
          <p className="text-muted-foreground">Upload an Excel file to bulk import devices</p>
        </div>

        <ImportGuide />

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm">
          {stepLabels.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                step === stepKeys[i] ? 'bg-primary text-primary-foreground' :
                stepKeys.indexOf(step) > i 
                  ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {i + 1}
              </div>
              {i < stepLabels.length - 1 && <div className="w-6 h-0.5 bg-muted" />}
            </div>
          ))}
        </div>

        {step === 'upload' && (
          <>
            {/* Instructions Panel */}
            <Collapsible open={instructionsOpen} onOpenChange={setInstructionsOpen}>
              <Card className="border-primary/20">
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Info className="h-5 w-5 text-primary" />
                        Import Rules & Instructions
                      </CardTitle>
                      {instructionsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="grid gap-3 md:grid-cols-2 text-sm">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-primary">Case-Sensitive Rules</h4>
                        <ul className="space-y-1 text-muted-foreground">
                          <li>• Brand names must use exact casing (e.g., <strong>"Apple"</strong> not "apple" or "APPLE")</li>
                          <li>• Model names must use exact casing (e.g., <strong>"iPhone 12 Pro Max"</strong>)</li>
                          <li>• Company must be exactly <strong>"VES"</strong> or <strong>"TGW"</strong></li>
                        </ul>
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-semibold text-primary">Required Fields</h4>
                        <ul className="space-y-1 text-muted-foreground">
                          <li>• <strong>Supplier ID</strong> — 3-digit code from the Suppliers section (e.g., "001")</li>
                          <li>• <strong>IMEI/Serial</strong> — must be unique; duplicates will be rejected</li>
                          <li>• <strong>SKU</strong> is auto-assigned — do not include it</li>
                        </ul>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <h4 className="font-semibold text-primary">Tax Status Options</h4>
                        <div className="flex flex-wrap gap-2">
                          {VALID_TAX_STATUSES.map(ts => (
                            <Badge key={ts} variant="outline">{ts}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

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
                    Download the updated template with all required fields
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">Required columns:</p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                    <li>Company (VES or TGW)</li>
                    <li>Brand, Model, Cost Price</li>
                    <li>IMEI/Serial/Unique ID</li>
                    <li>Supplier ID (3-digit code)</li>
                  </ul>
                  <Button onClick={downloadTemplate} variant="outline" className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Download Template
                  </Button>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {step === 'map' && (
          <Card>
            <CardHeader>
              <CardTitle>Map Columns & Settings</CardTitle>
              <CardDescription>Match your columns to the import fields</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 rounded-lg border bg-muted/30 space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <Label className="text-base font-medium">Import Settings</Label>
                </div>
                <div className="flex items-center space-x-2">
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

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {fieldLabels.map(({ key, label, required }) => (
                  <div key={key} className="space-y-2">
                    <Label>
                      {label}
                      {required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <Select
                      value={mapping[key] || 'none'}
                      onValueChange={(value) => setMapping({ ...mapping, [key]: value === 'none' ? '' : value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- None --</SelectItem>
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
                      <TableHead>Company</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>IMEI/Serial</TableHead>
                      <TableHead>Storage</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Supplier ID</TableHead>
                      <TableHead>Tax Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationResults.filter(r => r.valid).slice(0, 10).map((result) => {
                      const row = result.data;
                      return (
                        <TableRow key={result.row}>
                          <TableCell>{mapping.company ? String(row[mapping.company] || '-') : '-'}</TableCell>
                          <TableCell>{mapping.brand ? String(row[mapping.brand] || '-') : '-'}</TableCell>
                          <TableCell>{mapping.model ? String(row[mapping.model] || '-') : '-'}</TableCell>
                          <TableCell className="capitalize">
                            {mapping.category ? String(row[mapping.category] || 'phone') : 'phone'}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {mapping.imei ? String(row[mapping.imei] || '-') : '-'}
                          </TableCell>
                          <TableCell>{mapping.storage ? String(row[mapping.storage] || '-') : '-'}</TableCell>
                          <TableCell>${row[mapping.cost_price]}</TableCell>
                          <TableCell className="font-mono">
                            {mapping.supplier_id_code ? String(row[mapping.supplier_id_code] || '-') : '-'}
                          </TableCell>
                          <TableCell>
                            {mapping.tax_status ? String(row[mapping.tax_status] || '-') : '-'}
                          </TableCell>
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

                  <div className="flex gap-4">
                    <Button variant="outline" onClick={resetImport}>Import Another File</Button>
                    {importResults.filter(r => r.success).length > 0 && (
                      <Button onClick={() => setStep('review')}>
                        <DollarSign className="h-4 w-4 mr-2" />
                        Continue to Review & AP
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {step === 'review' && (
          <>
            {/* Finalization success confirmation */}
            {finalizeResult && (
              <Card className="border-2 border-primary/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-primary">
                    <CheckCircle className="h-6 w-6" />
                    Batch Finalized & Locked
                  </CardTitle>
                  <CardDescription>
                    All accounting records have been created successfully
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <div className="p-4 rounded-lg border bg-muted/30 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Accounts Payable</p>
                      <p className="font-bold text-lg">${finalizeResult.invoiceTotal.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{finalizeResult.supplierName}</p>
                    </div>
                    <div className="p-4 rounded-lg border bg-muted/30 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Purchase Order</p>
                      <p className="font-bold font-mono">{finalizeResult.poNumber || '—'}</p>
                    </div>
                    <div className="p-4 rounded-lg border bg-muted/30 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Goods Received Note</p>
                      <p className="font-bold font-mono">{finalizeResult.grnNumber || '—'}</p>
                    </div>
                    <div className="p-4 rounded-lg border bg-muted/30 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Status</p>
                      <Badge className="mt-1">Outstanding</Badge>
                    </div>
                  </div>

                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle>What was created</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc list-inside mt-1 space-y-1 text-sm">
                        <li>AP entry for <strong>{finalizeResult.supplierName}</strong> — ${finalizeResult.invoiceTotal.toFixed(2)} due in 30 days</li>
                        <li>Purchase Order <strong>{finalizeResult.poNumber}</strong> with line items for each device</li>
                        <li>Goods Received Note <strong>{finalizeResult.grnNumber}</strong> — all items marked as received</li>
                        <li>Batch locked — devices cannot be re-imported</li>
                      </ul>
                    </AlertDescription>
                  </Alert>

                  <Button onClick={resetImport} className="w-full">
                    <Upload className="h-4 w-4 mr-2" />
                    Import Another Batch
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Pre-finalization review form */}
            {!finalizeResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Review & Finalize — Create Accounts Payable
                  </CardTitle>
                  <CardDescription>
                    Match to supplier invoice, add shipping/charges. Finalizing will create AP, PO, and GRN and lock this batch.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {(() => {
                    const summary = getImportedSummary();
                    const shipping = parseFloat(shippingCost) || 0;
                    const other = parseFloat(otherCharges) || 0;
                    const invoiceTotal = summary.subtotal + summary.estimatedTax + shipping + other;

                    return (
                      <>
                        {/* Import summary banner */}
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>{summary.totalItems} devices imported successfully</AlertTitle>
                          <AlertDescription>
                            Complete the fields below to generate the AP entry, Purchase Order, and Goods Received Note.
                          </AlertDescription>
                        </Alert>

                        {/* Summary by supplier */}
                        <div className="space-y-3">
                          <h3 className="font-semibold">Items by Supplier</h3>
                          <div className="grid gap-2">
                            {Array.from(summary.supplierGroups.entries()).map(([code, info]) => (
                              <div key={code} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                                <div>
                                  <span className="font-mono text-primary font-semibold">S-{code}</span>
                                  <span className="ml-2 text-muted-foreground">{info.name}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-sm text-muted-foreground">{info.count} items</span>
                                  <span className="ml-4 font-semibold">${info.subtotal.toFixed(2)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Tax breakdown */}
                        {(summary.taxIncludedCount + summary.zeroRatedCount + summary.gstPaidCount + summary.hstPaidCount) > 0 && (
                          <div className="space-y-2">
                            <h3 className="font-semibold">Tax Breakdown</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {summary.taxIncludedCount > 0 && (
                                <div className="p-3 rounded-lg border text-center">
                                  <p className="text-xs text-muted-foreground">Tax Included</p>
                                  <p className="font-semibold">{summary.taxIncludedCount} items</p>
                                </div>
                              )}
                              {summary.zeroRatedCount > 0 && (
                                <div className="p-3 rounded-lg border text-center">
                                  <p className="text-xs text-muted-foreground">Zero-Rated (GST implied)</p>
                                  <p className="font-semibold">{summary.zeroRatedCount} items</p>
                                </div>
                              )}
                              {summary.gstPaidCount > 0 && (
                                <div className="p-3 rounded-lg border text-center">
                                  <p className="text-xs text-muted-foreground">GST Paid</p>
                                  <p className="font-semibold">{summary.gstPaidCount} items</p>
                                </div>
                              )}
                              {summary.hstPaidCount > 0 && (
                                <div className="p-3 rounded-lg border text-center">
                                  <p className="text-xs text-muted-foreground">HST Paid</p>
                                  <p className="font-semibold">{summary.hstPaidCount} items</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Invoice matching fields */}
                        <div className="space-y-3">
                          <h3 className="font-semibold">Invoice Matching</h3>
                          <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                              <Label>Supplier Invoice Number</Label>
                              <Input
                                value={reviewInvoiceNumber}
                                onChange={(e) => setReviewInvoiceNumber(e.target.value)}
                                placeholder="INV-2026-001"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Shipping Cost ($)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={shippingCost}
                                onChange={(e) => setShippingCost(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Other Charges ($)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={otherCharges}
                                onChange={(e) => setOtherCharges(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Invoice total summary */}
                        <div className="p-4 rounded-lg border-2 border-primary/30 bg-primary/5 space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">AP Entry Preview</p>
                          <div className="flex justify-between text-sm">
                            <span>Subtotal ({summary.totalItems} items)</span>
                            <span>${summary.subtotal.toFixed(2)}</span>
                          </div>
                          {summary.estimatedTax > 0 && (
                            <div className="flex justify-between text-sm">
                              <span>Estimated Tax (GST/HST)</span>
                              <span>${summary.estimatedTax.toFixed(2)}</span>
                            </div>
                          )}
                          {shipping > 0 && (
                            <div className="flex justify-between text-sm">
                              <span>Shipping</span>
                              <span>${shipping.toFixed(2)}</span>
                            </div>
                          )}
                          {other > 0 && (
                            <div className="flex justify-between text-sm">
                              <span>Other Charges</span>
                              <span>${other.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-lg pt-2 border-t">
                            <span>Invoice Total (AP Amount)</span>
                            <span>${invoiceTotal.toFixed(2)}</span>
                          </div>
                        </div>

                        {/* What will be created */}
                        <Alert>
                          <Info className="h-4 w-4" />
                          <AlertTitle>On finalization, the following will be created:</AlertTitle>
                          <AlertDescription>
                            <ul className="list-disc list-inside mt-1 space-y-1 text-sm">
                              <li><strong>Accounts Payable</strong> — ${invoiceTotal.toFixed(2)} due in 30 days</li>
                              <li><strong>Purchase Order</strong> — with line items and tax per device</li>
                              <li><strong>Goods Received Note</strong> — all items marked as received</li>
                              <li>Batch will be <strong>locked</strong> — no further changes</li>
                            </ul>
                          </AlertDescription>
                        </Alert>

                        <div className="flex gap-4">
                          <Button variant="outline" onClick={() => setStep('results')}>
                            Back to Results
                          </Button>
                          <Button onClick={handleFinalizeAP} disabled={isFinalizingAP} size="lg">
                            {isFinalizingAP ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
                                Finalizing...
                              </>
                            ) : (
                              <>
                                <DollarSign className="h-4 w-4 mr-2" />
                                Finalize & Create AP
                              </>
                            )}
                          </Button>
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
