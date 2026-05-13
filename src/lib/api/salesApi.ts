/**
 * Sales domain API.
 * All sale record mutations go through here.
 */
import { supabase } from '@/integrations/supabase/client';
import { assertNoError } from './errors';

/**
 * Link a device to a sale and reset accounting status for reprocessing.
 */
export async function linkDeviceToSale(saleId: string, deviceId: string, salePrice: number): Promise<void> {
  const { error: saleErr } = await supabase
    .from('sales')
    .update({ device_id: deviceId, accounting_status: 'unprocessed' })
    .eq('id', saleId);
  assertNoError(saleErr, `linkDeviceToSale — sale update`);

  const { error: deviceErr } = await supabase
    .from('devices')
    .update({ status: 'sold', sale_price: salePrice })
    .eq('id', deviceId);
  assertNoError(deviceErr, `linkDeviceToSale — device update`);
}

/**
 * Unlink a device from a sale. Caller is responsible for reversing COGS entries
 * via reverseCOGSEntriesForSale() before or after calling this.
 */
export async function unlinkDeviceFromSale(saleId: string, deviceId: string): Promise<void> {
  const { error: saleErr } = await supabase
    .from('sales')
    .update({ device_id: null, accounting_status: 'revenue_only' })
    .eq('id', saleId);
  assertNoError(saleErr, `unlinkDeviceFromSale — sale update`);

  const { error: deviceErr } = await supabase
    .from('devices')
    .update({ status: 'in_stock', sale_price: null })
    .eq('id', deviceId);
  assertNoError(deviceErr, `unlinkDeviceFromSale — device update`);
}

/**
 * Update the fulfillment status of a sale.
 */
export async function updateSaleFulfillmentStatus(
  saleId: string,
  status: string,
): Promise<void> {
  const { error } = await supabase
    .from('sales')
    .update({ fulfillment_status: status })
    .eq('id', saleId);
  assertNoError(error, `updateSaleFulfillmentStatus(${saleId})`);
}
