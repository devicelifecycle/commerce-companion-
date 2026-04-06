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

const PART_CATEGORIES = ['screen', 'battery', 'housing', 'camera', 'charging_port', 'speaker', 'button', 'connector', 'adhesive', 'ssd', 'general'];

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
    const subtotal = items.reduce((s, i) => s + i.unit_cost * i.quantity, 0);
    setInvoice({ ...invoice, items, subtotal });
  };

  const updateItem = (index: number, field: keyof ParsedItem, value: any) => {
    if (!invoice) return;
    const items = [...invoice.items];
    items[index] = { ...items[index], [field]: value };
    // Recalc subtotal on the item
    if (field === 'unit_cost' || field === 'quantity') {
      items[index].subtotal = items[index].unit_cost * items[index].quantity;
    }
    const newSubtotal = items.reduce((s, i) => s + i.unit_cost * i.quantity, 0);
    setInvoice({ ...invoice, items, subtotal: Math.round(newSubtotal * 100) / 100 });
  };

  const updateInvoiceField = (field: keyof ParsedInvoice, value: any) => {
    if (!invoice) return;
    const updated = { ...invoice, [field]: value };
    // Recalc total when subtotal/shipping/tax change
    if (['subtotal', 'shipping_cost', 'gst_hst_amount'].includes(field)) {
      updated.total = Math.round((updated.subtotal + updated.shipping_cost + updated.gst_hst_amount) * 100) / 100;
    }
    setInvoice(updated);
  };

  const handleImport = async () => {
    if (!invoice || !importCompany) return;
    setImporting(true);
    setStep('processing');

    try {
      const companyCode = selectedCompany.code || 'XX';
      const companyId = selectedCompany.id;
      const isVES = companyCode === 'VES';

      // 1. Create/find MobileSentrix supplier
      const { data: existingSupplier } = await supabase
        .from('suppliers')
        .select('id')
        .eq('company_id', companyId)
        .ilike('name', 'MobileSentrix')
        .maybeSingle();

      let supplierId: string;
      if (existingSupplier) {
        supplierId = existingSupplier.id;
      } else {
        const { data: newSup, error: supErr } = await supabase
          .from('suppliers')
          .insert({
            company_id: companyId,
            name: 'MobileSentrix',
            email: 'support@mobilesentrix.com',
            supplier_code: '000',
          })
          .select('id')
          .single();
        if (supErr) throw supErr;
        supplierId = newSup.id;
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
          supplier_name: 'MobileSentrix',
          po_date: invoice.invoice_date || paymentDate,
          subtotal,
          gst_hst_amount: gstHst,
          pst_qst_amount: 0,
          total_amount: totalAmount,
          status: 'received',
          payment_status: 'paid',
          payment_method: paymentMethod,
          paid_amount: totalAmount,
          notes: `MobileSentrix Order #${invoice.invoice_number}`,
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
          notes: `Auto-received from MobileSentrix Order #${invoice.invoice_number}`,
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
          vendor_name: 'MobileSentrix',
          vendor_id: supplierId,
          bill_number: `MS-${invoice.invoice_number}`,
          bill_date: invoice.invoice_date || paymentDate,
          due_date: dueDate.toISOString().split('T')[0],
          original_amount: totalAmount,
          gst_hst_amount: gstHst,
          paid_amount: totalAmount,
          category: 'repair_parts',
          description: `MobileSentrix repair parts - ${invoice.items.length} items`,
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
        notes: `Payment for MobileSentrix Order #${invoice.invoice_number}`,
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
            description: `Repair parts purchase - MobileSentrix #${invoice.invoice_number}`,
            debitAmount: subtotal + shipping,
            creditAmount: 0,
          },
        ];

        if (gstHst > 0 && gstPaidId) {
          jeLines.push({
            accountCode: gstPaidAccount,
            accountId: gstPaidId,
            description: `GST/HST paid - MobileSentrix #${invoice.invoice_number}`,
            debitAmount: gstHst,
            creditAmount: 0,
          });
        }

        jeLines.push({
          accountCode: apAccount,
          accountId: apId,
          description: `Payable to MobileSentrix - ${poNumber}`,
          debitAmount: 0,
          creditAmount: totalAmount,
        });

        await createAutoJournalEntry({
          companyId,
          entryDate: invoice.invoice_date || paymentDate,
          description: `Repair parts purchase from MobileSentrix - PO#${poNumber}`,
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
          supplierName: 'MobileSentrix',
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

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-4xl max-h-[85vh] overflow-y-auto"
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
                  <Input
                    type="file"
                    className="hidden"
                    accept=".xls,.xlsx,.csv"
                    onChange={handleFileSelect}
                  />
                  <Button variant="outline" size="sm" className="mt-2">Choose File</Button>
                </label>
              )}
            </div>
          </div>
        )}

        {step === 'review' && invoice && (
          <div className="space-y-5">
            {/* Invoice Summary Card */}
            <div className="bg-muted/30 border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Invoice Details
                </h3>
                <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                  {invoice.items.length} items
                </Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-0.5">Order #</p>
                  <Input
                    value={invoice.invoice_number}
                    onChange={e => updateInvoiceField('invoice_number', e.target.value)}
                    className="h-8 text-sm font-semibold"
                  />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-0.5">Order Date</p>
                  <Input
                    type="date"
                    value={invoice.invoice_date}
                    onChange={e => updateInvoiceField('invoice_date', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-0.5">Supplier</p>
                  <p className="text-sm font-medium mt-1.5">MobileSentrix</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-0.5">Grand Total</p>
                  <p className="text-lg font-bold text-primary mt-0.5">{fmtCurrency(invoice.total)}</p>
                </div>
              </div>
            </div>

            {invoice.payment_method_from_file && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Detected payment: {invoice.payment_method_from_file}
                </Badge>
              </div>
            )}

            {/* Line items table */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Line Items</h3>
              <div className="max-h-[260px] overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[120px] text-[11px]">SKU</TableHead>
                      <TableHead className="text-[11px]">Description</TableHead>
                      <TableHead className="w-[110px] text-[11px]">Category</TableHead>
                      <TableHead className="w-[60px] text-right text-[11px]">Qty</TableHead>
                      <TableHead className="w-[90px] text-right text-[11px]">Unit Cost</TableHead>
                      <TableHead className="w-[90px] text-right text-[11px]">Subtotal</TableHead>
                      <TableHead className="w-[40px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.items.map((item, idx) => (
                      <TableRow key={idx} className="hover:bg-muted/20">
                        <TableCell>
                          <Input
                            value={item.sku}
                            onChange={e => updateItem(idx, 'sku', e.target.value)}
                            className="h-7 text-xs font-mono"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.name}
                            onChange={e => updateItem(idx, 'name', e.target.value)}
                            className="h-7 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <Select value={item.category} onValueChange={v => updateItem(idx, 'category', v)}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PART_CATEGORIES.map(c => (
                                <SelectItem key={c} value={c} className="capitalize text-xs">
                                  {c.replace('_', ' ')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                            className="h-7 text-xs text-right w-[50px] ml-auto"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unit_cost}
                            onChange={e => updateItem(idx, 'unit_cost', parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs text-right w-[80px] ml-auto"
                          />
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono text-muted-foreground">
                          {fmtCurrency(item.unit_cost * item.quantity)}
                        </TableCell>
                        <TableCell>
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

            {/* Totals + Payment side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Financial Summary */}
              <div className="border rounded-lg p-4 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Financial Summary</h4>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{fmtCurrency(invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Shipping</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={invoice.shipping_cost}
                    onChange={e => updateInvoiceField('shipping_cost', parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs text-right w-[90px]"
                  />
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">HST/GST</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={invoice.gst_hst_amount}
                    onChange={e => updateInvoiceField('gst_hst_amount', parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs text-right w-[90px]"
                  />
                </div>
                <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
                  <span>Grand Total</span>
                  <span className="text-primary">{fmtCurrency(invoice.total)}</span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payment</h4>
                <div className="space-y-1">
                  <Label className="text-xs">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
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
                  <Label className="text-xs">Payment Date</Label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Company selector warning */}
            {!selectedCompany && (
              <div className="flex items-center gap-2 text-sm text-destructive p-3 border border-destructive/30 rounded-md bg-destructive/5">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Please select a specific company (VES or TGW) from the sidebar before importing. "All Companies" is not supported.</span>
              </div>
            )}

            {/* What will happen */}
            <div className="bg-muted/20 border border-dashed rounded-lg p-3">
              <p className="text-xs font-medium mb-1.5">On import, the system will automatically:</p>
              <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                <span>• Create Purchase Order (received)</span>
                <span>• Create Goods Received Note</span>
                <span>• Upsert repair parts inventory</span>
                <span>• Post AP entry (marked paid)</span>
                <span>• Post journal entries (Dr. Inventory + Tax / Cr. AP → Cash)</span>
              </div>
            </div>

            {invoice.items.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-destructive p-3 border border-destructive/30 rounded-md">
                <AlertTriangle className="h-4 w-4" />
                No items to import. Please re-upload the file.
              </div>
            )}
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Creating PO, GRN, and accounting entries...</p>
          </div>
        )}

        {step === 'complete' && result && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="h-14 w-14 rounded-full bg-[hsl(var(--success)/.15)] flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-[hsl(var(--success))]" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-lg font-semibold">Import Complete</p>
              <p className="text-sm text-muted-foreground">{result.itemCount} repair parts imported successfully</p>
            </div>
            <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
              <div className="border rounded-lg p-3 text-center bg-muted/20">
                <p className="text-[11px] text-muted-foreground">Purchase Order</p>
                <p className="text-sm font-mono font-semibold mt-0.5">{result.poNumber}</p>
              </div>
              <div className="border rounded-lg p-3 text-center bg-muted/20">
                <p className="text-[11px] text-muted-foreground">GRN</p>
                <p className="text-sm font-mono font-semibold mt-0.5">{result.grnNumber}</p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground text-center space-y-0.5 bg-muted/10 border rounded-lg p-3 w-full max-w-sm">
              <p>✓ AP entry created & marked as paid</p>
              <p>✓ Journal entries posted (Inventory + GST/HST → AP → Cash)</p>
              <p>✓ Repair parts inventory updated</p>
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
                disabled={importing || !invoice?.items.length || !selectedCompany}
              >
                <CheckCircle className="h-4 w-4 mr-1.5" />
                {!selectedCompany ? 'Select a Company First' : `Import ${invoice?.items.length || 0} Parts`}
              </Button>
            </>
          )}
          {step === 'complete' && (
            <Button type="button" onClick={() => { handleClose(false); onSuccess(); }}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
