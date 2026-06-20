// =============================================================================
// HSI Phase 70.1 — Infrastructure observability: shared types + PURE helpers.
//
// Health state, uptime %, RPO/RTO computation, and backup staleness — all derived
// from real recorded data (callers pass `now`). PURE: no I/O, no clocks.
// =============================================================================

export type HealthState = 'ok' | 'degraded' | 'down' | 'unconfigured' | 'unknown';

export interface SubsystemHealth { name: string; state: HealthState; detail: string }

export interface BackupRecord { id: string; backedUpAt: string; status: string; kind: string; sizeBytes: number | null; restoreTested: boolean; restoreTestedAt: string | null; note: string | null }
export interface DeploymentRecord { id: string; version: string | null; commitSha: string | null; environment: string; status: string; deployedAt: string; note: string | null }
export interface InfraEventRecord { id: string; category: string; eventType: string; severity: string; detail: string | null; createdAt: string }
export interface UptimeCheck { endpoint: string; ok: boolean; statusCode: number | null; latencyMs: number | null; checkedAt: string }
export interface IncidentRecord { id: string; endpoint: string; status: string; severity: string; detail: string | null; startedAt: string; resolvedAt: string | null }

export interface OperationalMetrics {
  sources: number; signals: number; evidence: number; narratives: number;
  forecasts: number; marketplaceProducts: number; notifications: number; agents: number;
}

export interface BackupRecovery {
  lastBackupAt: string | null;
  lastStatus: string | null;
  lastSizeBytes: number | null;
  restoreTested: boolean;
  restoreTestedAt: string | null;
  actualRpoMinutes: number | null;   // time since last good backup
  rpoTargetMinutes: number;          // policy
  rtoTargetMinutes: number;          // policy
  withinRpo: boolean | null;
}

// ---- pure computations ------------------------------------------------------

const MIN = 60_000;

/** Minutes since the last backup, or null when none recorded. */
export function actualRpoMinutes(lastBackupIso: string | null, nowIso: string): number | null {
  if (!lastBackupIso) return null;
  const last = Date.parse(lastBackupIso); const now = Date.parse(nowIso);
  if (Number.isNaN(last) || Number.isNaN(now)) return null;
  return Math.max(0, Math.round((now - last) / MIN));
}

/** Within RPO when a backup exists and is fresher than the target window. */
export function withinRpo(lastBackupIso: string | null, nowIso: string, rpoTargetMinutes: number): boolean | null {
  const actual = actualRpoMinutes(lastBackupIso, nowIso);
  return actual == null ? null : actual <= rpoTargetMinutes;
}

/** Historical uptime % from recorded checks (null when none — not fabricated). */
export function uptimePct(okCount: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((okCount / total) * 1000) / 10;
}

/** Roll a HealthResponse-style status into a HealthState. */
export function healthStateFromStatus(status: string | undefined, ok: boolean): HealthState {
  if (status === 'unconfigured') return 'unconfigured';
  if (ok || status === 'ok') return 'ok';
  if (status === 'degraded') return 'degraded';
  return 'down';
}

/** Overall infra verdict from subsystem states. */
export function overallHealth(subsystems: SubsystemHealth[]): HealthState {
  if (subsystems.some((s) => s.state === 'down')) return 'down';
  if (subsystems.some((s) => s.state === 'degraded')) return 'degraded';
  if (subsystems.every((s) => s.state === 'ok')) return 'ok';
  return 'unknown';
}
