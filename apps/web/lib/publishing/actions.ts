'use server';

// =============================================================================
// HSIN Phase 19 — Public Intelligence Publishing & Distribution server actions.
// 'use server'. THIN wrappers over the Phase-19 DAL. Return DbResult; revalidate
// the public + dashboard routes; NEVER throw. SERVER-ONLY.
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  createPublicationDal,
  getPublicIntelligence,
  getPublicationBySlug,
  getPublishingDashboard,
  getPublishingHighlights,
  getPublishingReview,
  getSubscriptionAccount,
  getTopicPage,
  retractPublicationDal,
  reviewPublicationDal,
  searchPublic,
  subscribeDal,
  transitionPublicationDal,
  unsubscribeDal,
  type CreatePublicationResult,
  type DbResult,
  type TransitionResult,
} from './persistence';
import type { RetractionReason } from '@hsi/publishing-engine';
import { getUser } from '@/lib/supabase/server';
import { recordContribution } from '@/lib/contributor/recorder';
import { canUseFeatureAction } from '@/lib/billing/billing';
import type {
  PublicIntelligenceData,
  PublicationPageData,
  PublicationState,
  PublishingDashboardData,
  PublishingHighlights,
  PublishingReviewData,
  SearchResultsData,
  SubscriberType,
  SubscriptionAccountData,
  TopicPageData,
} from '@hsi/shared-types';

const PORTAL = '/intelligence';
const DASH = '/dashboard/publishing';

function revalidate(...paths: string[]): void {
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      // best-effort.
    }
  }
}

// ---- public reads -----------------------------------------------------------
export async function getPublicIntelligenceAction(filters?: { topic?: string; category?: string }): Promise<DbResult<PublicIntelligenceData>> {
  return getPublicIntelligence(filters);
}
export async function getPublicationBySlugAction(slug: string): Promise<DbResult<PublicationPageData>> {
  return getPublicationBySlug(slug, { now: new Date().toISOString() });
}
export async function getTopicPageAction(slug: string): Promise<DbResult<TopicPageData>> {
  return getTopicPage(slug);
}
export async function searchPublicAction(query: string, filters?: { topic?: string; category?: string; minTrust?: number }): Promise<DbResult<SearchResultsData>> {
  return searchPublic(query, filters);
}

// ---- staff reads ------------------------------------------------------------
export async function getPublishingDashboardAction(): Promise<DbResult<PublishingDashboardData>> {
  return getPublishingDashboard();
}
export async function getPublishingReviewAction(): Promise<DbResult<PublishingReviewData>> {
  return getPublishingReview();
}
export async function getPublishingHighlightsAction(): Promise<DbResult<PublishingHighlights>> {
  return getPublishingHighlights();
}
export async function getSubscriptionAccountAction(): Promise<DbResult<SubscriptionAccountData>> {
  return getSubscriptionAccount();
}

// ---- writes -----------------------------------------------------------------
export async function createPublicationAction(input: {
  slug: string; title: string; summary: string; runId?: string;
  trustScore?: number; confidence?: number; evidenceCount?: number; sourceCount?: number;
  categories?: string[]; topics?: string[]; body?: Record<string, unknown>;
}): Promise<DbResult<CreatePublicationResult>> {
  // Phase 38 — entitlement enforcement (non-blocking under high Community limits).
  const gate = await canUseFeatureAction('publication');
  if (!gate.allowed) return { ok: false, error: gate.reason ?? 'Upgrade required to publish more.', code: 'FORBIDDEN' };
  const result = await createPublicationDal(input, new Date().toISOString());
  if (result.ok) revalidate(DASH);
  return result;
}

export async function transitionPublicationAction(id: string, to: PublicationState, reason?: string): Promise<DbResult<TransitionResult>> {
  const result = await transitionPublicationDal(id, to, new Date().toISOString(), reason);
  if (result.ok) {
    revalidate(DASH, PORTAL, `${DASH}/review`);
    // Phase 26 — additive, best-effort: credit the publisher on PUBLISHED. Does
    // NOT change publication approval/state logic.
    if (to === 'PUBLISHED') {
      const user = await getUser();
      if (user) await recordContribution({ event: 'REPORT_PUBLISHED', actorId: user.id, refKind: 'publication', refId: id, reason: 'Publication published.' });
    }
  }
  return result;
}

export async function reviewPublicationAction(id: string, decision: 'approved' | 'rejected', reason: string): Promise<DbResult<{ publicationId: string; decision: string }>> {
  const result = await reviewPublicationDal(id, decision, reason, new Date().toISOString());
  if (result.ok) revalidate(DASH, `${DASH}/review`);
  return result;
}

export async function retractPublicationAction(id: string, reason: RetractionReason, detail: string): Promise<DbResult<{ publicationId: string }>> {
  const result = await retractPublicationDal(id, reason, detail, new Date().toISOString());
  if (result.ok) revalidate(DASH, `${DASH}/retractions`, PORTAL);
  return result;
}

export async function subscribeAction(input: { email: string; type?: SubscriberType; digestFrequency?: 'none' | 'daily' | 'weekly'; topics?: string[]; channels?: string[] }): Promise<DbResult<{ subscriberId: string }>> {
  const result = await subscribeDal(input, new Date().toISOString());
  if (result.ok) revalidate('/account/subscriptions');
  return result;
}

export async function unsubscribeAction(): Promise<DbResult<{ ok: true }>> {
  const result = await unsubscribeDal();
  if (result.ok) revalidate('/account/subscriptions');
  return result;
}

// ---- re-exports -------------------------------------------------------------
export type { DbResult, DbResultCode } from './persistence';
export type { CreatePublicationResult, TransitionResult } from './persistence';
export type {
  HsinPublicationRecord,
  HsinPublicationRetractionRecord,
  HsinDigestRunRecord,
  HsinSubscriberRecord,
  HsinSubscriptionPreferenceRecord,
  PublicIntelligenceData,
  PublicIntelligenceItem,
  PublicationPageData,
  TopicPageData,
  SearchResultsData,
  PublishingDashboardData,
  PublishingReviewData,
  PublishingHighlights,
  SubscriptionAccountData,
  ReportSectionView,
  PublicationState,
  SubscriberType,
} from '@hsi/shared-types';
