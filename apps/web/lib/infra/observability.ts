// =============================================================================
// HSI Phase 70.1 — Observability / error-reporting layer (SERVER-ONLY).
//
// reportError() is the single capture point for frontend / API / cron / agent
// errors. It (1) records the error to the infra_events audit log (real, queryable)
// and (2) emits a console.error that Sentry's auto-instrumentation captures when
// `@sentry/nextjs` is installed + a DSN is set — a dependency-free integration
// layer (no SDK import → no build coupling). NEVER throws.
//
// To enable Sentry: install @sentry/nextjs, add instrumentation, set SENTRY_DSN.
// These console.error + unhandled-rejection surfaces are then captured automatically.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/admin/guard';
import { recordInfraEventDal } from './persistence';

export type ErrorScope = 'frontend' | 'api' | 'cron' | 'agent';

function sentryConfigured(): boolean {
  return Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
}

/** Capture an operational error: audit-log it + surface it for Sentry. */
export async function reportError(scope: ErrorScope, err: unknown, context: Record<string, unknown> = {}): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  // 1. Sentry-capturable surface (no SDK import; auto-instrumentation hooks console/uncaught).
  try {
    // eslint-disable-next-line no-console
    console.error(`[observability:${scope}]${sentryConfigured() ? '[sentry]' : ''}`, message, context);
  } catch { /* ignore */ }
  // 2. Always record to the infra event log (real audit; admin-readable).
  try {
    const db = await getServiceClient();
    if (db) await recordInfraEventDal(db as unknown as SupabaseClient, { category: 'error', eventType: `${scope}_error`, severity: 'error', detail: message.slice(0, 500), metadata: { scope, ...context } });
  } catch { /* observability must never throw */ }
}
