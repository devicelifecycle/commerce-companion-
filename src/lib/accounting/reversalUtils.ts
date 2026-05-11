/**
 * Centralized accounting reversal utilities.
 * Called before deleting records to ensure all related accounting entries are cleaned up.
 */
import { supabase } from '@/integrations/supabase/client';

/**
 * Reverse all journal entries linked to a reference (sale, expense, purchase, etc.)
 */
export async function reverseJournalEntries(referenceId: string): Promise<number> {
  const { data: entries, error: fetchError } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('reference_id', referenceId);

  if (fetchError) {
    console.error('Failed to fetch journal entries for reversal:', fetchError);
    throw new Error(`Failed to fetch journal entries: ${fetchError.message}`);
  }

  if (!entries || entries.length === 0) return 0;

  const entryIds = entries.map(e => e.id);

  // Reverse account balances BEFORE deleting lines
  for (const je of entries) {
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('account_id, debit_amount, credit_amount')
      .eq('journal_entry_id', je.id);

    if (lines) {
      for (const line of lines) {
        const { data: account } = await supabase
          .from('chart_of_accounts')
          .select('current_balance, normal_balance')
          .eq('id', line.account_id)
          .single();

        if (account) {
          const debit = Number(line.debit_amount || 0);
          const credit = Number(line.credit_amount || 0);
          const current = Number(account.current_balance || 0);
          // Reverse: subtract what was originally added
          const newBal = account.normal_balance === 'debit'
            ? current - debit + credit
            : current - credit + debit;
          await supabase.from('chart_of_accounts').update({ current_balance: newBal }).eq('id', line.account_id);
        }
      }
    }
  }

  const { error: linesError } = await supabase.from('journal_entry_lines').delete().in('journal_entry_id', entryIds);
  if (linesError) {
    console.error('Failed to delete journal entry lines:', linesError);
    throw new Error(`Failed to delete journal entry lines: ${linesError.message}`);
  }

  const { error: entriesError } = await supabase.from('journal_entries').delete().in('id', entryIds);
  if (entriesError) {
    console.error('Failed to delete journal entries:', entriesError);
    throw new Error(`Failed to delete journal entries: ${entriesError.message}`);
  }

  return entryIds.length;
}

/**
 * Clean up AR record linked to a sale (by source_reference) or invoice (by invoice_id).
 */
export async function reverseARForSale(saleId: string): Promise<void> {
  const { data: arRecords } = await supabase
    .from('accounts_receivable')
    .select('id')
    .eq('source_reference', saleId);

  if (arRecords && arRecords.length > 0) {
    const arIds = arRecords.map(r => r.id);
    await supabase.from('ar_payments').delete().in('accounts_receivable_id', arIds);
    await supabase.from('accounts_receivable').delete().in('id', arIds);
  }
}

/**
 * Clean up ITCs linked to an expense.
 */
export async function reverseITCsForExpense(expenseId: string): Promise<void> {
  await supabase
    .from('input_tax_credits')
    .delete()
    .eq('expense_id', expenseId);
}

/**
 * Clean up AP entries linked to a PO (by bill_number matching po_number).
 */
export async function reverseAPForPO(poNumber: string, companyId: string): Promise<void> {
  const { data: apRecords } = await supabase
    .from('accounts_payable')
    .select('id')
    .eq('bill_number', poNumber)
    .eq('company_id', companyId);

  if (apRecords && apRecords.length > 0) {
    const apIds = apRecords.map(r => r.id);
    await supabase.from('ap_payments').delete().in('accounts_payable_id', apIds);
    await supabase.from('accounts_payable').delete().in('id', apIds);
  }
}

/**
 * Reset device status back to in_stock when a sale is deleted.
 */
export async function resetDeviceOnSaleDelete(deviceId: string): Promise<void> {
  await supabase
    .from('devices')
    .update({ status: 'in_stock' as any, sale_price: null })
    .eq('id', deviceId);
}

/**
 * Full cleanup for deleting a sale:
 * - Reverse journal entries (revenue, COGS)
 * - Remove AR records
 * - Reset linked device
 * - Remove sale items
 * - Remove linked RMAs
 */
export async function reversePartnerSaleAccrual(saleId: string): Promise<void> {
  const { data: ps } = await supabase
    .from('partner_sales')
    .select('id, partner_device_id')
    .eq('sale_id', saleId)
    .maybeSingle();
  if (!ps) return;

  // Reverse partner-sale journal entries (linked by reference_id = partner_sales.id)
  await reverseJournalEntries(ps.id);

  // Mark payables reversed
  await supabase.from('partner_payables')
    .update({ status: 'reversed' })
    .eq('partner_sale_id', ps.id);

  // Mark partner sale reversed
  await supabase.from('partner_sales')
    .update({ status: 'reversed' })
    .eq('id', ps.id);

  // Re-list the partner device for resale
  if (ps.partner_device_id) {
    await supabase.from('partner_devices')
      .update({ status: 'listed' })
      .eq('id', ps.partner_device_id);
    await supabase.from('partner_device_events').insert({
      partner_device_id: ps.partner_device_id,
      partner_id: '00000000-0000-0000-0000-000000000000', // backfilled by trigger if needed
      company_id: '00000000-0000-0000-0000-000000000000',
      event_type: 'sale_reversed',
      payload: { sale_id: saleId, partner_sale_id: ps.id },
    });
  }
}

export async function cleanupBeforeSaleDelete(saleId: string, deviceId: string | null): Promise<{ journalCount: number }> {
  // Check if this is a partner sale; if so, reverse accruals first
  const { data: saleRow } = await supabase
    .from('sales')
    .select('is_partner_sale')
    .eq('id', saleId)
    .maybeSingle();
  if (saleRow?.is_partner_sale) {
    await reversePartnerSaleAccrual(saleId);
  }

  const journalCount = await reverseJournalEntries(saleId);
  await reverseARForSale(saleId);

  if (deviceId) {
    await resetDeviceOnSaleDelete(deviceId);
  }

  // Clean up sale items
  await supabase.from('sale_items').delete().eq('sale_id', saleId);

  // Clean up sales tax details
  await supabase.from('sales_tax_details').delete().eq('sale_id', saleId);

  return { journalCount };
}

/**
 * Full cleanup for deleting an expense:
 * - Reverse journal entries
 * - Remove ITCs
 * - Remove refunds
 */
export async function cleanupBeforeExpenseDelete(expenseId: string): Promise<{ journalCount: number }> {
  const journalCount = await reverseJournalEntries(expenseId);
  await reverseITCsForExpense(expenseId);
  await supabase.from('expense_refunds').delete().eq('expense_id', expenseId);
  return { journalCount };
}

/**
 * Full cleanup for deleting a PO:
 * - Reverse AP and journal entries
 * - Remove GRNs and GRN items
 * - Remove PO items
 * - Remove linked RMAs
 * Note: Does NOT reverse product stock changes (too complex to trace back reliably).
 */
export async function cleanupBeforePODelete(
  poId: string,
  poNumber: string,
  companyId: string
): Promise<{ journalCount: number; grnCount: number }> {
  // Reverse journal entries linked to AP records for this PO
  const { data: apRecords } = await supabase
    .from('accounts_payable')
    .select('id')
    .eq('bill_number', poNumber)
    .eq('company_id', companyId);

  let journalCount = 0;
  if (apRecords) {
    for (const ap of apRecords) {
      journalCount += await reverseJournalEntries(ap.id);
    }
  }

  // Also reverse any JEs linked to the PO directly
  journalCount += await reverseJournalEntries(poId);

  // Remove AP
  await reverseAPForPO(poNumber, companyId);

  // Remove GRN items, then GRNs
  const { data: grns } = await supabase
    .from('goods_received_notes')
    .select('id')
    .eq('purchase_order_id', poId);

  let grnCount = 0;
  if (grns && grns.length > 0) {
    const grnIds = grns.map(g => g.id);
    await supabase.from('grn_items').delete().in('grn_id', grnIds);
    await supabase.from('goods_received_notes').delete().in('id', grnIds);
    grnCount = grnIds.length;
  }

  // Remove linked RMAs (purchase returns)
  await supabase
    .from('return_authorizations')
    .delete()
    .eq('purchase_order_id', poId);

  // Remove PO items
  await supabase.from('purchase_order_items').delete().eq('purchase_order_id', poId);

  return { journalCount, grnCount };
}

/**
 * Full cleanup for deleting an invoice:
 * - Reverse account balances from journal entries
 * - Remove journal entry lines and entries
 * - Remove AR payments and AR records
 * - Remove invoice items
 */
export async function cleanupBeforeInvoiceDelete(invoiceId: string): Promise<{ journalCount: number }> {
  // 1. Reverse journal entries (now includes account balance reversal)
  const journalCount = await reverseJournalEntries(invoiceId);

  // 2. Clean up AR payments and AR records
  const { data: arRecord } = await supabase
    .from('accounts_receivable')
    .select('id')
    .eq('invoice_id', invoiceId)
    .maybeSingle();

  if (arRecord) {
    const { error: arPayErr } = await supabase.from('ar_payments').delete().eq('accounts_receivable_id', arRecord.id);
    if (arPayErr) throw new Error(`Failed to delete AR payments: ${arPayErr.message}`);

    const { error: arErr } = await supabase.from('accounts_receivable').delete().eq('id', arRecord.id);
    if (arErr) throw new Error(`Failed to delete AR record: ${arErr.message}`);
  }

  // 3. Clean up invoice items
  const { error: itemsErr } = await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);
  if (itemsErr) throw new Error(`Failed to delete invoice items: ${itemsErr.message}`);

  return { journalCount };
}

/**
 * Pre-delete check for devices: ensure no active sales or repairs reference it.
 */
export async function checkDeviceDeletable(deviceId: string): Promise<{ canDelete: boolean; reason?: string }> {
  const { data: activeSales } = await supabase
    .from('sales')
    .select('id, order_number')
    .eq('device_id', deviceId)
    .limit(1);

  if (activeSales && activeSales.length > 0) {
    return { canDelete: false, reason: `Device is linked to sale ${activeSales[0].order_number}. Unlink or delete the sale first.` };
  }

  const { data: activeRepairs } = await supabase
    .from('device_repairs')
    .select('id')
    .eq('device_id', deviceId)
    .in('status', ['pending', 'in_progress'])
    .limit(1);

  if (activeRepairs && activeRepairs.length > 0) {
    return { canDelete: false, reason: 'Device has active repairs. Complete or cancel repairs first.' };
  }

  return { canDelete: true };
}
