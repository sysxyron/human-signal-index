// =============================================================================
// HSI Phase 70.1 — Infrastructure dashboard data (SERVER-ONLY, admin). Composes
// live health + ledgers + migration verification + operational metrics + uptime +
// incidents + events. Everything computed from real records / probes. Never throws.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { readPublicClient } from '@/lib/public-intelligence';
import { getMigrationAudit } from '@/lib/launch/persistence';
import type { MigrationAuditResult } from '@/lib/launch/migration-audit';
import { getInfrastructureHealth } from './probes';
import * as dal from './persistence';
import {
  actualRpoMinutes, withinRpo, uptimePct, overallHealth,
  type SubsystemHealth, type BackupRecord, type DeploymentRecord, type InfraEventRecord,
  type IncidentRecord, type OperationalMetrics, type BackupRecovery, type HealthState,
} from './types';

// Recovery policy targets (configurable; displayed as targets, not fabricated actuals).
const RPO_TARGET_MINUTES = Number(process.env.HSI_RPO_TARGET_MINUTES ?? 1440); // 24h
const RTO_TARGET_MINUTES = Number(process.env.HSI_RTO_TARGET_MINUTES ?? 240);  // 4h

export interface UptimeSummary { endpoint: string; pct: number | null; total: number; lastOk: boolean }
export interface CurrentDeployment { version: string; commitSha: string; environment: string }

export interface InfraDashboard {
  overall: HealthState;
  health: SubsystemHealth[];
  backups: BackupRecord[];
  recovery: BackupRecovery;
  deployments: DeploymentRecord[];
  currentDeployment: CurrentDeployment;
  migrations: MigrationAuditResult | null;
  metrics: OperationalMetrics;
  uptime: UptimeSummary[];
  incidents: IncidentRecord[];
  events: InfraEventRecord[];
}

function currentDeployment(): CurrentDeployment {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? 'local';
  return {
    version: process.env.npm_package_version ?? process.env.HSI_VERSION ?? '1.0.0',
    commitSha: commit.slice(0, 12),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
  };
}

export async function getInfrastructureDashboard(): Promise<InfraDashboard> {
 try {
  const db = createClient();
  const pub = readPublicClient() ?? db;
  const nowIso = new Date().toISOString();

  const [health, backups, deployments, migAudit, metrics, uptimeChecks, incidents, events] = await Promise.all([
    getInfrastructureHealth().catch(() => [] as SubsystemHealth[]),
    dal.listBackupsDal(db, 20).catch(() => [] as BackupRecord[]),
    dal.listDeploymentsDal(db, 20).catch(() => [] as DeploymentRecord[]),
    getMigrationAudit().catch(() => null),
    dal.operationalMetricsDal(pub).catch(() => ({ sources: 0, signals: 0, evidence: 0, narratives: 0, forecasts: 0, marketplaceProducts: 0, notifications: 0, agents: 0 } as OperationalMetrics)),
    dal.recentUptimeDal(db, 1000).catch(() => []),
    dal.listIncidentsDal(db, 30).catch(() => [] as IncidentRecord[]),
    // Infra event loader must never crash the page (hotfix).
    dal.listInfraEventsDal(db, 50).catch(() => [] as InfraEventRecord[]),
  ]);

  // backup & recovery (computed from the latest good backup)
  const lastGood = backups.find((b) => b.status === 'success') ?? null;
  const recovery: BackupRecovery = {
    lastBackupAt: lastGood?.backedUpAt ?? null,
    lastStatus: backups[0]?.status ?? null,
    lastSizeBytes: lastGood?.sizeBytes ?? null,
    restoreTested: backups.some((b) => b.restoreTested),
    restoreTestedAt: backups.find((b) => b.restoreTested)?.restoreTestedAt ?? null,
    actualRpoMinutes: actualRpoMinutes(lastGood?.backedUpAt ?? null, nowIso),
    rpoTargetMinutes: RPO_TARGET_MINUTES,
    rtoTargetMinutes: RTO_TARGET_MINUTES,
    withinRpo: withinRpo(lastGood?.backedUpAt ?? null, nowIso, RPO_TARGET_MINUTES),
  };

  // uptime per endpoint
  const byEndpoint = new Map<string, { ok: number; total: number; lastOk: boolean }>();
  for (const ch of uptimeChecks) {
    const e = byEndpoint.get(ch.endpoint) ?? { ok: 0, total: 0, lastOk: true };
    if (e.total === 0) e.lastOk = ch.ok; // first = most recent (desc order)
    e.total += 1; if (ch.ok) e.ok += 1;
    byEndpoint.set(ch.endpoint, e);
  }
  const uptime: UptimeSummary[] = Array.from(byEndpoint.entries()).map(([endpoint, e]) => ({ endpoint, pct: uptimePct(e.ok, e.total), total: e.total, lastOk: e.lastOk })).sort((a, b) => a.endpoint.localeCompare(b.endpoint));

  return {
    overall: overallHealth(health),
    health, backups, recovery, deployments, currentDeployment: currentDeployment(),
    migrations: migAudit && migAudit.ok ? migAudit.data : null,
    metrics, uptime, incidents, events,
  };
 } catch {
  // Hotfix: never throw to the page. A crash here would route through
  // global-error → /api/observability/report and flood infra_events with
  // render-crash records. Degrade to an empty, safe dashboard instead.
  return {
    overall: 'unknown', health: [], backups: [],
    recovery: { lastBackupAt: null, lastStatus: null, lastSizeBytes: null, restoreTested: false, restoreTestedAt: null, actualRpoMinutes: null, rpoTargetMinutes: RPO_TARGET_MINUTES, rtoTargetMinutes: RTO_TARGET_MINUTES, withinRpo: false },
    deployments: [], currentDeployment: currentDeployment(), migrations: null,
    metrics: { sources: 0, signals: 0, evidence: 0, narratives: 0, forecasts: 0, marketplaceProducts: 0, notifications: 0, agents: 0 },
    uptime: [], incidents: [], events: [],
  };
 }
}
