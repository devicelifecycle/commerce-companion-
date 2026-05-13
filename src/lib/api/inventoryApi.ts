/**
 * Inventory domain API.
 * All device and product mutations go through here.
 */
import { supabase } from '@/integrations/supabase/client';
import { assertNoError } from './errors';

/**
 * Update a device's status and optionally its sale_price.
 */
export async function updateDeviceStatus(
  deviceId: string,
  status: 'in_stock' | 'sold' | 'repair' | 'retired',
  salePrice?: number | null,
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (salePrice !== undefined) update.sale_price = salePrice;
  const { error } = await supabase.from('devices').update(update).eq('id', deviceId);
  assertNoError(error, `updateDeviceStatus(${deviceId})`);
}

/**
 * Update a device's cost_price (after repair parts are capitalized).
 */
export async function updateDeviceCostPrice(deviceId: string, newCostPrice: number): Promise<void> {
  const { error } = await supabase
    .from('devices')
    .update({ cost_price: newCostPrice })
    .eq('id', deviceId);
  assertNoError(error, `updateDeviceCostPrice(${deviceId})`);
}
