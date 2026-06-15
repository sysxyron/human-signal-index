'use server';

// =============================================================================
// HSI Phase 25 — investigation WORKFLOW (Deliverables 12-19). Dashboard buckets,
// detail view (timeline + readiness), and governed workflow mutations. Every
// state change validates via the pure engine and appends an APPEND-ONLY event —
// no silent transitions. This moves WORKFLOW state only; it never publishes
// content, makes governance outcomes final, or assigns RBAC roles. Offline → demo.
// =============================================================================

import type { InvestigationRow, InvestigationEventRow } from '@hsi/shared-types';
import {
  transitionInvestigation, buildInvestigationTimeline, readinessChecklist, isPublicationReady,
  demoInvestigationEvents, demoReadiness,
  type InvestigationStatus, type PublicationReadiness, type InvestigationEvent,
} from '@hsi/contributor-network';
import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { hasRole } from '@/lib/security/rbac-audit';
import { contributorConfigured, type ContribResult } from './options';
import { recordContribution } from './recorder';
import type { ContributionEventType } from '@hsi/contributor-network';

/** Map an investigation status to the contribution event emitted on entering it. */
const INVESTIGATION_EVENT_BY_STATUS: Partial<Record<InvestigationStatus, ContributionEventType>> = {
  intake: 'INVESTIGATION_SUBMITTED',
  research: 'INVESTIGATION_ACTIVE',
  review: 'INVESTIGATION_UNDER_REVIEW',
  publication_ready: 'INVESTIGATION_APPROVED',
  published: 'INVESTIGATION_PUBLISHED',
  archived: 'INVESTIGATION_ARCHIVED',
};

// ---- reads -----------------------------------------------------------------

export interface InvestigationBuckets {
  active: InvestigationRow[];
  assigned: InvestigationRow[];
  recentlyUpdated: InvestigationRow[];
  escalated: InvestigationRow[];
  awaitingReview: InvestigationRow[];
  publicationReady: InvestigationRow[];
}

function mapInv(r: Record<string, unknown>): InvestigationRow {
  return {
    id: String(r.id), title: String(r.title), summary: (r.summary as string) ?? null,
    status: r.status as InvestigationRow['status'], priority: r.priority as InvestigationRow['priority'],
    ownerId: (r.owner_id as string) ?? null, teamId: (r.team_id as string) ?? null,
    createdBy: (r.created_by as string) ?? null,
    createdAt: String(r.created_at), updatedAt: (r.updated_at as string) ?? null,
  };
}

const DEMO_INVS: InvestigationRow[] = [
  { id: 'demo-1', title: 'Coordinated narrative spike (demo)', summary: 'Cluster of aligned posts across 3 platforms.', status: 'review', priority: 'high', ownerId: 'demo-researcher', teamId: 't1', createdBy: 'demo-researcher', createdAt: '2026-06-08T08:00:00Z', updatedAt: '2026-06-12T11:00:00Z' },
  { id: 'demo-2', title: 'Source authenticity check (demo)', summary: 'Verifying provenance of leaked document set.', status: 'evidence_collection', priority: 'medium', ownerId: 'demo-researcher', teamId: 't1', createdBy: 'demo-researcher', createdAt: '2026-06-09T08:00:00Z', updatedAt: '2026-06-11T09:00:00Z' },
  { id: 'demo-3', title: 'Escalated: sensitive claim (demo)', summary: 'Claim with potential legal exposure; escalated.', status: 'escalated', priority: 'critical', ownerId: null, teamId: 't2', createdBy: 'demo-reviewer', createdAt: '2026-06-10T08:00:00Z', updatedAt: '2026-06-13T08:00:00Z' },
  { id: 'demo-4', title: 'Ready for publication (demo)', summary: 'Completed investigation pending publication.', status: 'publication_ready', priority: 'high', ownerId: 'demo-researcher', teamId: 't3', createdBy: 'demo-curator', createdAt: '2026-06-05T08:00:00Z', updatedAt: '2026-06-13T12:00:00Z' },
];

function bucketize(rows: InvestigationRow[], userId: string | null): InvestigationBuckets {
  return {
    active: rows.filter((r) => !['published', 'archived'].includes(r.status)),
    assigned: rows.filter((r) => r.ownerId && r.ownerId === userId),
    recentlyUpdated: [...rows].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')).slice(0, 5),
    escalated: rows.filter((r) => r.status === 'escalated'),
    awaitingReview: rows.filter((r) => r.status === 'review'),
    publicationReady: rows.filter((r) => r.status === 'publication_ready'),
  };
}

export async function listInvestigationWorkflowAction(): Promise<ContribResult<InvestigationBuckets>> {
  if (!contributorConfigured()) return { ok: true, demo: true, data: bucketize(DEMO_INVS, 'demo-researcher') };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const role = await loadHighestRole(db, user.id);
    if (!hasRole(role ?? undefined, 'researcher')) return { ok: false, code: 'FORBIDDEN' };
    const { data, error } = await db.from('investigations').select('*').order('updated_at', { ascending: false }).limit(200);
    if (error) return { ok: false, code: 'DB_ERROR', error: error.message };
    return { ok: true, data: bucketize((data ?? []).map((r) => mapInv(r as Record<string, unknown>)), user.id) };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}

export interface InvestigationDetail {
  investigation: InvestigationRow;
  timeline: InvestigationEventRow[];
  readiness: PublicationReadiness;
  readinessChecklist: Array<{ label: string; ok: boolean }>;
  publicationReady: boolean;
  canAct: boolean;
  role: string | null;
}

export async function getInvestigationWorkflowAction(id: string): Promise<ContribResult<InvestigationDetail>> {
  if (!contributorConfigured()) {
    const inv = DEMO_INVS.find((i) => i.id === id) ?? DEMO_INVS[0];
    const timeline: InvestigationEventRow[] = buildInvestigationTimeline(demoInvestigationEvents).map((e, i) => ({
      id: `demo-evt-${i}`, investigationId: inv.id, actorId: e.actor, action: e.action, reason: e.reason, createdAt: e.at,
    }));
    return {
      ok: true, demo: true,
      data: { investigation: inv, timeline, readiness: demoReadiness, readinessChecklist: readinessChecklist(demoReadiness), publicationReady: isPublicationReady(demoReadiness), canAct: false, role: 'researcher' },
    };
  }
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const role = await loadHighestRole(db, user.id);
    if (!hasRole(role ?? undefined, 'researcher')) return { ok: false, code: 'FORBIDDEN' };

    const [{ data: invData, error: invErr }, { data: evData }, { data: rdData }] = await Promise.all([
      db.from('investigations').select('*').eq('id', id).single(),
      db.from('investigation_events').select('*').eq('investigation_id', id).order('created_at', { ascending: true }),
      db.from('investigation_publication_readiness').select('*').eq('investigation_id', id).maybeSingle(),
    ]);
    if (invErr || !invData) return { ok: false, code: 'DB_ERROR', error: invErr?.message };

    const timeline: InvestigationEventRow[] = (evData ?? []).map((r) => {
      const rec = r as Record<string, unknown>;
      return { id: String(rec.id), investigationId: id, actorId: (rec.actor_id as string) ?? null, action: String(rec.action), reason: (rec.reason as string) ?? null, createdAt: String(rec.created_at) };
    });
    const rd = (rdData ?? {}) as Record<string, boolean>;
    const readiness: PublicationReadiness = {
      evidenceComplete: Boolean(rd.evidence_complete), reviewerComplete: Boolean(rd.reviewer_complete),
      governanceComplete: Boolean(rd.governance_complete), riskAssessed: Boolean(rd.risk_assessed),
      traceabilitySufficient: Boolean(rd.traceability_sufficient), sourceQualitySufficient: Boolean(rd.source_quality_sufficient),
    };
    return {
      ok: true,
      data: {
        investigation: mapInv(invData as Record<string, unknown>), timeline, readiness,
        readinessChecklist: readinessChecklist(readiness), publicationReady: isPublicationReady(readiness),
        canAct: hasRole(role ?? undefined, 'researcher'), role,
      },
    };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}

// ---- mutations (governed; every change appends an audit event) -------------

async function applyTransition(
  id: string,
  to: InvestigationStatus,
  minRole: 'researcher' | 'reviewer',
  reason: string,
  extra?: { action?: string; assignmentAction?: string; ownerId?: string | null },
): Promise<ContribResult<{ id: string; status: InvestigationStatus }>> {
  if (!contributorConfigured()) return { ok: false, code: 'NOT_CONFIGURED' };
  if (!reason || reason.trim().length === 0) return { ok: false, code: 'DB_ERROR', error: 'A reason is required.' };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const role = await loadHighestRole(db, user.id);
    if (!hasRole(role ?? undefined, minRole)) return { ok: false, code: 'FORBIDDEN' };

    const { data: inv, error: loadErr } = await db.from('investigations').select('status, owner_id').eq('id', id).single();
    if (loadErr || !inv) return { ok: false, code: 'DB_ERROR', error: loadErr?.message };
    const from = (inv as { status: InvestigationStatus }).status;
    const ownerId = (inv as { owner_id?: string | null }).owner_id ?? null;

    const t = transitionInvestigation(from, to, { actor: user.id, reason }, { now: new Date().toISOString() });
    if (!t.ok) return { ok: false, code: 'DB_ERROR', error: t.reason };

    const patch: Record<string, unknown> = { status: to };
    if (extra && 'ownerId' in extra) patch.owner_id = extra.ownerId;
    const { error: updErr } = await db.from('investigations').update(patch).eq('id', id);
    if (updErr) return { ok: false, code: 'DB_ERROR', error: updErr.message };

    await db.from('investigation_events').insert({ investigation_id: id, actor_id: user.id, action: extra?.action ?? t.event.action, reason: reason.trim() });
    if (extra?.assignmentAction) {
      await db.from('investigation_assignments').insert({ investigation_id: id, assignee_id: extra.ownerId ?? null, assigner_id: user.id, action: extra.assignmentAction, reason: reason.trim() });
    }

    // Phase 26 — additive, best-effort contribution award on the state move.
    const evt = INVESTIGATION_EVENT_BY_STATUS[to];
    if (evt) {
      // For approval, credit the OWNER (subject) and the reviewer (actor).
      const subjectId = to === 'publication_ready' ? ownerId : null;
      await recordContribution({ event: evt, actorId: user.id, subjectId, refKind: 'investigation', refId: id, reason: reason.trim() });
    }

    return { ok: true, data: { id, status: to } };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}

/** Researcher claims an investigation (intake → research, takes ownership). */
export async function claimInvestigationAction(id: string): Promise<ContribResult<{ id: string; status: InvestigationStatus }>> {
  const user = await getUser();
  return applyTransition(id, 'research', 'researcher', 'Claimed for investigation.', { action: 'claimed', assignmentAction: 'claimed', ownerId: user?.id ?? null });
}
/** Researcher releases ownership (research → intake). */
export async function releaseInvestigationAction(id: string): Promise<ContribResult<{ id: string; status: InvestigationStatus }>> {
  return applyTransition(id, 'intake', 'researcher', 'Released back to intake.', { action: 'released', assignmentAction: 'released', ownerId: null });
}
/** Researcher submits for review (evidence_collection → review). */
export async function submitForReviewAction(id: string): Promise<ContribResult<{ id: string; status: InvestigationStatus }>> {
  return applyTransition(id, 'review', 'researcher', 'Submitted for review.', { action: 'submitted_for_review', assignmentAction: 'submitted_for_review' });
}
/** Reviewer/curator escalates (→ escalated). */
export async function escalateInvestigationAction(id: string, reason: string): Promise<ContribResult<{ id: string; status: InvestigationStatus }>> {
  return applyTransition(id, 'escalated', 'reviewer', reason, { action: 'escalated' });
}

/** Reviewer decision on an investigation in review. Comment REQUIRED (no silent approval). */
export async function reviewInvestigationAction(input: {
  id: string; decision: 'approve' | 'return_for_research' | 'escalate' | 'request_more_evidence'; comment: string;
}): Promise<ContribResult<{ id: string; status: InvestigationStatus }>> {
  if (!input.comment || input.comment.trim().length === 0) return { ok: false, code: 'DB_ERROR', error: 'A reviewer comment is required.' };
  const targetByDecision: Record<typeof input.decision, InvestigationStatus> = {
    approve: 'publication_ready', return_for_research: 'evidence_collection', escalate: 'escalated', request_more_evidence: 'evidence_collection',
  };
  if (!contributorConfigured()) return { ok: false, code: 'NOT_CONFIGURED' };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const role = await loadHighestRole(db, user.id);
    if (!hasRole(role ?? undefined, 'reviewer')) return { ok: false, code: 'FORBIDDEN' };
    // Record the review decision (comment NOT NULL at the DB layer too).
    await db.from('investigation_reviews').insert({ investigation_id: input.id, reviewer_id: user.id, decision: input.decision, comment: input.comment.trim() });
    return applyTransition(input.id, targetByDecision[input.decision], 'reviewer', input.comment, { action: `review:${input.decision}` });
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}

/** Governance decision on an escalated/sensitive investigation. Rationale REQUIRED. */
export async function governanceDecisionAction(input: {
  id: string; decision: 'cleared' | 'hold' | 'block' | 'return_for_review'; rationale: string;
}): Promise<ContribResult<{ id: string }>> {
  if (!input.rationale || input.rationale.trim().length === 0) return { ok: false, code: 'DB_ERROR', error: 'A governance rationale is required.' };
  if (!contributorConfigured()) return { ok: false, code: 'NOT_CONFIGURED' };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const role = await loadHighestRole(db, user.id);
    if (!hasRole(role ?? undefined, 'reviewer')) return { ok: false, code: 'FORBIDDEN' };
    await db.from('investigation_governance_decisions').insert({ investigation_id: input.id, decided_by: user.id, decision: input.decision, rationale: input.rationale.trim() });
    // Move to governance for tracking when held/blocked; cleared → publication_ready.
    const to: InvestigationStatus = input.decision === 'cleared' ? 'publication_ready' : input.decision === 'return_for_review' ? 'review' : 'governance';
    await applyTransition(input.id, to, 'reviewer', `Governance: ${input.decision}. ${input.rationale}`, { action: `governance:${input.decision}` });
    return { ok: true, data: { id: input.id } };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}
