// =============================================================================
// HSI Phase 19 — client-safe view helpers for the public intelligence portal +
// publishing dashboard (intelligence / [slug] / topics / search / subscribe /
// dashboard-publishing).
//
// PURE + CLIENT-SAFE: NO server-only imports. Maps the Phase-19 domain unions →
// color/label, formats trust/confidence/dates, reads jsonb, and builds clearly-
// LABELED demo view-models from the @hsi/publishing-engine + @hsi/distribution-engine
// fixtures so every Phase-19 page renders fully offline when an action returns
// NOT_CONFIGURED.
//
// EXPLAINABLE — every report carries limitations + provenance; retractions stay
// visible; trust is shown openly. These helpers decorate and project, never invent.
// =============================================================================

import type {
  HsinPublicationRecord,
  PublicationState,
  PublicIntelligenceData,
  PublicIntelligenceItem,
  PublicationPageData,
  PublishingDashboardData,
  ReportSectionView,
  RetractionReason,
  SearchResultsData,
  SubscriptionAccountData,
  TopicPageData,
} from '@hsi/shared-types';
import {
  buildIntelligenceReport,
  publicationAuditTrail,
  publishingDemo,
  type Publication,
} from '@hsi/publishing-engine';
import { distributionDemo } from '@hsi/distribution-engine';

/* -------------------------------------------------------------------------- */
/* Decoration                                                                  */
/* -------------------------------------------------------------------------- */
export type Tone = 'neutral' | 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'cyan' | 'pink';
export interface Decorated { label: string; color: string; tone: Tone; description?: string }
const TONE_COLORS: Record<Tone, string> = {
  neutral: '#94A3B8', blue: '#3B82F6', purple: '#8B5CF6', green: '#10B981',
  orange: '#F59E0B', red: '#EF4444', cyan: '#06B6D4', pink: '#EC4899',
};
export function toneColor(tone: Tone): string {
  return TONE_COLORS[tone];
}
function titleize(v: string): string {
  return v.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

/* role gating */
const ROLE_RANK: Record<string, number> = { viewer: 0, contributor: 1, researcher: 2, reviewer: 3, editor: 3, curator: 4, admin: 5, owner: 6 };
function rank(role?: string | null): number {
  return role ? (ROLE_RANK[role.toLowerCase()] ?? -1) : -1;
}
export function canResearch(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}
export function canCurate(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.curator;
}

/* publication state */
const STATE_DECOR: Record<PublicationState, Decorated> = {
  DRAFT: { label: 'Draft', color: TONE_COLORS.neutral, tone: 'neutral' },
  UNDER_REVIEW: { label: 'Under review', color: TONE_COLORS.orange, tone: 'orange' },
  APPROVED: { label: 'Approved', color: TONE_COLORS.cyan, tone: 'cyan' },
  PUBLISHED: { label: 'Published', color: TONE_COLORS.green, tone: 'green' },
  ARCHIVED: { label: 'Archived', color: TONE_COLORS.neutral, tone: 'neutral' },
  RETRACTED: { label: 'Retracted', color: TONE_COLORS.red, tone: 'red', description: 'This report was retracted — kept visible for the record.' },
};
export function stateDecor(state?: PublicationState | string | null): Decorated {
  if (!state) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  return STATE_DECOR[state as PublicationState] ?? { label: titleize(String(state)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/* trust band */
export function trustBandDecor(score?: number | null): Decorated {
  if (score == null || Number.isNaN(score)) return { label: 'Unrated', color: TONE_COLORS.neutral, tone: 'neutral' };
  if (score >= 70) return { label: 'High trust', color: TONE_COLORS.green, tone: 'green' };
  if (score >= 40) return { label: 'Medium trust', color: TONE_COLORS.orange, tone: 'orange' };
  return { label: 'Low trust', color: TONE_COLORS.red, tone: 'red' };
}

const RETRACTION_LABEL: Record<RetractionReason, string> = {
  evidence_error: 'Evidence error', trust_collapse: 'Trust collapse', governance_decision: 'Governance decision',
  data_quality_issue: 'Data quality issue', methodology_issue: 'Methodology issue',
};
export function retractionReasonLabel(reason?: RetractionReason | string | null): string {
  return reason ? (RETRACTION_LABEL[reason as RetractionReason] ?? titleize(String(reason))) : 'Retracted';
}

/* formatters */
export function formatTrust(v?: number | null): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${Math.round(Math.max(0, Math.min(100, v)))}`;
}
export function formatConfidence(v?: number | null): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
}
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
export function readStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === 'string');
  if (isRecord(value)) {
    for (const k of ['items', 'list', 'values']) {
      const inner = value[k];
      if (Array.isArray(inner)) return inner.filter((x): x is string => typeof x === 'string');
    }
  }
  return [];
}

/** The canonical public topic slugs surfaced in the nav. */
export const PUBLIC_TOPICS: { slug: string; title: string }[] = [
  { slug: 'history', title: 'History' },
  { slug: 'archaeology', title: 'Archaeology' },
  { slug: 'anthropology', title: 'Anthropology' },
  { slug: 'genetics', title: 'Genetics' },
  { slug: 'civilizations', title: 'Civilizations' },
  { slug: 'religion', title: 'Religion' },
  { slug: 'technology', title: 'Technology' },
];

/* -------------------------------------------------------------------------- */
/* DEMO builders                                                               */
/* -------------------------------------------------------------------------- */
const DEMO_NOW = '2026-06-09T12:00:00.000Z';

let _pub: ReturnType<typeof publishingDemo> | null = null;
function pubBundle(): ReturnType<typeof publishingDemo> {
  if (!_pub) _pub = publishingDemo();
  return _pub;
}

function toItem(p: Publication): PublicIntelligenceItem {
  return {
    slug: p.slug, title: p.title, summary: p.summary, state: p.state,
    ...(p.trustScore !== undefined ? { trustScore: p.trustScore } : {}),
    ...(p.confidence !== undefined ? { confidence: p.confidence } : {}),
    evidenceCount: p.evidenceCount, sourceCount: p.sourceCount,
    reviewStatus: p.reviewStatus, governanceStatus: p.governanceStatus,
    publishedAt: p.publishedAt, categories: p.categories, topics: p.topics,
  };
}

function toRecord(p: Publication): HsinPublicationRecord {
  return {
    id: p.id, slug: p.slug, title: p.title, summary: p.summary, state: p.state,
    run_id: p.runId, trust_score: p.trustScore, confidence: p.confidence,
    evidence_count: p.evidenceCount, source_count: p.sourceCount,
    categories: { items: p.categories }, topics: { items: p.topics },
    review_status: p.reviewStatus, governance_status: p.governanceStatus,
    published_at: p.publishedAt, created_at: p.createdAt, updated_at: p.updatedAt,
  };
}

export function demoPublicIntelligence(): PublicIntelligenceData {
  const d = pubBundle();
  const items = [toItem(d.published), toItem(d.retracted)];
  return { items, total: items.length };
}

export function demoPublicationPage(slug?: string): PublicationPageData {
  const d = pubBundle();
  const pub = slug === d.retracted.slug ? d.retracted : d.published;
  const report = d.report.sections as unknown as ReportSectionView[];
  return {
    publication: toItem(pub),
    report,
    sourceRefs: d.report.sourceRefs,
    ...(pub.state === 'RETRACTED'
      ? { retraction: { id: 'demo-ret', publication_id: pub.id, reason: d.retraction.reason, detail: d.retraction.detail, previous_state: d.retraction.previousState, created_at: DEMO_NOW } }
      : {}),
    trustHistory: [
      { trustScore: (pub.trustScore ?? 70) - 8, at: '2026-03-01T00:00:00.000Z' },
      { trustScore: (pub.trustScore ?? 70) - 3, at: '2026-04-01T00:00:00.000Z' },
      { trustScore: pub.trustScore ?? 70, at: pub.publishedAt ?? DEMO_NOW },
    ],
    auditTrail: publicationAuditTrail(pub),
  };
}

export function demoTopicPage(slug: string): TopicPageData {
  const d = pubBundle();
  const reports = [toItem(d.published)].filter((i) => i.topics.includes(slug) || slug === 'civilizations' || slug === 'history');
  const trustScores = reports.map((r) => r.trustScore).filter((x): x is number => typeof x === 'number');
  return {
    slug,
    title: titleize(slug),
    description: `Published intelligence on ${titleize(slug)}.`,
    reports,
    reportCount: reports.length,
    ...(trustScores.length ? { avgTrust: Math.round((trustScores.reduce((a, n) => a + n, 0) / trustScores.length) * 100) / 100 } : {}),
    evidenceTotal: reports.reduce((a, r) => a + r.evidenceCount, 0),
  };
}

export function demoSearchResults(query: string): SearchResultsData {
  const items = demoPublicIntelligence().items;
  const q = query.trim().toLowerCase();
  const publications = q ? items.filter((i) => i.title.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q) || i.topics.some((t) => t.includes(q))) : items;
  return { query, publications, topics: PUBLIC_TOPICS.slice(0, 5), total: publications.length };
}

export function demoPublishingDashboard(): PublishingDashboardData {
  const d = pubBundle();
  const dist = distributionDemo();
  const published = [toRecord(d.published)];
  const retraction = { id: 'demo-ret', publication_id: d.retracted.id, reason: d.retraction.reason, detail: d.retraction.detail, previous_state: d.retraction.previousState, created_at: DEMO_NOW };
  return {
    drafts: [toRecord(d.draft)],
    reviewQueue: [],
    publishingQueue: [],
    published,
    retractions: [retraction],
    digestRuns: [
      { id: 'demo-digest', kind: 'daily', title: dist.daily.title, period_start: dist.daily.periodStart, period_end: dist.daily.periodEnd, item_count: dist.daily.items.length, dropped_no_source: dist.daily.droppedNoSource, created_at: DEMO_NOW },
    ],
    subscriberCount: 2,
    byState: { DRAFT: 1, PUBLISHED: 1, RETRACTED: 1 },
    analytics: { totalPublished: 1, totalRetracted: 1, totalSubscribers: 2, totalDistributions: dist.distribution.length },
  };
}

export function demoSubscriptionAccount(): SubscriptionAccountData {
  const dist = distributionDemo();
  return {
    subscriber: { id: 'demo-sub', email: 'you@example.com', type: 'RESEARCHER', active: true, created_at: DEMO_NOW },
    preferences: { id: 'demo-pref', subscriber_id: 'demo-sub', digest_frequency: 'weekly', topics: { items: ['history', 'genetics'] }, notify_trust_changes: true, notify_retractions: true, channels: { items: ['email'] }, created_at: DEMO_NOW },
    recentDigests: [
      { id: 'demo-digest', kind: 'weekly', title: dist.weekly.title, item_count: dist.weekly.items.length, created_at: DEMO_NOW },
    ],
  };
}

/** Build a demo report (used by the slug page when no body is stored). */
export function demoReportSections(title: string): ReportSectionView[] {
  return buildIntelligenceReport({ publicationId: 'demo', title, summary: 'Demo report.', sourceRefs: ['ev:demo'] }, { now: DEMO_NOW }).sections as unknown as ReportSectionView[];
}
