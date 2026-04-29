/**
 * Structured logging helper for edge functions.
 *
 * Emits JSON lines so the Supabase log explorer can filter by `fn`, `level`,
 * `event`, `request_id`, and any other field. Always include enough context
 * (ids, marketplace, company) to trace a single request end-to-end.
 *
 * Usage:
 *   const log = createLogger("shopify-webhook", { request_id: crypto.randomUUID() });
 *   log.info("payload_received", { topic, order_id });
 *   try { ... } catch (err) { log.error("processing_failed", { err }); throw err; }
 */

type Level = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (event: string, data?: Record<string, unknown>) => void;
  info: (event: string, data?: Record<string, unknown>) => void;
  warn: (event: string, data?: Record<string, unknown>) => void;
  error: (event: string, data?: Record<string, unknown>) => void;
  child: (extra: Record<string, unknown>) => Logger;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack };
  }
  if (typeof err === "object" && err !== null) {
    try { return JSON.parse(JSON.stringify(err)); } catch { return { value: String(err) }; }
  }
  return { value: String(err) };
}

function emit(level: Level, fn: string, ctx: Record<string, unknown>, event: string, data?: Record<string, unknown>) {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    fn,
    event,
    ...ctx,
  };
  if (data) {
    for (const [k, v] of Object.entries(data)) {
      payload[k] = k === "err" || v instanceof Error ? serializeError(v) : v;
    }
  }
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(fn: string, ctx: Record<string, unknown> = {}): Logger {
  return {
    debug: (event, data) => emit("debug", fn, ctx, event, data),
    info: (event, data) => emit("info", fn, ctx, event, data),
    warn: (event, data) => emit("warn", fn, ctx, event, data),
    error: (event, data) => emit("error", fn, ctx, event, data),
    child: (extra) => createLogger(fn, { ...ctx, ...extra }),
  };
}
