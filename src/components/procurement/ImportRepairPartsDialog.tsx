import { useState, useCallback, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/lib/auth';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Upload, FileText, Loader2, CheckCircle, Trash2, AlertTriangle } from 'lucide-react';
import { generatePONumber, generateGRNNumber } from '@/lib/import/automatedImport';
import {
  createAutoJournalEntry, getAccountIdByCode, createPaymentMadeJournalEntry,
} from '@/lib/accounting/journalAutomation';
import { emitRefetch } from '@/hooks/useDataRefetch';

const PART_CATEGORIES = ['screen', 'battery', 'housing', 'camera', 'charging_port', 'speaker', 'button', 'connector', 'adhesive', 'ssd', 'general'];
const MOBILE_SENTRIX_NAME = 'MobileSentrix';
const MOBILE_SENTRIX_EMAIL = 'support@mobilesentrix.com';

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

interface ParsedItem {
  sku: string;
  name: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
  category: string;
}

interface ParsedInvoice {
  invoice_number: string;
  invoice_date: string;
  subtotal: number;
  shipping_cost: number;
  gst_hst_amount: number;
  total: number;
  payment_method_from_file: string;
  items: ParsedItem[];
}

type Step = 'upload' | 'review' | 'processing' | 'complete';

interface ImportRepairPartsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

function recalculateInvoiceAmounts(invoice: ParsedInvoice): ParsedInvoice {
  const subtotal = roundCurrency(
    invoice.items.reduce((sum, item) => sum + item.unit_cost * item.quantity, 0)
  );

  return {
    ...invoice,
    subtotal,
    total: roundCurrency(subtotal + invoice.shipping_cost + invoice.gst_hst_amount),
  };
}

async function ensureMobileSentrixSupplier(companyId: string): Promise<string> {
  // Check for existing supplier in this company OR shared (null company_id)
  const { data: existingSuppliers, error: supplierLookupError } = await supabase
    .from('suppliers')
    .select('id, company_id')
    .ilike('name', MOBILE_SENTRIX_NAME)
    .or(`company_id.eq.${companyId},company_id.is.null`);

  if (supplierLookupError) throw supplierLookupError;

  // Prefer company-specific, fall back to shared
  const companyMatch = existingSuppliers?.find(s => s.company_id === companyId);
  const sharedMatch = existingSuppliers?.find(s => s.company_id === null);
  if (companyMatch) return companyMatch.id;
  if (sharedMatch) return sharedMatch.id;

  const { data: newSupplier, error: supplierInsertError } = await supabase
    .from('suppliers')
    .insert({
      company_id: companyId,
      name: MOBILE_SENTRIX_NAME,
      email: MOBILE_SENTRIX_EMAIL,
      supplier_code: '000',
    })
    .select('id')
    .single();

  if (supplierInsertError) throw supplierInsertError;
  return newSupplier.id;
}

async function ensureMobileSentrixVendor(companyId: string): Promise<string> {
  // Check for existing vendor in this company OR shared (null company_id)
  const { data: existingVendors, error: vendorLookupError } = await supabase
    .from('vendors')
    .select('id, company_id')
    .ilike('name', MOBILE_SENTRIX_NAME)
    .or(`company_id.eq.${companyId},company_id.is.null`);

  if (vendorLookupError) throw vendorLookupError;

  const companyMatch = existingVendors?.find(v => v.company_id === companyId);
  const sharedMatch = existingVendors?.find(v => v.company_id === null);
  if (companyMatch) return companyMatch.id;
  if (sharedMatch) return sharedMatch.id;

  const { data: newVendor, error: vendorInsertError } = await supabase
    .from('vendors')
    .insert({
      company_id: companyId,
      name: MOBILE_SENTRIX_NAME,
      email: MOBILE_SENTRIX_EMAIL,
      category: 'repair_parts',
    })
    .select('id')
    .single();

  if (vendorInsertError) throw vendorInsertError;
  return newVendor.id;
}

/** Guess category from product description */
function guessCategory(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('screen') || d.includes('lcd') || d.includes('display') || d.includes('digitizer')) return 'screen';
  if (d.includes('battery')) return 'battery';
  if (d.includes('housing') || d.includes('back glass') || d.includes('rear glass') || d.includes('frame')) return 'housing';
  if (d.includes('camera')) return 'camera';
  if (d.includes('charging') || d.includes('charge port') || d.includes('lightning') || d.includes('usb-c')) return 'charging_port';
  if (d.includes('speaker') || d.includes('earpiece') || d.includes('buzzer')) return 'speaker';
  if (d.includes('button') || d.includes('power flex') || d.includes('volume flex')) return 'button';
  if (d.includes('connector') || d.includes('flex cable') || d.includes('ribbon')) return 'connector';
  if (d.includes('adhesive') || d.includes('tape') || d.includes('sticker')) return 'adhesive';
  if (d.includes('ssd') || d.includes('hard drive') || d.includes('storage')) return 'ssd';
  return 'general';
}

/** Get raw cell value as string, handling scientific notation / rich text */
function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'richText' in (v as any)) {
    return ((v as any).richText as any[]).map(r => r.text).join('');
  }
  // For numbers that look like SKUs (very large), get the raw text from the cell
  if (typeof v === 'number' && v > 1e9) {
    // Try to get the formatted text
    const txt = cell.text;
    if (txt && !txt.includes('E')) return txt;
    return v.toFixed(0);
  }
  return String(v);
}

function cellToNumber(cell: ExcelJS.Cell): number {
  const v = cell.value;
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const parsed = parseFloat(String(v).replace(/[,$]/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

export function ImportRepairPartsDialog({ open, onOpenChange, onSuccess }: ImportRepairPartsDialogProps) {
  const { user } = useAuth();
  const { selectedCompany, companies } = useCompany();
  const [step, setStep] = useState<Step>('upload');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [invoice, setInvoice] = useState<ParsedInvoice | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('credit_card');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [result, setResult] = useState<{ poNumber: string; grnNumber: string; itemCount: number } | null>(null);
  const [dialogCompanyId, setDialogCompanyId] = useState<string>(selectedCompany?.id || '');

  // The company to use: dialog override or sidebar selection
  const importCompany = companies.find(c => c.id === dialogCompanyId) || selectedCompany;

  // Sync when sidebar company changes
  const companyIdForSync = selectedCompany?.id;
  useEffect(() => { if (companyIdForSync) setDialogCompanyId(companyIdForSync); }, [companyIdForSync]);

  const reset = () => {
    setStep('upload');
    setFile(null);
    setInvoice(null);
    setParsing(false);
    setImporting(false);
    setResult(null);
    setPaymentMethod('credit_card');
    setPaymentDate(new Date().toISOString().split('T')[0]);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const validExts = ['.xls', '.xlsx', '.csv'];
    const ext = f.name.toLowerCase().substring(f.name.lastIndexOf('.'));
    if (!validExts.includes(ext)) {
      toast.error('Please upload an XLS, XLSX, or CSV file');
      return;
    }

    setFile(f);
    setParsing(true);

    try {
      const arrayBuffer = await f.arrayBuffer();
      const workbook = new ExcelJS.Workbook();

      if (ext === '.csv') {
        const text = new TextDecoder().decode(arrayBuffer);
        const blob = new Blob([text], { type: 'text/csv' });
        const stream = blob.stream();
        await workbook.csv.read(stream as any);
      } else {
        await workbook.xlsx.load(arrayBuffer);
      }

      const ws = workbook.worksheets[0];
      if (!ws) throw new Error('No worksheet found');

      // Read headers from row 1
      const headerRow = ws.getRow(1);
      const headers: Record<number, string> = {};
      headerRow.eachCell((cell, colNum) => {
        headers[colNum] = cellToString(cell).toLowerCase().trim();
      });

      // Find column indices
      const findCol = (...patterns: string[]) => {
        for (const [colStr, h] of Object.entries(headers)) {
          for (const p of patterns) {
            if (h.includes(p)) return parseInt(colStr);
          }
        }
        return 0;
      };

      const colOrderNum = findCol('order number', 'order_number', 'order #');
      const colOrderDate = findCol('order date', 'order_date');
      const colDesc = findCol('product description', 'description', 'product name', 'item');
      const colSku = findCol('sku', 'part number');
      const colUnitPrice = findCol('unit price', 'unit_price', 'price');
      const colQty = findCol('quantity ordered', 'quantity', 'qty');
      const colSubTotal = findCol('sub total', 'subtotal', 'line total', 'total');
      const colPayment = findCol('payment method', 'payment');

      if (!colDesc || !colUnitPrice || !colQty) {
        throw new Error('Could not find required columns (Product Description, Unit Price, Quantity). Please check the file format.');
      }

      // Parse line items and summary
      const items: ParsedItem[] = [];
      let orderNumber = '';
      let orderDate = '';
      let payMethodFromFile = '';
      let summarySubtotal = 0;
      let summaryShipping = 0;
      let summaryTax = 0;
      let summaryTotal = 0;

      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return; // skip header

        // Check for summary rows by looking at merged/label cells
        // MobileSentrix puts summary labels in the "Quantity Ordered" column area
        // and values in the "Sub Total" column area
        const qtyCell = colQty ? cellToString(ws.getRow(rowNum).getCell(colQty)).trim() : '';
        const subTotalCell = colSubTotal ? cellToNumber(ws.getRow(rowNum).getCell(colSubTotal)) : 0;
        const descCell = colDesc ? cellToString(ws.getRow(rowNum).getCell(colDesc)).trim() : '';

        // Check if this is a summary row (no product description but has label in qty-adjacent columns)
        const rowCells: string[] = [];
        row.eachCell((cell) => {
          rowCells.push(cellToString(cell).trim().toLowerCase());
        });
        const rowText = rowCells.join(' ');

        if (rowText.includes('subtotal') && !rowText.includes('shipping') && !rowText.includes('tax') && !rowText.includes('grand')) {
          summarySubtotal = subTotalCell || parseFloat(rowCells.find(c => /^\d+\.?\d*$/.test(c)) || '0');
          return;
        }
        if (rowText.includes('shipping')) {
          summaryShipping = subTotalCell || parseFloat(rowCells.find(c => /^\d+\.?\d*$/.test(c)) || '0');
          return;
        }
        if (rowText.includes('sales tax') || rowText.includes('hst') || rowText.includes('gst')) {
          // Try to find the tax amount
          const taxMatch = rowCells.find(c => /^\d+\.?\d+$/.test(c) && parseFloat(c) > 0);
          if (taxMatch) summaryTax = parseFloat(taxMatch);
          if (!summaryTax && subTotalCell > 0) summaryTax = subTotalCell;
          return;
        }
        if (rowText.includes('grand total')) {
          summaryTotal = subTotalCell || parseFloat(rowCells.find(c => /^\d+\.?\d*$/.test(c)) || '0');
          return;
        }
        if (rowText.includes('total due') || rowText.includes('paid(') || rowText.includes('total') && !descCell) {
          // skip total/paid/due rows
          if (rowText.includes('grand')) summaryTotal = subTotalCell;
          return;
        }

        // Regular line item
        const desc = colDesc ? cellToString(row.getCell(colDesc)).trim() : '';
        if (!desc) return; // skip empty rows

        const sku = colSku ? cellToString(row.getCell(colSku)).trim() : '';
        const unitPrice = colUnitPrice ? cellToNumber(row.getCell(colUnitPrice)) : 0;
        const qty = colQty ? cellToNumber(row.getCell(colQty)) : 0;
        const lineTotal = colSubTotal ? cellToNumber(row.getCell(colSubTotal)) : unitPrice * qty;

        if (qty <= 0 || unitPrice <= 0) return; // skip non-item rows

        // Capture order info from first line item
        if (!orderNumber && colOrderNum) {
          orderNumber = cellToString(row.getCell(colOrderNum)).trim();
        }
        if (!orderDate && colOrderDate) {
          const dateVal = row.getCell(colOrderDate).value;
          if (dateVal instanceof Date) {
            orderDate = dateVal.toISOString().split('T')[0];
          } else {
            const ds = cellToString(row.getCell(colOrderDate)).trim();
            // Try MM/DD/YYYY format
            const parts = ds.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (parts) {
              orderDate = `${parts[3]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            } else {
              orderDate = ds;
            }
          }
        }
        if (!payMethodFromFile && colPayment) {
          payMethodFromFile = cellToString(row.getCell(colPayment)).trim();
        }

        items.push({
          sku,
          name: desc,
          quantity: Math.round(qty),
          unit_cost: Math.round(unitPrice * 100) / 100,
          subtotal: Math.round(lineTotal * 100) / 100,
          category: guessCategory(desc),
        });
      });

      if (items.length === 0) {
        throw new Error('No line items found in the file');
      }

      // Fallback calculations
      const calcSubtotal = items.reduce((s, i) => s + i.unit_cost * i.quantity, 0);
      if (!summarySubtotal) summarySubtotal = calcSubtotal;
      if (!summaryTotal) summaryTotal = summarySubtotal + summaryShipping + summaryTax;

      // Map file payment method
      let mappedPayment = 'credit_card';
      const pm = payMethodFromFile.toLowerCase();
      if (pm.includes('bank') || pm.includes('wire') || pm.includes('transfer')) mappedPayment = 'wire';
      else if (pm.includes('paypal')) mappedPayment = 'paypal';
      else if (pm.includes('debit')) mappedPayment = 'debit';
      else if (pm.includes('e-transfer') || pm.includes('etransfer')) mappedPayment = 'e_transfer';

      setPaymentMethod(mappedPayment);
      if (orderDate) setPaymentDate(orderDate);

      setInvoice({
        invoice_number: orderNumber,
        invoice_date: orderDate || new Date().toISOString().split('T')[0],
        subtotal: Math.round(summarySubtotal * 100) / 100,
        shipping_cost: Math.round(summaryShipping * 100) / 100,
        gst_hst_amount: Math.round(summaryTax * 100) / 100,
        total: Math.round(summaryTotal * 100) / 100,
        payment_method_from_file: payMethodFromFile,
        items,
      });

      setStep('review');
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse file');
      setFile(null);
    } finally {
      setParsing(false);
    }
  }, []);

  const removeItem = (index: number) => {
    if (!invoice) return;
    const items = [...invoice.items];
    items.splice(index, 1);
    setInvoice(recalculateInvoiceAmounts({ ...invoice, items }));
  };

  const updateItem = (index: number, field: keyof ParsedItem, value: any) => {
    if (!invoice) return;
    const items = [...invoice.items];
    items[index] = { ...items[index], [field]: value };
    // Recalc subtotal on the item
    if (field === 'unit_cost' || field === 'quantity') {
      items[index].subtotal = items[index].unit_cost * items[index].quantity;
    }
    setInvoice(recalculateInvoiceAmounts({ ...invoice, items }));
  };

  const updateInvoiceField = (field: keyof ParsedInvoice, value: any) => {
    if (!invoice) return;
    const updated = { ...invoice, [field]: value };
    // Recalc total when subtotal/shipping/tax change
    if (field === 'shipping_cost' || field === 'gst_hst_amount') {
      updated.total = roundCurrency(updated.subtotal + updated.shipping_cost + updated.gst_hst_amount);
    }
    setInvoice(updated);
  };

  const handleImport = async () => {
    if (!invoice || !importCompany) return;
    setImporting(true);
    setStep('processing');

    try {
      const companyCode = importCompany.code || 'XX';
      const companyId = importCompany.id;
      const isVES = companyCode === 'VES';

      const supplierId = await ensureMobileSentrixSupplier(companyId);

      let vendorId: string | null = null;
      try {
        vendorId = await ensureMobileSentrixVendor(companyId);
      } catch (vendorError) {
        console.warn('Unable to link MobileSentrix vendor on AP record:', vendorError);
      }

      // 2. Create PO
      const poNumber = await generatePONumber(companyCode);
      const subtotal = invoice.subtotal;
      const gstHst = invoice.gst_hst_amount;
      const shipping = invoice.shipping_cost;
      const totalAmount = invoice.total;

      const { data: po, error: poErr } = await supabase
        .from('purchase_orders')
        .insert({
          company_id: companyId,
          po_number: poNumber,
          supplier_id: supplierId,
          supplier_name: MOBILE_SENTRIX_NAME,
          po_date: invoice.invoice_date || paymentDate,
          subtotal,
          gst_hst_amount: gstHst,
          pst_qst_amount: 0,
          total_amount: totalAmount,
          status: 'received',
          payment_status: 'paid',
          payment_method: paymentMethod,
          paid_amount: totalAmount,
          notes: `${MOBILE_SENTRIX_NAME} Order #${invoice.invoice_number}`,
          created_by: user?.id,
          po_type: 'repair_parts',
        })
        .select('id')
        .single();
      if (poErr) throw poErr;

      // 3. Create PO items
      const poItems = invoice.items.map(item => ({
        purchase_order_id: po.id,
        description: `${item.name} (${item.sku})`,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        gst_hst_amount: subtotal > 0 ? Math.round(item.unit_cost * item.quantity * (gstHst / subtotal) * 100) / 100 : 0,
        pst_qst_amount: 0,
        total_cost: item.unit_cost * item.quantity,
        item_type: 'repair_parts',
      }));
      await supabase.from('purchase_order_items').insert(poItems);

      // 4. Create GRN (auto-received)
      const grnNumber = await generateGRNNumber(companyCode);
      const { data: grn, error: grnErr } = await supabase
        .from('goods_received_notes')
        .insert({
          company_id: companyId,
          grn_number: grnNumber,
          purchase_order_id: po.id,
          supplier_id: supplierId,
          received_date: invoice.invoice_date || paymentDate,
          received_by: user?.id,
          status: 'completed',
          notes: `Auto-received from ${MOBILE_SENTRIX_NAME} Order #${invoice.invoice_number}`,
        })
        .select('id')
        .single();
      if (grnErr) throw grnErr;

      // 5. Create GRN items + upsert repair_parts
      for (const item of invoice.items) {
        await supabase.from('grn_items').insert({
          grn_id: grn.id,
          quantity_received: item.quantity,
          condition_status: 'passed',
          notes: `${item.name} - SKU: ${item.sku}`,
        });

        // Upsert repair part by SKU
        const { data: existingPart } = await supabase
          .from('repair_parts')
          .select('id, quantity_on_hand')
          .eq('company_id', companyId)
          .eq('sku', item.sku)
          .maybeSingle();

        if (existingPart) {
          await supabase
            .from('repair_parts')
            .update({
              quantity_on_hand: existingPart.quantity_on_hand + item.quantity,
              unit_cost: item.unit_cost,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingPart.id);
        } else {
          await supabase.from('repair_parts').insert({
            company_id: companyId,
            name: item.name,
            sku: item.sku,
            category: item.category || 'general',
            unit_cost: item.unit_cost,
            quantity_on_hand: item.quantity,
            reorder_point: 5,
            supplier_id: supplierId,
            created_by: user?.id,
          });
        }
      }

      // 6. Create AP record
      const dueDate = new Date(invoice.invoice_date || paymentDate);
      dueDate.setDate(dueDate.getDate() + 30);

      const { data: apRecord, error: apErr } = await supabase
        .from('accounts_payable')
        .insert({
          company_id: companyId,
          vendor_name: MOBILE_SENTRIX_NAME,
          vendor_id: vendorId,
          bill_number: `MS-${invoice.invoice_number}`,
          bill_date: invoice.invoice_date || paymentDate,
          due_date: dueDate.toISOString().split('T')[0],
          original_amount: totalAmount,
          gst_hst_amount: gstHst,
          paid_amount: totalAmount,
          category: 'repair_parts',
          description: `${MOBILE_SENTRIX_NAME} repair parts - ${invoice.items.length} items`,
          status: 'paid',
          created_by: user?.id,
        })
        .select('id')
        .single();
      if (apErr) throw apErr;

      // 7. Record AP payment
      await supabase.from('ap_payments').insert({
        accounts_payable_id: apRecord.id,
        amount: totalAmount,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        notes: `Payment for ${MOBILE_SENTRIX_NAME} Order #${invoice.invoice_number}`,
        created_by: user?.id,
      });

      // 8. Journal Entry: Dr. Repair Parts Inventory + Dr. GST/HST Paid / Cr. AP
      const repairInvAccount = isVES ? '1110' : '1111';
      const gstPaidAccount = isVES ? '8000' : '8001';
      const apAccount = isVES ? '2010' : '2011';

      const [repairInvId, gstPaidId, apId] = await Promise.all([
        getAccountIdByCode(companyId, repairInvAccount),
        getAccountIdByCode(companyId, gstPaidAccount),
        getAccountIdByCode(companyId, apAccount),
      ]);

      if (repairInvId && apId) {
        const jeLines: any[] = [
          {
            accountCode: repairInvAccount,
            accountId: repairInvId,
            description: `Repair parts purchase - ${MOBILE_SENTRIX_NAME} #${invoice.invoice_number}`,
            debitAmount: subtotal + shipping,
            creditAmount: 0,
          },
        ];

        if (gstHst > 0 && gstPaidId) {
          jeLines.push({
            accountCode: gstPaidAccount,
            accountId: gstPaidId,
            description: `GST/HST paid - ${MOBILE_SENTRIX_NAME} #${invoice.invoice_number}`,
            debitAmount: gstHst,
            creditAmount: 0,
          });
        }

        jeLines.push({
          accountCode: apAccount,
          accountId: apId,
          description: `Payable to ${MOBILE_SENTRIX_NAME} - ${poNumber}`,
          debitAmount: 0,
          creditAmount: totalAmount,
        });

        await createAutoJournalEntry({
          companyId,
          entryDate: invoice.invoice_date || paymentDate,
          description: `Repair parts purchase from ${MOBILE_SENTRIX_NAME} - PO#${poNumber}`,
          referenceType: 'purchase',
          referenceId: po.id,
          lines: jeLines,
        });

        // 9. Journal Entry: Dr. AP / Cr. Cash (immediate payment)
        await createPaymentMadeJournalEntry({
          companyId,
          paymentDate,
          amount: totalAmount,
          referenceId: apRecord.id,
          supplierName: MOBILE_SENTRIX_NAME,
          isVES,
        });
      }

      setResult({ poNumber, grnNumber, itemCount: invoice.items.length });
      setStep('complete');
      toast.success(`Imported ${invoice.items.length} repair parts from MobileSentrix`);
    } catch (err: any) {
      console.error('Import error:', err);
      toast.error(err.message || 'Failed to import repair parts');
      setStep('review');
    } finally {
      setImporting(false);
    }
  };

  const invoiceMetrics = invoice
    ? {
        lineCount: invoice.items.length,
        unitCount: invoice.items.reduce((sum, item) => sum + item.quantity, 0),
        categoryCount: new Set(invoice.items.map((item) => item.category)).size,
      }
    : null;

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-6xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import MobileSentrix Invoice
          </DialogTitle>
          <DialogDescription>
            Upload an XLS/XLSX or CSV export from MobileSentrix to import repair parts with full accounting.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              {parsing ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Parsing file...</p>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center gap-3">
                  <FileText className="h-10 w-10 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Drop or click to upload MobileSentrix export</p>
                    <p className="text-xs text-muted-foreground mt-1">Supports XLS, XLSX, CSV</p>
                  </div>
                  <Input type="file" className="hidden" accept=".xls,.xlsx,.csv" onChange={handleFileSelect} />
                  <Button type="button" variant="outline" size="sm" className="mt-2">Choose File</Button>
                </label>
              )}
            </div>
          </div>
        )}

        {step === 'review' && invoice && (
          <div className="space-y-4">
            {/* Header fields — single row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Order #</Label>
                <Input value={invoice.invoice_number} onChange={e => updateInvoiceField('invoice_number', e.target.value)} className="h-8 text-sm font-semibold" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Order Date</Label>
                <Input type="date" value={invoice.invoice_date} onChange={e => updateInvoiceField('invoice_date', e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Supplier</Label>
                <div className="flex h-8 items-center text-sm font-medium">{MOBILE_SENTRIX_NAME}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Import To</Label>
                <Select value={dialogCompanyId} onValueChange={setDialogCompanyId}>
                  <SelectTrigger className="h-8 text-sm font-semibold"><SelectValue placeholder="Select company..." /></SelectTrigger>
                  <SelectContent>
                    {companies.filter(c => (c.code as string) !== 'ALL').map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Full-width line items table */}
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Line Items ({invoice.items.length})</span>
                {file && <Badge variant="secondary" className="text-xs truncate max-w-[200px]">{file.name}</Badge>}
              </div>
              <div className="max-h-[340px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[11px]">
                      <TableHead className="w-[100px]">SKU</TableHead>
                      <TableHead className="min-w-[250px]">Description</TableHead>
                      <TableHead className="w-[110px]">Category</TableHead>
                      <TableHead className="w-[60px] text-right">Qty</TableHead>
                      <TableHead className="w-[80px] text-right">Unit $</TableHead>
                      <TableHead className="w-[80px] text-right">Line $</TableHead>
                      <TableHead className="w-[36px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.items.map((item, idx) => (
                      <TableRow key={idx} className="hover:bg-muted/10">
                        <TableCell className="p-1.5">
                          <Input value={item.sku} onChange={e => updateItem(idx, 'sku', e.target.value)} className="h-7 text-xs font-mono" />
                        </TableCell>
                        <TableCell className="p-1.5">
                          <Input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} className="h-7 text-xs" />
                        </TableCell>
                        <TableCell className="p-1.5">
                          <Select value={item.category} onValueChange={v => updateItem(idx, 'category', v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PART_CATEGORIES.map(c => (
                                <SelectItem key={c} value={c} className="capitalize text-xs">{c.replace('_', ' ')}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="p-1.5 text-right">
                          <Input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)} className="h-7 text-xs text-right w-[50px] ml-auto" />
                        </TableCell>
                        <TableCell className="p-1.5 text-right">
                          <Input type="number" step="0.01" value={item.unit_cost} onChange={e => updateItem(idx, 'unit_cost', parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right w-[70px] ml-auto" />
                        </TableCell>
                        <TableCell className="p-1.5 text-right text-xs font-mono text-muted-foreground">
                          {fmtCurrency(item.unit_cost * item.quantity)}
                        </TableCell>
                        <TableCell className="p-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(idx)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Totals + Payment — single row */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Subtotal</Label>
                <div className="h-8 flex items-center text-sm font-medium">{fmtCurrency(invoice.subtotal)}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Shipping</Label>
                <Input type="number" step="0.01" value={invoice.shipping_cost} onChange={e => updateInvoiceField('shipping_cost', parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">GST/HST</Label>
                <Input type="number" step="0.01" value={invoice.gst_hst_amount} onChange={e => updateInvoiceField('gst_hst_amount', parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Total</Label>
                <div className="h-8 flex items-center text-sm font-bold text-primary">{fmtCurrency(invoice.total)}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit_card">Credit Card</SelectItem>
                    <SelectItem value="debit">Debit</SelectItem>
                    <SelectItem value="e_transfer">E-Transfer</SelectItem>
                    <SelectItem value="wire">Wire / Bank Transfer</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Payment Date</Label>
                <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>

            {!importCompany && (
              <div className="flex items-center gap-2 text-sm text-destructive p-2.5 border border-destructive/30 rounded-md bg-destructive/5">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Select a company above to continue.</span>
              </div>
            )}

            {invoice.items.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-destructive p-2.5 border border-destructive/30 rounded-md">
                <AlertTriangle className="h-4 w-4" />
                No items found. Please re-upload the file.
              </div>
            )}
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Creating the PO, receiving the parts, and posting the accounting entries…</p>
          </div>
        )}

        {step === 'complete' && result && (
          <div className="py-6">
            <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border bg-muted/10 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle className="h-7 w-7 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-semibold">Import complete</p>
                <p className="text-sm text-muted-foreground">{result.itemCount} repair parts were imported successfully.</p>
              </div>

              <div className="grid w-full gap-4 sm:grid-cols-2">
                <div className="rounded-xl border bg-background p-3">
                  <p className="text-[11px] text-muted-foreground">Purchase Order</p>
                  <p className="mt-1 text-sm font-mono font-semibold">{result.poNumber}</p>
                </div>
                <div className="rounded-xl border bg-background p-3">
                  <p className="text-[11px] text-muted-foreground">GRN</p>
                  <p className="mt-1 text-sm font-mono font-semibold">{result.grnNumber}</p>
                </div>
              </div>

              <div className="w-full rounded-xl border bg-background p-3 text-xs text-muted-foreground">
                <p>✓ Accounts payable bill recorded as paid</p>
                <p>✓ Journal entries posted for inventory, tax, AP, and cash</p>
                <p>✓ Repair parts inventory updated</p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          )}
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={() => reset()}>Re-upload</Button>
              <Button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleImport(); }}
                disabled={importing || !invoice?.items.length || !importCompany}
              >
                <CheckCircle className="h-4 w-4 mr-1.5" />
                {!importCompany ? 'Select a Company' : `Import ${invoice?.items.length || 0} Parts`}
              </Button>
            </>
          )}
          {step === 'complete' && (
            <Button type="button" onClick={() => { handleClose(false); onSuccess(); emitRefetch('repair_parts'); emitRefetch('purchase_orders'); }}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
