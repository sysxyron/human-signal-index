// =============================================================================
// HSI Phase 70.1 — Uptime engine (SERVER-ONLY). Runs the live health probes,
// records an uptime check per subsystem, and opens/resolves incidents + logs
// infra events. Reused by the cron route and the admin "run check" action. Never throws.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getInfrastructureHealth } from './probes';
import { recordUptimeCheckDal, openIncidentDal, resolveIncidentsDal, recordInfraEventDal } from './persistence';

export interface UptimeRunSummary { checked: number; down: number; degraded: number }

export async function runUptimeCheck(writer: SupabaseClient): Promise<UptimeRunSummary> {
  const health = await getInfrastructureHealth();
  let down = 0; let degraded = 0;
  for (const s of health) {
    const ok = s.state === 'ok';
    await recordUptimeCheckDal(writer, { endpoint: s.name, ok, statusCode: null, latencyMs: null });
    if (s.state === 'down') {
      down += 1;
      await openIncidentDal(writer, s.name, 'error', s.detail);
      await recordInfraEventDal(writer, { category: 'uptime', eventType: 'subsystem_down', severity: 'error', detail: `${s.name} is down: ${s.detail}`, metadata: { subsystem: s.name } });
    } else if (s.state === 'degraded' || s.state === 'unconfigured') {
      degraded += 1;
    } else {
      await resolveIncidentsDal(writer, s.name);
    }
  }
  return { checked: health.length, down, degraded };
}
