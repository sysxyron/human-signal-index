// =============================================================================
// WorldForge Phase 6 — Human Review & Curation data-access layer (DAL).
//
// SERVER-ONLY — never import from a 'use client' module. It uses next/headers
// (via lib/supabase/server.ts), so it must stay on the server. (`server-only` is
// not installed in this workspace, hence this comment instead of the import.)
//
// OWNERSHIP / AUTHZ MODEL:
//   * READS go through the cookie-backed SSR server client (createClient). RLS
//     (migration 0010) decides visibility. No service-role read path.
//   * WRITES resolve the authenticated user via the SAME client's auth.getUser()
//     and the caller's app role via getSessionRole(). We role-gate IN THE DAL
//     (returning FORBIDDEN below the required tier / AUTH_REQUIRED with no user)
//     AND rely on RLS as the backstop — defence in depth. We stamp the actor id
//     (created_by / reviewer_id / user_id) so the RLS owner policies authorize
//     the write. There is NO service-role write path for user-facing actions.
//
// GOVERNANCE LOOP (the heart of Phase 6): submitReviewDecision gathers ALL
// decisions for a research_run's queue, derives an aggregate reviewerValidation
// + per-reviewer trust, and recomputes the run's governed_confidence via the
// PURE engine (@hsi/research-agents). Honesty: we store the REAL decision; an
// ESCALATE keeps the item visible and unresolved rather than silently approving.
//
// DESIGN: every function returns a DbResult<T> and NEVER throws. Empty Supabase
// env degrades gracefully (NOT_CONFIGURED) so `next build` passes.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient } from '@/lib/supabase/server';
import {
  governedConfidence,
  aggregateReviewerValidation,
  computeReviewerTrust,
  type ReviewerDecision,
} from '@hsi/research-agents';
import type {
  ReviewEntityType,
  ReviewQueueStatus,
  ReviewPriority,
  ReviewDecisionType,
  PublicationVisibility,
  AppRole,
  NotificationType,
  ReviewQueueRecord,
  ReviewAssignmentRecord,
  ReviewDecisionRecord,
  PublicationRecord,
  PublicationVersionRecord,
  ReviewCommentRecord,
  ReviewerTrustRecord,
  NotificationRecord,
  ReviewQueueItem,
  ReviewItemDetail,
  CurationDashboardData,
  PublicReportDraft,
  EvidenceCoverageSummary,
} from '@hsi/shared-types';
import { buildPublicReport } from './report-builder';

// -----------------------------------------------------------------------------
// Result type — canonical DbResult EXTENDED with 'FORBIDDEN' (Phase 6). Declared
// here so this module is self-contained, and re-exported for actions / UI.
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

function fail(error: unknown): { ok: false; error: string; code: DbResultCode } {
  logError('governance/persistence', error);
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

function forbidden(required: AppRole): {
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

// -----------------------------------------------------------------------------
// Client + identity + role helpers.
// -----------------------------------------------------------------------------

/** Per-request, cookie-backed, RLS-enforced client for reads AND writes. */
function db(): SupabaseClient {
  return createClient();
}

/** Resolve the authenticated user via the cookie session, or null. */
async function currentUser(client: SupabaseClient): Promise<User | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  return user ?? null;
}

/** Ascending privilege ladder. viewer < researcher < reviewer < curator < admin. */
const ROLE_LEVEL: Record<AppRole, number> = {
  viewer: 1,
  researcher: 2,
  reviewer: 3,
  curator: 4,
  admin: 5,
};

/** Read the caller's app role from public.users (default viewer when unknown). */
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

/**
 * Resolve { user, role } and gate against a minimum role. Returns a DbResult
 * error (AUTH_REQUIRED / FORBIDDEN) on failure, else { user, role }. Centralizes
 * the gating used by every mutation.
 */
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
// Typed JSON helpers — keep `any` out of signatures.
// -----------------------------------------------------------------------------
type JsonRecord = Record<string, unknown>;

function toJsonRecord(value: unknown): JsonRecord | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') return value as JsonRecord;
  return { value };
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

// -----------------------------------------------------------------------------
// AUDIT — internal helper used by every mutation. Writes one audit_logs row
// (0001 shape: user_id, action, metadata jsonb, created_at). We standardize the
// metadata to carry entity_type / entity_id so getAuditTrail can filter on them.
// Best-effort: an audit failure never fails the underlying mutation.
// -----------------------------------------------------------------------------
async function recordAudit(
  client: SupabaseClient,
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  extra?: JsonRecord,
): Promise<void> {
  try {
    await client.from('audit_logs').insert({
      user_id: userId,
      action,
      metadata: {
        entity_type: entityType,
        entity_id: entityId,
        ...(extra ?? {}),
      },
    });
  } catch {
    // Best-effort — never block the mutation on an audit write.
  }
}

/**
 * Insert a notification (best-effort). The notifications RLS allows any
 * authenticated actor to INSERT, so the server can fan out to other users.
 */
async function notify(
  client: SupabaseClient,
  input: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
  },
): Promise<void> {
  try {
    await client.from('notifications').insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
    });
  } catch {
    // Best-effort fan-out.
  }
}

// =============================================================================
// REVIEW QUEUE
// =============================================================================

/**
 * Submit an entity for human review (researcher+). Inserts a review_queues row
 * owned by the caller (created_by = auth.uid()) so RLS authorizes the insert.
 */
export async function createReviewQueue(
  entityType: ReviewEntityType,
  entityId: string,
  priority: ReviewPriority = 'medium',
): Promise<DbResult<ReviewQueueRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const { data, error } = await client
      .from('review_queues')
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        status: 'under_review',
        priority,
        created_by: gate.user.id,
      })
      .select('*')
      .single();
    if (error) return fail(error);
    const queue = data as ReviewQueueRecord;

    await recordAudit(
      client,
      gate.user.id,
      'review_queue_created',
      entityType,
      entityId,
      { queue_id: queue.id, priority },
    );

    return { ok: true, data: queue };
  } catch (e) {
    return fail(e);
  }
}

export interface ReviewQueueFilters {
  status?: ReviewQueueStatus;
  priority?: ReviewPriority;
  reviewerId?: string;
  entityType?: ReviewEntityType;
  from?: string;
  to?: string;
}

/**
 * List the review queue. RLS scopes visibility: reviewer+ see ALL rows; lower
 * roles see only their own submissions / assignments. Each row is enriched with
 * the assigned reviewer's email, a decisions count + latest decision, and a
 * light entitySummary for research_run entries.
 */
export async function listReviewQueue(
  filters?: ReviewQueueFilters,
): Promise<DbResult<ReviewQueueItem[]>> {
  try {
    const client = db();

    let query = client.from('review_queues').select('*');
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.priority) query = query.eq('priority', filters.priority);
    if (filters?.reviewerId) query = query.eq('assigned_to', filters.reviewerId);
    if (filters?.entityType) query = query.eq('entity_type', filters.entityType);
    if (filters?.from) query = query.gte('created_at', filters.from);
    if (filters?.to) query = query.lte('created_at', filters.to);

    const { data: queueRows, error } = await query.order('created_at', {
      ascending: false,
    });
    if (error) return fail(error);
    const queues = (queueRows ?? []) as ReviewQueueRecord[];
    if (queues.length === 0) return { ok: true, data: [] };

    const queueIds = queues.map((q) => q.id);

    // Decisions for these queues (for count + latest).
    const { data: decisionRows } = await client
      .from('review_decisions')
      .select('*')
      .in('review_queue_id', queueIds)
      .order('created_at', { ascending: false });
    const decisionsByQueue = new Map<string, ReviewDecisionRecord[]>();
    for (const d of (decisionRows ?? []) as ReviewDecisionRecord[]) {
      const arr = decisionsByQueue.get(d.review_queue_id) ?? [];
      arr.push(d);
      decisionsByQueue.set(d.review_queue_id, arr);
    }

    // Assigned-reviewer emails.
    const reviewerIds = Array.from(
      new Set(queues.map((q) => q.assigned_to).filter((v): v is string => !!v)),
    );
    const emailById = await loadUserEmails(client, reviewerIds);

    // Light entity summaries for research_run entries (best-effort).
    const runIds = Array.from(
      new Set(
        queues
          .filter((q) => q.entity_type === 'research_run')
          .map((q) => q.entity_id),
      ),
    );
    const runSummaries = await loadRunSummaries(client, runIds);

    const items: ReviewQueueItem[] = queues.map((queue) => {
      const decisions = decisionsByQueue.get(queue.id) ?? [];
      return {
        queue,
        assignedReviewerEmail: queue.assigned_to
          ? emailById.get(queue.assigned_to)
          : undefined,
        decisionsCount: decisions.length,
        latestDecision: decisions[0],
        entitySummary:
          queue.entity_type === 'research_run'
            ? runSummaries.get(queue.entity_id)
            : undefined,
      };
    });

    return { ok: true, data: items };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Full detail for one queued item: queue + assignments + decisions + comments +
 * an entitySummary (research_run: run row + consensus overallConfidence +
 * evidence coverage incl contradictions/unsupported + governed_confidence).
 */
export async function getReviewItem(
  queueId: string,
): Promise<DbResult<ReviewItemDetail>> {
  try {
    const client = db();

    const { data: queueRow, error: queueError } = await client
      .from('review_queues')
      .select('*')
      .eq('id', queueId)
      .maybeSingle();
    if (queueError) return fail(queueError);
    if (!queueRow) {
      return { ok: false, error: 'Queue item not found or not visible.', code: 'DB_ERROR' };
    }
    const queue = queueRow as ReviewQueueRecord;

    const { data: assignmentRows, error: aErr } = await client
      .from('review_assignments')
      .select('*')
      .eq('review_queue_id', queueId)
      .order('assigned_at', { ascending: false });
    if (aErr) return fail(aErr);

    const { data: decisionRows, error: dErr } = await client
      .from('review_decisions')
      .select('*')
      .eq('review_queue_id', queueId)
      .order('created_at', { ascending: false });
    if (dErr) return fail(dErr);

    const { data: commentRows, error: cErr } = await client
      .from('review_comments')
      .select('*')
      .eq('entity_type', queue.entity_type)
      .eq('entity_id', queue.entity_id)
      .order('created_at', { ascending: true });
    if (cErr) return fail(cErr);

    let entitySummary: JsonRecord | undefined;
    if (queue.entity_type === 'research_run') {
      const summaries = await loadRunSummaries(client, [queue.entity_id]);
      entitySummary = summaries.get(queue.entity_id);
    }

    return {
      ok: true,
      data: {
        queue,
        assignments: (assignmentRows ?? []) as ReviewAssignmentRecord[],
        decisions: (decisionRows ?? []) as ReviewDecisionRecord[],
        comments: (commentRows ?? []) as ReviewCommentRecord[],
        entitySummary,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Assign a reviewer to a queue entry (curator/admin). Inserts a
 * review_assignments row, sets review_queues.assigned_to + status 'under_review',
 * notifies the reviewer, and audits.
 */
export async function assignReviewer(
  queueId: string,
  reviewerId: string,
): Promise<DbResult<ReviewQueueRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const { error: insErr } = await client.from('review_assignments').insert({
      review_queue_id: queueId,
      reviewer_id: reviewerId,
    });
    if (insErr) return fail(insErr);

    const { data: updated, error: updErr } = await client
      .from('review_queues')
      .update({ assigned_to: reviewerId, status: 'under_review' })
      .eq('id', queueId)
      .select('*')
      .single();
    if (updErr) return fail(updErr);
    const queue = updated as ReviewQueueRecord;

    await notify(client, {
      userId: reviewerId,
      type: 'review_assigned',
      title: 'You have been assigned a review',
      body: `A ${queue.entity_type} was assigned to you for review.`,
      entityType: queue.entity_type,
      entityId: queue.entity_id,
    });

    await recordAudit(
      client,
      gate.user.id,
      'review_assigned',
      queue.entity_type,
      queue.entity_id,
      { queue_id: queueId, reviewer_id: reviewerId },
    );

    return { ok: true, data: queue };
  } catch (e) {
    return fail(e);
  }
}

/** Map a decision verdict to the resulting queue status. */
const DECISION_TO_STATUS: Record<ReviewDecisionType, ReviewQueueStatus> = {
  APPROVE: 'approved',
  REJECT: 'rejected',
  NEEDS_EVIDENCE: 'needs_evidence',
  ESCALATE: 'escalated',
};

/**
 * Submit a reviewer decision (reviewer+). The governance heart of Phase 6:
 *   1. insert review_decisions {reviewer_id, decision, notes};
 *   2. update review_queues.status per the verdict map;
 *   3. set this reviewer's open review_assignments.completed_at;
 *   4. for research_run entities, RECOMPUTE governed_confidence:
 *        aggregate ALL decisions → reviewerValidation; load research confidence
 *        (consensus overall) + evidence confidence (coverage) → governedConfidence;
 *        write research_runs.governed_confidence + review_status;
 *   5. recompute + upsert this reviewer's trust;
 *   6. notify the run creator; audit.
 * Honesty: stores the REAL decision; ESCALATE keeps the item escalated/visible.
 */
export async function submitReviewDecision(
  queueId: string,
  decision: ReviewDecisionType,
  notes?: string,
): Promise<DbResult<ReviewDecisionRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'reviewer');
    if (!gate.ok) return gate;

    // Load the queue (must be visible) to know the entity.
    const { data: queueRow, error: queueErr } = await client
      .from('review_queues')
      .select('*')
      .eq('id', queueId)
      .maybeSingle();
    if (queueErr) return fail(queueErr);
    if (!queueRow) {
      return { ok: false, error: 'Queue item not found or not visible.', code: 'DB_ERROR' };
    }
    const queue = queueRow as ReviewQueueRecord;

    // 1. Insert the immutable decision (RLS: reviewer_id = auth.uid()).
    const { data: decisionRow, error: decErr } = await client
      .from('review_decisions')
      .insert({
        review_queue_id: queueId,
        reviewer_id: gate.user.id,
        decision,
        notes: notes ?? null,
      })
      .select('*')
      .single();
    if (decErr) return fail(decErr);
    const decisionRecord = decisionRow as ReviewDecisionRecord;

    // 2. Map decision → queue status.
    const newStatus = DECISION_TO_STATUS[decision];
    const { error: statusErr } = await client
      .from('review_queues')
      .update({ status: newStatus })
      .eq('id', queueId);
    if (statusErr) return fail(statusErr);

    // 3. Close this reviewer's open assignment(s) for the queue.
    await client
      .from('review_assignments')
      .update({ completed_at: new Date().toISOString() })
      .eq('review_queue_id', queueId)
      .eq('reviewer_id', gate.user.id)
      .is('completed_at', null);

    // 4. Governance recompute for research_run entities.
    if (queue.entity_type === 'research_run') {
      await recomputeGovernedConfidence(client, queueId, queue.entity_id);
    }

    // 5. Recompute + upsert this reviewer's trust aggregate.
    await recomputeReviewerTrust(client, gate.user.id);

    // 6. Notify the run/entity creator (best-effort), if known + not self.
    const creatorId = await loadEntityCreator(
      client,
      queue.entity_type,
      queue.entity_id,
    );
    if (creatorId && creatorId !== gate.user.id) {
      await notify(client, {
        userId: creatorId,
        type: 'review_completed',
        title: `Review ${decision.toLowerCase()}`,
        body: notes ?? `A reviewer recorded a ${decision} decision.`,
        entityType: queue.entity_type,
        entityId: queue.entity_id,
      });
    }

    await recordAudit(
      client,
      gate.user.id,
      'review_decision_submitted',
      queue.entity_type,
      queue.entity_id,
      { queue_id: queueId, decision, status: newStatus },
    );

    return { ok: true, data: decisionRecord };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Recompute a research_run's governed_confidence from ALL its queue decisions.
 * Pure-engine math; persists governed_confidence + review_status on the run.
 * Best-effort — never throws (returns void; the decision already succeeded).
 */
async function recomputeGovernedConfidence(
  client: SupabaseClient,
  queueId: string,
  runId: string,
): Promise<void> {
  try {
    // Gather all decisions for the queue, each tagged with the reviewer's trust.
    const { data: decisionRows } = await client
      .from('review_decisions')
      .select('decision, reviewer_id')
      .eq('review_queue_id', queueId);
    const decisions = (decisionRows ?? []) as Array<{
      decision: ReviewDecisionType;
      reviewer_id?: string;
    }>;
    if (decisions.length === 0) return;

    // Trust per reviewer (default 0.5 neutral when no trust row).
    const reviewerIds = Array.from(
      new Set(decisions.map((d) => d.reviewer_id).filter((v): v is string => !!v)),
    );
    const trustById = new Map<string, number>();
    if (reviewerIds.length > 0) {
      const { data: trustRows } = await client
        .from('reviewer_trust')
        .select('reviewer_id, trust_score')
        .in('reviewer_id', reviewerIds);
      for (const t of (trustRows ?? []) as Array<{
        reviewer_id: string;
        trust_score: number;
      }>) {
        trustById.set(t.reviewer_id, Number(t.trust_score));
      }
    }

    const decisionInputs: ReviewerDecision[] = decisions.map((d) => ({
      decision: d.decision,
      reviewerTrust: d.reviewer_id ? trustById.get(d.reviewer_id) ?? 0.5 : 0.5,
    }));
    const reviewerValidation = aggregateReviewerValidation(decisionInputs);

    // Aggregate reviewer trust (mean) for the governance call.
    const trustValues = decisionInputs.map((d) => d.reviewerTrust ?? 0.5);
    const aggregateTrust =
      trustValues.reduce((a, b) => a + b, 0) / (trustValues.length || 1);

    // Research + evidence confidence (0..100).
    const { data: runRow } = await client
      .from('research_runs')
      .select('overall_confidence, evidence_coverage')
      .eq('id', runId)
      .maybeSingle();

    const coverage =
      (toJsonRecord(runRow?.evidence_coverage) as unknown as
        | EvidenceCoverageSummary
        | null) ?? null;

    // Prefer the consensus report's overallConfidence; fall back to the run.
    let researchConfidence =
      coverage?.researchConfidence ?? asNumber(runRow?.overall_confidence) ?? 0;
    const { data: reportRow } = await client
      .from('research_consensus_reports')
      .select('overall_confidence, report')
      .eq('run_id', runId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reportRow) {
      const fromReport = (toJsonRecord(reportRow.report) ?? {}) as {
        overallConfidence?: number;
      };
      researchConfidence =
        asNumber(fromReport.overallConfidence) ??
        asNumber(reportRow.overall_confidence) ??
        researchConfidence;
    }

    const evidenceConfidence =
      coverage?.evidenceWeightedConfidence ?? coverage?.coverageScore ?? researchConfidence;

    const result = governedConfidence({
      researchConfidence,
      evidenceConfidence,
      reviewerValidation,
      reviewerTrust: aggregateTrust,
      reviewCount: decisions.length,
    });

    // The run's review_status mirrors the queue status after this decision.
    const { data: queueRow } = await client
      .from('review_queues')
      .select('status')
      .eq('id', queueId)
      .maybeSingle();

    await client
      .from('research_runs')
      .update({
        governed_confidence: result.governedConfidence,
        review_status: (queueRow?.status as string | undefined) ?? null,
      })
      .eq('id', runId);
  } catch {
    // Best-effort governance recompute; the decision itself already persisted.
  }
}

/**
 * Recompute + upsert a reviewer's trust aggregate. approvedCount = APPROVE
 * decisions; reviewCount = total decisions; reversedCount = a heuristic
 * (decisions on queues whose FINAL status contradicts the reviewer's verdict —
 * e.g. they APPROVE'd but the queue ended rejected/escalated). See the
 * reviewer-guide for the exact reversal heuristic + its caveats.
 */
async function recomputeReviewerTrust(
  client: SupabaseClient,
  reviewerId: string,
): Promise<void> {
  try {
    const { data: decisionRows } = await client
      .from('review_decisions')
      .select('decision, review_queue_id')
      .eq('reviewer_id', reviewerId);
    const decisions = (decisionRows ?? []) as Array<{
      decision: ReviewDecisionType;
      review_queue_id: string;
    }>;

    const reviewCount = decisions.length;
    const approvedCount = decisions.filter((d) => d.decision === 'APPROVE').length;

    // Reversal heuristic: load the final status of each queue the reviewer acted
    // on. A reversal = the reviewer APPROVE'd but the queue's final status is
    // rejected/escalated, OR they REJECT'ed but it ended approved/published.
    let reversedCount = 0;
    const queueIds = Array.from(new Set(decisions.map((d) => d.review_queue_id)));
    if (queueIds.length > 0) {
      const { data: queueRows } = await client
        .from('review_queues')
        .select('id, status')
        .in('id', queueIds);
      const statusById = new Map<string, string>();
      for (const q of (queueRows ?? []) as Array<{ id: string; status: string }>) {
        statusById.set(q.id, q.status);
      }
      for (const d of decisions) {
        const finalStatus = statusById.get(d.review_queue_id);
        if (!finalStatus) continue;
        const approvedFinal =
          finalStatus === 'approved' || finalStatus === 'published';
        const negativeFinal =
          finalStatus === 'rejected' || finalStatus === 'escalated';
        if (d.decision === 'APPROVE' && negativeFinal) reversedCount += 1;
        else if (d.decision === 'REJECT' && approvedFinal) reversedCount += 1;
      }
    }

    const trust = computeReviewerTrust({
      approvedCount,
      reversedCount,
      reviewCount,
    });

    await client.from('reviewer_trust').upsert(
      {
        reviewer_id: reviewerId,
        approved_count: approvedCount,
        reversed_count: reversedCount,
        review_count: reviewCount,
        trust_score: trust.trustScore,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'reviewer_id' },
    );
  } catch {
    // Best-effort — trust recompute never blocks a decision.
  }
}

// =============================================================================
// CURATION DASHBOARD
// =============================================================================

/**
 * Assemble the curation dashboard (reviewer+/curator). Best-effort across the
 * board: each block degrades to [] on its own error so a partial dashboard still
 * renders. Never throws.
 */
export async function getCurationDashboard(): Promise<
  DbResult<CurationDashboardData>
> {
  try {
    const client = db();
    const gate = await requireRole(client, 'reviewer');
    if (!gate.ok) return gate;

    // Pending publications (recent).
    let pendingPublications: PublicationRecord[] = [];
    {
      const { data } = await client
        .from('publication_records')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(20);
      pendingPublications = (data ?? []) as PublicationRecord[];
    }

    // High-priority reviews (high/urgent & under_review).
    let highPriorityReviews: ReviewQueueItem[] = [];
    {
      const { data } = await client
        .from('review_queues')
        .select('*')
        .in('priority', ['high', 'urgent'])
        .eq('status', 'under_review')
        .order('created_at', { ascending: false });
      highPriorityReviews = await enrichQueueRows(
        client,
        (data ?? []) as ReviewQueueRecord[],
      );
    }

    // Escalations.
    let escalations: ReviewQueueItem[] = [];
    {
      const { data } = await client
        .from('review_queues')
        .select('*')
        .eq('status', 'escalated')
        .order('created_at', { ascending: false });
      escalations = await enrichQueueRows(
        client,
        (data ?? []) as ReviewQueueRecord[],
      );
    }

    // Contradiction + low-coverage runs (scan runs with stored coverage).
    const contradictionRuns: JsonRecord[] = [];
    const lowCoverageRuns: JsonRecord[] = [];
    {
      const { data: runRows } = await client
        .from('research_runs')
        .select(
          'id, title, overall_confidence, governed_confidence, review_status, evidence_coverage',
        )
        .order('created_at', { ascending: false })
        .limit(200);
      for (const r of runRows ?? []) {
        const cov = toJsonRecord(r.evidence_coverage) as unknown as
          | EvidenceCoverageSummary
          | null;
        if (!cov || typeof cov.totalClaims !== 'number') continue;
        const summary: JsonRecord = {
          id: r.id,
          title: r.title,
          overallConfidence: r.overall_confidence,
          governedConfidence: r.governed_confidence,
          reviewStatus: r.review_status,
          contradicted: cov.contradicted,
          coverageScore: cov.coverageScore,
        };
        if ((cov.contradicted ?? 0) > 0) contradictionRuns.push(summary);
        if ((cov.coverageScore ?? 100) < 50) lowCoverageRuns.push(summary);
      }
    }

    return {
      ok: true,
      data: {
        pendingPublications,
        highPriorityReviews,
        escalations,
        contradictionRuns,
        lowCoverageRuns,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// PUBLICATION
// =============================================================================

/**
 * Publish an entity (curator+). Builds a frozen PublicReportDraft snapshot via
 * the report-builder. If no publication_record exists for (entity_type,
 * entity_id) it creates one at version 1; otherwise it appends the NEXT version
 * and bumps latest_version. Marks any related review_queue 'published', notifies
 * the publisher, audits. Returns the publication_record.
 */
export async function publishEntity(
  entityType: ReviewEntityType,
  entityId: string,
  visibility: PublicationVisibility,
): Promise<DbResult<PublicationRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    // Build the snapshot first (read-only assembly).
    const draftResult = await buildPublicReport(entityType, entityId);
    if (!draftResult.ok) return draftResult;
    const draft = draftResult.data;

    // Existing publication record for this entity?
    const { data: existing, error: existErr } = await client
      .from('publication_records')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .maybeSingle();
    if (existErr) return fail(existErr);

    let record: PublicationRecord;
    let versionNumber: number;

    if (existing) {
      record = existing as PublicationRecord;
      versionNumber = (record.latest_version ?? 0) + 1;
      const { data: updated, error: updErr } = await client
        .from('publication_records')
        .update({ visibility, latest_version: versionNumber, status: 'published' })
        .eq('id', record.id)
        .select('*')
        .single();
      if (updErr) return fail(updErr);
      record = updated as PublicationRecord;
    } else {
      versionNumber = 1;
      const { data: inserted, error: insErr } = await client
        .from('publication_records')
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          published_by: gate.user.id,
          visibility,
          status: 'published',
          latest_version: 1,
        })
        .select('*')
        .single();
      if (insErr) return fail(insErr);
      record = inserted as PublicationRecord;
    }

    // Append the immutable version snapshot.
    const { error: verErr } = await client.from('publication_versions').insert({
      publication_record_id: record.id,
      version_number: versionNumber,
      snapshot_json: draft as unknown as JsonRecord,
      created_by: gate.user.id,
    });
    if (verErr) return fail(verErr);

    // Mark a related review queue 'published' if one exists (best-effort).
    await client
      .from('review_queues')
      .update({ status: 'published' })
      .eq('entity_type', entityType)
      .eq('entity_id', entityId);

    await notify(client, {
      userId: gate.user.id,
      type: 'publication_approved',
      title: 'Publication created',
      body: `Published ${entityType} at version ${versionNumber} (${visibility}).`,
      entityType,
      entityId,
    });

    await recordAudit(
      client,
      gate.user.id,
      'entity_published',
      entityType,
      entityId,
      { publication_id: record.id, version: versionNumber, visibility },
    );

    return { ok: true, data: record };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Re-publish: re-run the report builder and append the NEXT version snapshot to
 * an existing publication_record, bumping latest_version (curator+). Returns the
 * new publication_versions row.
 */
export async function republishEntity(
  publicationId: string,
): Promise<DbResult<PublicationVersionRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const { data: recordRow, error: recErr } = await client
      .from('publication_records')
      .select('*')
      .eq('id', publicationId)
      .maybeSingle();
    if (recErr) return fail(recErr);
    if (!recordRow) {
      return { ok: false, error: 'Publication not found or not visible.', code: 'DB_ERROR' };
    }
    const record = recordRow as PublicationRecord;

    const draftResult = await buildPublicReport(
      record.entity_type as ReviewEntityType,
      record.entity_id,
    );
    if (!draftResult.ok) return draftResult;

    const versionNumber = (record.latest_version ?? 0) + 1;

    const { data: versionRow, error: verErr } = await client
      .from('publication_versions')
      .insert({
        publication_record_id: record.id,
        version_number: versionNumber,
        snapshot_json: draftResult.data as unknown as JsonRecord,
        created_by: gate.user.id,
      })
      .select('*')
      .single();
    if (verErr) return fail(verErr);

    const { error: bumpErr } = await client
      .from('publication_records')
      .update({ latest_version: versionNumber })
      .eq('id', record.id);
    if (bumpErr) return fail(bumpErr);

    await recordAudit(
      client,
      gate.user.id,
      'entity_republished',
      record.entity_type,
      record.entity_id,
      { publication_id: record.id, version: versionNumber },
    );

    return { ok: true, data: versionRow as PublicationVersionRecord };
  } catch (e) {
    return fail(e);
  }
}

/** List publication records visible to the caller (RLS-gated), newest first. */
export async function listPublications(): Promise<DbResult<PublicationRecord[]>> {
  try {
    const { data, error } = await db()
      .from('publication_records')
      .select('*')
      .order('published_at', { ascending: false });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as PublicationRecord[] };
  } catch (e) {
    return fail(e);
  }
}

/** A publication record + all of its version snapshots (ascending version). */
export async function getPublication(id: string): Promise<
  DbResult<{ record: PublicationRecord; versions: PublicationVersionRecord[] }>
> {
  try {
    const client = db();
    const { data: recordRow, error: recErr } = await client
      .from('publication_records')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (recErr) return fail(recErr);
    if (!recordRow) {
      return { ok: false, error: 'Publication not found or not visible.', code: 'DB_ERROR' };
    }

    const { data: versionRows, error: verErr } = await client
      .from('publication_versions')
      .select('*')
      .eq('publication_record_id', id)
      .order('version_number', { ascending: true });
    if (verErr) return fail(verErr);

    return {
      ok: true,
      data: {
        record: recordRow as PublicationRecord,
        versions: (versionRows ?? []) as PublicationVersionRecord[],
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/** Change a publication's visibility tier (curator+). */
export async function updatePublicationVisibility(
  id: string,
  visibility: PublicationVisibility,
): Promise<DbResult<PublicationRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const { data, error } = await client
      .from('publication_records')
      .update({ visibility })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return fail(error);
    const record = data as PublicationRecord;

    await recordAudit(
      client,
      gate.user.id,
      'publication_visibility_updated',
      record.entity_type,
      record.entity_id,
      { publication_id: id, visibility },
    );

    return { ok: true, data: record };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// COMMENTS
// =============================================================================

/** List comments on an entity (authenticated read via RLS), with author email. */
export async function listComments(
  entityType: ReviewEntityType,
  entityId: string,
): Promise<DbResult<Array<ReviewCommentRecord & { userEmail?: string }>>> {
  try {
    const client = db();
    const { data, error } = await client
      .from('review_comments')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true });
    if (error) return fail(error);
    const comments = (data ?? []) as ReviewCommentRecord[];

    const userIds = Array.from(
      new Set(comments.map((c) => c.user_id).filter((v): v is string => !!v)),
    );
    const emailById = await loadUserEmails(client, userIds);

    return {
      ok: true,
      data: comments.map((c) => ({
        ...c,
        userEmail: c.user_id ? emailById.get(c.user_id) : undefined,
      })),
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Add a comment (any authenticated user). Inserts review_comments
 * {user_id, parent_id, mentions}; for each mention inserts a comment_mention
 * notification; audits.
 */
export async function addComment(
  entityType: ReviewEntityType,
  entityId: string,
  comment: string,
  parentId?: string,
  mentions?: string[],
): Promise<DbResult<ReviewCommentRecord>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    const mentionList = mentions ?? [];
    const { data, error } = await client
      .from('review_comments')
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        user_id: user.id,
        comment,
        parent_id: parentId ?? null,
        mentions: mentionList,
      })
      .select('*')
      .single();
    if (error) return fail(error);
    const record = data as ReviewCommentRecord;

    for (const mentionedId of mentionList) {
      if (mentionedId === user.id) continue;
      await notify(client, {
        userId: mentionedId,
        type: 'comment_mention',
        title: 'You were mentioned in a comment',
        body: comment.slice(0, 280),
        entityType,
        entityId,
      });
    }

    await recordAudit(client, user.id, 'comment_added', entityType, entityId, {
      comment_id: record.id,
      parent_id: parentId ?? null,
      mentions: mentionList,
    });

    return { ok: true, data: record };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// NOTIFICATIONS
// =============================================================================

/** The caller's own notifications (RLS: user_id = auth.uid()), newest first. */
export async function listNotifications(): Promise<
  DbResult<NotificationRecord[]>
> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    const { data, error } = await client
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as NotificationRecord[] };
  } catch (e) {
    return fail(e);
  }
}

/** Mark a single notification read (owner only via RLS). */
export async function markNotificationRead(
  id: string,
): Promise<DbResult<NotificationRecord>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    const { data, error } = await client
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as NotificationRecord };
  } catch (e) {
    return fail(e);
  }
}

/** Mark all of the caller's notifications read. Returns the updated count. */
export async function markAllNotificationsRead(): Promise<
  DbResult<{ updated: number }>
> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    const { data, error } = await client
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)
      .select('id');
    if (error) return fail(error);
    return { ok: true, data: { updated: (data ?? []).length } };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// AUDIT TRAIL
// =============================================================================

/**
 * Read the audit trail for an entity: audit_logs rows whose metadata carries the
 * matching entity_type/entity_id (the shape recordAudit writes), newest first.
 */
export async function getAuditTrail(
  entityType: ReviewEntityType,
  entityId: string,
): Promise<DbResult<JsonRecord[]>> {
  try {
    const { data, error } = await db()
      .from('audit_logs')
      .select('*')
      .eq('metadata->>entity_type', entityType)
      .eq('metadata->>entity_id', entityId)
      .order('created_at', { ascending: false });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as JsonRecord[] };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// INTERNAL JOIN HELPERS
// =============================================================================

/** Map user ids → email (best-effort; empty map on error). */
async function loadUserEmails(
  client: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (userIds.length === 0) return result;
  try {
    const { data } = await client
      .from('users')
      .select('id, email')
      .in('id', userIds);
    for (const u of (data ?? []) as Array<{ id: string; email?: string }>) {
      if (u.email) result.set(u.id, u.email);
    }
  } catch {
    // best-effort
  }
  return result;
}

/**
 * Build a light entitySummary per research_run id: overall_confidence,
 * governed_confidence, review_status, and the evidence support/contradiction
 * counts. Best-effort (empty map on error).
 */
async function loadRunSummaries(
  client: SupabaseClient,
  runIds: string[],
): Promise<Map<string, JsonRecord>> {
  const result = new Map<string, JsonRecord>();
  if (runIds.length === 0) return result;
  try {
    const { data } = await client
      .from('research_runs')
      .select(
        'id, title, overall_confidence, governed_confidence, review_status, evidence_coverage',
      )
      .in('id', runIds);
    for (const r of data ?? []) {
      const cov = toJsonRecord(r.evidence_coverage) as unknown as
        | EvidenceCoverageSummary
        | null;
      result.set(r.id as string, {
        title: r.title,
        overallConfidence: r.overall_confidence,
        governedConfidence: r.governed_confidence,
        reviewStatus: r.review_status,
        evidenceCoverage: cov
          ? {
              totalClaims: cov.totalClaims,
              supported: cov.supported,
              contradicted: cov.contradicted,
              unsupported: cov.unsupported,
              coverageScore: cov.coverageScore,
            }
          : undefined,
      });
    }
  } catch {
    // best-effort
  }
  return result;
}

/** Enrich raw queue rows into ReviewQueueItem[] (decisions + reviewer email + summary). */
async function enrichQueueRows(
  client: SupabaseClient,
  queues: ReviewQueueRecord[],
): Promise<ReviewQueueItem[]> {
  if (queues.length === 0) return [];
  const queueIds = queues.map((q) => q.id);

  const { data: decisionRows } = await client
    .from('review_decisions')
    .select('*')
    .in('review_queue_id', queueIds)
    .order('created_at', { ascending: false });
  const decisionsByQueue = new Map<string, ReviewDecisionRecord[]>();
  for (const d of (decisionRows ?? []) as ReviewDecisionRecord[]) {
    const arr = decisionsByQueue.get(d.review_queue_id) ?? [];
    arr.push(d);
    decisionsByQueue.set(d.review_queue_id, arr);
  }

  const reviewerIds = Array.from(
    new Set(queues.map((q) => q.assigned_to).filter((v): v is string => !!v)),
  );
  const emailById = await loadUserEmails(client, reviewerIds);

  const runIds = Array.from(
    new Set(
      queues
        .filter((q) => q.entity_type === 'research_run')
        .map((q) => q.entity_id),
    ),
  );
  const runSummaries = await loadRunSummaries(client, runIds);

  return queues.map((queue) => {
    const decisions = decisionsByQueue.get(queue.id) ?? [];
    return {
      queue,
      assignedReviewerEmail: queue.assigned_to
        ? emailById.get(queue.assigned_to)
        : undefined,
      decisionsCount: decisions.length,
      latestDecision: decisions[0],
      entitySummary:
        queue.entity_type === 'research_run'
          ? runSummaries.get(queue.entity_id)
          : undefined,
    };
  });
}

/**
 * Resolve the creator/owner user id for an entity (best-effort). research_run →
 * research_runs.created_by; other kinds → undefined. Used to notify on a verdict.
 */
async function loadEntityCreator(
  client: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<string | undefined> {
  try {
    if (entityType === 'research_run') {
      const { data } = await client
        .from('research_runs')
        .select('created_by')
        .eq('id', entityId)
        .maybeSingle();
      return (data?.created_by as string | undefined) ?? undefined;
    }
  } catch {
    // best-effort
  }
  return undefined;
}

// -----------------------------------------------------------------------------
// Re-export the public report builder for callers that import only the DAL.
// -----------------------------------------------------------------------------
export { buildPublicReport } from './report-builder';
export type { PublicReportDraft } from '@hsi/shared-types';
