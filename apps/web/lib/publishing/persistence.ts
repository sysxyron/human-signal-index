// =============================================================================
// HSIN Phase 19 — Public Intelligence Publishing & Distribution data-access layer.
// SERVER-ONLY.
//
// "What intelligence has been published, why should I trust it, what changed, and
// who approved it?" The persistence layer for the Phase-19 publishing tables
// (migration 0023):
//
//   * PUBLICATIONS — hsin_publications (+ append-only versions/reviews/retractions).
//   * SUBSCRIBERS  — hsin_subscribers + hsin_subscription_preferences (own-row).
//   * DISTRIBUTION — hsin_digest_runs + hsin_distribution_events.
//   * TOPICS       — hsin_topic_pages.
//
// The PURE engines live in '@hsi/publishing-engine' (lifecycle, governance,
// retraction, report) and '@hsi/distribution-engine'. This DAL reads the
// persisted state, feeds it (with an injected `now`) into the engines, and
// persists governed transitions. PUBLIC reads (the portal) are RLS-gated to
// PUBLISHED/RETRACTED rows and work for anonymous visitors.
//
// SERVER-ONLY — never import from a 'use client' module. Mirrors prior DALs.
// GOVERNANCE: nothing auto-publishes; every transition/review/retraction is
// human-approved + audited. NEVER throws; empty env → NOT_CONFIGURED.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient } from '@/lib/supabase/server';
import {
  buildIntelligenceReport,
  canPublish,
  createPublication as engineCreatePublication,
  publicationAuditTrail,
  publishReview,
  retractPublication,
  transitionPublication,
  type Publication,
  type PublicationState as EnginePubState,
  type RetractionReason,
} from '@hsi/publishing-engine';
import type {
  AppRole,
  HsinDigestRunRecord,
  HsinPublicationRecord,
  HsinPublicationRetractionRecord,
  HsinPublicationReviewRecord,
  HsinSubscriberRecord,
  HsinSubscriptionPreferenceRecord,
  PublicIntelligenceData,
  PublicIntelligenceItem,
  PublicationPageData,
  PublicationState,
  PublishingDashboardData,
  PublishingHighlights,
  PublishingReviewData,
  ReportSectionView,
  SearchResultsData,
  SubscriberType,
  SubscriptionAccountData,
  TopicPageData,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Result type.
// -----------------------------------------------------------------------------
export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED =
  'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';
const AUTH_REQUIRED = 'Sign in to continue.';

export function fail(error: unknown): { ok: false; error: string; code: DbResultCode } {
  logError('publishing/persistence', error);
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
export function forbidden(required: AppRole): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: `Requires the ${required} role or higher.`, code: 'FORBIDDEN' };
}
function validation(message: string): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: message, code: 'FORBIDDEN' };
}

// -----------------------------------------------------------------------------
// Client + role helpers.
// -----------------------------------------------------------------------------
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
function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
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

/** Map a publication record into the public list item. */
function toPublicItem(r: HsinPublicationRecord): PublicIntelligenceItem {
  return {
    slug: r.slug ?? r.id,
    title: r.title ?? 'Untitled',
    summary: r.summary ?? '',
    state: (r.state as PublicationState) ?? 'DRAFT',
    ...(typeof r.trust_score === 'number' ? { trustScore: r.trust_score } : {}),
    ...(typeof r.confidence === 'number' ? { confidence: r.confidence } : {}),
    evidenceCount: r.evidence_count ?? 0,
    sourceCount: r.source_count ?? 0,
    reviewStatus: r.review_status,
    governanceStatus: r.governance_status,
    publishedAt: r.published_at,
    categories: listFromJson(r.categories),
    topics: listFromJson(r.topics),
  };
}

/** Reconstruct an engine Publication from a record (for transitions/gates). */
function recordToPublication(r: HsinPublicationRecord, events: Publication['events'] = []): Publication {
  return {
    id: r.id,
    slug: r.slug ?? r.id,
    title: r.title ?? '',
    summary: r.summary ?? '',
    state: (r.state as EnginePubState) ?? 'DRAFT',
    ...(r.run_id ? { runId: r.run_id } : {}),
    ...(typeof r.trust_score === 'number' ? { trustScore: r.trust_score } : {}),
    ...(typeof r.confidence === 'number' ? { confidence: r.confidence } : {}),
    evidenceCount: r.evidence_count ?? 0,
    sourceCount: r.source_count ?? 0,
    categories: listFromJson(r.categories),
    topics: listFromJson(r.topics),
    reviewStatus: r.review_status,
    governanceStatus: r.governance_status,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
    events,
  };
}

// =============================================================================
// PUBLIC READS (anonymous-safe — RLS gates to PUBLISHED/RETRACTED)
// =============================================================================

/** The public intelligence portal: published items (optionally filtered by topic/category). */
export async function getPublicIntelligence(filters?: {
  topic?: string;
  category?: string;
}): Promise<DbResult<PublicIntelligenceData>> {
  try {
    const client = db();
    const { data, error } = await client
      .from('hsin_publications')
      .select('*')
      .in('state', ['PUBLISHED', 'RETRACTED'])
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) return fail(error);
    let items = ((data ?? []) as HsinPublicationRecord[]).map(toPublicItem);
    if (filters?.topic) items = items.filter((i) => i.topics.includes(filters.topic!));
    if (filters?.category) items = items.filter((i) => i.categories.includes(filters.category!));
    return { ok: true, data: { items, total: items.length } };
  } catch (e) {
    return fail(e);
  }
}

/** A single public publication page by slug. */
export async function getPublicationBySlug(
  slug: string,
  opts?: { now?: string },
): Promise<DbResult<PublicationPageData>> {
  try {
    const client = db();
    const now = opts?.now ?? new Date().toISOString();
    const { data: row, error } = await client
      .from('hsin_publications')
      .select('*')
      .eq('slug', slug)
      .in('state', ['PUBLISHED', 'RETRACTED'])
      .maybeSingle();
    if (error) return fail(error);
    if (!row) return { ok: false, error: 'Publication not found.', code: 'DB_ERROR' };
    const record = row as HsinPublicationRecord;

    // Versions (audit trail).
    const { data: verRows } = await client
      .from('hsin_publication_versions')
      .select('*')
      .eq('publication_id', record.id)
      .order('at', { ascending: true, nullsFirst: true })
      .limit(500);
    const auditTrail = ((verRows ?? []) as Array<{ from_state?: string; to_state?: string; actor?: string; reason?: string; at?: string }>).map(
      (v) => `${v.at ?? ''} — ${v.from_state} → ${v.to_state} by ${v.actor ?? 'curator'}: ${v.reason ?? ''}`,
    );

    // Retraction (if any).
    const { data: retRows } = await client
      .from('hsin_publication_retractions')
      .select('*')
      .eq('publication_id', record.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const retraction = ((retRows ?? []) as HsinPublicationRetractionRecord[])[0];

    // Trust history (best-effort from the Phase-17 history, keyed by run/publication).
    const trustHistory = await loadTrustHistory(client, record);

    // Build the report from the stored body (engine sections) or a minimal one.
    const report = buildReportSections(record, now);

    return {
      ok: true,
      data: {
        publication: toPublicItem(record),
        report: report.sections,
        sourceRefs: report.sourceRefs,
        ...(retraction ? { retraction } : {}),
        trustHistory,
        auditTrail,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

function buildReportSections(record: HsinPublicationRecord, now: string): { sections: ReportSectionView[]; sourceRefs: string[] } {
  const body = (record.body ?? {}) as JsonRecord;
  const refs = listFromJson(body.sourceRefs ?? body.source_refs);
  const report = buildIntelligenceReport(
    {
      publicationId: record.id,
      title: record.title ?? 'Untitled',
      summary: record.summary,
      evidence: listFromJson(body.evidence),
      temporal: typeof body.temporal === 'string' ? body.temporal : undefined,
      causal: typeof body.causal === 'string' ? body.causal : undefined,
      counterfactual: typeof body.counterfactual === 'string' ? body.counterfactual : undefined,
      decision: typeof body.decision === 'string' ? body.decision : undefined,
      outcome: typeof body.outcome === 'string' ? body.outcome : undefined,
      calibration: typeof body.calibration === 'string' ? body.calibration : undefined,
      trust: typeof body.trust === 'string' ? body.trust : `Trust ${record.trust_score ?? '—'}/100.`,
      governance: typeof body.governance === 'string' ? body.governance : `Governance status: ${record.governance_status ?? 'cleared'}.`,
      limitations: listFromJson(body.limitations),
      provenance: listFromJson(body.provenance),
      sourceRefs: refs,
    },
    { now },
  );
  return { sections: report.sections, sourceRefs: report.sourceRefs };
}

async function loadTrustHistory(
  client: SupabaseClient,
  record: HsinPublicationRecord,
): Promise<{ trustScore: number; at: string }[]> {
  if (!record.run_id) {
    return typeof record.trust_score === 'number' && record.published_at
      ? [{ trustScore: record.trust_score, at: record.published_at }]
      : [];
  }
  try {
    const { data } = await client
      .from('hsin_trust_history')
      .select('trust_score, snapshot_at, created_at')
      .eq('entity_type', 'decision')
      .eq('entity_id', record.run_id)
      .order('snapshot_at', { ascending: true, nullsFirst: true })
      .limit(500);
    const hist = ((data ?? []) as Array<{ trust_score?: number; snapshot_at?: string; created_at?: string }>)
      .filter((h) => typeof h.trust_score === 'number')
      .map((h) => ({ trustScore: h.trust_score as number, at: h.snapshot_at ?? h.created_at ?? '' }));
    if (hist.length > 0) return hist;
  } catch {
    // fall through.
  }
  return typeof record.trust_score === 'number' && record.published_at
    ? [{ trustScore: record.trust_score, at: record.published_at }]
    : [];
}

/** A public topic page: published reports for a topic + aggregates. */
export async function getTopicPage(slug: string): Promise<DbResult<TopicPageData>> {
  try {
    const client = db();
    const { data: tpRows } = await client.from('hsin_topic_pages').select('*').eq('slug', slug).maybeSingle();
    const topicPage = tpRows as { slug?: string; title?: string; description?: string } | null;

    const { data, error } = await client
      .from('hsin_publications')
      .select('*')
      .eq('state', 'PUBLISHED')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) return fail(error);
    const reports = ((data ?? []) as HsinPublicationRecord[])
      .map(toPublicItem)
      .filter((i) => i.topics.includes(slug));

    const trustScores = reports.map((r) => r.trustScore).filter((x): x is number => typeof x === 'number');
    const avgTrust = trustScores.length
      ? Math.round((trustScores.reduce((a, n) => a + n, 0) / trustScores.length) * 100) / 100
      : undefined;
    const evidenceTotal = reports.reduce((a, r) => a + r.evidenceCount, 0);

    return {
      ok: true,
      data: {
        slug,
        title: topicPage?.title ?? titleizeSlug(slug),
        description: topicPage?.description,
        reports,
        reportCount: reports.length,
        ...(avgTrust !== undefined ? { avgTrust } : {}),
        evidenceTotal,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

function titleizeSlug(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Public search across published publications + topics. */
export async function searchPublic(
  query: string,
  filters?: { topic?: string; category?: string; minTrust?: number },
): Promise<DbResult<SearchResultsData>> {
  try {
    const client = db();
    const q = (query ?? '').trim().toLowerCase();
    const { data, error } = await client
      .from('hsin_publications')
      .select('*')
      .in('state', ['PUBLISHED', 'RETRACTED'])
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) return fail(error);
    let items = ((data ?? []) as HsinPublicationRecord[]).map(toPublicItem);
    if (q.length > 0) {
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.summary.toLowerCase().includes(q) ||
          i.topics.some((t) => t.toLowerCase().includes(q)) ||
          i.categories.some((c) => c.toLowerCase().includes(q)),
      );
    }
    if (filters?.topic) items = items.filter((i) => i.topics.includes(filters.topic!));
    if (filters?.category) items = items.filter((i) => i.categories.includes(filters.category!));
    if (filters?.minTrust !== undefined) items = items.filter((i) => (i.trustScore ?? 0) >= filters.minTrust!);

    const topicSet = new Map<string, string>();
    for (const i of items) for (const t of i.topics) topicSet.set(t, titleizeSlug(t));
    const topics = [...topicSet.entries()].map(([s, t]) => ({ slug: s, title: t })).slice(0, 20);

    return { ok: true, data: { query, publications: items, topics, total: items.length } };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// STAFF READS (researcher+)
// =============================================================================

/** The publishing dashboard. RLS: researcher+. NEVER throws. */
export async function getPublishingDashboard(): Promise<DbResult<PublishingDashboardData>> {
  try {
    const client = db();
    const { data: rows, error } = await client.from('hsin_publications').select('*').order('updated_at', { ascending: false }).limit(2000);
    if (error) return fail(error);
    const pubs = (rows ?? []) as HsinPublicationRecord[];

    const drafts = pubs.filter((p) => p.state === 'DRAFT');
    const reviewQueue = pubs.filter((p) => p.state === 'UNDER_REVIEW');
    const publishingQueue = pubs.filter((p) => p.state === 'APPROVED');
    const published = pubs.filter((p) => p.state === 'PUBLISHED');

    const { data: retRows } = await client.from('hsin_publication_retractions').select('*').order('created_at', { ascending: false }).limit(200);
    const retractions = (retRows ?? []) as HsinPublicationRetractionRecord[];

    const { data: digestRows } = await client.from('hsin_digest_runs').select('*').order('created_at', { ascending: false }).limit(50);
    const digestRuns = (digestRows ?? []) as HsinDigestRunRecord[];

    const { data: subRows } = await client.from('hsin_subscribers').select('id').limit(5000);
    const subscriberCount = (subRows ?? []).length;

    const { data: distRows } = await client.from('hsin_distribution_events').select('id').limit(5000);
    const totalDistributions = (distRows ?? []).length;

    const byState: Record<string, number> = {};
    for (const p of pubs) byState[p.state ?? 'DRAFT'] = (byState[p.state ?? 'DRAFT'] ?? 0) + 1;

    return {
      ok: true,
      data: {
        drafts, reviewQueue, publishingQueue, published, retractions, digestRuns, subscriberCount, byState,
        analytics: {
          totalPublished: published.length,
          totalRetracted: pubs.filter((p) => p.state === 'RETRACTED').length,
          totalSubscribers: subscriberCount,
          totalDistributions,
        },
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/** The review queue. RLS: researcher+. */
export async function getPublishingReview(): Promise<DbResult<PublishingReviewData>> {
  try {
    const client = db();
    const { data, error } = await client.from('hsin_publications').select('*').in('state', ['UNDER_REVIEW', 'APPROVED']).order('updated_at', { ascending: false }).limit(1000);
    if (error) return fail(error);
    const rows = (data ?? []) as HsinPublicationRecord[];
    return { ok: true, data: { reviewQueue: rows.filter((p) => p.state === 'UNDER_REVIEW'), approved: rows.filter((p) => p.state === 'APPROVED') } };
  } catch (e) {
    return fail(e);
  }
}

/** Headline publishing callouts. RLS: researcher+. */
export async function getPublishingHighlights(): Promise<DbResult<PublishingHighlights>> {
  try {
    const client = db();
    const { data } = await client.from('hsin_publications').select('state').limit(5000);
    const rows = (data ?? []) as Array<{ state?: string }>;
    const count = (s: string) => rows.filter((r) => r.state === s).length;
    const { data: subRows } = await client.from('hsin_subscribers').select('id').limit(5000);
    return {
      ok: true,
      data: {
        published: count('PUBLISHED'),
        inReview: count('UNDER_REVIEW'),
        drafts: count('DRAFT'),
        retractions: count('RETRACTED'),
        subscribers: (subRows ?? []).length,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/** The signed-in user's subscription account. RLS: own row. */
export async function getSubscriptionAccount(): Promise<DbResult<SubscriptionAccountData>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();
    const { data: subRow } = await client.from('hsin_subscribers').select('*').eq('user_id', user.id).maybeSingle();
    const subscriber = subRow as HsinSubscriberRecord | null;
    let preferences: HsinSubscriptionPreferenceRecord | undefined;
    if (subscriber?.id) {
      const { data: prefRow } = await client.from('hsin_subscription_preferences').select('*').eq('subscriber_id', subscriber.id).maybeSingle();
      preferences = (prefRow as HsinSubscriptionPreferenceRecord) ?? undefined;
    }
    const { data: digestRows } = await client.from('hsin_digest_runs').select('*').order('created_at', { ascending: false }).limit(10);
    return {
      ok: true,
      data: {
        ...(subscriber ? { subscriber } : {}),
        ...(preferences ? { preferences } : {}),
        recentDigests: (digestRows ?? []) as HsinDigestRunRecord[],
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// WRITES
// =============================================================================

export interface CreatePublicationResult { publicationId: string; slug: string }

/** Create a DRAFT publication from a research run (curator/admin). */
export async function createPublicationDal(
  input: { slug: string; title: string; summary: string; runId?: string; trustScore?: number; confidence?: number; evidenceCount?: number; sourceCount?: number; categories?: string[]; topics?: string[]; body?: JsonRecord },
  now: string,
): Promise<DbResult<CreatePublicationResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const pub = engineCreatePublication(
      { id: 'pending', slug: input.slug, title: input.title, summary: input.summary, runId: input.runId, trustScore: input.trustScore, confidence: input.confidence, evidenceCount: input.evidenceCount, sourceCount: input.sourceCount, categories: input.categories, topics: input.topics },
      { now, actor: gate.user.id },
    );

    const { data: row, error } = await client
      .from('hsin_publications')
      .insert({
        slug: pub.slug, title: pub.title, summary: pub.summary, state: pub.state,
        run_id: pub.runId ?? null, trust_score: pub.trustScore ?? null, confidence: pub.confidence ?? null,
        evidence_count: pub.evidenceCount, source_count: pub.sourceCount,
        categories: listJson(pub.categories), topics: listJson(pub.topics),
        review_status: pub.reviewStatus, governance_status: pub.governanceStatus,
        body: input.body ?? {}, created_by: gate.user.id,
      })
      .select('id, slug')
      .single();
    if (error || !row?.id) return fail(error ?? new Error('Publication insert returned no id.'));

    await insertVersion(client, row.id as string, 'DRAFT', 'DRAFT', gate.user.id, 'Publication drafted.', now);
    await recordAudit(client, gate.user.id, 'publication.create', row.id as string, { slug: pub.slug });
    return { ok: true, data: { publicationId: row.id as string, slug: row.slug as string } };
  } catch (e) {
    return fail(e);
  }
}

export interface TransitionResult { publicationId: string; from: string; to: string }

/** Transition a publication through the lifecycle (curator/admin). Validated + audited. */
export async function transitionPublicationDal(
  id: string,
  to: PublicationState,
  now: string,
  reason?: string,
): Promise<DbResult<TransitionResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const { data: row, error } = await client.from('hsin_publications').select('*').eq('id', id).maybeSingle();
    if (error) return fail(error);
    if (!row) return { ok: false, error: 'Publication not found.', code: 'DB_ERROR' };
    const pub = recordToPublication(row as HsinPublicationRecord);

    // Enforce the publish gate when moving to PUBLISHED.
    if (to === 'PUBLISHED') {
      const eligible = canPublish(pub);
      if (!eligible.canPublish) {
        return validation(`Cannot publish: ${eligible.blockers.join(' ')}`);
      }
    }

    const res = transitionPublication(pub, to as EnginePubState, { now, actor: gate.user.id, reason });
    if (!res.ok) return validation(res.reason);

    await client.from('hsin_publications').update({
      state: res.publication.state, review_status: res.publication.reviewStatus, governance_status: res.publication.governanceStatus,
      ...(res.publication.publishedAt ? { published_at: res.publication.publishedAt } : {}),
    }).eq('id', id);
    await insertVersion(client, id, res.event.from, res.event.to, gate.user.id, res.event.reason, now);
    await recordAudit(client, gate.user.id, 'publication.transition', id, { from: res.event.from, to: res.event.to });
    return { ok: true, data: { publicationId: id, from: res.event.from, to: res.event.to } };
  } catch (e) {
    return fail(e);
  }
}

/** Record a governance publish review (curator/admin; required reason). Approving moves to APPROVED. */
export async function reviewPublicationDal(
  id: string,
  decision: 'approved' | 'rejected',
  reason: string,
  now: string,
): Promise<DbResult<{ publicationId: string; decision: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;
    const clean = (reason ?? '').trim();
    if (clean.length === 0) return validation('A publish review requires a non-blank reason.');

    const { data: row, error } = await client.from('hsin_publications').select('*').eq('id', id).maybeSingle();
    if (error) return fail(error);
    if (!row) return { ok: false, error: 'Publication not found.', code: 'DB_ERROR' };
    const pub = recordToPublication(row as HsinPublicationRecord);

    let review;
    try {
      review = publishReview(pub, { decision, reviewer: gate.user.id, reason: clean }, { now });
    } catch (e) {
      return validation(e instanceof Error ? e.message : 'Invalid review.');
    }

    await client.from('hsin_publication_reviews').insert({
      publication_id: id, reviewer_id: gate.user.id, decision, reason: clean,
      gate: review.gate as unknown as JsonRecord,
    });

    // Approve → APPROVED; reject → back to DRAFT.
    const target: PublicationState = decision === 'approved' ? 'APPROVED' : 'DRAFT';
    const res = transitionPublication(pub, target as EnginePubState, { now, actor: gate.user.id, reason: `Review ${decision}: ${clean}` });
    if (res.ok) {
      await client.from('hsin_publications').update({ state: res.publication.state, review_status: res.publication.reviewStatus, governance_status: res.publication.governanceStatus }).eq('id', id);
      await insertVersion(client, id, res.event.from, res.event.to, gate.user.id, res.event.reason, now);
    }
    await recordAudit(client, gate.user.id, `publication.review.${decision}`, id, { reason: clean });
    return { ok: true, data: { publicationId: id, decision } };
  } catch (e) {
    return fail(e);
  }
}

/** Retract a publication (curator/admin; required detail). Retraction stays visible. */
export async function retractPublicationDal(
  id: string,
  reason: RetractionReason,
  detail: string,
  now: string,
): Promise<DbResult<{ publicationId: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;
    const clean = (detail ?? '').trim();
    if (clean.length === 0) return validation('A retraction requires a non-blank detail.');

    const { data: row, error } = await client.from('hsin_publications').select('*').eq('id', id).maybeSingle();
    if (error) return fail(error);
    if (!row) return { ok: false, error: 'Publication not found.', code: 'DB_ERROR' };
    const pub = recordToPublication(row as HsinPublicationRecord);

    let result;
    try {
      result = retractPublication(pub, { reason, detail: clean, retractedBy: gate.user.id }, { now });
    } catch (e) {
      return validation(e instanceof Error ? e.message : 'Invalid retraction.');
    }

    await client.from('hsin_publications').update({ state: 'RETRACTED', review_status: 'retracted', governance_status: 'retracted' }).eq('id', id);
    await client.from('hsin_publication_retractions').insert({
      publication_id: id, reason, detail: clean, previous_state: result.retraction.previousState, retracted_by: gate.user.id,
    });
    await insertVersion(client, id, result.retraction.previousState, 'RETRACTED', gate.user.id, `Retracted (${reason}): ${clean}`, now);
    await recordAudit(client, gate.user.id, 'publication.retract', id, { reason, detail: clean });
    return { ok: true, data: { publicationId: id } };
  } catch (e) {
    return fail(e);
  }
}

// ---- subscribers ------------------------------------------------------------

/** Subscribe the signed-in user (idempotent) + set preferences. */
export async function subscribeDal(
  input: { email: string; type?: SubscriberType; digestFrequency?: 'none' | 'daily' | 'weekly'; topics?: string[]; channels?: string[] },
  now: string,
): Promise<DbResult<{ subscriberId: string }>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    const { data: existing } = await client.from('hsin_subscribers').select('id').eq('user_id', user.id).maybeSingle();
    let subscriberId: string;
    if (existing?.id) {
      subscriberId = existing.id as string;
      await client.from('hsin_subscribers').update({ active: true, email: input.email, type: input.type ?? 'FREE' }).eq('id', subscriberId);
    } else {
      const { data: row, error } = await client.from('hsin_subscribers').insert({ user_id: user.id, email: input.email, type: input.type ?? 'FREE', active: true }).select('id').single();
      if (error || !row?.id) return fail(error ?? new Error('Subscriber insert returned no id.'));
      subscriberId = row.id as string;
    }

    // Upsert preferences.
    const prefPayload = {
      subscriber_id: subscriberId, digest_frequency: input.digestFrequency ?? 'weekly',
      topics: listJson(input.topics ?? []), channels: listJson(input.channels ?? ['email']),
      notify_trust_changes: true, notify_retractions: true,
    };
    const { data: existingPref } = await client.from('hsin_subscription_preferences').select('id').eq('subscriber_id', subscriberId).maybeSingle();
    if (existingPref?.id) {
      await client.from('hsin_subscription_preferences').update(prefPayload).eq('id', existingPref.id as string);
    } else {
      await client.from('hsin_subscription_preferences').insert(prefPayload);
    }
    return { ok: true, data: { subscriberId } };
  } catch (e) {
    return fail(e);
  }
}

/** Unsubscribe the signed-in user (deactivate; never deletes history). */
export async function unsubscribeDal(): Promise<DbResult<{ ok: true }>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();
    await client.from('hsin_subscribers').update({ active: false }).eq('user_id', user.id);
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return fail(e);
  }
}

// ---- helpers ----------------------------------------------------------------

async function insertVersion(client: SupabaseClient, publicationId: string, from: string, to: string, actor: string, reason: string, now: string): Promise<void> {
  try {
    await client.from('hsin_publication_versions').insert({ publication_id: publicationId, from_state: from, to_state: to, actor, reason, at: now });
  } catch {
    // best-effort.
  }
}

async function recordAudit(client: SupabaseClient, userId: string | null, action: string, entityId: string, extra?: JsonRecord): Promise<void> {
  try {
    await client.from('audit_logs').insert({ user_id: userId, action, metadata: { entity_type: 'publication', entity_id: entityId, ...(extra ?? {}) } });
  } catch {
    // best-effort.
  }
}

export { db as publishingDbClient, requireRole as requirePublishingRole, recordToPublication, publicationAuditTrail };
