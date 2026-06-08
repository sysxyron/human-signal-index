// =============================================================================
// apps/worker/jobs — slaEscalationJob (WorldForge/HSI Phase 9)
//
// The SLA WATCHDOG. Periodically scans open review items (review_queues +
// hsin_signal_reviews) and, for each item whose SLA review/escalation deadline
// has been exceeded, ESCALATES it for human attention — it NEVER auto-publishes
// and NEVER auto-decides a review. The decision stays with a human; the worker
// only raises priority/visibility so an overdue item isn't silently lost.
//
// SLA MATH (pure, deterministic): we resolve a SlaPolicy by severity from
// DEFAULT_SLA_POLICIES (@hsi/source-intelligence), then call `slaStatus(policy,
// createdAt, now, reviewedAt?)` to determine on_track / due_soon / overdue_review
// / overdue_escalation. Only `overdue_review` and `overdue_escalation` items are
// escalated. `computeSlaDeadlines` surfaces the concrete deadlines for the log.
//
// FOR EACH OVERDUE ITEM (all via an INJECTED persister, default no-op):
//   1. ESCALATE severity — set review_queues.status='escalated' and bump
//      priority toward 'urgent'.
//   2. NOTIFY — insert a notifications row for the assignee (and/or reviewers).
//   3. AUDIT — insert an audit_logs event ('sla.escalation') recording the
//      overdue item, its deadlines, and the rationale.
//   4. NEVER auto-publish / NEVER auto-approve.
//
// OFFLINE-SAFE (binding): items are loaded via an INJECTED loader (default:
// none → empty run) and escalations are applied via an INJECTED persister
// (default: no-op). With a service-role Supabase client configured the default
// factories operate on the DB; otherwise everything is a clean no-op. NEVER
// throws. ICM: declared inputs + structured summary are logged.
//
// SCHEDULING: cron '*/15 * * * *' (every 15 min) via an external scheduler.
// =============================================================================

import {
  DEFAULT_SLA_POLICIES,
  computeSlaDeadlines,
  slaStatus,
  type SlaPolicy,
  type SlaSeverity,
  type SlaStatus,
} from '@hsi/source-intelligence';
import { logger } from '../src/logger';
import { createServiceRoleClient } from '@hsi/database';
import type { Job, JobContext, JobResult } from './types';

/**
 * One open review item under SLA. Carries enough provenance to compute its SLA
 * status and to address an escalation/notification. `severity` selects the SLA
 * policy; `createdAt` starts the clock; `reviewedAt` (when set + before the
 * review deadline) stops it.
 */
export interface SlaReviewItem {
  /** review_queues.id (or hsin_signal_reviews.id) — the row to escalate. */
  id: string;
  /** 'review_queue' | 'signal_review' — which table this came from. */
  kind: 'review_queue' | 'signal_review';
  /** Underlying entity (signal/world/etc.) for notifications/audit context. */
  entityType?: string;
  entityId?: string;
  /** Severity drives the SLA policy (defaults to MEDIUM when unknown). */
  severity?: SlaSeverity | string;
  /** ISO creation timestamp (SLA clock start). */
  createdAt: string;
  /** ISO timestamp a review completed (stops the review clock), if any. */
  reviewedAt?: string;
  /** Current status (so we skip already-escalated/terminal items). */
  status?: string;
  /** User to notify (assignee/reviewer); optional. */
  assignedTo?: string;
}

/** The escalation computed for one overdue item (handed to the persister). */
export interface SlaEscalation {
  item: SlaReviewItem;
  status: SlaStatus;
  policy: SlaPolicy;
  /** Target priority after escalation. */
  newPriority: 'high' | 'urgent';
  /** Human-readable reason this item was escalated (ICM/traceability). */
  rationale: string;
  /** When the escalation was raised (injected `now`). */
  at: string;
}

/** Loads open review items under SLA (default: none — safe no-op offline). */
export type LoadSlaItems = (ctx: JobContext) => Promise<SlaReviewItem[]>;

/**
 * Applies one escalation: bump status/priority, notify, audit. MUST NEVER
 * auto-publish or auto-decide. Default: no-op. Returns whether each side-effect
 * was applied (best-effort; for the summary only).
 */
export type PersistSlaEscalation = (
  escalation: SlaEscalation,
) => Promise<{ escalated: boolean; notified: boolean; audited: boolean }>;

const defaultLoad: LoadSlaItems = async () => [];
const defaultPersist: PersistSlaEscalation = async () => ({
  escalated: false,
  notified: false,
  audited: false,
});

/** Resolve the SLA policy for a severity (default MEDIUM if unknown). */
function policyForSeverity(severity: unknown): SlaPolicy {
  const sev = typeof severity === 'string' ? severity.toUpperCase() : 'MEDIUM';
  return (
    DEFAULT_SLA_POLICIES.find((p) => p.severity === sev) ??
    DEFAULT_SLA_POLICIES.find((p) => p.severity === 'MEDIUM') ??
    DEFAULT_SLA_POLICIES[2]
  );
}

/** Statuses we never escalate (already escalated or terminal). */
const SKIP_STATUSES = new Set([
  'escalated',
  'approved',
  'published',
  'rejected',
]);

export function makeSlaEscalationJob(
  load: LoadSlaItems = defaultLoad,
  persist: PersistSlaEscalation = defaultPersist,
  policies: SlaPolicy[] = DEFAULT_SLA_POLICIES,
): Job {
  return {
    name: 'slaEscalation',
    description:
      'Escalates review items that exceeded their SLA review/escalation deadline (never auto-publishes).',
    schedule: '*/15 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;

      let items: SlaReviewItem[] = [];
      try {
        items = await load(ctx);
      } catch (e) {
        logger.warn('job.slaEscalation.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
        items = [];
      }

      const declaredInputs = {
        itemCount: items.length,
        policyCount: policies.length,
        runAt: now,
        // BINDING: this worker never publishes/decides — it only escalates.
        autoPublish: false,
      };
      logger.info('job.slaEscalation.start', { declaredInputs });

      let scanned = 0;
      let overdueReview = 0;
      let overdueEscalation = 0;
      let escalated = 0;
      let notified = 0;
      let audited = 0;
      let skipped = 0;
      let failed = 0;

      for (const item of items) {
        scanned += 1;
        try {
          if (item.status && SKIP_STATUSES.has(item.status.toLowerCase())) {
            skipped += 1;
            continue;
          }

          const policy = policyForSeverity(item.severity);
          const status = slaStatus(policy, item.createdAt, now, item.reviewedAt);

          // Only overdue items escalate. on_track / due_soon are left alone.
          if (status.state !== 'overdue_review' && status.state !== 'overdue_escalation') {
            continue;
          }
          if (status.state === 'overdue_review') overdueReview += 1;
          else overdueEscalation += 1;

          const { reviewDeadline, escalationDeadline } = computeSlaDeadlines(
            policy,
            item.createdAt,
          );
          // overdue_escalation is the more severe → urgent; overdue_review → high.
          const newPriority: 'high' | 'urgent' =
            status.state === 'overdue_escalation' ? 'urgent' : 'high';
          const rationale =
            `SLA ${status.state}: ${policy.name} (${policy.severity}) — ` +
            `created ${item.createdAt}; review due ${reviewDeadline}; ` +
            `escalation due ${escalationDeadline}; ${status.hoursRemaining}h to next ` +
            `deadline (negative = overdue). Escalating to '${newPriority}' for human ` +
            `attention. NEVER auto-published / auto-decided.`;

          const escalation: SlaEscalation = {
            item,
            status,
            policy,
            newPriority,
            rationale,
            at: now,
          };

          logger.info('job.slaEscalation.overdue', {
            id: item.id,
            kind: item.kind,
            severity: policy.severity,
            state: status.state,
            newPriority,
            hoursRemaining: status.hoursRemaining,
            rationale,
          });

          const applied = await persist(escalation).catch((e) => {
            logger.warn('job.slaEscalation.persistFailed', {
              id: item.id,
              error: e instanceof Error ? e.message : String(e),
            });
            return { escalated: false, notified: false, audited: false };
          });
          if (applied.escalated) escalated += 1;
          if (applied.notified) notified += 1;
          if (applied.audited) audited += 1;
        } catch (e) {
          failed += 1;
          logger.warn('job.slaEscalation.itemFailed', {
            id: item.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const summary = {
        scanned,
        overdueReview,
        overdueEscalation,
        escalated,
        notified,
        audited,
        skipped,
        failed,
      };
      logger.info('job.slaEscalation.done', summary);

      return {
        job: 'slaEscalation',
        ok: true,
        declaredInputs,
        summary,
      };
    },
  };
}

// =============================================================================
// Service-role default loader/persister (offline-safe — null client → no-op).
// =============================================================================

/** Minimal structural shape of the Supabase bits the SLA worker uses. */
interface SlaClientLike {
  from(table: string): {
    insert: (values: unknown) => Promise<{ data: unknown; error: unknown }>;
    select: (cols?: string) => {
      in: (col: string, vals: unknown[]) => {
        limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
      };
    };
    update: (values: unknown) => {
      eq: (col: string, val: unknown) => Promise<{ data: unknown; error: unknown }>;
    };
  };
}

/** True when the service-role env is present (mirrors queue-store). */
function slaServiceRoleConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** Resolve a service-role client, or null (offline). Never throws. */
function trySlaClient(): SlaClientLike | null {
  if (!slaServiceRoleConfigured()) return null;
  try {
    return createServiceRoleClient() as unknown as SlaClientLike;
  } catch (e) {
    logger.warn('slaEscalation.serviceRole.unavailable', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

interface ReviewQueueRow {
  id: string;
  entity_type: string | null;
  entity_id: string | null;
  status: string | null;
  priority: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string | null;
}

/**
 * Default DB loader: read OPEN review_queues rows (draft/under_review/
 * needs_evidence). Severity is inferred from the current priority (urgent→
 * CRITICAL, high→HIGH, else MEDIUM) since review_queues has no severity column.
 * Offline (no client) → empty. Never throws.
 */
export const dbLoadSlaItems: LoadSlaItems = async () => {
  const client = trySlaClient();
  if (!client) return [];
  try {
    const { data, error } = await client
      .from('review_queues')
      .select('id,entity_type,entity_id,status,priority,assigned_to,created_at,updated_at')
      .in('status', ['draft', 'under_review', 'needs_evidence'])
      .limit(500);
    if (error || !data) return [];
    const rows = data as ReviewQueueRow[];
    return rows.map((r) => ({
      id: r.id,
      kind: 'review_queue' as const,
      entityType: r.entity_type ?? undefined,
      entityId: r.entity_id ?? undefined,
      severity: priorityToSeverity(r.priority),
      createdAt: r.created_at,
      status: r.status ?? undefined,
      assignedTo: r.assigned_to ?? undefined,
    }));
  } catch (e) {
    logger.warn('slaEscalation.dbLoad.threw', {
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
};

function priorityToSeverity(priority: string | null): SlaSeverity {
  switch ((priority ?? '').toLowerCase()) {
    case 'urgent':
      return 'CRITICAL';
    case 'high':
      return 'HIGH';
    case 'low':
      return 'LOW';
    default:
      return 'MEDIUM';
  }
}

/**
 * Default DB persister: escalate the review_queues row (status='escalated',
 * priority bumped), insert a notification for the assignee, and append an
 * audit_logs event. NEVER publishes. Offline (no client) → no-op. Never throws.
 */
export const dbPersistSlaEscalation: PersistSlaEscalation = async (escalation) => {
  const client = trySlaClient();
  if (!client) {
    return { escalated: false, notified: false, audited: false };
  }
  const { item, newPriority, rationale, at } = escalation;
  let escalated = false;
  let notified = false;
  let audited = false;

  // (1) Escalate — only review_queue rows have a status/priority to bump.
  if (item.kind === 'review_queue') {
    try {
      const { error } = await client
        .from('review_queues')
        .update({ status: 'escalated', priority: newPriority, updated_at: at })
        .eq('id', item.id);
      escalated = !error;
      if (error) {
        logger.warn('slaEscalation.escalate.failed', { id: item.id, error: String(error) });
      }
    } catch (e) {
      logger.warn('slaEscalation.escalate.threw', {
        id: item.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (2) Notify the assignee (best-effort; notifications.user_id is required).
  if (item.assignedTo) {
    try {
      const { error } = await client.from('notifications').insert({
        user_id: item.assignedTo,
        type: 'sla_escalation',
        title: `Review overdue — escalated (${escalation.policy.severity})`,
        body: rationale,
        entity_type: item.entityType ?? 'review_queue',
        entity_id: item.entityId ?? item.id,
        read: false,
      });
      notified = !error;
    } catch (e) {
      logger.warn('slaEscalation.notify.threw', {
        id: item.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (3) Audit — append-only audit_logs event.
  try {
    const { error } = await client.from('audit_logs').insert({
      user_id: null,
      action: 'sla.escalation',
      metadata: {
        reviewItemId: item.id,
        kind: item.kind,
        entityType: item.entityType,
        entityId: item.entityId,
        state: escalation.status.state,
        severity: escalation.policy.severity,
        reviewDeadline: escalation.status.reviewDeadline,
        escalationDeadline: escalation.status.escalationDeadline,
        newPriority,
        rationale,
        at,
        autoPublished: false,
      },
    });
    audited = !error;
  } catch (e) {
    logger.warn('slaEscalation.audit.threw', {
      id: item.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return { escalated, notified, audited };
};

/**
 * The registered SLA escalation job. Uses the DB loader/persister by default;
 * both degrade to a clean no-op offline (no service-role env), so this is fully
 * offline-safe and never throws.
 */
export const slaEscalationJob: Job = makeSlaEscalationJob(
  dbLoadSlaItems,
  dbPersistSlaEscalation,
);
