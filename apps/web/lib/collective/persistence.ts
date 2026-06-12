// =============================================================================
// HSIN Phase 20 — Collective Intelligence & Consensus data-access layer.
// SERVER-ONLY.
//
// "What investigations are active, who disagrees, how strong is the consensus,
// who contributed, and how trustworthy are they?" The persistence layer for the
// Phase-20 collective-intelligence tables (migration 0024):
//
//   * INVESTIGATIONS — hsin_investigations (+ findings/challenges/alternatives/
//     endorsements + evidence claims/reviews).
//   * CONSENSUS      — hsin_consensus_snapshots (append-only) + hsin_consensus_reviews.
//   * CONTRIBUTORS   — hsin_contributor_scores.
//
// The PURE engines live in '@hsi/collective-intelligence' (lifecycle, findings,
// evidence, reputation, governance) and '@hsi/consensus-engine'. This DAL reads
// the persisted collaboration, feeds it (with an injected `now`) into the engines
// for snapshots / scores / governance, and persists the results.
//
// SERVER-ONLY — never import from a 'use client' module. Mirrors prior DALs.
// GOVERNANCE: no auto-consensus / auto-truth / auto-publish; every acceptance is
// a human decision (reviewer + reason + audit). NEVER throws; empty env →
// NOT_CONFIGURED.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient } from '@/lib/supabase/server';
import {
  approveConsensus,
  archiveConsensus,
  calculateDiscussionMetrics,
  collectiveDemo,
  createInvestigation as engineCreateInvestigation,
  escalateConsensus,
  rejectConsensus,
  submitChallenge as engineSubmitChallenge,
  submitFinding as engineSubmitFinding,
  transitionInvestigation,
  investigationProgress,
  type AlternativeNarrative,
  type Challenge,
  type Endorsement,
  type Finding,
  type InvestigationState as EngineInvState,
} from '@hsi/collective-intelligence';
import {
  buildConsensusSnapshot,
  type ConsensusFinding,
  type ConsensusSnapshot,
} from '@hsi/consensus-engine';
import type {
  AppRole,
  CollectiveHighlights,
  ConsensusBoardData,
  ConsensusDecision,
  ConsensusDetailData,
  ContributorsBoardData,
  DebatesBoardData,
  HsinAlternativeNarrativeRecord,
  HsinChallengeRecord,
  HsinConsensusReviewRecord,
  HsinConsensusSnapshotRecord,
  HsinContributorScoreRecord,
  HsinEvidenceClaimRecord,
  HsinFindingRecord,
  HsinInvestigationRecord,
  InvestigationBoardRow,
  InvestigationDetailData,
  InvestigationState,
  InvestigationsBoardData,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Result type + helpers.
// -----------------------------------------------------------------------------
export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED = 'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';
const AUTH_REQUIRED = 'Sign in to continue.';

export function fail(error: unknown): { ok: false; error: string; code: DbResultCode } {
  logError('collective/persistence', error);
  if (error instanceof Error && /required|not configured|SUPABASE_/i.test(error.message) && /key|url/i.test(error.message)) {
    return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
  }
  return { ok: false, error: formatErrorMessage(error), code: 'DB_ERROR' };
}
function authRequired(): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: AUTH_REQUIRED, code: 'AUTH_REQUIRED' };
}
export function forbidden(required: AppRole): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: `Requires the ${required} role or higher.`, code: 'FORBIDDEN' };
}
function validation(message: string): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: message, code: 'FORBIDDEN' };
}

function db(): SupabaseClient {
  return createClient();
}
async function currentUser(client: SupabaseClient): Promise<User | null> {
  const { data: { user } } = await client.auth.getUser();
  return user ?? null;
}
const ROLE_LEVEL: Record<AppRole, number> = { viewer: 1, researcher: 2, reviewer: 3, curator: 4, admin: 5 };
async function sessionRole(client: SupabaseClient): Promise<AppRole | null> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data } = await client.from('users').select('role').eq('id', user.id).single();
  const role = (data?.role as string | undefined) ?? 'viewer';
  return (role in ROLE_LEVEL ? role : 'viewer') as AppRole;
}
async function requireRole(
  client: SupabaseClient,
  min: AppRole,
): Promise<{ ok: true; user: User; role: AppRole } | { ok: false; error: string; code: DbResultCode }> {
  const user = await currentUser(client);
  if (!user) return authRequired();
  const role = (await sessionRole(client)) ?? 'viewer';
  if (ROLE_LEVEL[role] < ROLE_LEVEL[min]) return forbidden(min);
  return { ok: true, user, role };
}

type JsonRecord = Record<string, unknown>;
function listJson(items: unknown[]): JsonRecord {
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
function num(v: unknown, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

// =============================================================================
// Build consensus findings from DB rows (findings + challenge tallies + trust).
// =============================================================================
function toConsensusFindings(
  findings: HsinFindingRecord[],
  challenges: HsinChallengeRecord[],
  contributorTrust: Map<string, number>,
): ConsensusFinding[] {
  return findings.map((f) => {
    const targeted = challenges.filter((c) => c.target_finding_id === f.id);
    return {
      id: f.id,
      position: f.position ?? 'Unspecified',
      contributorId: f.contributor_id ?? 'unknown',
      confidence: num(f.confidence, 0.5),
      evidenceStrength: num(f.confidence, 0.5), // proxy: stated confidence (documented).
      contributorTrust: contributorTrust.get(f.contributor_id ?? '') ?? 50,
      challengesUpheld: targeted.filter((c) => c.status === 'upheld').length,
      challengesRejected: targeted.filter((c) => c.status === 'rejected').length,
      endorsements: num(f.endorsements, 0),
    };
  });
}

function snapshotToRecord(s: ConsensusSnapshot): HsinConsensusSnapshotRecord {
  return {
    id: `live-${s.investigationId}`,
    investigation_id: s.investigationId,
    consensus_position: s.consensusPosition ?? undefined,
    agreement_score: s.agreementScore,
    evidence_strength: s.evidenceStrength,
    confidence: s.confidence,
    positions: { items: s.positions },
    dissent_positions: { items: s.dissentPositions },
    confidence_distribution: { items: s.confidenceDistribution },
    sample_count: s.sampleCount,
    contributor_count: s.contributorCount,
    explanation: { items: s.explanation },
    limitations: { items: s.limitations },
    generated_at: s.generatedAt,
    created_at: s.generatedAt,
  };
}

async function loadContributorTrust(client: SupabaseClient): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const { data } = await client.from('hsin_contributor_scores').select('contributor_id, trust').limit(20000);
    for (const r of (data ?? []) as Array<{ contributor_id?: string; trust?: number }>) {
      if (r.contributor_id) map.set(r.contributor_id, num(r.trust, 50));
    }
  } catch {
    // non-fatal.
  }
  return map;
}

// =============================================================================
// READS (researcher+)
// =============================================================================

/** The investigations board. RLS: researcher+. NEVER throws. */
export async function getInvestigationsBoard(): Promise<DbResult<InvestigationsBoardData>> {
  try {
    const client = db();
    const { data: invRows, error } = await client.from('hsin_investigations').select('*').order('updated_at', { ascending: false }).limit(2000);
    if (error) return fail(error);
    const investigations = (invRows ?? []) as HsinInvestigationRecord[];

    const { data: findingRows } = await client.from('hsin_findings').select('investigation_id, contributor_id').limit(20000);
    const { data: challengeRows } = await client.from('hsin_challenges').select('investigation_id').limit(20000);
    const { data: snapRows } = await client.from('hsin_consensus_snapshots').select('investigation_id, consensus_position, agreement_score, created_at').order('created_at', { ascending: false }).limit(5000);

    const findingsByInv = groupCount((findingRows ?? []) as Array<{ investigation_id?: string; contributor_id?: string }>, (r) => r.investigation_id);
    const contributorsByInv = groupSet((findingRows ?? []) as Array<{ investigation_id?: string; contributor_id?: string }>, (r) => r.investigation_id, (r) => r.contributor_id);
    const challengesByInv = groupCount((challengeRows ?? []) as Array<{ investigation_id?: string }>, (r) => r.investigation_id);
    const latestSnap = new Map<string, { consensus_position?: string; agreement_score?: number }>();
    for (const s of (snapRows ?? []) as Array<{ investigation_id?: string; consensus_position?: string; agreement_score?: number }>) {
      if (s.investigation_id && !latestSnap.has(s.investigation_id)) latestSnap.set(s.investigation_id, s);
    }

    const rows: InvestigationBoardRow[] = investigations.map((inv) => {
      const fc = findingsByInv.get(inv.id) ?? 0;
      const cc = challengesByInv.get(inv.id) ?? 0;
      const snap = latestSnap.get(inv.id);
      return {
        id: inv.id,
        slug: inv.slug ?? inv.id,
        title: inv.title ?? 'Untitled',
        question: inv.question ?? '',
        state: (inv.state as InvestigationState) ?? 'DRAFT',
        findingCount: fc,
        challengeCount: cc,
        contributorCount: contributorsByInv.get(inv.id)?.size ?? 0,
        contentiousness: fc > 0 ? Math.round(Math.min(1, cc / fc) * 100) / 100 : 0,
        ...(snap?.consensus_position ? { consensusPosition: snap.consensus_position } : {}),
        ...(typeof snap?.agreement_score === 'number' ? { agreementScore: snap.agreement_score } : {}),
        updatedAt: inv.updated_at,
      };
    });

    const byState: Record<string, number> = {};
    for (const inv of investigations) byState[inv.state ?? 'DRAFT'] = (byState[inv.state ?? 'DRAFT'] ?? 0) + 1;
    return { ok: true, data: { rows, byState } };
  } catch (e) {
    return fail(e);
  }
}

/** A single investigation detail (findings/challenges/alternatives/evidence + live snapshot). */
export async function getInvestigationDetail(id: string, opts?: { now?: string }): Promise<DbResult<InvestigationDetailData>> {
  try {
    const client = db();
    const now = opts?.now ?? new Date().toISOString();
    const { data: invRow, error } = await client.from('hsin_investigations').select('*').eq('id', id).maybeSingle();
    if (error) return fail(error);
    if (!invRow) return { ok: false, error: 'Investigation not found.', code: 'DB_ERROR' };
    const investigation = invRow as HsinInvestigationRecord;

    const [{ data: fRows }, { data: cRows }, { data: aRows }, { data: eRows }, { data: enRows }] = await Promise.all([
      client.from('hsin_findings').select('*').eq('investigation_id', id).order('created_at', { ascending: true }).limit(2000),
      client.from('hsin_challenges').select('*').eq('investigation_id', id).order('created_at', { ascending: false }).limit(2000),
      client.from('hsin_alternative_narratives').select('*').eq('investigation_id', id).order('created_at', { ascending: false }).limit(500),
      client.from('hsin_evidence_claims').select('*').eq('investigation_id', id).order('created_at', { ascending: false }).limit(2000),
      client.from('hsin_endorsements').select('finding_id, withdrawn').limit(20000),
    ]);
    const findings = (fRows ?? []) as HsinFindingRecord[];
    const challenges = (cRows ?? []) as HsinChallengeRecord[];
    const alternatives = (aRows ?? []) as HsinAlternativeNarrativeRecord[];
    const evidenceClaims = (eRows ?? []) as HsinEvidenceClaimRecord[];

    // Live snapshot.
    const trust = await loadContributorTrust(client);
    const cf = toConsensusFindings(findings, challenges, trust);
    const snapshot = cf.length > 0 ? snapshotToRecord(buildConsensusSnapshot(id, cf, { now })) : undefined;

    // Metrics (engine).
    const engFindings: Finding[] = findings.map((f) => ({ id: f.id, investigationId: id, contributorId: f.contributor_id ?? 'u', position: f.position ?? '', summary: f.summary ?? '', confidence: num(f.confidence, 0.5), evidenceRefs: listFromJson(f.evidence_refs), endorsements: num(f.endorsements), createdAt: f.created_at, updatedAt: f.updated_at ?? f.created_at }));
    const engChallenges: Challenge[] = challenges.map((c) => ({ id: c.id, investigationId: id, targetFindingId: c.target_finding_id ?? '', contributorId: c.contributor_id ?? 'u', reason: c.reason ?? '', status: (c.status as Challenge['status']) ?? 'open', createdAt: c.created_at }));
    const engAlts: AlternativeNarrative[] = alternatives.map((a) => ({ id: a.id, investigationId: id, contributorId: a.contributor_id ?? 'u', title: a.title ?? '', summary: a.summary ?? '', position: a.position ?? '', createdAt: a.created_at }));
    const engEndorsements: Endorsement[] = ((enRows ?? []) as Array<{ finding_id?: string; withdrawn?: boolean }>).map((e, i) => ({ id: `e${i}`, findingId: e.finding_id ?? '', contributorId: 'u', withdrawn: e.withdrawn === true, createdAt: now, updatedAt: now }));
    const metrics = calculateDiscussionMetrics({ findings: engFindings, challenges: engChallenges, alternatives: engAlts, endorsements: engEndorsements });

    return {
      ok: true,
      data: {
        investigation,
        findings,
        challenges,
        alternatives,
        evidenceClaims,
        ...(snapshot ? { snapshot } : {}),
        metrics,
        progress: investigationProgress((investigation.state as EngineInvState) ?? 'DRAFT'),
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/** The consensus board (recent snapshots + reviews). RLS: researcher+. */
export async function getConsensusBoard(): Promise<DbResult<ConsensusBoardData>> {
  try {
    const client = db();
    const { data: snapRows, error } = await client.from('hsin_consensus_snapshots').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) return fail(error);
    const { data: revRows } = await client.from('hsin_consensus_reviews').select('*').order('created_at', { ascending: false }).limit(200);
    return { ok: true, data: { snapshots: (snapRows ?? []) as HsinConsensusSnapshotRecord[], reviews: (revRows ?? []) as HsinConsensusReviewRecord[] } };
  } catch (e) {
    return fail(e);
  }
}

/** A single consensus detail (investigation + latest snapshot + reviews). RLS: researcher+. */
export async function getConsensusDetail(investigationId: string, opts?: { now?: string }): Promise<DbResult<ConsensusDetailData>> {
  try {
    const client = db();
    const now = opts?.now ?? new Date().toISOString();
    const { data: invRow, error } = await client.from('hsin_investigations').select('*').eq('id', investigationId).maybeSingle();
    if (error) return fail(error);
    if (!invRow) return { ok: false, error: 'Investigation not found.', code: 'DB_ERROR' };

    const { data: snapRows } = await client.from('hsin_consensus_snapshots').select('*').eq('investigation_id', investigationId).order('created_at', { ascending: false }).limit(1);
    let snapshot = ((snapRows ?? []) as HsinConsensusSnapshotRecord[])[0];
    if (!snapshot) {
      // Compute a live snapshot from current findings.
      const { data: fRows } = await client.from('hsin_findings').select('*').eq('investigation_id', investigationId).limit(2000);
      const { data: cRows } = await client.from('hsin_challenges').select('*').eq('investigation_id', investigationId).limit(2000);
      const trust = await loadContributorTrust(client);
      const cf = toConsensusFindings((fRows ?? []) as HsinFindingRecord[], (cRows ?? []) as HsinChallengeRecord[], trust);
      if (cf.length > 0) snapshot = snapshotToRecord(buildConsensusSnapshot(investigationId, cf, { now }));
    }
    const { data: revRows } = await client.from('hsin_consensus_reviews').select('*').eq('investigation_id', investigationId).order('created_at', { ascending: false }).limit(50);

    return { ok: true, data: { investigation: invRow as HsinInvestigationRecord, ...(snapshot ? { snapshot } : {}), reviews: (revRows ?? []) as HsinConsensusReviewRecord[] } };
  } catch (e) {
    return fail(e);
  }
}

/** The contributors leaderboard. RLS: researcher+. */
export async function getContributorsBoard(): Promise<DbResult<ContributorsBoardData>> {
  try {
    const client = db();
    const { data, error } = await client.from('hsin_contributor_scores').select('*').order('overall', { ascending: false, nullsFirst: false }).limit(500);
    if (error) return fail(error);
    return { ok: true, data: { scores: (data ?? []) as HsinContributorScoreRecord[] } };
  } catch (e) {
    return fail(e);
  }
}

/** The debates board (evidence under contention). RLS: researcher+. */
export async function getDebatesBoard(): Promise<DbResult<DebatesBoardData>> {
  try {
    const client = db();
    const { data: cRows, error } = await client.from('hsin_evidence_claims').select('*').order('challenge_count', { ascending: false, nullsFirst: false }).limit(500);
    if (error) return fail(error);
    const { data: chRows } = await client.from('hsin_challenges').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(500);
    return { ok: true, data: { claims: (cRows ?? []) as HsinEvidenceClaimRecord[], challenges: (chRows ?? []) as HsinChallengeRecord[] } };
  } catch (e) {
    return fail(e);
  }
}

/** Headline collective-intelligence callouts. RLS: researcher+. */
export async function getCollectiveHighlights(): Promise<DbResult<CollectiveHighlights>> {
  try {
    const client = db();
    const { data: invRows } = await client.from('hsin_investigations').select('state').limit(5000);
    const states = (invRows ?? []) as Array<{ state?: string }>;
    const count = (s: string) => states.filter((r) => r.state === s).length;
    const { data: revRows } = await client.from('hsin_consensus_reviews').select('decision').eq('decision', 'escalated').limit(5000);
    const { data: scoreRows } = await client.from('hsin_contributor_scores').select('overall').limit(5000);
    const highTrust = ((scoreRows ?? []) as Array<{ overall?: number }>).filter((r) => num(r.overall) >= 70).length;
    return {
      ok: true,
      data: {
        activeInvestigations: count('ACTIVE'),
        consensusForming: count('CONSENSUS_FORMING'),
        majorDisputes: (revRows ?? []).length,
        pendingGovernance: count('UNDER_REVIEW'),
        highTrustContributors: highTrust,
        highImpactInvestigations: count('PUBLISHED'),
      },
    };
  } catch (e) {
    return fail(e);
  }
}

function groupCount<T>(rows: T[], key: (r: T) => string | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
function groupSet<T>(rows: T[], key: (r: T) => string | undefined, val: (r: T) => string | undefined): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = key(r);
    const v = val(r);
    if (!k || !v) continue;
    const set = m.get(k) ?? new Set<string>();
    set.add(v);
    m.set(k, set);
  }
  return m;
}

// =============================================================================
// WRITES
// =============================================================================

export interface CreateInvestigationResult { investigationId: string; slug: string }

/** Create a DRAFT investigation (researcher+). */
export async function createInvestigationDal(input: { slug: string; title: string; question: string }, now: string): Promise<DbResult<CreateInvestigationResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;
    const inv = engineCreateInvestigation({ id: 'pending', slug: input.slug, title: input.title, question: input.question, createdBy: gate.user.id }, { now });
    const { data: row, error } = await client.from('hsin_investigations').insert({ slug: inv.slug, title: inv.title, question: inv.question, state: inv.state, created_by: gate.user.id }).select('id, slug').single();
    if (error || !row?.id) return fail(error ?? new Error('Investigation insert returned no id.'));
    await recordAudit(client, gate.user.id, 'investigation.create', row.id as string, { slug: inv.slug });
    return { ok: true, data: { investigationId: row.id as string, slug: row.slug as string } };
  } catch (e) {
    return fail(e);
  }
}

/** Transition an investigation (curator/admin). Validated + audited. */
export async function transitionInvestigationDal(id: string, to: InvestigationState, now: string, reason?: string): Promise<DbResult<{ from: string; to: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;
    const { data: row, error } = await client.from('hsin_investigations').select('*').eq('id', id).maybeSingle();
    if (error) return fail(error);
    if (!row) return { ok: false, error: 'Investigation not found.', code: 'DB_ERROR' };
    const r = row as HsinInvestigationRecord;
    const res = transitionInvestigation(
      { id, slug: r.slug ?? id, title: r.title ?? '', question: r.question ?? '', state: (r.state as EngineInvState) ?? 'DRAFT', createdBy: r.created_by ?? '', createdAt: r.created_at, updatedAt: r.updated_at ?? r.created_at, events: [] },
      to as EngineInvState,
      { now, actor: gate.user.id, reason },
    );
    if (!res.ok) return validation(res.reason);
    await client.from('hsin_investigations').update({ state: res.investigation.state }).eq('id', id);
    await recordAudit(client, gate.user.id, 'investigation.transition', id, { from: res.event.from, to: res.event.to, reason });
    return { ok: true, data: { from: res.event.from, to: res.event.to } };
  } catch (e) {
    return fail(e);
  }
}

/** Submit a finding (researcher+). */
export async function submitFindingDal(input: { investigationId: string; position: string; summary: string; confidence?: number; evidenceRefs?: string[] }, now: string): Promise<DbResult<{ findingId: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;
    const f = engineSubmitFinding({ id: 'pending', investigationId: input.investigationId, contributorId: gate.user.id, position: input.position, summary: input.summary, confidence: input.confidence, evidenceRefs: input.evidenceRefs }, { now });
    const { data: row, error } = await client.from('hsin_findings').insert({ investigation_id: input.investigationId, contributor_id: gate.user.id, position: f.position, summary: f.summary, confidence: f.confidence, evidence_refs: listJson(f.evidenceRefs), endorsements: 0 }).select('id').single();
    if (error || !row?.id) return fail(error ?? new Error('Finding insert returned no id.'));
    await recordAudit(client, gate.user.id, 'finding.submit', row.id as string, { investigation: input.investigationId });
    return { ok: true, data: { findingId: row.id as string } };
  } catch (e) {
    return fail(e);
  }
}

/** Submit a challenge against a finding (researcher+). */
export async function submitChallengeDal(input: { investigationId: string; targetFindingId: string; reason: string }, now: string): Promise<DbResult<{ challengeId: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;
    const clean = (input.reason ?? '').trim();
    if (clean.length === 0) return validation('A challenge requires a non-blank reason.');
    const c = engineSubmitChallenge({ id: 'pending', investigationId: input.investigationId, targetFindingId: input.targetFindingId, contributorId: gate.user.id, reason: clean }, { now });
    const { data: row, error } = await client.from('hsin_challenges').insert({ investigation_id: input.investigationId, target_finding_id: input.targetFindingId, contributor_id: gate.user.id, reason: c.reason, status: 'open' }).select('id').single();
    if (error || !row?.id) return fail(error ?? new Error('Challenge insert returned no id.'));
    await recordAudit(client, gate.user.id, 'challenge.submit', row.id as string, { target: input.targetFindingId });
    return { ok: true, data: { challengeId: row.id as string } };
  } catch (e) {
    return fail(e);
  }
}

/** Recompute + persist a consensus snapshot for an investigation (curator/admin or worker). */
export async function recomputeConsensusDal(investigationId: string, now: string): Promise<DbResult<{ snapshotId: string; consensusPosition: string | null }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;
    const { data: fRows } = await client.from('hsin_findings').select('*').eq('investigation_id', investigationId).limit(2000);
    const { data: cRows } = await client.from('hsin_challenges').select('*').eq('investigation_id', investigationId).limit(2000);
    const trust = await loadContributorTrust(client);
    const cf = toConsensusFindings((fRows ?? []) as HsinFindingRecord[], (cRows ?? []) as HsinChallengeRecord[], trust);
    if (cf.length === 0) return validation('No findings to compute consensus from.');
    const snap = buildConsensusSnapshot(investigationId, cf, { now });
    const { data: row, error } = await client.from('hsin_consensus_snapshots').insert({
      investigation_id: investigationId, consensus_position: snap.consensusPosition, agreement_score: snap.agreementScore,
      evidence_strength: snap.evidenceStrength, confidence: snap.confidence, positions: listJson(snap.positions),
      dissent_positions: listJson(snap.dissentPositions), confidence_distribution: listJson(snap.confidenceDistribution),
      sample_count: snap.sampleCount, contributor_count: snap.contributorCount, explanation: listJson(snap.explanation),
      limitations: listJson(snap.limitations), generated_at: snap.generatedAt,
    }).select('id').single();
    if (error || !row?.id) return fail(error ?? new Error('Snapshot insert returned no id.'));
    await recordAudit(client, gate.user.id, 'consensus.recompute', investigationId, { position: snap.consensusPosition });
    return { ok: true, data: { snapshotId: row.id as string, consensusPosition: snap.consensusPosition } };
  } catch (e) {
    return fail(e);
  }
}

/** Governance decision over a forming consensus (reviewer/curator; required reason). */
export async function reviewConsensusDal(investigationId: string, decision: ConsensusDecision, reason: string, now: string): Promise<DbResult<{ decision: string; resultingState: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;
    const clean = (reason ?? '').trim();
    if (clean.length === 0) return validation('A consensus decision requires a non-blank reason.');

    // Latest snapshot (or computed).
    const detail = await getConsensusDetail(investigationId, { now });
    if (!detail.ok) return detail;
    const snapRec = detail.data.snapshot;
    if (!snapRec) return validation('No consensus snapshot to review yet.');

    const snap: ConsensusSnapshot = {
      investigationId,
      consensusPosition: snapRec.consensus_position ?? null,
      agreementScore: num(snapRec.agreement_score),
      evidenceStrength: num(snapRec.evidence_strength),
      confidence: num(snapRec.confidence),
      positions: [], dissentPositions: [], confidenceDistribution: [],
      sampleCount: num(snapRec.sample_count), contributorCount: num(snapRec.contributor_count),
      explanation: [], limitations: [], generatedAt: snapRec.generated_at ?? now,
    };

    let review;
    try {
      const input = { reviewer: gate.user.id, reason: clean };
      review = decision === 'approved' ? approveConsensus(snap, input, { now })
        : decision === 'rejected' ? rejectConsensus(snap, input, { now })
        : decision === 'escalated' ? escalateConsensus(snap, input, { now })
        : archiveConsensus(snap, input, { now });
    } catch (e) {
      return validation(e instanceof Error ? e.message : 'Invalid decision.');
    }

    await client.from('hsin_consensus_reviews').insert({
      investigation_id: investigationId, snapshot_id: snapRec.id?.startsWith('live-') ? null : snapRec.id,
      reviewer_id: gate.user.id, decision: review.decision, reason: clean,
      consensus_position: review.consensusPosition, agreement_score: review.agreementScore, resulting_state: review.resultingState,
    });
    // Apply the resulting investigation state (best-effort; validated by the engine target).
    await client.from('hsin_investigations').update({ state: review.resultingState }).eq('id', investigationId);
    await recordAudit(client, gate.user.id, `consensus.${decision}`, investigationId, { reason: clean });
    return { ok: true, data: { decision: review.decision, resultingState: review.resultingState } };
  } catch (e) {
    return fail(e);
  }
}

async function recordAudit(client: SupabaseClient, userId: string | null, action: string, entityId: string, extra?: JsonRecord): Promise<void> {
  try {
    await client.from('audit_logs').insert({ user_id: userId, action, metadata: { entity_type: 'collective', entity_id: entityId, ...(extra ?? {}) } });
  } catch {
    // best-effort.
  }
}

// =============================================================================
// DEMO builders (NOT_CONFIGURED path).
// =============================================================================

const DEMO_NOW = '2026-06-09T12:00:00.000Z';

export function demoInvestigationsBoard(): InvestigationsBoardData {
  const d = collectiveDemo();
  const rows: InvestigationBoardRow[] = [
    {
      id: d.investigation.id, slug: d.investigation.slug, title: d.investigation.title, question: d.investigation.question,
      state: d.investigation.state as InvestigationState, findingCount: d.findings.length, challengeCount: d.challenges.length,
      contributorCount: d.metrics.contributorCount, contentiousness: d.metrics.contentiousness,
      consensusPosition: d.snapshot.consensusPosition ?? undefined, agreementScore: d.snapshot.agreementScore, updatedAt: DEMO_NOW,
    },
  ];
  return { rows, byState: { ACTIVE: 1 } };
}

export function demoInvestigationDetail(): InvestigationDetailData {
  const d = collectiveDemo();
  return {
    investigation: { id: d.investigation.id, slug: d.investigation.slug, title: d.investigation.title, question: d.investigation.question, state: d.investigation.state as InvestigationState, created_at: DEMO_NOW, updated_at: DEMO_NOW },
    findings: d.findings.map((f) => ({ id: f.id, investigation_id: f.investigationId, contributor_id: f.contributorId, position: f.position, summary: f.summary, confidence: f.confidence, evidence_refs: { items: f.evidenceRefs }, endorsements: f.endorsements, created_at: DEMO_NOW })),
    challenges: d.challenges.map((c) => ({ id: c.id, investigation_id: c.investigationId, target_finding_id: c.targetFindingId, contributor_id: c.contributorId, reason: c.reason, status: c.status, created_at: DEMO_NOW })),
    alternatives: d.alternatives.map((a) => ({ id: a.id, investigation_id: a.investigationId, contributor_id: a.contributorId, title: a.title, summary: a.summary, position: a.position, created_at: DEMO_NOW })),
    evidenceClaims: [{ id: d.claim.id, investigation_id: d.claim.investigationId, contributor_id: d.claim.contributorId, claim: d.claim.claim, source_ref: d.claim.sourceRef, source_quality: d.claim.sourceQuality, support_count: d.claim.supportCount, challenge_count: d.claim.challengeCount, reviews_approved: d.claim.reviewsApproved, reviews_rejected: d.claim.reviewsRejected, strength: d.evidenceStrength.strength, created_at: DEMO_NOW }],
    snapshot: snapshotToRecord(d.snapshot),
    metrics: d.metrics,
    progress: investigationProgress(d.investigation.state as EngineInvState),
  };
}

export function demoConsensusBoard(): ConsensusBoardData {
  const d = collectiveDemo();
  return {
    snapshots: [snapshotToRecord(d.snapshot)],
    reviews: [{ id: 'demo-rev', investigation_id: d.investigation.id, reviewer_id: d.review.reviewer, decision: d.review.decision, reason: d.review.reason, consensus_position: d.review.consensusPosition ?? undefined, agreement_score: d.review.agreementScore, resulting_state: d.review.resultingState, created_at: DEMO_NOW }],
  };
}

export function demoConsensusDetail(): ConsensusDetailData {
  const d = collectiveDemo();
  return {
    investigation: { id: d.investigation.id, slug: d.investigation.slug, title: d.investigation.title, question: d.investigation.question, state: d.investigation.state as InvestigationState, created_at: DEMO_NOW },
    snapshot: snapshotToRecord(d.snapshot),
    reviews: [{ id: 'demo-rev', investigation_id: d.investigation.id, reviewer_id: d.review.reviewer, decision: d.review.decision, reason: d.review.reason, consensus_position: d.review.consensusPosition ?? undefined, agreement_score: d.review.agreementScore, resulting_state: d.review.resultingState, created_at: DEMO_NOW }],
  };
}

export function demoContributorsBoard(): ContributorsBoardData {
  const d = collectiveDemo();
  return {
    scores: d.contributors.map((c) => ({ id: `demo-${c.contributorId}`, contributor_id: c.contributorId, accuracy: c.accuracy, trust: c.trust, review_quality: c.reviewQuality, consensus_alignment: c.consensusAlignment, evidence_quality: c.evidenceQuality, overall: c.overall, explanation: { items: c.explanation }, limitations: { items: c.limitations }, computed_at: DEMO_NOW, created_at: DEMO_NOW })),
  };
}

export function demoDebatesBoard(): DebatesBoardData {
  const d = collectiveDemo();
  return {
    claims: [{ id: d.claim.id, investigation_id: d.claim.investigationId, contributor_id: d.claim.contributorId, claim: d.claim.claim, source_ref: d.claim.sourceRef, source_quality: d.claim.sourceQuality, support_count: d.claim.supportCount, challenge_count: d.claim.challengeCount, reviews_approved: d.claim.reviewsApproved, reviews_rejected: d.claim.reviewsRejected, strength: d.evidenceStrength.strength, created_at: DEMO_NOW }],
    challenges: d.challenges.map((c) => ({ id: c.id, investigation_id: c.investigationId, target_finding_id: c.targetFindingId, contributor_id: c.contributorId, reason: c.reason, status: c.status, created_at: DEMO_NOW })),
  };
}

export { db as collectiveDbClient, requireRole as requireCollectiveRole, snapshotToRecord };
