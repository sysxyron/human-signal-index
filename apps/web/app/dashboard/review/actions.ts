'use server';

// =============================================================================
// WorldForge Phase 6 — Human Review & Curation server actions.
//
// Thin, serializable wrappers around the SERVER-ONLY governance data-access layer
// (lib/governance/persistence.ts) so client components can trigger the review /
// curation / publication / comment / notification flows. Every action
// accepts/returns only plain JSON — no class instances or engine objects cross
// the boundary. Actions NEVER throw: they pass the DAL's DbResult straight
// through. Mutations revalidate the affected dashboard route(s).
//
// The UI is built against THIS exact export surface — do not rename/remove.
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  createReviewQueue,
  listReviewQueue,
  getReviewItem,
  assignReviewer,
  submitReviewDecision,
  getCurationDashboard,
  publishEntity,
  republishEntity,
  listPublications,
  getPublication,
  updatePublicationVisibility,
  listComments,
  addComment,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getAuditTrail,
  buildPublicReport,
  type DbResult,
  type ReviewQueueFilters,
} from '@/lib/governance/persistence';
import type {
  ReviewEntityType,
  ReviewPriority,
  ReviewDecisionType,
  PublicationVisibility,
  ReviewQueueRecord,
  ReviewAssignmentRecord,
  ReviewDecisionRecord,
  PublicationRecord,
  PublicationVersionRecord,
  ReviewCommentRecord,
  NotificationRecord,
  ReviewQueueItem,
  ReviewItemDetail,
  CurationDashboardData,
  PublicReportDraft,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Re-export the DbResult type + the Phase 6 view-model types so the UI imports
// everything it needs from this single module.
// -----------------------------------------------------------------------------
export type { DbResult, ReviewQueueFilters } from '@/lib/governance/persistence';
export type {
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
} from '@hsi/shared-types';

// Route constants for targeted revalidation.
const REVIEW_BASE = '/dashboard/review';
const PUBLICATIONS_BASE = '/dashboard/publications';

// =============================================================================
// REVIEW QUEUE
// =============================================================================

export async function createReviewQueueAction(
  entityType: ReviewEntityType,
  entityId: string,
  priority?: ReviewPriority,
): Promise<DbResult<ReviewQueueRecord>> {
  const res = await createReviewQueue(entityType, entityId, priority);
  if (res.ok) revalidatePath(REVIEW_BASE);
  return res;
}

export async function listReviewQueueAction(
  filters?: ReviewQueueFilters,
): Promise<DbResult<ReviewQueueItem[]>> {
  return listReviewQueue(filters);
}

export async function getReviewItemAction(
  queueId: string,
): Promise<DbResult<ReviewItemDetail>> {
  return getReviewItem(queueId);
}

export async function assignReviewerAction(
  queueId: string,
  reviewerId: string,
): Promise<DbResult<ReviewQueueRecord>> {
  const res = await assignReviewer(queueId, reviewerId);
  if (res.ok) {
    revalidatePath(REVIEW_BASE);
    revalidatePath(`${REVIEW_BASE}/${queueId}`);
  }
  return res;
}

export async function submitReviewDecisionAction(
  queueId: string,
  decision: ReviewDecisionType,
  notes?: string,
): Promise<DbResult<ReviewDecisionRecord>> {
  const res = await submitReviewDecision(queueId, decision, notes);
  if (res.ok) {
    revalidatePath(REVIEW_BASE);
    revalidatePath(`${REVIEW_BASE}/${queueId}`);
  }
  return res;
}

// =============================================================================
// CURATION DASHBOARD
// =============================================================================

export async function getCurationDashboardAction(): Promise<
  DbResult<CurationDashboardData>
> {
  return getCurationDashboard();
}

// =============================================================================
// PUBLICATION
// =============================================================================

export async function publishEntityAction(
  entityType: ReviewEntityType,
  entityId: string,
  visibility: PublicationVisibility,
): Promise<DbResult<PublicationRecord>> {
  const res = await publishEntity(entityType, entityId, visibility);
  if (res.ok) {
    revalidatePath(REVIEW_BASE);
    revalidatePath(PUBLICATIONS_BASE);
  }
  return res;
}

export async function republishEntityAction(
  publicationId: string,
): Promise<DbResult<PublicationVersionRecord>> {
  const res = await republishEntity(publicationId);
  if (res.ok) {
    revalidatePath(PUBLICATIONS_BASE);
    revalidatePath(`${PUBLICATIONS_BASE}/${publicationId}`);
  }
  return res;
}

export async function listPublicationsAction(): Promise<
  DbResult<PublicationRecord[]>
> {
  return listPublications();
}

export async function getPublicationAction(
  id: string,
): Promise<
  DbResult<{ record: PublicationRecord; versions: PublicationVersionRecord[] }>
> {
  return getPublication(id);
}

export async function updatePublicationVisibilityAction(
  id: string,
  visibility: PublicationVisibility,
): Promise<DbResult<PublicationRecord>> {
  const res = await updatePublicationVisibility(id, visibility);
  if (res.ok) {
    revalidatePath(PUBLICATIONS_BASE);
    revalidatePath(`${PUBLICATIONS_BASE}/${id}`);
  }
  return res;
}

export async function buildPublicReportAction(
  entityType: ReviewEntityType,
  entityId: string,
): Promise<DbResult<PublicReportDraft>> {
  return buildPublicReport(entityType, entityId);
}

// =============================================================================
// COMMENTS
// =============================================================================

export async function listCommentsAction(
  entityType: ReviewEntityType,
  entityId: string,
): Promise<DbResult<Array<ReviewCommentRecord & { userEmail?: string }>>> {
  return listComments(entityType, entityId);
}

export async function addCommentAction(
  entityType: ReviewEntityType,
  entityId: string,
  comment: string,
  parentId?: string,
  mentions?: string[],
): Promise<DbResult<ReviewCommentRecord>> {
  const res = await addComment(entityType, entityId, comment, parentId, mentions);
  if (res.ok) revalidatePath(`${REVIEW_BASE}`);
  return res;
}

// =============================================================================
// NOTIFICATIONS
// =============================================================================

export async function listNotificationsAction(): Promise<
  DbResult<NotificationRecord[]>
> {
  return listNotifications();
}

export async function markNotificationReadAction(
  id: string,
): Promise<DbResult<NotificationRecord>> {
  const res = await markNotificationRead(id);
  if (res.ok) revalidatePath(REVIEW_BASE);
  return res;
}

export async function markAllNotificationsReadAction(): Promise<
  DbResult<{ updated: number }>
> {
  const res = await markAllNotificationsRead();
  if (res.ok) revalidatePath(REVIEW_BASE);
  return res;
}

// =============================================================================
// AUDIT TRAIL
// =============================================================================

export async function getAuditTrailAction(
  entityType: ReviewEntityType,
  entityId: string,
): Promise<DbResult<Record<string, unknown>[]>> {
  return getAuditTrail(entityType, entityId);
}
