import { supabase } from '@/integrations/supabase/client';

export async function logPartnerEvent(opts: {
  partner_device_id: string;
  partner_id: string;
  company_id: string;
  event_type: string;
  payload?: Record<string, any>;
}) {
  const { data: u } = await supabase.auth.getUser();
  await supabase.from('partner_device_events').insert({
    partner_device_id: opts.partner_device_id,
    partner_id: opts.partner_id,
    company_id: opts.company_id,
    event_type: opts.event_type,
    payload: opts.payload ?? null,
    user_id: u.user?.id ?? null,
  });
}

export const PARTNER_STATUSES = [
  'received', 'testing', 'tested', 'refurbishing', 'refurbished',
  'listed', 'sold', 'returned_to_partner', 'written_off',
] as const;

export type PartnerDeviceStatus = typeof PARTNER_STATUSES[number];

export const STATUS_LABELS: Record<string, string> = {
  received: 'Received',
  testing: 'Testing',
  tested: 'Tested',
  refurbishing: 'Refurbishing',
  refurbished: 'Refurbished',
  listed: 'Listed',
  sold: 'Sold',
  returned_to_partner: 'Returned to partner',
  written_off: 'Written off',
};

export const STATUS_COLORS: Record<string, string> = {
  received: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  testing: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  tested: 'bg-amber-600/15 text-amber-200 border-amber-600/30',
  refurbishing: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  refurbished: 'bg-orange-600/15 text-orange-200 border-orange-600/30',
  listed: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  sold: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  returned_to_partner: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  written_off: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export function fmtMoney(n: number | null | undefined) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })
    .format(Number(n ?? 0));
}
