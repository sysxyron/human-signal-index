// =============================================================================
// HSIN Phase 22 — Executive Command Center data-access layer. SERVER-ONLY.
//
// THE COMMAND LAYER. "What is happening now, what matters most, what needs
// attention, and what decisions are pending?" This DAL reads ACROSS every Phase
// 1-21 subsystem table, assembles a normalised UnifiedInputs, feeds it (with an
// injected `now`) into the PURE '@hsi/executive-intelligence' engine, and persists
// the governed snapshot / priorities / briefs / report / reviews / decisions
// (migration 0026).
//
// SERVER-ONLY — never import from a 'use client' module. Mirrors prior DALs.
// GOVERNANCE: autoPublish/autoApprove/autoAct/autoGovern = false. Every snapshot,
// priority, risk, and opportunity is ADVISORY; every decision is HUMAN (reviewer +
// reason required, reversible, audit-logged). NEVER throws; empty env → NOT_CONFIGURED.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient } from '@/lib/supabase/server';
import {
  approveExecutiveDecision as engineApprove,
  archiveExecutiveDecision as engineArchive,
  buildDailyIntelligenceReport,
  buildExecutiveSnapshot,
  buildUnifiedSystemState,
  computeExecutiveAttention,
  generateGovernanceBrief,
  queueExecutiveReview,
  rejectExecutiveDecision as engineReject,
  summarizeSystemState,
  type ExecutiveDecision,
  type ExecutiveReviewQueueItem,
  type StrategicPriority,
  type UnifiedInputs,
  type UnifiedSystemState,
} from '@hsi/executive-intelligence';
import type {
  AppRole,
  ExecutiveBriefingsData,
  ExecutiveCommandData,
  ExecutiveGovernanceData,
  ExecutiveHighlights,
  ExecutiveOpportunitiesData,
  ExecutivePrioritiesData,
  ExecutiveRisksData,
  HsinExecutiveDecisionRecord,
  HsinExecutiveReviewRecord,
} from '@hsi/shared-types';

export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED = 'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';
const AUTH_REQUIRED = 'Sign in to continue.';

export function fail(error: unknown): { ok: false; error: string; code: DbResultCode } {
  logError('executive/persistence', error);
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
  return loadHighestRole(client, user.id);
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
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
function num(v: unknown, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}
/** Best-effort table read — returns [] on any error (missing table/column/RLS). */
async function safeRows(client: SupabaseClient, table: string, build: (q: ReturnType<SupabaseClient['from']>) => unknown): Promise<JsonRecord[]> {
  try {
    const q = build(client.from(table));
    const { data, error } = (await q) as { data: JsonRecord[] | null; error: unknown };
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

// =============================================================================
// UNIFIED INPUTS — assemble the cross-system model from every subsystem.
// Each read is best-effort; a missing subsystem degrades gracefully to empty.
// =============================================================================

export async function assembleUnifiedInputs(client: SupabaseClient): Promise<UnifiedInputs> {
  const [
    investigations, consensus, forecasts, warnings,
    sourceTrust, narrativeTrust, decisionTrust, opportunities,
    scenarios, recal, escalations, runs, publications, outcomes,
  ] = await Promise.all([
    safeRows(client, 'hsin_investigations', (q) => q.select('id, title, state').limit(500)),
    safeRows(client, 'hsin_consensus_snapshots', (q) => q.select('investigation_id, consensus_position, agreement_score, confidence, contributor_count, dissent_positions').order('created_at', { ascending: false }).limit(500)),
    safeRows(client, 'hsin_forecasts', (q) => q.select('id, prediction, confidence, reliability, status').order('created_at', { ascending: false }).limit(500)),
    safeRows(client, 'hsin_early_warning_alerts', (q) => q.select('id, kind, level, title, status').eq('status', 'open').order('created_at', { ascending: false }).limit(300)),
    safeRows(client, 'hsin_source_trust', (q) => q.select('source_id, trust_score, band').limit(500)),
    safeRows(client, 'hsin_narrative_trust', (q) => q.select('*').limit(500)),
    safeRows(client, 'hsin_decision_trust', (q) => q.select('*').limit(500)),
    safeRows(client, 'hsin_research_opportunities', (q) => q.select('id, title, confidence, priority, status').eq('status', 'proposed').order('created_at', { ascending: false }).limit(300)),
    safeRows(client, 'hsin_scenarios', (q) => q.select('id, title, state, likelihood').limit(500)),
    safeRows(client, 'hsin_recalibration_proposals', (q) => q.select('id, entity_type, entity_id, severity, reason, status').eq('status', 'proposed').limit(300)),
    safeRows(client, 'hsin_research_escalations', (q) => q.select('id, reason, severity, status').eq('status', 'open').limit(300)),
    safeRows(client, 'hsin_research_runs', (q) => q.select('id, state').limit(2000)),
    safeRows(client, 'hsin_trust_publications', (q) => q.select('id').limit(5000)),
    safeRows(client, 'hsin_outcome_measurements', (q) => q.select('within_expectation').limit(5000)),
  ]);

  // Contributor counts + contentiousness from the latest consensus per investigation.
  const consensusByInv = new Map<string, JsonRecord>();
  for (const c of consensus) {
    const k = String(c.investigation_id ?? '');
    if (k && !consensusByInv.has(k)) consensusByInv.set(k, c);
  }

  const inputs: UnifiedInputs = {
    investigations: investigations.map((i) => {
      const c = consensusByInv.get(String(i.id));
      const agreement = c ? clamp01(num(c.agreement_score, 0.6)) : undefined;
      return {
        id: String(i.id), title: String(i.title ?? 'Investigation'), state: String(i.state ?? 'ACTIVE'),
        contributorCount: c ? Math.max(0, Math.floor(num(c.contributor_count, 0))) : 0,
        ...(agreement !== undefined ? { agreementScore: agreement, contentiousness: clamp01(1 - agreement) } : {}),
      };
    }),
    consensus: consensus.map((c) => {
      const agreement = clamp01(num(c.agreement_score, 0.6));
      const dissent = Array.isArray(c.dissent_positions) ? c.dissent_positions.length : 0;
      return {
        investigationId: String(c.investigation_id ?? ''),
        position: c.consensus_position ? String(c.consensus_position) : undefined,
        agreement, confidence: clamp01(num(c.confidence, 0.6)),
        disputed: agreement < 0.5 || dissent > 0,
      };
    }),
    forecasts: forecasts.map((f) => ({
      id: String(f.id), prediction: String(f.prediction ?? 'Forecast'),
      confidence: clamp01(num(f.confidence, 0.5)), reliability: clamp01(num(f.reliability, 0.5)),
      status: String(f.status ?? 'active'),
    })),
    warnings: warnings.map((w) => ({
      id: String(w.id), kind: String(w.kind ?? 'emerging_pattern'),
      level: (['INFO', 'WATCH', 'WARNING', 'CRITICAL'].includes(String(w.level)) ? String(w.level) : 'INFO') as 'INFO' | 'WATCH' | 'WARNING' | 'CRITICAL',
      title: String(w.title ?? 'Alert'),
    })),
    trust: [
      ...sourceTrust.map((t) => ({ entityType: 'source', entityId: String(t.source_id ?? ''), score: Math.max(0, Math.min(100, num(t.trust_score, 50))), band: bandOf(t.band, t.trust_score) })),
      ...narrativeTrust.map((t) => ({ entityType: 'narrative', entityId: String(t.narrative_id ?? t.entity_id ?? t.id ?? ''), score: Math.max(0, Math.min(100, num(t.trust_score, 50))), band: bandOf(t.band, t.trust_score) })),
      ...decisionTrust.map((t) => ({ entityType: 'decision', entityId: String(t.decision_id ?? t.entity_id ?? t.id ?? ''), score: Math.max(0, Math.min(100, num(t.trust_score, 50))), band: bandOf(t.band, t.trust_score) })),
    ],
    opportunities: opportunities.map((o) => ({
      id: String(o.id), title: String(o.title ?? 'Opportunity'), confidence: clamp01(num(o.confidence, 0.5)),
      priority: (['CRITICAL', 'HIGH', 'NORMAL', 'LOW'].includes(String(o.priority)) ? String(o.priority) : 'NORMAL') as 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW',
    })),
    scenarios: scenarios.map((s) => ({ id: String(s.id), title: String(s.title ?? 'Scenario'), state: String(s.state ?? 'EMERGING'), likelihood: clamp01(num(s.likelihood, 0.5)) })),
    governanceQueue: [
      ...recal.map((g) => ({ id: `recal-${g.id}`, source: 'recalibration' as const, label: `Recalibration: ${g.entity_type ?? ''} ${g.entity_id ?? ''}`.trim(), severity: sevOf(g.severity) })),
      ...escalations.map((g) => ({ id: `esc-${g.id}`, source: 'escalation' as const, label: `Escalation: ${String(g.reason ?? 'open escalation').slice(0, 80)}`, severity: sevOf(g.severity) })),
      ...opportunities.filter((o) => String(o.priority) === 'CRITICAL' || String(o.priority) === 'HIGH').map((o) => ({ id: `opp-${o.id}`, source: 'research_opportunity' as const, label: `Opportunity review: ${String(o.title ?? '').slice(0, 80)}`, severity: (String(o.priority) === 'CRITICAL' ? 'HIGH' : 'MEDIUM') as 'HIGH' | 'MEDIUM' })),
    ],
    operations: {
      activeRuns: runs.filter((r) => ['ACTIVE', 'RUNNING', 'active', 'running', 'IN_PROGRESS'].includes(String(r.state))).length,
      queueDepth: runs.filter((r) => ['QUEUED', 'PENDING', 'queued', 'pending'].includes(String(r.state))).length,
      openEscalations: escalations.length,
      overallHealth: escalations.length >= 5 ? 'DOWN' : escalations.length > 0 || warnings.some((w) => w.level === 'CRITICAL') ? 'DEGRADED' : 'HEALTHY',
    },
    publishing: { published: publications.length, inReview: 0, retracted: 0 },
    outcomes: outcomeRates(outcomes),
  };
  return inputs;
}

function bandOf(band: unknown, score: unknown): 'low' | 'medium' | 'high' {
  const b = String(band ?? '').toLowerCase();
  if (b === 'low' || b === 'medium' || b === 'high') return b;
  const s = num(score, 50);
  return s < 40 ? 'low' : s < 70 ? 'medium' : 'high';
}
function sevOf(severity: unknown): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const s = String(severity ?? '').toUpperCase();
  return (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(s) ? s : 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
function outcomeRates(rows: JsonRecord[]): { successRate?: number; failureRate?: number } {
  const measured = rows.filter((r) => r.within_expectation !== null && r.within_expectation !== undefined);
  if (measured.length === 0) return {};
  const ok = measured.filter((r) => r.within_expectation === true).length;
  const successRate = clamp01(ok / measured.length);
  return { successRate, failureRate: clamp01(1 - successRate) };
}

/** Assemble the live unified system state (engine-ready). */
export async function buildLiveSystemState(client: SupabaseClient, now: string): Promise<UnifiedSystemState> {
  const inputs = await assembleUnifiedInputs(client);
  return buildUnifiedSystemState(inputs, { now });
}

// =============================================================================
// READS (researcher+ via RLS)
// =============================================================================

export async function getExecutiveCommand(opts?: { now?: string }): Promise<DbResult<ExecutiveCommandData>> {
  try {
    const client = db();
    const now = opts?.now ?? new Date().toISOString();
    const state = await buildLiveSystemState(client, now);
    const snapshot = buildExecutiveSnapshot(state, { now });
    const summary = summarizeSystemState(state);
    return {
      ok: true,
      data: {
        snapshot: {
          id: 'live', attention_index: snapshot.attention.index, attention_level: snapshot.attention.level,
          overall_health: state.operations.overallHealth, executive_summary: snapshot.executiveSummary,
          priority_count: snapshot.strategicPriorities.length, risk_count: snapshot.operationalRisks.length,
          opportunity_count: snapshot.opportunities.length, governance_count: snapshot.governanceQueue.length,
          generated_at: now, created_at: now,
        },
        priorities: snapshot.strategicPriorities.slice(0, 25).map((p) => priorityToRecord(p, now)),
        attentionIndex: snapshot.attention.index,
        attentionLevel: snapshot.attention.level,
        executiveSummary: summary.summary,
        riskCount: snapshot.operationalRisks.length,
        opportunityCount: snapshot.opportunities.length,
        governanceCount: snapshot.governanceQueue.length,
        panels: {
          forecasts: snapshot.forecasts,
          consensus: snapshot.consensus,
          operations: { health: state.operations.overallHealth, activeRuns: state.operations.activeRuns, escalations: state.operations.openEscalations },
        },
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function getExecutivePriorities(opts?: { now?: string }): Promise<DbResult<ExecutivePrioritiesData>> {
  try {
    const client = db();
    const now = opts?.now ?? new Date().toISOString();
    const snapshot = buildExecutiveSnapshot(await buildLiveSystemState(client, now), { now });
    const priorities = snapshot.strategicPriorities.map((p) => priorityToRecord(p, now));
    const byKind: Record<string, number> = {};
    const byAttention: Record<string, number> = {};
    for (const p of snapshot.strategicPriorities) {
      byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
      byAttention[p.attentionLevel] = (byAttention[p.attentionLevel] ?? 0) + 1;
    }
    return { ok: true, data: { priorities, byKind, byAttention } };
  } catch (e) {
    return fail(e);
  }
}

export async function getExecutiveRisks(opts?: { now?: string }): Promise<DbResult<ExecutiveRisksData>> {
  try {
    const client = db();
    const now = opts?.now ?? new Date().toISOString();
    const snapshot = buildExecutiveSnapshot(await buildLiveSystemState(client, now), { now });
    const risks = snapshot.operationalRisks.map((r) => ({ id: r.id, title: r.title, source: r.source, severity: r.severity, score: r.score, recommendation: r.recommendation }));
    const bySeverity: Record<string, number> = {};
    for (const r of snapshot.operationalRisks) bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
    return { ok: true, data: { risks, bySeverity } };
  } catch (e) {
    return fail(e);
  }
}

export async function getExecutiveOpportunities(opts?: { now?: string }): Promise<DbResult<ExecutiveOpportunitiesData>> {
  try {
    const client = db();
    const now = opts?.now ?? new Date().toISOString();
    const snapshot = buildExecutiveSnapshot(await buildLiveSystemState(client, now), { now });
    const opportunities = snapshot.opportunities.map((o) => ({ id: o.id, title: o.title, source: o.source, score: o.score, recommendation: o.recommendation }));
    const bySource: Record<string, number> = {};
    for (const o of snapshot.opportunities) bySource[o.source] = (bySource[o.source] ?? 0) + 1;
    return { ok: true, data: { opportunities, bySource } };
  } catch (e) {
    return fail(e);
  }
}

export async function getExecutiveBriefings(opts?: { now?: string }): Promise<DbResult<ExecutiveBriefingsData>> {
  try {
    const client = db();
    const now = opts?.now ?? new Date().toISOString();
    const report = buildDailyIntelligenceReport(await buildLiveSystemState(client, now), { now });
    const latestDaily = {
      id: 'live-daily', kind: report.brief.kind, title: report.brief.title, headline: report.brief.headline,
      sections: { items: report.brief.sections }, limitations: { items: report.brief.limitations },
      generated_at: now, created_at: now,
    };
    // Persisted briefs (worker output), most recent first.
    const stored = await safeRows(client, 'hsin_executive_briefs', (q) => q.select('*').order('created_at', { ascending: false }).limit(50));
    return { ok: true, data: { briefs: [latestDaily, ...stored] as ExecutiveBriefingsData['briefs'], latestDaily } };
  } catch (e) {
    return fail(e);
  }
}

export async function getExecutiveGovernance(): Promise<DbResult<ExecutiveGovernanceData>> {
  try {
    const client = db();
    const { data: rRows, error } = await client.from('hsin_executive_reviews').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) return fail(error);
    const reviews = (rRows ?? []) as HsinExecutiveReviewRecord[];
    const { data: dRows } = await client.from('hsin_executive_decisions').select('*').order('created_at', { ascending: false }).limit(500);
    const decisions = (dRows ?? []) as HsinExecutiveDecisionRecord[];
    const byStatus: Record<string, number> = {};
    for (const r of reviews) byStatus[r.status ?? 'queued'] = (byStatus[r.status ?? 'queued'] ?? 0) + 1;
    return { ok: true, data: { reviews, decisions, byStatus } };
  } catch (e) {
    return fail(e);
  }
}

export async function getExecutiveHighlights(opts?: { now?: string }): Promise<DbResult<ExecutiveHighlights>> {
  try {
    const client = db();
    const now = opts?.now ?? new Date().toISOString();
    const state = await buildLiveSystemState(client, now);
    const attention = computeExecutiveAttention(state);
    const snapshot = buildExecutiveSnapshot(state, { now });
    return {
      ok: true,
      data: {
        attentionIndex: attention.index,
        attentionLevel: attention.level,
        topPriorities: snapshot.strategicPriorities.filter((p) => p.attentionLevel === 'urgent' || p.attentionLevel === 'elevated').length,
        openRisks: snapshot.operationalRisks.length,
        openOpportunities: snapshot.opportunities.length,
        governancePending: snapshot.governanceQueue.length,
        dailyBriefReady: true,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

function priorityToRecord(p: StrategicPriority, now: string) {
  return {
    id: p.id, ref_id: p.entityRef, kind: p.kind, title: p.title, score: p.score, rank: p.rank,
    urgency: p.urgency, impact: p.impact, attention_level: p.attentionLevel, recommendation: p.recommendation,
    explanation: { items: p.explanation }, limitations: { items: p.limitations }, entity_ref: p.entityRef,
    created_at: now,
  };
}

// =============================================================================
// WRITES — governance (curator+). Every decision is HUMAN + reversible.
// =============================================================================

export async function queueExecutiveReviewDal(priorityId: string, now: string): Promise<DbResult<{ reviewId: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;
    const state = await buildLiveSystemState(client, now);
    const snapshot = buildExecutiveSnapshot(state, { now });
    const priority = snapshot.strategicPriorities.find((p) => p.id === priorityId);
    if (!priority) return validation('Priority not found in the current snapshot.');
    const review: ExecutiveReviewQueueItem = queueExecutiveReview(priority, { now, id: 'pending' });
    const { data: row, error } = await client.from('hsin_executive_reviews').insert({
      priority_id: review.priorityId, title: review.title, kind: review.kind, severity: review.severity,
      status: 'queued', queued_at: now, created_by: gate.user.id,
    }).select('id').single();
    if (error || !row?.id) return fail(error ?? new Error('Review insert returned no id.'));
    await recordAudit(client, gate.user.id, 'executive.review.queue', row.id as string, { priorityId });
    return { ok: true, data: { reviewId: row.id as string } };
  } catch (e) {
    return fail(e);
  }
}

type DecisionKind = 'approved' | 'rejected' | 'archived';

export async function decideExecutiveReviewDal(reviewId: string, decision: DecisionKind, input: { reviewer: string; reason: string }, now: string): Promise<DbResult<{ id: string; decision: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;
    const { data: row, error } = await client.from('hsin_executive_reviews').select('*').eq('id', reviewId).maybeSingle();
    if (error) return fail(error);
    if (!row) return { ok: false, error: 'Review not found.', code: 'DB_ERROR' };
    const rec = row as HsinExecutiveReviewRecord;
    const review: ExecutiveReviewQueueItem = {
      id: rec.id, priorityId: rec.priority_id ?? '', title: rec.title ?? '', kind: (rec.kind ?? 'risk') as ExecutiveReviewQueueItem['kind'],
      severity: (rec.severity ?? 'MEDIUM') as ExecutiveReviewQueueItem['severity'], queuedAt: rec.queued_at ?? now, status: 'queued',
    };
    let result: ExecutiveDecision;
    try {
      result = decision === 'approved' ? engineApprove(review, input, { now }) : decision === 'rejected' ? engineReject(review, input, { now }) : engineArchive(review, input, { now });
    } catch (e) {
      return validation(e instanceof Error ? e.message : 'Invalid decision.');
    }
    await client.from('hsin_executive_reviews').update({ status: decision }).eq('id', reviewId);
    await client.from('hsin_executive_decisions').insert({
      review_id: reviewId, priority_id: result.priorityId, decision: result.decision, reviewer: result.reviewer,
      reason: result.reason, previous_status: result.previousStatus, reversible: result.reversible,
      audit_trail: { items: result.auditTrail }, decided_at: result.at,
    });
    await recordAudit(client, gate.user.id, `executive.review.${decision}`, reviewId, { reviewer: input.reviewer });
    return { ok: true, data: { id: reviewId, decision } };
  } catch (e) {
    return fail(e);
  }
}

async function recordAudit(client: SupabaseClient, userId: string | null, action: string, entityId: string, extra?: JsonRecord): Promise<void> {
  try {
    await client.from('audit_logs').insert({ user_id: userId, action, metadata: { entity_type: 'executive', entity_id: entityId, ...(extra ?? {}) } });
  } catch {
    // best-effort.
  }
}

/** Generate + persist a governance brief snapshot (used by worker via service role). */
export async function persistGovernanceBriefDal(now: string): Promise<DbResult<{ briefId: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;
    const brief = generateGovernanceBrief(await buildLiveSystemState(client, now), { now });
    const { data: row, error } = await client.from('hsin_executive_briefs').insert({
      kind: brief.kind, title: brief.title, headline: brief.headline,
      sections: { items: brief.sections }, limitations: { items: brief.limitations }, generated_at: now, created_by: gate.user.id,
    }).select('id').single();
    if (error || !row?.id) return fail(error ?? new Error('Brief insert returned no id.'));
    return { ok: true, data: { briefId: row.id as string } };
  } catch (e) {
    return fail(e);
  }
}

export { db as executiveDbClient, requireRole as requireExecutiveRole };
