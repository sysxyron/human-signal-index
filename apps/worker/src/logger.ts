// =============================================================================
// apps/worker — structured logging.
// JSON lines for ingestion. OpenTelemetry/Sentry-ready (documented hooks below).
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: 'hsi-worker',
    message,
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, f?: LogFields) => emit('debug', msg, f),
  info: (msg: string, f?: LogFields) => emit('info', msg, f),
  warn: (msg: string, f?: LogFields) => emit('warn', msg, f),
  error: (msg: string, f?: LogFields) => emit('error', msg, f),
};

// -----------------------------------------------------------------------------
// Observability hooks (no hard dependency).
//
// OpenTelemetry: wrap job runs in a span. If @opentelemetry/api is installed:
//   const { trace } = await import('@opentelemetry/api');
//   const span = trace.getTracer('hsi-worker').startSpan(jobName);
//   try { ... } finally { span.end(); }
//
// Sentry: if SENTRY_DSN is set and @sentry/node is installed:
//   const Sentry = await import('@sentry/node');
//   Sentry.init({ dsn: process.env.SENTRY_DSN });
//   Sentry.captureException(err);
//
// Both are intentionally optional so the worker runs without them.
// -----------------------------------------------------------------------------

/** Best-effort Sentry capture; no-ops if the SDK/DSN is absent. */
export async function captureException(err: unknown, context?: LogFields): Promise<void> {
  logger.error('exception', { error: String((err as Error)?.message ?? err), ...context });
  if (!process.env.SENTRY_DSN) return;
  try {
    // @ts-ignore optional dep
    const Sentry = await import('@sentry/node');
    Sentry.captureException?.(err, { extra: context });
  } catch {
    /* Sentry not installed — already logged above. */
  }
}
