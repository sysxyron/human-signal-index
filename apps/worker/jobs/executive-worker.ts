// =============================================================================
// apps/worker/jobs — executiveWorkerJob (WorldForge/HSI Phase 22)
//
// THE COMMAND LOOP. Every 60 minutes it assembles the UNIFIED SYSTEM STATE from
// every Phase 1-21 subsystem, ranks strategic priorities, scores risk +
// opportunity, computes executive attention, generates the briefs + daily report,
// and persists the snapshot — in fault-isolated, retry-safe, deterministic,
// offline-safe steps (each wrapped — a failure logs + continues; NEVER throws):
//
//   1. ASSEMBLE — read across subsystem tables → UnifiedInputs.
//   2. BUILD    — unified state → snapshot + priorities + briefs + daily report.
//   3. PERSIST  — write snapshot + priorities + daily brief + report.
//
// PURITY: the engine (@hsi/executive-intelligence) is pure & deterministic; `now`
// is INJECTED (ctx.runAt). OFFLINE-SAFE: no service-role env → runs the fixtures +
// logs, no writes. GOVERNANCE: autoPublish/autoApprove/autoAct/autoGovern = false —
// every priority/risk/opportunity is advisory; every decision is HUMAN.
//
// SCHEDULING: cron '0 * * * *' (every 60 minutes, on the hour).
// =============================================================================

import {
  buildDailyIntelligenceReport,
  buildExecutiveSnapshot,
  buildUnifiedSystemState,
  executiveDemo,
  generateGovernanceBrief,
  type UnifiedInputs,
} from '@hsi/executive-intelligence';
import { createServiceRoleClient } from '@hsi/database';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

export interface ExecutiveWorkerResult {
  mode: 'db' | 'offline';
  priorities: number;
  risks: number;
  opportunities: number;
  attentionIndex: number;
  attentionLevel: string;
  snapshotPersisted: boolean;
  briefPersisted: boolean;
  reportPersisted: boolean;
}

type ExQuery = {
  eq: (col: string, val: unknown) => ExQuery;
  in: (col: string, vals: unknown[]) => ExQuery;
  order: (col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => ExQuery;
  limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
};
interface ExClient {
  from(table: string): {
    select: (cols?: string) => ExQuery;
    insert: (values: unknown) => Promise<{ data: unknown; error: unknown }> & { select: (cols?: string) => { single: () => Promise<{ data: unknown; error: unknown }> } };
  };
}

function serviceRoleConfigured(): boolean {
  return Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
function tryClient(): ExClient | null {
  if (!serviceRoleConfigured()) return null;
  try {
    return createServiceRoleClient() as unknown as ExClient;
  } catch (e) {
    logger.warn('executive.serviceRole.unavailable', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
function num(v: unknown, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}
type JsonRecord = Record<string, unknown>;

/** Best-effort table read — returns [] on any error (missing table/column/RLS). */
async function safeRows(client: ExClient, table: string, build: (q: ExQuery) => Promise<{ data: unknown; error: unknown }>): Promise<JsonRecord[]> {
  try {
    const { data, error } = await build(client.from(table).select('*'));
    if (error) return [];
    return (data ?? []) as JsonRecord[];
  } catch {
    return [];
  }
}

/** Assemble the cross-system UnifiedInputs from the subsystem tables. */
export async function assembleUnifiedInputs(client: ExClient): Promise<UnifiedInputs> {
  const [
    investigations, consensus, forecasts, warnings,
    sourceTrust, opportunities, scenarios, recal, escalations, runs, publications, outcomes,
  ] = await Promise.all([
    safeRows(client, 'hsin_investigations', (q) => q.limit(500)),
    safeRows(client, 'hsin_consensus_snapshots', (q) => q.order('created_at', { ascending: false }).limit(500)),
    safeRows(client, 'hsin_forecasts', (q) => q.order('created_at', { ascending: false }).limit(500)),
    safeRows(client, 'hsin_early_warning_alerts', (q) => q.eq('status', 'open').order('created_at', { ascending: false }).limit(300)),
    safeRows(client, 'hsin_source_trust', (q) => q.limit(500)),
    safeRows(client, 'hsin_research_opportunities', (q) => q.eq('status', 'proposed').order('created_at', { ascending: false }).limit(300)),
    safeRows(client, 'hsin_scenarios', (q) => q.limit(500)),
    safeRows(client, 'hsin_recalibration_proposals', (q) => q.eq('status', 'proposed').limit(300)),
    safeRows(client, 'hsin_research_escalations', (q) => q.eq('status', 'open').limit(300)),
    safeRows(client, 'hsin_research_runs', (q) => q.limit(2000)),
    safeRows(client, 'hsin_trust_publications', (q) => q.limit(5000)),
    safeRows(client, 'hsin_outcome_measurements', (q) => q.limit(5000)),
  ]);

  const consensusByInv = new Map<string, JsonRecord>();
  for (const c of consensus) {
    const k = String(c.investigation_id ?? '');
    if (k && !consensusByInv.has(k)) consensusByInv.set(k, c);
  }

  return {
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
        investigationId: String(c.investigation_id ?? ''), position: c.consensus_position ? String(c.consensus_position) : undefined,
        agreement, confidence: clamp01(num(c.confidence, 0.6)), disputed: agreement < 0.5 || dissent > 0,
      };
    }),
    forecasts: forecasts.map((f) => ({
      id: String(f.id), prediction: String(f.prediction ?? 'Forecast'),
      confidence: clamp01(num(f.confidence, 0.5)), reliability: clamp01(num(f.reliability, 0.5)), status: String(f.status ?? 'active'),
    })),
    warnings: warnings.map((w) => ({
      id: String(w.id), kind: String(w.kind ?? 'emerging_pattern'),
      level: (['INFO', 'WATCH', 'WARNING', 'CRITICAL'].includes(String(w.level)) ? String(w.level) : 'INFO') as 'INFO' | 'WATCH' | 'WARNING' | 'CRITICAL',
      title: String(w.title ?? 'Alert'),
    })),
    trust: sourceTrust.map((t) => ({
      entityType: 'source', entityId: String(t.source_id ?? ''), score: Math.max(0, Math.min(100, num(t.trust_score, 50))), band: bandOf(t.band, t.trust_score),
    })),
    opportunities: opportunities.map((o) => ({
      id: String(o.id), title: String(o.title ?? 'Opportunity'), confidence: clamp01(num(o.confidence, 0.5)),
      priority: (['CRITICAL', 'HIGH', 'NORMAL', 'LOW'].includes(String(o.priority)) ? String(o.priority) : 'NORMAL') as 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW',
    })),
    scenarios: scenarios.map((s) => ({ id: String(s.id), title: String(s.title ?? 'Scenario'), state: String(s.state ?? 'EMERGING'), likelihood: clamp01(num(s.likelihood, 0.5)) })),
    governanceQueue: [
      ...recal.map((g) => ({ id: `recal-${g.id}`, source: 'recalibration' as const, label: `Recalibration: ${g.entity_type ?? ''} ${g.entity_id ?? ''}`.trim(), severity: sevOf(g.severity) })),
      ...escalations.map((g) => ({ id: `esc-${g.id}`, source: 'escalation' as const, label: `Escalation: ${String(g.reason ?? 'open escalation').slice(0, 80)}`, severity: sevOf(g.severity) })),
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

/**
 * Run the command loop. Deterministic (`now` injected). Offline-safe. NEVER
 * throws. Returns the counts.
 */
export async function runExecutiveStage(now: string, opts?: { client?: ExClient | null }): Promise<ExecutiveWorkerResult> {
  const client = opts?.client !== undefined ? opts.client : tryClient();
  if (!client) return offlineResult(now);

  const result: ExecutiveWorkerResult = {
    mode: 'db', priorities: 0, risks: 0, opportunities: 0, attentionIndex: 0, attentionLevel: 'routine',
    snapshotPersisted: false, briefPersisted: false, reportPersisted: false,
  };

  // --- Step 1-2: assemble + build -------------------------------------------
  let snapshot;
  let report;
  let govBrief;
  try {
    const inputs = await assembleUnifiedInputs(client);
    const state = buildUnifiedSystemState(inputs, { now });
    snapshot = buildExecutiveSnapshot(state, { now });
    report = buildDailyIntelligenceReport(state, { now });
    govBrief = generateGovernanceBrief(state, { now });
    result.priorities = snapshot.strategicPriorities.length;
    result.risks = snapshot.operationalRisks.length;
    result.opportunities = snapshot.opportunities.length;
    result.attentionIndex = snapshot.attention.index;
    result.attentionLevel = snapshot.attention.level;
  } catch (e) {
    logger.warn('executive.build.failed', { error: e instanceof Error ? e.message : String(e) });
    return result;
  }

  // --- Step 3: persist snapshot + priorities --------------------------------
  let snapshotId: string | null = null;
  try {
    const { data, error } = await client.from('hsin_executive_snapshots').insert({
      attention_index: snapshot.attention.index, attention_level: snapshot.attention.level,
      overall_health: snapshot.executiveSummary.includes('DOWN') ? 'DOWN' : snapshot.executiveSummary.includes('DEGRADED') ? 'DEGRADED' : 'HEALTHY',
      executive_summary: snapshot.executiveSummary, snapshot: snapshot as unknown as JsonRecord,
      priority_count: snapshot.strategicPriorities.length, risk_count: snapshot.operationalRisks.length,
      opportunity_count: snapshot.opportunities.length, governance_count: snapshot.governanceQueue.length,
      limitations: { items: snapshot.limitations }, generated_at: now,
    }).select('id').single();
    if (!error && data && typeof data === 'object' && 'id' in data) {
      snapshotId = String((data as { id: unknown }).id);
      result.snapshotPersisted = true;
    }
  } catch (e) {
    logger.warn('executive.persist.snapshot.failed', { error: e instanceof Error ? e.message : String(e) });
  }

  if (snapshotId) {
    try {
      for (const p of snapshot.strategicPriorities.slice(0, 50)) {
        await client.from('hsin_executive_priorities').insert({
          snapshot_id: snapshotId, ref_id: p.entityRef, kind: p.kind, title: p.title, score: p.score, rank: p.rank,
          urgency: p.urgency, impact: p.impact, attention_level: p.attentionLevel, recommendation: p.recommendation,
          explanation: { items: p.explanation }, limitations: { items: p.limitations }, entity_ref: p.entityRef,
        });
      }
    } catch (e) {
      logger.warn('executive.persist.priorities.failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // --- Step 3b: persist daily brief + governance brief -----------------------
  try {
    const { error } = await client.from('hsin_executive_briefs').insert({
      kind: report.brief.kind, title: report.brief.title, headline: report.brief.headline,
      sections: { items: report.brief.sections }, limitations: { items: report.brief.limitations }, generated_at: now,
    });
    result.briefPersisted = !error;
    await client.from('hsin_executive_briefs').insert({
      kind: govBrief.kind, title: govBrief.title, headline: govBrief.headline,
      sections: { items: govBrief.sections }, limitations: { items: govBrief.limitations }, generated_at: now,
    });
  } catch (e) {
    logger.warn('executive.persist.brief.failed', { error: e instanceof Error ? e.message : String(e) });
  }

  // --- Step 3c: persist daily report ----------------------------------------
  try {
    const { error } = await client.from('hsin_executive_reports').insert({
      ...(snapshotId ? { snapshot_id: snapshotId } : {}), title: report.title, report_date: report.date,
      report: report as unknown as JsonRecord, top_risk_count: report.topRisks.length, top_opportunity_count: report.topOpportunities.length, generated_at: now,
    });
    result.reportPersisted = !error;
  } catch (e) {
    logger.warn('executive.persist.report.failed', { error: e instanceof Error ? e.message : String(e) });
  }

  logger.info('executive.done', { ...result, autoPublish: false, autoApprove: false, autoAct: false, autoGovern: false });
  return result;
}

/** Offline-safe result: run the fixtures, log, persist nothing. */
function offlineResult(now: string): ExecutiveWorkerResult {
  const d = executiveDemo();
  const result: ExecutiveWorkerResult = {
    mode: 'offline',
    priorities: d.snapshot.strategicPriorities.length,
    risks: d.snapshot.operationalRisks.length,
    opportunities: d.snapshot.opportunities.length,
    attentionIndex: d.snapshot.attention.index,
    attentionLevel: d.snapshot.attention.level,
    snapshotPersisted: false, briefPersisted: false, reportPersisted: false,
  };
  logger.info('executive.offline', { ...result, now, autoPublish: false, autoApprove: false, autoAct: false, autoGovern: false });
  return result;
}

/** The Job wrapper (every 60 minutes). */
export function makeExecutiveWorkerJob(): Job {
  return {
    name: 'executiveWorker',
    description:
      'Every 60 min: assemble the unified system state from every subsystem, rank strategic priorities, score risk + opportunity, compute executive attention, generate briefs + the daily report, and persist the snapshot. NEVER auto-publishes/auto-approves/auto-acts/auto-governs — every priority is advisory and every decision is human.',
    schedule: '0 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;
      const offline = !serviceRoleConfigured();
      const declaredInputs = { mode: offline ? 'offline-fixtures' : 'db', runAt: now, autoPublish: false, autoApprove: false, autoAct: false, autoGovern: false };
      logger.info('job.executiveWorker.start', { declaredInputs });

      let summary: ExecutiveWorkerResult;
      try {
        summary = await runExecutiveStage(now);
      } catch (e) {
        logger.warn('job.executiveWorker.failed', { error: e instanceof Error ? e.message : String(e) });
        summary = { mode: offline ? 'offline' : 'db', priorities: 0, risks: 0, opportunities: 0, attentionIndex: 0, attentionLevel: 'routine', snapshotPersisted: false, briefPersisted: false, reportPersisted: false };
      }

      logger.info('job.executiveWorker.done', { summary, autoPublish: false, autoApprove: false });
      return { job: 'executiveWorker', ok: true, declaredInputs, summary: { ...summary, autoPublish: false, autoApprove: false, autoAct: false, autoGovern: false } };
    },
  };
}

/** The registered Phase-22 executive job instance. */
export const executiveWorkerJob: Job = makeExecutiveWorkerJob();
