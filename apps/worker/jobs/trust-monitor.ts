// =============================================================================
// apps/worker/jobs — trust-monitor (WorldForge/HSI Phase 17)
//
// The TRUST MONITORING STAGE that EXTENDS the Phase-15/16 outcome-alert worker.
// Where Phase 16 measures trust, this stage tracks how trust EVOLVES and routes
// problems to humans — in fault-isolated, retry-safe, deterministic steps:
//
//   1. HISTORY    — append one immutable trust snapshot per tracked entity
//                   (hsin_trust_history) from the current Phase-16 trust tables.
//                   APPEND-ONLY — never overwrites a prior snapshot.
//   2. DRIFT      — for each entity with ≥2 snapshots, run the pure
//                   @hsi/trust-history detectTrustDrift + computeTrustTrend and
//                   persist non-stable events (hsin_trust_drift).
//   3. PROPOSALS  — for actionable drift, raise a recalibration PROPOSAL
//                   (@hsi/recalibration-engine, proposal only — never applied)
//                   into hsin_recalibration_proposals.
//   4. ALERTS     — raise the four NEW Phase-17 advisory alerts into
//                   hsin_decision_alerts (trust_degrading / trust_collapse /
//                   trust_instability / recalibration_required). Never auto-acts,
//                   never auto-resolves.
//
// PURITY: the engines are pure & deterministic — `now` is INJECTED (ctx.runAt);
// NO Date.now()/Math.random(). OFFLINE-SAFE: with no service-role env it runs the
// @hsi/trust-history fixtures and logs the result (no persistence). FAULT-ISOLATED:
// every step is wrapped — a failure logs + continues; the stage NEVER throws.
//
// GOVERNANCE: this stage only RECORDS / DETECTS / RECOMMENDS / ALERTS. It NEVER
// changes a trust score, never decides a proposal, never auto-resolves an alert —
// every output is advisory data for a human reviewer.
// =============================================================================

import {
  computeTrustTrend,
  detectTrustDrift,
  recordTrustSnapshot,
  trustHistoryDemo,
  type TrustDriftEvent,
  type TrustSnapshot,
} from '@hsi/trust-history';
import {
  proposalFromDriftEvent,
  type RecalibrationProposal,
} from '@hsi/recalibration-engine';
import { createServiceRoleClient } from '@hsi/database';
import { logger } from '../src/logger';

/** The four NEW Phase-17 alert types (migration 0021). */
export type TrustAlertType =
  | 'trust_degrading'
  | 'trust_collapse'
  | 'trust_instability'
  | 'recalibration_required';

/** The result of the trust-monitoring stage (for the worker summary / ICM). */
export interface TrustMonitorResult {
  mode: 'db' | 'offline';
  snapshotsRecorded: number;
  driftDetected: number;
  driftPersisted: number;
  proposals: number;
  alerts: number;
  alertsByType: Record<TrustAlertType, number>;
}

/** A minimal structural shape of the Supabase bits this stage uses. */
type TrustQuery = {
  eq: (col: string, val: unknown) => TrustQuery;
  order: (
    col: string,
    opts?: { ascending?: boolean; nullsFirst?: boolean },
  ) => TrustQuery;
  limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
};
interface TrustClient {
  from(table: string): {
    select: (cols?: string) => TrustQuery;
    insert: (values: unknown) => Promise<{ data: unknown; error: unknown }>;
  };
}

function emptyByType(): Record<TrustAlertType, number> {
  return {
    trust_degrading: 0,
    trust_collapse: 0,
    trust_instability: 0,
    recalibration_required: 0,
  };
}

function serviceRoleConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function tryClient(): TrustClient | null {
  if (!serviceRoleConfigured()) return null;
  try {
    return createServiceRoleClient() as unknown as TrustClient;
  } catch (e) {
    logger.warn('trust.monitor.serviceRole.unavailable', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

const ENTITY_TABLES: Array<{
  table: string;
  entityType: TrustSnapshot['entityType'];
  idColumn: string;
}> = [
  { table: 'hsin_source_trust', entityType: 'source', idColumn: 'source_id' },
  { table: 'hsin_narrative_trust', entityType: 'narrative', idColumn: 'narrative_id' },
  { table: 'hsin_forecast_trust', entityType: 'forecast', idColumn: 'narrative_id' },
  { table: 'hsin_decision_trust', entityType: 'decision', idColumn: 'decision_run_id' },
];

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** Map a drift kind to its Phase-17 advisory alert type (null = no direct alert). */
function alertTypeForDrift(kind: TrustDriftEvent['kind']): TrustAlertType | null {
  switch (kind) {
    case 'collapse':
      return 'trust_collapse';
    case 'degradation':
      return 'trust_degrading';
    case 'instability':
      return 'trust_instability';
    case 'overconfidence':
    case 'underconfidence':
      return 'recalibration_required';
    default:
      return null;
  }
}

/**
 * Run the trust-monitoring stage. Deterministic (`now` injected). Offline-safe
 * (no service-role env → fixtures + log, no writes). NEVER throws — every step is
 * fault-isolated. Returns the counts for the worker summary.
 *
 * An optional `client` can be injected (tests); otherwise the service-role client
 * is resolved internally.
 */
export async function runTrustMonitoringStage(
  now: string,
  opts?: { client?: TrustClient | null },
): Promise<TrustMonitorResult> {
  const client = opts?.client !== undefined ? opts.client : tryClient();

  if (!client) {
    return offlineResult(now);
  }

  const result: TrustMonitorResult = {
    mode: 'db',
    snapshotsRecorded: 0,
    driftDetected: 0,
    driftPersisted: 0,
    proposals: 0,
    alerts: 0,
    alertsByType: emptyByType(),
  };

  // --- Step 1: record one snapshot per tracked entity (append-only) ----------
  const entities: Array<{ entityType: TrustSnapshot['entityType']; entityId: string }> = [];
  for (const spec of ENTITY_TABLES) {
    try {
      const { data } = await client.from(spec.table).select('*').limit(5000);
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        const entityId = String(r[spec.idColumn] ?? r.id ?? 'unknown');
        const snap = recordTrustSnapshot(
          {
            entityType: spec.entityType,
            entityId,
            trustScore: clamp(Number(r.trust_score ?? 0), 0, 100),
            confidence: clamp(Number(r.confidence ?? 0), 0, 1),
            calibrationScore: clamp(Number(r.calibration_score ?? 0), 0, 1),
            evidenceCount: Math.max(0, Math.floor(Number(r.evidence_count ?? 0))),
          },
          { now },
        );
        const { error } = await client.from('hsin_trust_history').insert({
          entity_type: snap.entityType,
          entity_id: snap.entityId,
          trust_score: snap.trustScore,
          confidence: snap.confidence,
          calibration_score: snap.calibrationScore,
          evidence_count: snap.evidenceCount,
          band: snap.band,
          snapshot_at: snap.at,
        });
        if (!error) {
          result.snapshotsRecorded += 1;
          entities.push({ entityType: spec.entityType, entityId });
        }
      }
    } catch (e) {
      logger.warn('trust.monitor.history.failed', {
        table: spec.table,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // --- Steps 2-4: per entity → drift → proposal → alerts ---------------------
  for (const ent of entities) {
    try {
      const snaps = await loadHistory(client, ent.entityType, ent.entityId);
      if (snaps.length < 2) continue;

      const drift = detectTrustDrift(snaps, { now });
      const trend = computeTrustTrend(snaps);
      if (drift.kind === 'stable') continue;
      result.driftDetected += 1;

      // 2. Persist the drift event.
      try {
        const { error } = await client.from('hsin_trust_drift').insert({
          entity_type: drift.entityType,
          entity_id: drift.entityId,
          drift_kind: drift.kind,
          severity: drift.severity,
          magnitude: drift.magnitude,
          current_trust: drift.currentTrust,
          baseline_trust: drift.baselineTrust,
          reason: drift.reason,
          evidence: { items: [...drift.evidence, `trend: ${trend.trend} (${trend.explanation})`] },
          recommendation: drift.recommendation,
          detected_at: drift.detectedAt,
        });
        if (!error) result.driftPersisted += 1;
      } catch (e) {
        logger.warn('trust.monitor.drift.persist.failed', {
          entity: `${ent.entityType}:${ent.entityId}`,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // 3. Raise a recalibration proposal (proposal only — never applied).
      const latest = snaps[snaps.length - 1];
      const proposal = proposalFromDriftEvent(
        drift,
        { id: 'pending', currentConfidence: latest.confidence || latest.calibrationScore },
        { now },
      );
      let proposalRaised = false;
      if (proposal) {
        proposalRaised = await insertProposal(client, proposal);
        if (proposalRaised) result.proposals += 1;
      }

      // 4. Raise the advisory alert(s) — never auto-resolved.
      const driftAlert = alertTypeForDrift(drift.kind);
      if (driftAlert) {
        if (await insertAlert(client, driftAlert, drift)) {
          result.alerts += 1;
          result.alertsByType[driftAlert] += 1;
        }
      }
      if (proposalRaised && driftAlert !== 'recalibration_required') {
        if (await insertAlert(client, 'recalibration_required', drift)) {
          result.alerts += 1;
          result.alertsByType.recalibration_required += 1;
        }
      }
    } catch (e) {
      logger.warn('trust.monitor.entity.failed', {
        entity: `${ent.entityType}:${ent.entityId}`,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  logger.info('trust.monitor.done', {
    ...result,
    // BINDING: this stage never changes trust, never decides, never auto-resolves.
    autoApplied: false,
    autoResolved: false,
  });
  return result;
}

/** Load an entity's ascending trust-history series. NEVER throws. */
async function loadHistory(
  client: TrustClient,
  entityType: TrustSnapshot['entityType'],
  entityId: string,
): Promise<TrustSnapshot[]> {
  try {
    const { data } = await client
      .from('hsin_trust_history')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('snapshot_at', { ascending: true, nullsFirst: true })
      .limit(5000);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
      const trustScore = clamp(Number(r.trust_score ?? 0), 0, 100);
      return {
        id: String(r.id ?? ''),
        entityType,
        entityId,
        trustScore,
        confidence: clamp(Number(r.confidence ?? 0), 0, 1),
        calibrationScore: clamp(Number(r.calibration_score ?? 0), 0, 1),
        evidenceCount: Math.max(0, Math.floor(Number(r.evidence_count ?? 0))),
        band: trustScore >= 70 ? 'high' : trustScore >= 40 ? 'medium' : 'low',
        at: String(r.snapshot_at ?? r.created_at ?? ''),
      } satisfies TrustSnapshot;
    });
  } catch {
    return [];
  }
}

/** Insert a recalibration proposal row. NEVER throws. */
async function insertProposal(
  client: TrustClient,
  proposal: RecalibrationProposal,
): Promise<boolean> {
  try {
    const { error } = await client.from('hsin_recalibration_proposals').insert({
      entity_type: proposal.entityType,
      entity_id: proposal.entityId,
      trigger: proposal.trigger,
      current_confidence: proposal.currentConfidence,
      recommended_confidence: proposal.recommendedConfidence,
      current_trust: proposal.currentTrust ?? null,
      recommended_trust: proposal.recommendedTrust ?? null,
      direction: proposal.direction,
      magnitude: proposal.magnitude,
      severity: proposal.severity,
      reason: proposal.reason,
      supporting_evidence: { items: proposal.supportingEvidence },
      status: 'pending',
    });
    return !error;
  } catch {
    return false;
  }
}

/** Insert an advisory Phase-17 alert (status 'open', never auto-resolved). NEVER throws. */
async function insertAlert(
  client: TrustClient,
  alertType: TrustAlertType,
  drift: TrustDriftEvent,
): Promise<boolean> {
  try {
    const { error } = await client.from('hsin_decision_alerts').insert({
      alert_type: alertType,
      severity: drift.severity,
      message: `${labelFor(alertType)}: ${drift.entityType} ${drift.entityId}.`,
      explanation: `${drift.reason} ${drift.recommendation}`,
      status: 'open',
      metadata: {
        entity_type: drift.entityType,
        entity_id: drift.entityId,
        drift_kind: drift.kind,
        magnitude: drift.magnitude,
        current_trust: drift.currentTrust,
        baseline_trust: drift.baselineTrust,
      },
    });
    return !error;
  } catch {
    return false;
  }
}

function labelFor(alertType: TrustAlertType): string {
  switch (alertType) {
    case 'trust_collapse':
      return 'Trust collapse';
    case 'trust_degrading':
      return 'Trust degrading';
    case 'trust_instability':
      return 'Trust instability';
    case 'recalibration_required':
      return 'Recalibration required';
  }
}

/** Offline-safe result: run the fixtures deterministically, log, persist nothing. */
function offlineResult(now: string): TrustMonitorResult {
  const demo = trustHistoryDemo();
  const result: TrustMonitorResult = {
    mode: 'offline',
    snapshotsRecorded: 0,
    driftDetected: 0,
    driftPersisted: 0,
    proposals: 0,
    alerts: 0,
    alertsByType: emptyByType(),
  };
  for (const key of Object.keys(demo.series)) {
    result.snapshotsRecorded += demo.series[key].length;
    const drift = detectTrustDrift(demo.series[key], { now });
    if (drift.kind === 'stable') continue;
    result.driftDetected += 1;
    const alertType = alertTypeForDrift(drift.kind);
    const latest = demo.series[key][demo.series[key].length - 1];
    const proposal = proposalFromDriftEvent(
      drift,
      { id: `offline-${key}`, currentConfidence: latest.confidence || latest.calibrationScore },
      { now },
    );
    if (proposal) result.proposals += 1;
    if (alertType) {
      result.alerts += 1;
      result.alertsByType[alertType] += 1;
    }
  }
  logger.info('trust.monitor.offline', { ...result, autoApplied: false, autoResolved: false });
  return result;
}
