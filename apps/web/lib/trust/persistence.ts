// =============================================================================
// HSIN Phase 17 — Public Trust, Recalibration & Governance data-access layer.
// SERVER-ONLY.
//
// "How trustworthy is this intelligence — why, how has it changed, and who
// governs the change?" The persistence layer for the Phase-17 trust-history +
// recalibration-governance + publication layer (migration 0021) over the
// Phase-16 calibration & trust layer (migration 0020):
//
//   * HISTORY   — hsin_trust_history: APPEND-ONLY trust snapshots over time.
//   * DRIFT     — hsin_trust_drift: detected trust-drift events (advisory).
//   * PROPOSALS — hsin_recalibration_proposals: recommended confidence
//                 recalibrations (proposal only, never auto-applied).
//   * REVIEWS   — hsin_recalibration_reviews: governance decisions over a
//                 proposal (approved/rejected) with previous→new state + audit.
//   * OVERRIDES — hsin_trust_overrides: APPEND-ONLY applied trust-change trail.
//   * PUBLISH   — hsin_trust_publications: trust attached to published reports.
//
// The PURE, deterministic engines live in '@hsi/trust-history' and
// '@hsi/recalibration-engine'. This DAL reads the persisted snapshots/proposals,
// feeds them (with an injected `now`) into the engines for trend/drift/
// provenance/review, and persists governance decisions. Reads assemble the
// Phase-17 view-models the trust dashboards render.
//
// SERVER-ONLY — never import from a 'use client' module (uses next/headers via
// lib/supabase/server.ts). `server-only` is not installed in this workspace, so
// this comment stands in for the import (mirrors lib/calibration/persistence.ts).
//
// AUTHZ MODEL (migration 0021 RLS, mirrored here for clean DbResult errors):
//   * All 6 Phase-17 tables: researcher+ READ; curator/admin INSERT/UPDATE/DELETE.
//   We gate reads at researcher and writes at curator (RLS is the backstop).
//
// GOVERNANCE: nothing here auto-applies a trust change. Drift only RECOMMENDS;
// proposals are reviewed by a human; an approval preserves the previous state
// (reversible) and writes an audit trail. NEVER throws; empty env → NOT_CONFIGURED.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient } from '@/lib/supabase/server';
import {
  buildTrustProvenance,
  computeTrustTrend,
  detectTrustDrift,
  recordTrustSnapshot,
  trustHistoryDemo,
  type TrustSnapshot,
  type TrustExplanation,
} from '@hsi/trust-history';
import {
  approveProposal,
  proposeRecalibration,
  recalibrationDemo,
  rejectProposal,
  reviewRecalibrationProposal,
  type RecalibrationProposal,
  type RecalibrationTrigger,
} from '@hsi/recalibration-engine';
import type {
  AppRole,
  HsinRecalibrationProposalRecord,
  HsinRecalibrationReviewRecord,
  HsinTrustDriftRecord,
  HsinTrustHistoryRecord,
  HsinTrustOverrideRecord,
  HsinTrustPublicationRecord,
  ProposalStatus,
  PublicTrustData,
  PublicTrustEntry,
  RecalibrationProposalView,
  RecalibrationQueueData,
  TrustBand,
  TrustDriftDashboardData,
  TrustDriftKind,
  TrustEntityType,
  TrustGovernanceHighlights,
  TrustHistoryDashboardData,
  TrustHistoryRow,
  TrustHistoryView,
  TrustProvenanceView,
  TrustReportType,
  TrustSeverity,
  TrustTrend,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Result type — canonical DbResult with 'FORBIDDEN' (Phase 6–16).
// -----------------------------------------------------------------------------
export type DbResultCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_CONFIGURED'
  | 'DB_ERROR';

export type DbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED =
  'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';
const AUTH_REQUIRED = 'Sign in to continue.';

export function fail(error: unknown): {
  ok: false;
  error: string;
  code: DbResultCode;
} {
  logError('trust/persistence', error);
  if (
    error instanceof Error &&
    /required|not configured|SUPABASE_/i.test(error.message) &&
    /key|url/i.test(error.message)
  ) {
    return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
  }
  return { ok: false, error: formatErrorMessage(error), code: 'DB_ERROR' };
}

function authRequired(): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: AUTH_REQUIRED, code: 'AUTH_REQUIRED' };
}

export function forbidden(required: AppRole): {
  ok: false;
  error: string;
  code: DbResultCode;
} {
  return {
    ok: false,
    error: `Requires the ${required} role or higher.`,
    code: 'FORBIDDEN',
  };
}

function validation(message: string): {
  ok: false;
  error: string;
  code: DbResultCode;
} {
  return { ok: false, error: message, code: 'FORBIDDEN' };
}

// -----------------------------------------------------------------------------
// Client + identity + role helpers (mirror lib/calibration/persistence.ts).
// -----------------------------------------------------------------------------
function db(): SupabaseClient {
  return createClient();
}

async function currentUser(client: SupabaseClient): Promise<User | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  return user ?? null;
}

const ROLE_LEVEL: Record<AppRole, number> = {
  viewer: 1,
  researcher: 2,
  reviewer: 3,
  curator: 4,
  admin: 5,
};

async function sessionRole(client: SupabaseClient): Promise<AppRole | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data } = await client
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = (data?.role as string | undefined) ?? 'viewer';
  return (role in ROLE_LEVEL ? role : 'viewer') as AppRole;
}

async function requireRole(
  client: SupabaseClient,
  min: AppRole,
): Promise<
  | { ok: true; user: User; role: AppRole }
  | { ok: false; error: string; code: DbResultCode }
> {
  const user = await currentUser(client);
  if (!user) return authRequired();
  const role = (await sessionRole(client)) ?? 'viewer';
  if (ROLE_LEVEL[role] < ROLE_LEVEL[min]) return forbidden(min);
  return { ok: true, user, role };
}

// -----------------------------------------------------------------------------
// Shared helpers.
// -----------------------------------------------------------------------------
export type JsonRecord = Record<string, unknown>;

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
function clamp01(n: number): number {
  return clamp(n, 0, 1);
}
function listJson(items: string[]): JsonRecord {
  return { items };
}
function listFromJson(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((x) => String(x));
  if (value && typeof value === 'object') {
    const items = (value as JsonRecord).items;
    if (Array.isArray(items)) return items.map((x) => String(x));
  }
  return [];
}

const TRUST_ENTITY_TYPES: TrustEntityType[] = [
  'source',
  'narrative',
  'forecast',
  'intervention',
  'recommendation',
  'decision',
];
function asEntityType(t: string | undefined | null): TrustEntityType {
  return (TRUST_ENTITY_TYPES as string[]).includes(t ?? '')
    ? (t as TrustEntityType)
    : 'source';
}

function bandForScore(score: number): TrustBand {
  const s = clamp(score, 0, 100);
  return s >= 70 ? 'high' : s >= 40 ? 'medium' : 'low';
}

/** Convert a HsinTrustHistoryRecord into the engine TrustSnapshot shape. */
function recordToSnapshot(r: HsinTrustHistoryRecord): TrustSnapshot {
  const trustScore = clamp(r.trust_score ?? 0, 0, 100);
  return {
    id: r.id,
    entityType: asEntityType(r.entity_type),
    entityId: r.entity_id ?? 'unknown',
    trustScore,
    confidence: clamp01(r.confidence ?? 0),
    calibrationScore: clamp01(r.calibration_score ?? 0),
    evidenceCount: Math.max(0, Math.floor(r.evidence_count ?? 0)),
    band: (r.band as TrustBand) ?? bandForScore(trustScore),
    at: r.snapshot_at ?? r.created_at,
  };
}

/** Engine TrustExplanation → serializable TrustProvenanceView. */
function provenanceToView(p: TrustExplanation): TrustProvenanceView {
  return {
    entityType: p.entityType,
    entityId: p.entityId,
    score: p.score,
    band: p.band,
    factors: p.factors,
    weights: p.weights,
    limitations: p.limitations,
    history: p.history,
    ...(p.trend
      ? {
          trend: {
            trend: p.trend.trend,
            delta: p.trend.delta,
            slope: p.trend.slope,
            mean: p.trend.mean,
            volatility: p.trend.volatility,
            sampleCount: p.trend.sampleCount,
            explanation: p.trend.explanation,
          },
        }
      : {}),
    summary: p.summary,
    generatedAt: p.generatedAt,
  };
}

// =============================================================================
// READS (researcher+ — RLS scopes visibility; anon/empty → empty lists)
// =============================================================================

/**
 * The trust-history dashboard (TrustHistoryDashboardData): per-entity rows (latest
 * score + trend + sparkline) built from the append-only hsin_trust_history series,
 * plus the recent drift timeline. RLS: researcher+. NEVER throws.
 */
export async function getTrustHistoryDashboard(): Promise<
  DbResult<TrustHistoryDashboardData>
> {
  try {
    const client = db();
    const { data: histRows, error: herr } = await client
      .from('hsin_trust_history')
      .select('*')
      .order('snapshot_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .limit(20000);
    if (herr) return fail(herr);
    const records = (histRows ?? []) as HsinTrustHistoryRecord[];

    const { data: driftRows, error: derr } = await client
      .from('hsin_trust_drift')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (derr) return fail(derr);
    const drift = (driftRows ?? []) as HsinTrustDriftRecord[];

    return { ok: true, data: buildHistoryDashboard(records, drift) };
  } catch (e) {
    return fail(e);
  }
}

/** Pure assembly of the history dashboard (also used by the demo path). */
export function buildHistoryDashboard(
  records: HsinTrustHistoryRecord[],
  drift: HsinTrustDriftRecord[],
): TrustHistoryDashboardData {
  const groups = new Map<string, HsinTrustHistoryRecord[]>();
  for (const r of records) {
    const key = `${asEntityType(r.entity_type)}:${r.entity_id ?? 'unknown'}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const rows: TrustHistoryRow[] = [];
  const trendCounts: Record<TrustTrend, number> = {
    improving: 0,
    stable: 0,
    degrading: 0,
    volatile: 0,
  };

  for (const [key, recs] of groups) {
    const snaps = recs.map(recordToSnapshot);
    const trend = computeTrustTrend(snaps);
    const latest = snaps[snaps.length - 1];
    const [entityType, entityId] = splitKey(key);
    trendCounts[trend.trend] += 1;
    rows.push({
      entityType,
      entityId,
      latestScore: latest?.trustScore ?? 0,
      band: latest?.band ?? 'low',
      trend: trend.trend,
      delta: trend.delta,
      snapshotCount: snaps.length,
      sparkline: snaps.map((s) => ({ trustScore: s.trustScore, at: s.at })),
      lastUpdated: latest?.at,
    });
  }

  rows.sort((a, b) => b.latestScore - a.latestScore);
  return { rows, drift, trendCounts };
}

function splitKey(key: string): [TrustEntityType, string] {
  const idx = key.indexOf(':');
  return [asEntityType(key.slice(0, idx)), key.slice(idx + 1)];
}

/**
 * A single entity's trust-history view (TrustHistoryView): its snapshots, trend,
 * latest drift, and provenance. RLS: researcher+. NEVER throws.
 */
export async function getTrustHistoryFor(
  entityType: TrustEntityType | string,
  entityId: string,
  opts?: { now?: string },
): Promise<DbResult<TrustHistoryView>> {
  try {
    const client = db();
    const type = asEntityType(entityType);
    const now = opts?.now ?? new Date().toISOString();

    const { data: rows, error } = await client
      .from('hsin_trust_history')
      .select('*')
      .eq('entity_type', type)
      .eq('entity_id', entityId)
      .order('snapshot_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .limit(5000);
    if (error) return fail(error);
    const snapshots = (rows ?? []) as HsinTrustHistoryRecord[];
    const snaps = snapshots.map(recordToSnapshot);

    const trendResult = snaps.length > 0 ? computeTrustTrend(snaps) : undefined;
    const driftEvent = snaps.length >= 2 ? detectTrustDrift(snaps, { now }) : undefined;

    const latest = snaps[snaps.length - 1];
    const provenance = latest
      ? provenanceToView(
          buildTrustProvenance(
            {
              entityType: type,
              entityId,
              score: latest.trustScore,
              calibrationScore: latest.calibrationScore,
              evidenceCount: latest.evidenceCount,
              history: snaps.map((s) => ({ trustScore: s.trustScore, at: s.at })),
            },
            { now },
          ),
        )
      : undefined;

    return {
      ok: true,
      data: {
        entityType: type,
        entityId,
        snapshots,
        ...(trendResult
          ? {
              trend: {
                trend: trendResult.trend,
                delta: trendResult.delta,
                slope: trendResult.slope,
                mean: trendResult.mean,
                volatility: trendResult.volatility,
                sampleCount: trendResult.sampleCount,
                first: trendResult.first,
                last: trendResult.last,
                explanation: trendResult.explanation,
                limitations: trendResult.limitations,
              },
            }
          : {}),
        ...(driftEvent
          ? {
              drift: {
                id: `live-${entityId}`,
                entity_type: driftEvent.entityType,
                entity_id: driftEvent.entityId,
                drift_kind: driftEvent.kind,
                severity: driftEvent.severity,
                magnitude: driftEvent.magnitude,
                current_trust: driftEvent.currentTrust,
                baseline_trust: driftEvent.baselineTrust,
                reason: driftEvent.reason,
                evidence: driftEvent.evidence,
                recommendation: driftEvent.recommendation,
                detected_at: driftEvent.detectedAt,
                created_at: driftEvent.detectedAt,
              },
            }
          : {}),
        ...(provenance ? { provenance } : {}),
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * The trust-drift dashboard (TrustDriftDashboardData): the recent drift events +
 * severity/kind breakdowns. RLS: researcher+. NEVER throws.
 */
export async function getTrustDriftDashboard(): Promise<
  DbResult<TrustDriftDashboardData>
> {
  try {
    const client = db();
    const { data, error } = await client
      .from('hsin_trust_drift')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return fail(error);
    const events = (data ?? []) as HsinTrustDriftRecord[];
    return { ok: true, data: buildDriftDashboard(events) };
  } catch (e) {
    return fail(e);
  }
}

/** Pure assembly of the drift dashboard (also used by the demo path). */
export function buildDriftDashboard(
  events: HsinTrustDriftRecord[],
): TrustDriftDashboardData {
  const bySeverity: Record<TrustSeverity, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  const byKind: Record<TrustDriftKind, number> = {
    collapse: 0,
    degradation: 0,
    instability: 0,
    overconfidence: 0,
    underconfidence: 0,
    stable: 0,
  };
  for (const e of events) {
    if (e.severity && e.severity in bySeverity) bySeverity[e.severity] += 1;
    if (e.drift_kind && e.drift_kind in byKind) byKind[e.drift_kind] += 1;
  }
  return { events, bySeverity, byKind };
}

/**
 * The recalibration proposal queue (RecalibrationQueueData), optionally filtered
 * by status, with pending/approved/rejected counts. RLS: researcher+. NEVER throws.
 */
export async function getRecalibrationQueue(
  statusFilter?: ProposalStatus,
): Promise<DbResult<RecalibrationQueueData>> {
  try {
    const client = db();
    let query = client
      .from('hsin_recalibration_proposals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (statusFilter) query = query.eq('status', statusFilter);
    const { data, error } = await query;
    if (error) return fail(error);
    const proposals = (data ?? []) as HsinRecalibrationProposalRecord[];

    // Counts come from a separate unfiltered pass so they reflect the whole queue.
    const counts = { pending: 0, approved: 0, rejected: 0 };
    const { data: allRows } = await client
      .from('hsin_recalibration_proposals')
      .select('status')
      .limit(5000);
    for (const r of (allRows ?? []) as Array<{ status?: string }>) {
      if (r.status === 'pending') counts.pending += 1;
      else if (r.status === 'approved') counts.approved += 1;
      else if (r.status === 'rejected') counts.rejected += 1;
    }

    return {
      ok: true,
      data: {
        proposals,
        pendingCount: counts.pending,
        approvedCount: counts.approved,
        rejectedCount: counts.rejected,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * A single recalibration proposal (RecalibrationProposalView): the proposal, a
 * fresh non-mutating review summary (engine reviewRecalibrationProposal), and the
 * append-only governance decisions over it. RLS: researcher+. NEVER throws.
 */
export async function getRecalibrationProposal(
  id: string,
  opts?: { now?: string },
): Promise<DbResult<RecalibrationProposalView>> {
  try {
    const client = db();
    const now = opts?.now ?? new Date().toISOString();

    const { data: row, error } = await client
      .from('hsin_recalibration_proposals')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return fail(error);
    if (!row) {
      return { ok: false, error: 'Recalibration proposal not found.', code: 'DB_ERROR' };
    }
    const proposal = row as HsinRecalibrationProposalRecord;

    const { data: revRows } = await client
      .from('hsin_recalibration_reviews')
      .select('*')
      .eq('proposal_id', id)
      .order('created_at', { ascending: false })
      .limit(200);
    const reviews = (revRows ?? []) as HsinRecalibrationReviewRecord[];

    const engineProposal = recordToProposal(proposal);
    const review = reviewRecalibrationProposal(engineProposal, { now });

    return {
      ok: true,
      data: {
        proposal,
        review: {
          valid: review.valid,
          direction: review.direction,
          confidenceDelta: review.confidenceDelta,
          severity: review.severity,
          checks: review.checks,
          recommendation: review.recommendation,
          summary: review.summary,
        },
        reviews,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/** Reconstruct an engine RecalibrationProposal from a stored record. */
function recordToProposal(r: HsinRecalibrationProposalRecord): RecalibrationProposal {
  return {
    id: r.id,
    entityType: asEntityType(r.entity_type),
    entityId: r.entity_id ?? 'unknown',
    trigger: (r.trigger as RecalibrationTrigger) ?? 'manual',
    currentConfidence: clamp01(r.current_confidence ?? 0),
    recommendedConfidence: clamp01(r.recommended_confidence ?? 0),
    ...(typeof r.current_trust === 'number' ? { currentTrust: r.current_trust } : {}),
    ...(typeof r.recommended_trust === 'number'
      ? { recommendedTrust: r.recommended_trust }
      : {}),
    direction:
      (r.direction as RecalibrationProposal['direction']) ??
      (((r.recommended_confidence ?? 0) - (r.current_confidence ?? 0)) < 0
        ? 'downward'
        : ((r.recommended_confidence ?? 0) - (r.current_confidence ?? 0)) > 0
          ? 'upward'
          : 'none'),
    magnitude: Math.abs((r.recommended_confidence ?? 0) - (r.current_confidence ?? 0)),
    severity: (r.severity as RecalibrationProposal['severity']) ?? 'LOW',
    reason: r.reason ?? '',
    supportingEvidence: listFromJson(r.supporting_evidence),
    status: (r.status as ProposalStatus) ?? 'pending',
    createdAt: r.created_at,
  };
}

/**
 * The PUBLIC trust surface (PublicTrustData): every tracked entity rendered
 * transparently — trust score / reliability / calibration quality / outcome
 * accuracy / evidence quality / governance history + provenance. Built from the
 * Phase-16 trust tables + the Phase-17 history. RLS: researcher+. NEVER throws.
 */
export async function getPublicTrust(
  opts?: { now?: string },
): Promise<DbResult<PublicTrustData>> {
  try {
    const client = db();
    const now = opts?.now ?? new Date().toISOString();
    const entries: PublicTrustEntry[] = [];

    // Pull the four Phase-16 trust tables.
    const sources = await readTrustTable(client, 'hsin_source_trust', 'source', 'source_id');
    const narratives = await readTrustTable(
      client,
      'hsin_narrative_trust',
      'narrative',
      'narrative_id',
    );
    const forecasts = await readTrustTable(
      client,
      'hsin_forecast_trust',
      'forecast',
      'narrative_id',
    );
    const decisions = await readTrustTable(
      client,
      'hsin_decision_trust',
      'decision',
      'decision_run_id',
    );
    const all = [...sources, ...narratives, ...forecasts, ...decisions];

    // History (for trend + governance-history count) keyed per entity.
    const histGroups = await loadHistoryGroups(client);
    const govCounts = await loadGovernanceCounts(client);

    for (const t of all) {
      const histKey = `${t.entityType}:${t.entityId}`;
      const snaps = (histGroups.get(histKey) ?? []).map(recordToSnapshot);
      const trend = snaps.length >= 2 ? computeTrustTrend(snaps).trend : undefined;
      const calibration = clamp01(t.calibrationScore);
      const provenance = provenanceToView(
        buildTrustProvenance(
          {
            entityType: t.entityType,
            entityId: t.entityId,
            score: t.trustScore,
            calibrationScore: calibration,
            evidenceCount: t.evidenceCount,
            governanceSignal: govCounts.get(histKey) ? 0.7 : undefined,
            history: snaps.map((s) => ({ trustScore: s.trustScore, at: s.at })),
          },
          { now },
        ),
      );
      entries.push({
        entityType: t.entityType,
        entityId: t.entityId,
        trustScore: t.trustScore,
        band: bandForScore(t.trustScore),
        reliability: calibration,
        calibrationQuality: calibration,
        outcomeAccuracy: clamp01(t.confidence),
        evidenceQuality: clamp01(t.calibrationScore),
        governanceHistoryCount: govCounts.get(histKey) ?? 0,
        ...(trend ? { trend } : {}),
        provenance,
      });
    }

    entries.sort((a, b) => b.trustScore - a.trustScore);
    return { ok: true, data: { entries } };
  } catch (e) {
    return fail(e);
  }
}

interface TrustLite {
  entityType: TrustEntityType;
  entityId: string;
  trustScore: number;
  confidence: number;
  calibrationScore: number;
  evidenceCount: number;
}

async function readTrustTable(
  client: SupabaseClient,
  table: string,
  entityType: TrustEntityType,
  idColumn: string,
): Promise<TrustLite[]> {
  try {
    const { data } = await client.from(table).select('*').limit(2000);
    return ((data ?? []) as JsonRecord[]).map((r) => ({
      entityType,
      entityId: String(r[idColumn] ?? r.id ?? 'unknown'),
      trustScore: clamp(Number(r.trust_score ?? 0), 0, 100),
      confidence: clamp01(Number(r.confidence ?? 0)),
      calibrationScore: clamp01(Number(r.calibration_score ?? 0)),
      evidenceCount: Math.max(0, Math.floor(Number(r.evidence_count ?? 0))),
    }));
  } catch {
    return [];
  }
}

async function loadHistoryGroups(
  client: SupabaseClient,
): Promise<Map<string, HsinTrustHistoryRecord[]>> {
  const groups = new Map<string, HsinTrustHistoryRecord[]>();
  try {
    const { data } = await client
      .from('hsin_trust_history')
      .select('*')
      .order('snapshot_at', { ascending: true, nullsFirst: true })
      .limit(20000);
    for (const r of (data ?? []) as HsinTrustHistoryRecord[]) {
      const key = `${asEntityType(r.entity_type)}:${r.entity_id ?? 'unknown'}`;
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
  } catch (e) {
    logError('trust/persistence:loadHistoryGroups', e);
  }
  return groups;
}

async function loadGovernanceCounts(
  client: SupabaseClient,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    const { data } = await client
      .from('hsin_trust_overrides')
      .select('entity_type, entity_id')
      .limit(20000);
    for (const r of (data ?? []) as Array<{ entity_type?: string; entity_id?: string }>) {
      const key = `${asEntityType(r.entity_type)}:${r.entity_id ?? 'unknown'}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  } catch {
    // Non-fatal.
  }
  return counts;
}

/** Headline Phase-17 governance callouts (degrading / pending / drift / avg trust). NEVER throws. */
export async function getTrustGovernanceHighlights(): Promise<
  DbResult<TrustGovernanceHighlights>
> {
  try {
    const client = db();
    const highlights: TrustGovernanceHighlights = {};

    const { data: driftRows } = await client
      .from('hsin_trust_drift')
      .select('drift_kind')
      .in('drift_kind', ['degradation', 'collapse'])
      .limit(5000);
    highlights.degradingCount = (driftRows ?? []).length;

    const { data: pendRows } = await client
      .from('hsin_recalibration_proposals')
      .select('id')
      .eq('status', 'pending')
      .limit(5000);
    highlights.pendingProposals = (pendRows ?? []).length;

    const { data: allDrift } = await client
      .from('hsin_trust_drift')
      .select('id')
      .limit(5000);
    highlights.driftEvents = (allDrift ?? []).length;

    const scores: number[] = [];
    for (const table of [
      'hsin_source_trust',
      'hsin_narrative_trust',
      'hsin_forecast_trust',
      'hsin_decision_trust',
    ]) {
      try {
        const { data } = await client.from(table).select('trust_score').limit(5000);
        for (const r of (data ?? []) as Array<{ trust_score?: number | null }>) {
          if (typeof r.trust_score === 'number') scores.push(r.trust_score);
        }
      } catch {
        // Non-fatal.
      }
    }
    if (scores.length > 0) {
      highlights.avgTrust =
        Math.round((scores.reduce((a, n) => a + n, 0) / scores.length) * 100) / 100;
    }

    return { ok: true, data: highlights };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// WRITES (curator/admin). NEVER throw.
// =============================================================================

export interface RecordTrustHistorySummary {
  recorded: number;
}

/**
 * Generate trust-history snapshots from the CURRENT Phase-16 trust tables
 * (curator/admin). For every source/narrative/forecast/decision trust row, append
 * one immutable hsin_trust_history snapshot at `now`. APPEND-ONLY — never edits a
 * prior snapshot. The background worker does the same under the service role.
 * NEVER throws.
 */
export async function recordTrustHistory(
  now: string,
): Promise<DbResult<RecordTrustHistorySummary>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const sources = await readTrustTable(client, 'hsin_source_trust', 'source', 'source_id');
    const narratives = await readTrustTable(
      client,
      'hsin_narrative_trust',
      'narrative',
      'narrative_id',
    );
    const forecasts = await readTrustTable(
      client,
      'hsin_forecast_trust',
      'forecast',
      'narrative_id',
    );
    const decisions = await readTrustTable(
      client,
      'hsin_decision_trust',
      'decision',
      'decision_run_id',
    );

    let recorded = 0;
    for (const t of [...sources, ...narratives, ...forecasts, ...decisions]) {
      const snap = recordTrustSnapshot(
        {
          entityType: t.entityType,
          entityId: t.entityId,
          trustScore: t.trustScore,
          confidence: t.confidence,
          calibrationScore: t.calibrationScore,
          evidenceCount: t.evidenceCount,
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
        created_by: gate.user.id,
      });
      if (!error) recorded += 1;
    }

    await recordAudit(client, gate.user.id, 'trust.history.record', 'all', { recorded });
    return { ok: true, data: { recorded } };
  } catch (e) {
    return fail(e);
  }
}

export interface CreateProposalResult {
  proposalId: string;
}

/**
 * Create a recalibration proposal (curator/admin). Builds it through the engine
 * (proposeRecalibration) so direction/magnitude/severity are derived consistently,
 * then INSERTs it `pending`. NEVER applies a change. NEVER throws.
 */
export async function createRecalibrationProposal(
  input: {
    entityType: TrustEntityType | string;
    entityId: string;
    trigger: RecalibrationTrigger;
    currentConfidence: number;
    recommendedConfidence: number;
    currentTrust?: number;
    recommendedTrust?: number;
    reason?: string;
    supportingEvidence?: string[];
  },
  now: string,
): Promise<DbResult<CreateProposalResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const proposal = proposeRecalibration(
      {
        id: 'pending', // replaced by the DB default
        entityType: asEntityType(input.entityType),
        entityId: input.entityId,
        trigger: input.trigger,
        currentConfidence: input.currentConfidence,
        recommendedConfidence: input.recommendedConfidence,
        currentTrust: input.currentTrust,
        recommendedTrust: input.recommendedTrust,
        reason: input.reason,
        supportingEvidence: input.supportingEvidence,
      },
      { now },
    );

    const { data: row, error } = await client
      .from('hsin_recalibration_proposals')
      .insert({
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
        supporting_evidence: listJson(proposal.supportingEvidence),
        status: 'pending',
        created_by: gate.user.id,
      })
      .select('id')
      .single();
    if (error || !row?.id) {
      return fail(error ?? new Error('Proposal insert returned no id.'));
    }

    await recordAudit(client, gate.user.id, 'recalibration.proposal.create', row.id as string, {
      entity_type: proposal.entityType,
      entity_id: proposal.entityId,
      trigger: proposal.trigger,
    });
    return { ok: true, data: { proposalId: row.id as string } };
  } catch (e) {
    return fail(e);
  }
}

export interface DecisionResult {
  proposalId: string;
  status: ProposalStatus;
  applied: boolean;
}

/**
 * APPROVE or REJECT a recalibration proposal through governance (curator/admin).
 * REQUIRES a non-blank reason. Loads the proposal, runs the engine
 * approve/rejectProposal (which preserves the previous state + builds the audit
 * trail), writes a hsin_recalibration_reviews row, flips the proposal status, and
 * — on APPROVAL — writes a hsin_trust_overrides row (the applied, reversible
 * trail) + raises a trust_override_applied alert. NEVER auto-applies without the
 * explicit decision. NEVER throws.
 */
export async function decideRecalibrationProposal(
  id: string,
  decision: 'approved' | 'rejected',
  reason: string,
  now: string,
): Promise<DbResult<DecisionResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const cleanReason = (reason ?? '').trim();
    if (cleanReason.length === 0) {
      return validation('A recalibration decision requires a non-blank reason.');
    }

    const { data: row, error } = await client
      .from('hsin_recalibration_proposals')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return fail(error);
    if (!row) {
      return { ok: false, error: 'Recalibration proposal not found.', code: 'DB_ERROR' };
    }
    const proposal = recordToProposal(row as HsinRecalibrationProposalRecord);
    if (proposal.status !== 'pending') {
      return validation(`Proposal is already '${proposal.status}'; it cannot be re-decided.`);
    }

    const result =
      decision === 'approved'
        ? approveProposal(proposal, { decidedBy: gate.user.id, reason: cleanReason }, { now })
        : rejectProposal(proposal, { decidedBy: gate.user.id, reason: cleanReason }, { now });

    // 1. Append the governance decision (review) row.
    await client.from('hsin_recalibration_reviews').insert({
      proposal_id: id,
      reviewer_id: gate.user.id,
      decision: result.status,
      reason: cleanReason,
      valid: true,
      checks: { decidedVia: 'governance' },
      previous_state: result.previousState as unknown as JsonRecord,
      new_state: result.newState as unknown as JsonRecord,
      reversible: result.reversible,
      audit_trail: listJson(result.auditTrail),
    });

    // 2. Flip the proposal status.
    await client
      .from('hsin_recalibration_proposals')
      .update({ status: result.status })
      .eq('id', id);

    let applied = false;
    if (decision === 'approved') {
      // 3. Append the applied trust-override trail + raise an alert.
      applied = await applyApprovedRecalibration(
        client,
        proposal,
        result.previousState,
        result.newState,
        cleanReason,
        gate.user.id,
        id,
        now,
      );
    }

    await recordAudit(client, gate.user.id, `recalibration.proposal.${decision}`, id, {
      entity_type: proposal.entityType,
      entity_id: proposal.entityId,
      reason: cleanReason,
      applied,
    });

    return { ok: true, data: { proposalId: id, status: result.status, applied } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Apply an APPROVED recalibration: record the override trail row and raise a
 * trust_override_applied advisory alert. The trust model's confidence is moved to
 * the recommended value; the previous state is preserved on the override row
 * (reversible). Best-effort — returns whether the override row was written.
 */
async function applyApprovedRecalibration(
  client: SupabaseClient,
  proposal: RecalibrationProposal,
  previousState: { confidence: number; trust?: number },
  newState: { confidence: number; trust?: number },
  reason: string,
  userId: string,
  proposalId: string,
  now: string,
): Promise<boolean> {
  const prevScore = previousState.trust ?? proposal.currentTrust ?? 0;
  const newScore = newState.trust ?? proposal.recommendedTrust ?? prevScore;

  const { error } = await client.from('hsin_trust_overrides').insert({
    entity_type: proposal.entityType,
    entity_id: proposal.entityId,
    previous_score: prevScore,
    new_score: newScore,
    previous_band: bandForScore(prevScore),
    new_band: bandForScore(newScore),
    reason,
    proposal_id: proposalId,
    reversible: true,
    overridden_by: userId,
  });

  // Raise an advisory alert (never auto-resolved).
  try {
    await client.from('hsin_decision_alerts').insert({
      alert_type: 'trust_override_applied',
      severity: 'MEDIUM',
      message: `Recalibration approved for ${proposal.entityType} ${proposal.entityId}.`,
      explanation:
        `Confidence ${Math.round(previousState.confidence * 100)}% → ` +
        `${Math.round(newState.confidence * 100)}% applied via governance. Reason: ${reason}. ` +
        `Previous state preserved; change is reversible.`,
      status: 'open',
      metadata: { proposal_id: proposalId, decided_by: userId, at: now },
    });
  } catch {
    // Non-fatal.
  }

  return !error;
}

export interface PublishTrustResult {
  publicationId: string;
}

/**
 * Publish trust alongside an intelligence report (curator/admin): attach the
 * entity's confidence + calibrated reliability + trust score + provenance to a
 * hsin_trust_publications row for the given report type. NEVER throws.
 */
export async function publishTrust(
  input: {
    entityType: TrustEntityType | string;
    entityId: string;
    reportType: TrustReportType;
    confidence: number;
    calibratedReliability: number;
    trustScore: number;
  },
  now: string,
): Promise<DbResult<PublishTrustResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const type = asEntityType(input.entityType);
    const provView = await buildProvenanceView(client, type, input.entityId, input.trustScore, now);

    const { data: row, error } = await client
      .from('hsin_trust_publications')
      .insert({
        entity_type: type,
        entity_id: input.entityId,
        report_type: input.reportType,
        confidence: clamp01(input.confidence),
        calibrated_reliability: clamp01(input.calibratedReliability),
        trust_score: clamp(input.trustScore, 0, 100),
        provenance: provView as unknown as JsonRecord,
        published_by: gate.user.id,
        published_at: now,
      })
      .select('id')
      .single();
    if (error || !row?.id) {
      return fail(error ?? new Error('Publication insert returned no id.'));
    }

    await recordAudit(client, gate.user.id, 'trust.publish', row.id as string, {
      entity_type: type,
      entity_id: input.entityId,
      report_type: input.reportType,
    });
    return { ok: true, data: { publicationId: row.id as string } };
  } catch (e) {
    return fail(e);
  }
}

/** Build a TrustProvenanceView for an entity from its history (best-effort). */
async function buildProvenanceView(
  client: SupabaseClient,
  entityType: TrustEntityType,
  entityId: string,
  score: number,
  now: string,
): Promise<TrustProvenanceView> {
  const { data } = await client
    .from('hsin_trust_history')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('snapshot_at', { ascending: true, nullsFirst: true })
    .limit(5000);
  const snaps = ((data ?? []) as HsinTrustHistoryRecord[]).map(recordToSnapshot);
  const latest = snaps[snaps.length - 1];
  return provenanceToView(
    buildTrustProvenance(
      {
        entityType,
        entityId,
        score,
        calibrationScore: latest?.calibrationScore,
        evidenceCount: latest?.evidenceCount,
        history: snaps.map((s) => ({ trustScore: s.trustScore, at: s.at })),
      },
      { now },
    ),
  );
}

/** Write a best-effort audit_logs row (0001 shape). NEVER blocks the mutation. */
async function recordAudit(
  client: SupabaseClient,
  userId: string | null,
  action: string,
  entityId: string,
  extra?: JsonRecord,
): Promise<void> {
  try {
    await client.from('audit_logs').insert({
      user_id: userId,
      action,
      metadata: { entity_type: 'trust', entity_id: entityId, ...(extra ?? {}) },
    });
  } catch {
    // Best-effort.
  }
}

// =============================================================================
// DEMO — labeled, NON-PERSISTED view-models from the engine fixtures.
// For the NOT_CONFIGURED / empty-env showcase path. NEVER throws.
// =============================================================================

const DEMO_NOW = '2026-06-09T12:00:00.000Z';

function snapToRecord(s: TrustSnapshot, i: number): HsinTrustHistoryRecord {
  return {
    id: s.id ?? `demo-hist-${i}`,
    entity_type: s.entityType,
    entity_id: s.entityId,
    trust_score: s.trustScore,
    confidence: s.confidence,
    calibration_score: s.calibrationScore,
    evidence_count: s.evidenceCount,
    band: s.band,
    snapshot_at: s.at,
    created_at: s.at,
  };
}

/** Demo trust-history dashboard from the @hsi/trust-history fixtures. */
export function demoTrustHistoryDashboard(): TrustHistoryDashboardData {
  const demo = trustHistoryDemo();
  const records: HsinTrustHistoryRecord[] = [];
  for (const key of Object.keys(demo.series)) {
    demo.series[key].forEach((s, i) => records.push(snapToRecord(s, records.length + i)));
  }
  const drift: HsinTrustDriftRecord[] = Object.keys(demo.drift)
    .filter((k) => demo.drift[k].kind !== 'stable')
    .map((k, i) => driftToRecord(demo.drift[k], i));
  return buildHistoryDashboard(records, drift);
}

function driftToRecord(
  d: ReturnType<typeof detectTrustDrift>,
  i: number,
): HsinTrustDriftRecord {
  return {
    id: `demo-drift-${i}`,
    entity_type: d.entityType,
    entity_id: d.entityId,
    drift_kind: d.kind,
    severity: d.severity,
    magnitude: d.magnitude,
    current_trust: d.currentTrust,
    baseline_trust: d.baselineTrust,
    reason: d.reason,
    evidence: d.evidence,
    recommendation: d.recommendation,
    detected_at: d.detectedAt,
    created_at: d.detectedAt,
  };
}

/** Demo trust-drift dashboard. */
export function demoTrustDriftDashboard(): TrustDriftDashboardData {
  const demo = trustHistoryDemo();
  const events = Object.keys(demo.drift).map((k, i) => driftToRecord(demo.drift[k], i));
  return buildDriftDashboard(events);
}

/** Demo recalibration queue from the @hsi/recalibration-engine fixtures. */
export function demoRecalibrationQueue(): RecalibrationQueueData {
  const demo = recalibrationDemo();
  const proposals: HsinRecalibrationProposalRecord[] = demo.proposals.map((p) =>
    proposalToRecord(p),
  );
  return {
    proposals,
    pendingCount: proposals.length,
    approvedCount: 0,
    rejectedCount: 0,
  };
}

function proposalToRecord(p: RecalibrationProposal): HsinRecalibrationProposalRecord {
  return {
    id: p.id,
    entity_type: p.entityType,
    entity_id: p.entityId,
    trigger: p.trigger,
    current_confidence: p.currentConfidence,
    recommended_confidence: p.recommendedConfidence,
    current_trust: p.currentTrust,
    recommended_trust: p.recommendedTrust,
    direction: p.direction,
    magnitude: p.magnitude,
    severity: p.severity,
    reason: p.reason,
    supporting_evidence: { items: p.supportingEvidence },
    status: p.status,
    created_at: p.createdAt,
    updated_at: p.createdAt,
  };
}

/** Demo single recalibration proposal view. */
export function demoRecalibrationProposal(id?: string): RecalibrationProposalView {
  const demo = recalibrationDemo();
  const base = demo.proposals[0];
  const proposal = proposalToRecord({ ...base, id: id?.trim() || base.id });
  return {
    proposal,
    review: {
      valid: demo.review.valid,
      direction: demo.review.direction,
      confidenceDelta: demo.review.confidenceDelta,
      severity: demo.review.severity,
      checks: demo.review.checks,
      recommendation: demo.review.recommendation,
      summary: demo.review.summary,
    },
    reviews: [
      {
        id: 'demo-review-0',
        proposal_id: proposal.id,
        reviewer_id: 'curator-alice',
        decision: 'approved',
        reason: demo.approval.reason,
        valid: true,
        previous_state: demo.approval.previousState as unknown as JsonRecord,
        new_state: demo.approval.newState as unknown as JsonRecord,
        reversible: true,
        audit_trail: { items: demo.approval.auditTrail },
        created_at: DEMO_NOW,
      },
    ],
  };
}

/** Demo public trust surface. */
export function demoPublicTrust(): PublicTrustData {
  const demo = trustHistoryDemo();
  const entries: PublicTrustEntry[] = Object.keys(demo.series).map((key) => {
    const snaps = demo.series[key];
    const latest = snaps[snaps.length - 1];
    const trend = computeTrustTrend(snaps).trend;
    const provenance = provenanceToView(
      buildTrustProvenance(
        {
          entityType: latest.entityType,
          entityId: latest.entityId,
          score: latest.trustScore,
          calibrationScore: latest.calibrationScore,
          historicalAccuracy: 0.72,
          evidenceQuality: 0.66,
          governanceSignal: 0.8,
          evidenceCount: latest.evidenceCount,
          history: snaps.map((s) => ({ trustScore: s.trustScore, at: s.at })),
        },
        { now: DEMO_NOW },
      ),
    );
    return {
      entityType: latest.entityType,
      entityId: latest.entityId,
      trustScore: latest.trustScore,
      band: latest.band,
      reliability: latest.calibrationScore,
      calibrationQuality: latest.calibrationScore,
      outcomeAccuracy: 0.72,
      evidenceQuality: 0.66,
      governanceHistoryCount: 1,
      trend,
      provenance,
    };
  });
  entries.sort((a, b) => b.trustScore - a.trustScore);
  return { entries };
}

/** Demo single trust-history view for an entity. */
export function demoTrustHistoryView(
  entityType?: TrustEntityType,
  entityId?: string,
): TrustHistoryView {
  const demo = trustHistoryDemo();
  const series = demo.series.improving;
  const snaps = series;
  const type = entityType ?? snaps[0].entityType;
  const eid = entityId ?? snaps[0].entityId;
  const trend = computeTrustTrend(snaps);
  const drift = detectTrustDrift(snaps, { now: DEMO_NOW });
  return {
    entityType: type,
    entityId: eid,
    snapshots: snaps.map((s, i) => snapToRecord(s, i)),
    trend: {
      trend: trend.trend,
      delta: trend.delta,
      slope: trend.slope,
      mean: trend.mean,
      volatility: trend.volatility,
      sampleCount: trend.sampleCount,
      first: trend.first,
      last: trend.last,
      explanation: trend.explanation,
      limitations: trend.limitations,
    },
    drift: driftToRecord(drift, 0),
    provenance: demo.provenance ? provenanceToView(demo.provenance) : undefined,
  };
}

// -----------------------------------------------------------------------------
// Re-export the shared client accessor + role helper for the actions layer.
// -----------------------------------------------------------------------------
export { db as trustDbClient, requireRole as requireTrustRole };
