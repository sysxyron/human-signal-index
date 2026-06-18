// =============================================================================
// HSI Phase 49 — Trust & Transparency Center data (SERVER-ONLY, read-only).
//
// Composes the EXISTING cached intelligence layers (public / source / operations)
// — so there are no duplicate queries — and adds the one missing public read: the
// correction (retraction) log. Produces the trust overview, transparency
// scorecard, review pipeline, corrections, platform health, source accountability,
// and audit timeline. Public-safe: aggregate metrics + already-public corrections
// only (NO reviewer/retractor identities, NO internal notes/detail text).
// =============================================================================

import { unstable_cache } from 'next/cache';
import { readPublicClient, getPublicIntelligenceBundle, getSignalLibraryData } from './public-intelligence';
import { getSourceIntelligence } from './source-intelligence';
import { getOperationsIntelligence, type PipelineStage } from './operations-intelligence';
import type { SourceCoverage } from './source-intelligence';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function titleCase(r?: string | null): string {
  if (!r) return 'Correction';
  return r.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export interface TrustCorrection {
  id: string;
  at: string;
  date: string;
  type: string;
  status: string;
  publication: string;
  resolution: string;
}

export interface TrustOverviewData {
  publishedSignals: number;
  publishedReports: number;
  /** % of published items with an approving review status; null when not measurable. */
  humanReviewedPct: number | null;
  traceabilityPct: number;
  correctionsIssued: number;
  sourcesActive: number;
}

export interface TransparencyScore {
  label: string;
  /** Percentage 0–100, or null when there isn't enough data to measure it. */
  pct: number | null;
}

export interface PlatformHealthData {
  signalsReviewedToday: number;
  reportsPublishedToday: number;
  avgTraceability: number;
  reviewBacklog: number;
  sourceActivity: number;
}

export interface SourceAccountabilityData {
  coverage: SourceCoverage[];
  reliabilityAvg: number;
  validationRate: number;
  totalSources: number;
}

export interface TrustAuditItem {
  id: string;
  kind: string;
  text: string;
  at: string;
}

export interface TrustData {
  overview: TrustOverviewData;
  scorecard: TransparencyScore[];
  pipeline: PipelineStage[];
  corrections: TrustCorrection[];
  health: PlatformHealthData;
  sourceAccountability: SourceAccountabilityData;
  audit: TrustAuditItem[];
}

// ---- corrections (the one extra read) --------------------------------------

async function loadCorrections(): Promise<TrustCorrection[]> {
  const c = readPublicClient();
  if (!c) return [];
  try {
    const { data } = await c
      .from('hsin_publication_retractions')
      .select('id, publication_id, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    const rows = (data ?? []) as Array<{ id: string; publication_id: string | null; reason: string | null; created_at: string }>;
    if (rows.length === 0) return [];

    // Resolve publication titles in ONE query (no N+1).
    const ids = Array.from(new Set(rows.map((r) => r.publication_id).filter((x): x is string => Boolean(x))));
    const titles = new Map<string, string>();
    if (ids.length > 0) {
      try {
        const { data: pubs } = await c.from('hsin_publications').select('id, title').in('id', ids);
        for (const p of (pubs ?? []) as Array<{ id: string; title: string | null }>) titles.set(p.id, p.title ?? 'Publication');
      } catch { /* titles optional */ }
    }
    return rows.map((r) => ({
      id: r.id,
      at: r.created_at,
      date: fmtDate(r.created_at),
      type: titleCase(r.reason),
      status: 'Published correction',
      publication: (r.publication_id && titles.get(r.publication_id)) || 'Publication',
      resolution: titleCase(r.reason),
    }));
  } catch {
    return [];
  }
}

const loadCorrectionsCached = unstable_cache(
  async (): Promise<TrustCorrection[]> => loadCorrections(),
  ['public-corrections:v1'],
  { revalidate: 300, tags: ['public-intelligence'] },
);

export async function getPublicCorrections(): Promise<TrustCorrection[]> {
  try {
    return await loadCorrectionsCached();
  } catch {
    return [];
  }
}

// ---- composed trust data ----------------------------------------------------

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function getTrustData(): Promise<TrustData> {
  const [bundle, library, source, ops, corrections] = await Promise.all([
    getPublicIntelligenceBundle(),
    getSignalLibraryData(),
    getSourceIntelligence(),
    getOperationsIntelligence(),
    getPublicCorrections(),
  ]);

  const { metrics, activityBar, activityFeed } = bundle;
  const published = library.signals.filter((s) => s.status === 'Published');
  const archived = library.signals.filter((s) => s.status === 'Archived');
  const pubN = published.length;

  // Phase 56.1 — trust metrics computed from real data (no hardcoded 100%).
  // Human review is measured from the publications' review_status field: a
  // publication counts as human-reviewed when its status indicates approval. If
  // no published item carries a review_status, the metric is null ("Not enough
  // data yet") rather than an unsupported 100%.
  const withReviewStatus = published.filter((s) => Boolean(s.reviewStatus));
  const reviewedCount = withReviewStatus.filter((s) => /approv|review|clear|publish|pass|accept/i.test(s.reviewStatus ?? '')).length;
  const humanReviewedPct: number | null = withReviewStatus.length > 0 ? pct(reviewedCount, withReviewStatus.length) : null;

  // Corrections logged: of items pulled back (archived/retracted), the share that
  // have a public correction entry. Null when nothing has been pulled back.
  const correctionsLoggedPct: number | null = archived.length > 0 ? Math.min(100, pct(corrections.length, archived.length)) : null;

  const overview: TrustOverviewData = {
    publishedSignals: library.total,
    publishedReports: metrics.publishedReports,
    humanReviewedPct,
    traceabilityPct: metrics.traceabilityScore,
    correctionsIssued: corrections.length,
    sourcesActive: source.health.active,
  };

  const evidenceLinked = pubN > 0 ? pct(published.filter((s) => s.evidenceCount > 0).length, pubN) : null;
  const traceable = pubN > 0 ? pct(published.filter((s) => typeof s.traceabilityScore === 'number').length, pubN) : null;
  const sourceVerifiedPct = source.health.total > 0 ? pct(source.health.active, source.health.total) : null;
  const scorecard: TransparencyScore[] = [
    { label: 'Evidence Linked', pct: evidenceLinked },
    { label: 'Human Reviewed', pct: humanReviewedPct },
    { label: 'Traceable', pct: traceable },
    // No per-publication version metadata is collected yet → not measurable.
    { label: 'Version Controlled', pct: null },
    { label: 'Corrections Logged', pct: correctionsLoggedPct },
    { label: 'Source Verified', pct: sourceVerifiedPct },
  ];

  const reliabilityAvg = source.sources.length > 0
    ? Math.round(source.sources.reduce((s, x) => s + x.trustScore, 0) / source.sources.length)
    : 0;
  const sourceAccountability: SourceAccountabilityData = {
    coverage: source.coverage,
    reliabilityAvg,
    validationRate: sourceVerifiedPct ?? 0,
    totalSources: source.health.total,
  };

  const health: PlatformHealthData = {
    signalsReviewedToday: ops.review.approvedToday + ops.review.rejectedToday,
    reportsPublishedToday: activityBar.publishedToday,
    avgTraceability: metrics.traceabilityScore,
    reviewBacklog: ops.review.backlog,
    sourceActivity: source.health.signalsGenerated,
  };

  const audit: TrustAuditItem[] = [
    ...activityFeed.map((e) => ({ id: e.id, kind: e.kind, text: e.text, at: e.at })),
    ...corrections.map((c) => ({ id: c.id, kind: 'CORRECTION ISSUED', text: `Correction on “${c.publication}”`, at: c.at })),
  ]
    .filter((e) => Boolean(e.at))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 12);

  return { overview, scorecard, pipeline: ops.pipeline, corrections, health, sourceAccountability, audit };
}
