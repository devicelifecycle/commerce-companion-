/**
 * Edge Functions API.
 * Single point of invocation for all Supabase edge functions.
 * Centralizes auth header injection and error handling.
 */
import { supabase } from '@/integrations/supabase/client';
import { assertNoError } from './errors';

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

async function invoke<T = unknown>(
  functionName: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    body,
    headers,
  });
  assertNoError(error, `edgeFn:${functionName}`);
  return data as T;
}

export const edgeFunctions = {
  processSaleAccounting: (saleIds: string[]) =>
    invoke('process-sale-accounting', { sale_ids: saleIds }),

  processReturnAccounting: (returnId: string) =>
    invoke('process-return-accounting', { return_id: returnId }),

  processIntercompanyAccounting: (payload: Record<string, unknown>) =>
    invoke('process-intercompany-accounting', payload),

  importOrders: (source: 'amazon' | 'bestbuy' | 'shopify' | 'temu') =>
    invoke(`import-${source}-orders`),

  syncMarketplacePayouts: (payload: Record<string, unknown>) =>
    invoke('sync-marketplace-payouts', payload),

  runDataValidation: () =>
    invoke('run-data-validation'),

  generateInvoicePdf: (invoiceId: string) =>
    invoke('generate-invoice-pdf', { invoiceId }),

  autoResolveSales: () =>
    invoke('auto-resolve-sales', {}),

  adminCreateUser: (payload: {
    email: string;
    password: string;
    full_name: string;
    role: string;
    company_ids: string[];
  }) => invoke('admin-create-user', payload),

  aiForecast: (payload: Record<string, unknown>) =>
    invoke('ai-forecast', payload),
} as const;
