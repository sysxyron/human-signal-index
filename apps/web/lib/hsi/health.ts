// =============================================================================
// HSI Phase 74.4 — Database health & availability (SERVER-ONLY, READ-ONLY).
//
// A lightweight, read-only probe of the PRIMARY database (Coolify Supabase) plus
// derived Edge Config + runtime health. Uses the existing safe server read
// pattern (`readPublicClient` → service-role, no cookies). It performs a single
// HEAD count read — no writes, no migrations, no RLS/auth changes. Never throws;
// failures classify as `down`, an unconfigured probe as `unknown`.
//
// The pure classifiers are defined at module top (no `@/` or `next/cache` imports
// up here) so they stay unit-testable; the I/O helpers dynamic-import their deps.
// =============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
export type DbProbe = 'select_1' | 'table_read' | 'rpc' | 'unavailable';

/** Latency threshold (ms) above which a successful read is considered degraded. */
export const DEGRADED_LATENCY_MS = 2000;

// ---- pure classifiers (no I/O) ---------------------------------------------

/** Classify a completed probe: failed → down; slow → degraded; else healthy. */
export function dbStatusFrom(probeOk: boolean, latencyMs: number, degradedMs = DEGRADED_LATENCY_MS): HealthStatus {
  if (!probeOk) return 'down';
  return latencyMs > degradedMs ? 'degraded' : 'healthy';
}

/** Edge Config source → health. */
export function edgeConfigStatusFromSource(source: string): HealthStatus {
  if (source === 'edge-config') return 'healthy';
  if (source === 'error-fallback') return 'degraded';
  return 'unknown'; // 'defaults' (no items / not connected)
}

/** Overall runtime health from DB + Edge Config + mode (worst-case dominates). */
export function combineRuntimeStatus(hsiMode: string, dbStatus: HealthStatus, edgeStatus: HealthStatus): HealthStatus {
  if (dbStatus === 'down') return 'down';
  if (hsiMode === 'maintenance') return 'degraded';
  if (dbStatus === 'degraded' || edgeStatus === 'degraded' || hsiMode === 'protected_read') return 'degraded';
  if (dbStatus === 'unknown') return 'unknown';
  return 'healthy';
}

function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim().length > 0);
}

// ---- I/O probe (read-only) -------------------------------------------------

export interface DatabaseHealth {
  status: HealthStatus;
  latencyMs: number | null;
  checkedAt: string;
  source: 'primary';
  probe: DbProbe;
}

/** Probe the primary DB with a single read-only HEAD count. Requires the
 *  service-role key (RLS-bypassed read); without it we cannot safely probe and
 *  report `unknown` rather than a misleading `down`. Never throws. */
export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  const checkedAt = new Date().toISOString();
  if (!hasServiceRole()) {
    return { status: 'unknown', latencyMs: null, checkedAt, source: 'primary', probe: 'unavailable' };
  }
  let client: { from: (t: string) => any } | null = null;
  try {
    const mod = await import('@/lib/public-intelligence');
    client = mod.readPublicClient();
  } catch {
    client = null;
  }
  if (!client) {
    return { status: 'unknown', latencyMs: null, checkedAt, source: 'primary', probe: 'unavailable' };
  }
  const t0 = Date.now();
  try {
    const { error } = await client.from('hsin_sources').select('id', { head: true, count: 'exact' }).limit(1);
    const latencyMs = Math.max(0, Date.now() - t0);
    return { status: dbStatusFrom(!error, latencyMs), latencyMs, checkedAt, source: 'primary', probe: 'table_read' };
  } catch {
    return { status: 'down', latencyMs: Math.max(0, Date.now() - t0), checkedAt, source: 'primary', probe: 'table_read' };
  }
}

export interface SystemHealth {
  timestamp: string;
  database: DatabaseHealth;
  edgeConfig: { status: HealthStatus };
  runtime: { status: HealthStatus };
}

/** Compose DB + Edge Config + runtime health for the health endpoint. */
export async function getSystemHealth(): Promise<SystemHealth> {
  const timestamp = new Date().toISOString();
  const database = await getDatabaseHealth();
  let source = 'defaults'; let hsiMode = 'normal';
  try {
    const { getHsiRuntimeConfig } = await import('./edge-config');
    const cfg = await getHsiRuntimeConfig();
    source = cfg.source; hsiMode = cfg.hsiMode;
  } catch { /* degrade to defaults */ }
  const edgeStatus = edgeConfigStatusFromSource(source);
  return {
    timestamp,
    database,
    edgeConfig: { status: edgeStatus },
    runtime: { status: combineRuntimeStatus(hsiMode, database.status, edgeStatus) },
  };
}
