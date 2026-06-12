// =============================================================================
// apps/worker/jobs — consensusWorkerJob (WorldForge/HSI Phase 20)
//
// The COLLECTIVE-INTELLIGENCE loop. Every 30 minutes it recomputes consensus +
// contributor reliability for active investigations and surfaces disputes — in
// fault-isolated, retry-safe, deterministic, offline-safe steps (each wrapped — a
// failure logs + continues; NEVER throws):
//
//   1. LOAD        — active investigations (ACTIVE / UNDER_REVIEW / CONSENSUS_FORMING).
//   2. CONSENSUS   — recompute + persist a consensus snapshot per investigation.
//   3. CONTRIBUTORS— recompute + upsert contributor reliability scores.
//   4. DISPUTES    — detect contested investigations (weak agreement / strong dissent).
//   5. GOVERNANCE  — flag disputes for HUMAN governance review (count only).
//
// PURITY: the engines (@hsi/consensus-engine, @hsi/collective-intelligence) are
// pure & deterministic; `now` is INJECTED (ctx.runAt). OFFLINE-SAFE: no
// service-role env → runs the fixtures + logs, no writes. GOVERNANCE: the worker
// NEVER auto-approves, auto-publishes, or auto-consensus — it computes candidates
// and flags disputes; every acceptance is a human decision.
//
// SCHEDULING: cron '*/30 * * * *' (every 30 minutes).
// =============================================================================

import {
  buildConsensusSnapshot,
  type ConsensusFinding,
} from '@hsi/consensus-engine';
import {
  collectiveDemo,
  computeContributorScore,
  type ContributorInput,
} from '@hsi/collective-intelligence';
import { createServiceRoleClient } from '@hsi/database';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/** Investigations in these states are recomputed. */
export const ACTIVE_INVESTIGATION_STATES = ['ACTIVE', 'UNDER_REVIEW', 'CONSENSUS_FORMING'];
/** Agreement at/below which an investigation is a "dispute" needing review. */
export const DISPUTE_AGREEMENT = 0.5;

export interface ConsensusResult {
  mode: 'db' | 'offline';
  investigations: number;
  snapshots: number;
  contributorScores: number;
  disputes: number;
  pendingGovernance: number;
}

type ConQuery = {
  eq: (col: string, val: unknown) => ConQuery;
  in: (col: string, vals: unknown[]) => ConQuery;
  order: (col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => ConQuery;
  limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
};
interface ConClient {
  from(table: string): {
    select: (cols?: string) => ConQuery;
    insert: (values: unknown) => Promise<{ data: unknown; error: unknown }>;
    update: (values: unknown) => { eq: (col: string, val: unknown) => Promise<{ error: unknown }> };
  };
}

function serviceRoleConfigured(): boolean {
  return Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
function tryClient(): ConClient | null {
  if (!serviceRoleConfigured()) return null;
  try {
    return createServiceRoleClient() as unknown as ConClient;
  } catch (e) {
    logger.warn('consensus.serviceRole.unavailable', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}
function num(v: unknown, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

/**
 * Run the consensus + contributor loop. Deterministic (`now` injected). Offline-safe.
 * NEVER throws. Returns the counts.
 */
export async function runConsensusStage(now: string, opts?: { client?: ConClient | null }): Promise<ConsensusResult> {
  const client = opts?.client !== undefined ? opts.client : tryClient();
  if (!client) return offlineResult(now);

  const result: ConsensusResult = { mode: 'db', investigations: 0, snapshots: 0, contributorScores: 0, disputes: 0, pendingGovernance: 0 };

  // --- Step 1: load active investigations ------------------------------------
  let investigationIds: string[] = [];
  try {
    const { data } = await client.from('hsin_investigations').select('id, state').in('state', ACTIVE_INVESTIGATION_STATES).limit(2000);
    investigationIds = ((data ?? []) as Array<{ id?: string }>).map((r) => String(r.id ?? '')).filter(Boolean);
    result.investigations = investigationIds.length;
  } catch (e) {
    logger.warn('consensus.load.failed', { error: e instanceof Error ? e.message : String(e) });
  }

  // Contributor trust seeds (from prior scores).
  const trustSeed = new Map<string, number>();
  try {
    const { data } = await client.from('hsin_contributor_scores').select('contributor_id, trust').limit(20000);
    for (const r of (data ?? []) as Array<{ contributor_id?: string; trust?: number }>) {
      if (r.contributor_id) trustSeed.set(r.contributor_id, num(r.trust, 50));
    }
  } catch {
    // non-fatal.
  }

  // Accumulate per-contributor stats across investigations (for step 3).
  const contributorStats = new Map<string, { aligned: number; misaligned: number; contributions: number }>();

  // --- Step 2 + 4 + 5: per investigation -------------------------------------
  for (const invId of investigationIds) {
    try {
      const findings = await loadFindings(client, invId);
      const challenges = await loadChallenges(client, invId);
      if (findings.length === 0) continue;

      const cf = toConsensusFindings(findings, challenges, trustSeed);
      const snap = buildConsensusSnapshot(invId, cf, { now });

      // Persist the snapshot.
      const { error } = await client.from('hsin_consensus_snapshots').insert({
        investigation_id: invId, consensus_position: snap.consensusPosition, agreement_score: snap.agreementScore,
        evidence_strength: snap.evidenceStrength, confidence: snap.confidence, positions: { items: snap.positions },
        dissent_positions: { items: snap.dissentPositions }, confidence_distribution: { items: snap.confidenceDistribution },
        sample_count: snap.sampleCount, contributor_count: snap.contributorCount, explanation: { items: snap.explanation },
        limitations: { items: snap.limitations }, generated_at: snap.generatedAt,
      });
      if (!error) result.snapshots += 1;

      // Tally contributor alignment vs the consensus candidate.
      for (const f of findings) {
        const cid = f.contributor_id ?? '';
        if (!cid) continue;
        const stat = contributorStats.get(cid) ?? { aligned: 0, misaligned: 0, contributions: 0 };
        stat.contributions += 1;
        if (snap.consensusPosition && f.position === snap.consensusPosition) stat.aligned += 1;
        else if (snap.consensusPosition) stat.misaligned += 1;
        contributorStats.set(cid, stat);
      }

      // Detect a dispute (weak agreement or strong dissent) — flag for HUMAN review.
      const topDissent = snap.dissentPositions[0]?.share ?? 0;
      if (snap.agreementScore <= DISPUTE_AGREEMENT || topDissent >= 0.3) {
        result.disputes += 1;
        result.pendingGovernance += 1; // a human must decide; the worker never does.
        logger.info('consensus.dispute', { investigationId: invId, agreement: snap.agreementScore, topDissent, autoActed: false });
      }
    } catch (e) {
      logger.warn('consensus.investigation.failed', { investigationId: invId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // --- Step 3: recompute + upsert contributor scores -------------------------
  for (const [contributorId, stat] of contributorStats) {
    try {
      const input: ContributorInput = {
        contributorId,
        findingsAligned: stat.aligned,
        findingsMisaligned: stat.misaligned,
        baseTrust: trustSeed.get(contributorId),
        contributionCount: stat.contributions,
      };
      const score = computeContributorScore(input);
      if (await upsertContributorScore(client, score, now)) result.contributorScores += 1;
    } catch (e) {
      logger.warn('consensus.contributor.failed', { contributorId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  logger.info('consensus.done', { ...result, autoApproved: false, autoConsensus: false, autoPublished: false });
  return result;
}

async function loadFindings(client: ConClient, invId: string): Promise<Array<{ id: string; contributor_id?: string; position?: string; confidence?: number; endorsements?: number }>> {
  try {
    const { data } = await client.from('hsin_findings').select('*').eq('investigation_id', invId).limit(2000);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id ?? ''),
      contributor_id: r.contributor_id ? String(r.contributor_id) : undefined,
      position: r.position ? String(r.position) : undefined,
      confidence: typeof r.confidence === 'number' ? r.confidence : undefined,
      endorsements: typeof r.endorsements === 'number' ? r.endorsements : 0,
    }));
  } catch {
    return [];
  }
}
async function loadChallenges(client: ConClient, invId: string): Promise<Array<{ target_finding_id?: string; status?: string }>> {
  try {
    const { data } = await client.from('hsin_challenges').select('target_finding_id, status').eq('investigation_id', invId).limit(2000);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      target_finding_id: r.target_finding_id ? String(r.target_finding_id) : undefined,
      status: r.status ? String(r.status) : undefined,
    }));
  } catch {
    return [];
  }
}

function toConsensusFindings(
  findings: Array<{ id: string; contributor_id?: string; position?: string; confidence?: number; endorsements?: number }>,
  challenges: Array<{ target_finding_id?: string; status?: string }>,
  trustSeed: Map<string, number>,
): ConsensusFinding[] {
  return findings.map((f) => {
    const targeted = challenges.filter((c) => c.target_finding_id === f.id);
    return {
      id: f.id,
      position: f.position ?? 'Unspecified',
      contributorId: f.contributor_id ?? 'unknown',
      confidence: num(f.confidence, 0.5),
      evidenceStrength: num(f.confidence, 0.5),
      contributorTrust: trustSeed.get(f.contributor_id ?? '') ?? 50,
      challengesUpheld: targeted.filter((c) => c.status === 'upheld').length,
      challengesRejected: targeted.filter((c) => c.status === 'rejected').length,
      endorsements: num(f.endorsements, 0),
    };
  });
}

async function upsertContributorScore(client: ConClient, score: ReturnType<typeof computeContributorScore>, now: string): Promise<boolean> {
  const payload = {
    contributor_id: score.contributorId, accuracy: score.accuracy, trust: score.trust, review_quality: score.reviewQuality,
    consensus_alignment: score.consensusAlignment, evidence_quality: score.evidenceQuality, overall: score.overall,
    explanation: { items: score.explanation }, limitations: { items: score.limitations }, computed_at: now,
  };
  try {
    const { data } = await client.from('hsin_contributor_scores').select('id').eq('contributor_id', score.contributorId).maybeSingle();
    const existing = data as { id?: string } | null;
    if (existing?.id) {
      const { error } = await client.from('hsin_contributor_scores').update(payload).eq('id', existing.id);
      return !error;
    }
    const { error } = await client.from('hsin_contributor_scores').insert(payload);
    return !error;
  } catch {
    return false;
  }
}

/** Offline-safe result: run the fixtures, log, persist nothing. */
function offlineResult(now: string): ConsensusResult {
  const demo = collectiveDemo();
  const topDissent = demo.snapshot.dissentPositions[0]?.share ?? 0;
  const result: ConsensusResult = {
    mode: 'offline',
    investigations: 1,
    snapshots: 1,
    contributorScores: demo.contributors.length,
    disputes: demo.snapshot.agreementScore <= DISPUTE_AGREEMENT || topDissent >= 0.3 ? 1 : 0,
    pendingGovernance: demo.snapshot.agreementScore <= DISPUTE_AGREEMENT || topDissent >= 0.3 ? 1 : 0,
  };
  logger.info('consensus.offline', { ...result, autoApproved: false, autoConsensus: false, autoPublished: false });
  return result;
}

/** The Job wrapper (every 30 minutes). */
export function makeConsensusWorkerJob(): Job {
  return {
    name: 'consensusWorker',
    description:
      'Every 30 min: recompute consensus + contributor reliability for active investigations, detect disputes, and flag them for HUMAN governance review. NEVER auto-approves/auto-consensus/auto-publishes.',
    schedule: '*/30 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;
      const offline = !serviceRoleConfigured();
      const declaredInputs = { mode: offline ? 'offline-fixtures' : 'db', runAt: now, autoApprove: false, autoConsensus: false, autoPublish: false };
      logger.info('job.consensusWorker.start', { declaredInputs });

      let summary: ConsensusResult;
      try {
        summary = await runConsensusStage(now);
      } catch (e) {
        logger.warn('job.consensusWorker.failed', { error: e instanceof Error ? e.message : String(e) });
        summary = { mode: offline ? 'offline' : 'db', investigations: 0, snapshots: 0, contributorScores: 0, disputes: 0, pendingGovernance: 0 };
      }

      logger.info('job.consensusWorker.done', { summary, autoApproved: false, autoConsensus: false });
      return { job: 'consensusWorker', ok: true, declaredInputs, summary: { ...summary, autoApproved: false, autoConsensus: false, autoPublished: false } };
    },
  };
}

/** The registered Phase-20 consensus job instance. */
export const consensusWorkerJob: Job = makeConsensusWorkerJob();
