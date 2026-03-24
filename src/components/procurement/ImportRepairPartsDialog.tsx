import { useState, useCallback } from 'react';
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

const PART_CATEGORIES = ['screen', 'battery', 'housing', 'camera', 'charging_port', 'speaker', 'button', 'connector', 'adhesive', 'general'];

interface ParsedItem {
  sku: string;
  name: string;
  quantity: number;
  unit_cost: number;
  category: string;
}

interface ParsedInvoice {
  invoice_number: string;
  invoice_date: string;
  subtotal: number;
  gst_hst_amount: number;
  shipping_cost: number;
  total: number;
  items: ParsedItem[];
}

type Step = 'upload' | 'review' | 'processing' | 'complete';

interface ImportRepairPartsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

export function ImportRepairPartsDialog({ open, onOpenChange, onSuccess }: ImportRepairPartsDialogProps) {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const [step, setStep] = useState<Step>('upload');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [invoice, setInvoice] = useState<ParsedInvoice | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('credit_card');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [result, setResult] = useState<{ poNumber: string; grnNumber: string; itemCount: number } | null>(null);

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const validTypes = ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'];
    const validExts = ['.pdf', '.xls', '.xlsx', '.csv'];
    const ext = f.name.toLowerCase().substring(f.name.lastIndexOf('.'));

    if (!validTypes.includes(f.type) && !validExts.includes(ext)) {
      toast.error('Please upload a PDF, XLS, XLSX, or CSV file');
      return;
    }

    setFile(f);
    setParsing(true);

    try {
      const formData = new FormData();
      formData.append('file', f);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-repair-parts-invoice`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: formData,
        }
      );

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to parse');

      setInvoice(json.data);
      setStep('review');
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse invoice');
      setFile(null);
    } finally {
      setParsing(false);
    }
  };

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
    setInvoice({ ...invoice, items });
  };

  const handleImport = async () => {
    if (!invoice || !selectedCompany) return;
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
      const subtotal = invoice.items.reduce((s, i) => s + i.unit_cost * i.quantity, 0);
      const gstHst = invoice.gst_hst_amount || 0;
      const shipping = invoice.shipping_cost || 0;
      const totalAmount = subtotal + gstHst + shipping;

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
          notes: `MobileSentrix Invoice #${invoice.invoice_number}`,
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
        gst_hst_amount: Math.round(item.unit_cost * item.quantity * (gstHst / subtotal) * 100) / 100 || 0,
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
          notes: `Auto-received from MobileSentrix Invoice #${invoice.invoice_number}`,
        })
        .select('id')
        .single();
      if (grnErr) throw grnErr;

      // 5. Create GRN items + upsert repair_parts
      for (const item of invoice.items) {
        // GRN item
        await supabase.from('grn_items').insert({
          grn_id: grn.id,
          quantity_received: item.quantity,
          condition_status: 'passed',
          notes: `${item.name} - SKU: ${item.sku}`,
        });

        // Upsert repair part - try to match by SKU first
        const { data: existingPart } = await supabase
          .from('repair_parts')
          .select('id, quantity_on_hand')
          .eq('company_id', companyId)
          .eq('sku', item.sku)
          .maybeSingle();

        if (existingPart) {
          // Update existing part: increment qty, update cost
          await supabase
            .from('repair_parts')
            .update({
              quantity_on_hand: existingPart.quantity_on_hand + item.quantity,
              unit_cost: item.unit_cost,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingPart.id);
        } else {
          // Create new repair part
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
        notes: `Prepayment for MobileSentrix Invoice #${invoice.invoice_number}`,
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
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import MobileSentrix Invoice
          </DialogTitle>
          <DialogDescription>
            Upload a PDF or Excel invoice from MobileSentrix to automatically import repair parts.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              {parsing ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Parsing invoice with AI...</p>
                  <p className="text-xs text-muted-foreground">This may take a few seconds</p>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center gap-3">
                  <FileText className="h-10 w-10 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Drop or click to upload invoice</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supports PDF, XLS, XLSX, CSV
                    </p>
                  </div>
                  <Input
                    type="file"
                    className="hidden"
                    accept=".pdf,.xls,.xlsx,.csv"
                    onChange={handleFileSelect}
                  />
                  <Button variant="outline" size="sm" className="mt-2">
                    Choose File
                  </Button>
                </label>
              )}
            </div>
          </div>
        )}

        {step === 'review' && invoice && (
          <div className="space-y-4">
            {/* Invoice summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Invoice #</p>
                <p className="text-sm font-semibold">{invoice.invoice_number}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="text-sm font-semibold">{invoice.invoice_date}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Items</p>
                <p className="text-sm font-semibold">{invoice.items.length}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-sm font-semibold">{fmtCurrency(invoice.total)}</p>
              </div>
            </div>

            {/* Line items */}
            <div className="max-h-[300px] overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">SKU</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[100px]">Category</TableHead>
                    <TableHead className="w-[60px] text-right">Qty</TableHead>
                    <TableHead className="w-[90px] text-right">Unit Cost</TableHead>
                    <TableHead className="w-[90px] text-right">Total</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Input
                          value={item.sku}
                          onChange={e => updateItem(idx, 'sku', e.target.value)}
                          className="h-7 text-xs"
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
                      <TableCell className="text-right text-xs font-mono">
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

            {/* Totals */}
            <div className="grid grid-cols-2 gap-4 border-t pt-3">
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{fmtCurrency(invoice.subtotal)}</span>
                </div>
                {invoice.shipping_cost > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Shipping</span>
                    <span>{fmtCurrency(invoice.shipping_cost)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">GST/HST</span>
                  <span>{fmtCurrency(invoice.gst_hst_amount)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold border-t pt-1">
                  <span>Total</span>
                  <span>{fmtCurrency(invoice.total)}</span>
                </div>
              </div>
              <div className="space-y-3">
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
                      <SelectItem value="wire">Wire Transfer</SelectItem>
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

            {invoice.items.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-destructive p-3 border border-destructive/30 rounded-md">
                <AlertTriangle className="h-4 w-4" />
                No items to import. Please re-upload the invoice.
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
            <CheckCircle className="h-12 w-12 text-[hsl(var(--success))]" />
            <div className="text-center space-y-1">
              <p className="font-semibold">Import Complete</p>
              <p className="text-sm text-muted-foreground">{result.itemCount} repair parts imported</p>
            </div>
            <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
              <div className="border rounded-md p-3 text-center">
                <p className="text-xs text-muted-foreground">Purchase Order</p>
                <p className="text-sm font-mono font-semibold">{result.poNumber}</p>
              </div>
              <div className="border rounded-md p-3 text-center">
                <p className="text-xs text-muted-foreground">GRN</p>
                <p className="text-sm font-mono font-semibold">{result.grnNumber}</p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground text-center space-y-0.5">
              <p>✓ AP entry created & marked as paid</p>
              <p>✓ Journal entries posted (Inventory + GST/HST → AP → Cash)</p>
              <p>✓ Repair parts inventory updated</p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={() => { reset(); }}>
                Re-upload
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || !invoice?.items.length}
              >
                Import {invoice?.items.length || 0} Parts
              </Button>
            </>
          )}
          {step === 'complete' && (
            <Button onClick={() => { handleClose(false); onSuccess(); }}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
