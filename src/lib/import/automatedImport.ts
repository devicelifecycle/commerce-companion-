import { supabase } from '@/integrations/supabase/client';
import { createPurchaseJournalEntry } from '@/lib/accounting/journalAutomation';

interface CreatePOData {
  companyId: string;
  supplierId?: string;
  supplierName: string;
  items: Array<{
    deviceId?: string;
    description: string;
    quantity: number;
    unitCost: number;
    gstHstAmount: number;
    pstQstAmount: number;
  }>;
  poDate?: string;
  notes?: string;
  createdBy?: string;
}

interface CreateGRNData {
  companyId: string;
  purchaseOrderId?: string;
  supplierId?: string;
  items: Array<{
    purchaseOrderItemId?: string;
    deviceId?: string;
    quantityReceived: number;
    conditionStatus?: 'passed' | 'damaged' | 'rejected';
    notes?: string;
  }>;
  receivedDate?: string;
  receivedBy?: string;
  notes?: string;
}

export async function generatePONumber(companyCode: string): Promise<string> {
  const year = new Date().getFullYear();
  
  // Get the next sequence number
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('po_number')
    .ilike('po_number', `PO-${companyCode}-${year}-%`)
    .order('po_number', { ascending: false })
    .limit(1);

  let sequence = 1;
  if (data && data.length > 0) {
    const lastNumber = data[0].po_number;
    const lastSeq = parseInt(lastNumber.split('-').pop() || '0');
    sequence = lastSeq + 1;
  }

  return `PO-${companyCode}-${year}-${String(sequence).padStart(5, '0')}`;
}

export async function generateGRNNumber(companyCode: string): Promise<string> {
  const year = new Date().getFullYear();
  
  const { data } = await supabase
    .from('goods_received_notes')
    .select('grn_number')
    .ilike('grn_number', `GRN-${companyCode}-${year}-%`)
    .order('grn_number', { ascending: false })
    .limit(1);

  let sequence = 1;
  if (data && data.length > 0) {
    const lastNumber = data[0].grn_number;
    const lastSeq = parseInt(lastNumber.split('-').pop() || '0');
    sequence = lastSeq + 1;
  }

  return `GRN-${companyCode}-${year}-${String(sequence).padStart(5, '0')}`;
}

export async function createPurchaseOrder(data: CreatePOData) {
  // Calculate totals
  const subtotal = data.items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
  const gstHstTotal = data.items.reduce((sum, item) => sum + item.gstHstAmount, 0);
  const pstQstTotal = data.items.reduce((sum, item) => sum + item.pstQstAmount, 0);
  const totalAmount = subtotal + gstHstTotal + pstQstTotal;

  // Get company code for PO number
  const { data: company } = await supabase
    .from('companies')
    .select('code')
    .eq('id', data.companyId)
    .single();

  const poNumber = await generatePONumber(company?.code || 'XX');

  // Create the PO
  const { data: poData, error: poError } = await supabase
    .from('purchase_orders')
    .insert({
      company_id: data.companyId,
      po_number: poNumber,
      supplier_id: data.supplierId || null,
      supplier_name: data.supplierName,
      po_date: data.poDate || new Date().toISOString().split('T')[0],
      subtotal,
      gst_hst_amount: gstHstTotal,
      pst_qst_amount: pstQstTotal,
      total_amount: totalAmount,
      status: 'pending',
      payment_status: 'unpaid',
      notes: data.notes,
      created_by: data.createdBy,
    })
    .select()
    .single();

  if (poError) throw poError;

  // Create PO items
  const poItems = data.items.map(item => ({
    purchase_order_id: poData.id,
    device_id: item.deviceId || null,
    description: item.description,
    quantity: item.quantity,
    unit_cost: item.unitCost,
    gst_hst_amount: item.gstHstAmount,
    pst_qst_amount: item.pstQstAmount,
    total_cost: (item.unitCost * item.quantity) + item.gstHstAmount + item.pstQstAmount,
  }));

  const { error: itemsError } = await supabase
    .from('purchase_order_items')
    .insert(poItems);

  if (itemsError) throw itemsError;

  return { purchaseOrder: poData, poNumber };
}

export async function createGoodsReceivedNote(data: CreateGRNData) {
  // Get company code
  const { data: company } = await supabase
    .from('companies')
    .select('code')
    .eq('id', data.companyId)
    .single();

  const grnNumber = await generateGRNNumber(company?.code || 'XX');

  // Create the GRN
  const { data: grnData, error: grnError } = await supabase
    .from('goods_received_notes')
    .insert({
      company_id: data.companyId,
      grn_number: grnNumber,
      purchase_order_id: data.purchaseOrderId || null,
      supplier_id: data.supplierId || null,
      received_date: data.receivedDate || new Date().toISOString().split('T')[0],
      received_by: data.receivedBy,
      status: 'completed',
      notes: data.notes,
    })
    .select()
    .single();

  if (grnError) throw grnError;

  // Create GRN items
  const grnItems = data.items.map(item => ({
    grn_id: grnData.id,
    purchase_order_item_id: item.purchaseOrderItemId || null,
    device_id: item.deviceId || null,
    quantity_received: item.quantityReceived,
    condition_status: item.conditionStatus || 'passed',
    notes: item.notes,
  }));

  const { error: itemsError } = await supabase
    .from('grn_items')
    .insert(grnItems);

  if (itemsError) throw itemsError;

  // Update PO status if linked
  if (data.purchaseOrderId) {
    await supabase
      .from('purchase_orders')
      .update({ status: 'received' })
      .eq('id', data.purchaseOrderId);
  }

  return { goodsReceivedNote: grnData, grnNumber };
}

export async function createSupplierIfNotExists(
  companyId: string,
  supplierName: string,
  contactInfo?: { email?: string; phone?: string; address?: string }
) {
  // Check if supplier exists
  const { data: existing } = await supabase
    .from('suppliers')
    .select('id')
    .eq('company_id', companyId)
    .ilike('name', supplierName)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  // Create new supplier (supplier_code is auto-generated by DB trigger)
  const { data: newSupplier, error } = await supabase
    .from('suppliers')
    .insert({
      company_id: companyId,
      name: supplierName,
      email: contactInfo?.email,
      phone: contactInfo?.phone,
      address: contactInfo?.address,
      supplier_code: '000', // Will be overridden by DB trigger
    })
    .select()
    .single();

  if (error) throw error;

  return newSupplier.id;
}

export interface AutomatedImportResult {
  deviceId: string;
  poNumber?: string;
  grnNumber?: string;
  supplierId?: string;
  journalEntryId?: string;
}

export async function processAutomatedInventoryImport(
  companyId: string,
  companyCode: string,
  devices: Array<{
    id: string;
    brand: string;
    model: string;
    costPrice: number;
    gstHstAmount: number;
    pstQstAmount: number;
    supplierName?: string;
    supplierEmail?: string;
    paymentDate?: string;
  }>,
  userId?: string
): Promise<AutomatedImportResult[]> {
  const results: AutomatedImportResult[] = [];

  // Group devices by supplier
  const devicesBySupplier = new Map<string, typeof devices>();
  
  for (const device of devices) {
    const supplierKey = device.supplierName || 'Unknown Supplier';
    if (!devicesBySupplier.has(supplierKey)) {
      devicesBySupplier.set(supplierKey, []);
    }
    devicesBySupplier.get(supplierKey)!.push(device);
  }

  for (const [supplierName, supplierDevices] of devicesBySupplier) {
    try {
      // Create/get supplier
      const supplierId = await createSupplierIfNotExists(
        companyId,
        supplierName,
        { email: supplierDevices[0].supplierEmail }
      );

      // Create PO
      const { purchaseOrder, poNumber } = await createPurchaseOrder({
        companyId,
        supplierId,
        supplierName,
        items: supplierDevices.map(d => ({
          deviceId: d.id,
          description: `${d.brand} ${d.model}`,
          quantity: 1,
          unitCost: d.costPrice,
          gstHstAmount: d.gstHstAmount,
          pstQstAmount: d.pstQstAmount,
        })),
        createdBy: userId,
      });

      // Create GRN (since items are already in inventory)
      const { grnNumber } = await createGoodsReceivedNote({
        companyId,
        purchaseOrderId: purchaseOrder.id,
        supplierId,
        items: supplierDevices.map(d => ({
          deviceId: d.id,
          quantityReceived: 1,
          conditionStatus: 'passed',
        })),
        receivedBy: userId,
      });

      // If payment date is provided, mark PO as paid
      if (supplierDevices[0].paymentDate) {
        await supabase
          .from('purchase_orders')
          .update({
            payment_status: 'paid',
            payment_date: supplierDevices[0].paymentDate,
          })
          .eq('id', purchaseOrder.id);
      }

      // Add results
      for (const device of supplierDevices) {
        results.push({
          deviceId: device.id,
          poNumber,
          grnNumber,
          supplierId,
        });
      }
    } catch (error) {
      console.error(`Error processing supplier ${supplierName}:`, error);
    }
  }

  return results;
}
