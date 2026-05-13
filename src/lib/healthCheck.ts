/**
 * App health check — verifies Supabase connectivity and auth state.
 * Call this on app init or from a monitoring dashboard to surface
 * infrastructure issues before users hit them.
 */
import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';

export interface HealthStatus {
  ok: boolean;
  supabase: 'ok' | 'error';
  auth: 'authenticated' | 'unauthenticated' | 'error';
  latencyMs: number;
  checkedAt: string;
  error?: string;
}

export async function runHealthCheck(): Promise<HealthStatus> {
  const start = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    // Lightest possible Supabase round-trip — fetch one row from a public table
    const { error: dbError } = await supabase
      .from('companies')
      .select('id')
      .limit(1);

    const supabaseStatus: HealthStatus['supabase'] = dbError ? 'error' : 'ok';

    const { data: { session }, error: authError } = await supabase.auth.getSession();
    const authStatus: HealthStatus['auth'] = authError
      ? 'error'
      : session ? 'authenticated' : 'unauthenticated';

    const latencyMs = Date.now() - start;
    const ok = supabaseStatus === 'ok';

    const status: HealthStatus = { ok, supabase: supabaseStatus, auth: authStatus, latencyMs, checkedAt };
    logger.info('health_check', { ...status });
    return status;
  } catch (err) {
    const status: HealthStatus = {
      ok: false,
      supabase: 'error',
      auth: 'error',
      latencyMs: Date.now() - start,
      checkedAt,
      error: err instanceof Error ? err.message : String(err),
    };
    logger.error('health_check_failed', err, { latencyMs: status.latencyMs });
    return status;
  }
}
