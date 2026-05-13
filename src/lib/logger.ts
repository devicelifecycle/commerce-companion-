/**
 * Frontend structured logger.
 * In production, replace the console calls here with your monitoring
 * provider (Sentry, Datadog, LogRocket, etc.) — one place to swap.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

interface LogPayload {
  level: Level;
  module: string;
  event: string;
  ts: string;
  [key: string]: unknown;
}

const IS_DEV = import.meta.env.DEV;

function emit(payload: LogPayload): void {
  const line = JSON.stringify(payload);
  switch (payload.level) {
    case 'error': console.error(line); break;
    case 'warn':  console.warn(line);  break;
    case 'debug': if (IS_DEV) console.debug(line); break;
    default:      console.log(line);
  }
}

export function createLogger(module: string) {
  return {
    debug: (event: string, data?: Record<string, unknown>) =>
      emit({ level: 'debug', module, event, ts: new Date().toISOString(), ...data }),
    info: (event: string, data?: Record<string, unknown>) =>
      emit({ level: 'info', module, event, ts: new Date().toISOString(), ...data }),
    warn: (event: string, data?: Record<string, unknown>) =>
      emit({ level: 'warn', module, event, ts: new Date().toISOString(), ...data }),
    error: (event: string, err?: unknown, data?: Record<string, unknown>) => {
      const errData = err instanceof Error
        ? { err_message: err.message, err_stack: err.stack }
        : { err_raw: String(err) };
      emit({ level: 'error', module, event, ts: new Date().toISOString(), ...errData, ...data });
    },
  };
}

export const logger = createLogger('app');
