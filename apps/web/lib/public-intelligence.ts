// =============================================================================
// HSI Phase 43 — Live Public Intelligence (SERVER-ONLY).
//
// Turns the homepage into a live public-intelligence surface backed by real
// platform activity. Read-only, anonymous-safe, cached, and public-safe:
//
//   * READ CLIENT: prefers the service-role client (server-only, RLS-bypassed)
//     for aggregate COUNTS over internal tables, and falls back to the anon
//     server client (published-only, RLS-enforced) when no service-role key is
//     configured. Anonymous visitors NEVER touch the service key — it stays on
//     the server inside this module + the API route. If neither client can be
//     built (no env, sandbox, tests), every read degrades to a graceful empty
//     result; nothing throws.
//   * PUBLIC SAFETY: only PUBLISHED, human-reviewed content is ever shown as
//     content (publication titles; published-signal CATEGORIES only — never raw
//     signal titles, source names, reviewer identities, or notes). Internal
//     tables contribute aggregate counts + activity timestamps only.
//   * CACHING: the whole bundle is wrapped in `unstable_cache` (60s revalidate,
//     tag `public-intelligence`) so the homepage stays fast and DB load is
//     bounded. Reads use non-cookie clients so caching is safe.
//
// NEVER import this module from a 'use client' file.
// =============================================================================

import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient, createServerClient } from '@hsi/database';
import {
  bucketOf,
  riskForBucket,
  riskTier,
  normalizeCategoryActivity,
  CATEGORY_BUCKETS,
  RISK_TIERS,
  type CategoryActivity,
  type CategoryBucket,
  type RiskTier,
} from './public-intelligence-mapping';

// ---- public types -----------------------------------------------------------

export interface PublicPlatformMetrics {
  totalSources: number;
  totalSignals: number;
  publishedReports: number;
  openReviews: number;
  /** Average traceability (0–100, one decimal). 0 when no published reports. */
  traceabilityScore: number;
}

export interface PublicSignalItem {
  id: string;
  title: string;
  risk_level: 1 | 2 | 3 | 4 | 5;
  category: CategoryBucket;
  created_at: string;
  status: string;
}

export type PublicActivityKind =
  | 'NEW SIGNAL'
  | 'EVIDENCE LINKED'
  | 'REVIEW COMPLETED'
  | 'REPORT PUBLISHED'
  | 'SOURCE VERIFIED';

export interface PublicActivityItem {
  id: string;
  kind: PublicActivityKind;
  text: string;
  at: string;
}

export interface PublicActivityBar {
  activeSignals: number;
  underReview: number;
  publishedToday: number;
  traceabilityScore: number;
}

export interface PublicIntelligenceBundle {
  metrics: PublicPlatformMetrics;
  latestSignals: PublicSignalItem[];
  activityFeed: PublicActivityItem[];
  categoryActivity: CategoryActivity[];
  activityBar: PublicActivityBar;
}

function emptyBundle(): PublicIntelligenceBundle {
  return {
    metrics: { totalSources: 0, totalSignals: 0, publishedReports: 0, openReviews: 0, traceabilityScore: 0 },
    latestSignals: [],
    activityFeed: [],
    categoryActivity: [],
    activityBar: { activeSignals: 0, underReview: 0, publishedToday: 0, traceabilityScore: 0 },
  };
}

// ---- read client ------------------------------------------------------------

/**
 * Best read client for public aggregates: service-role (RLS-bypassed counts)
 * when configured, else the anon server client (published-only). Returns null
 * when neither can be constructed (e.g. no env) so callers degrade gracefully.
 */
function readClient(): SupabaseClient | null {
  try {
    return createServiceRoleClient();
  } catch {
    /* no service-role key — fall back to anon */
  }
  try {
    return createServerClient();
  } catch {
    return null;
  }
}

// ---- small query helpers ----------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CountFilter = (q: any) => any;

async function countOf(c: SupabaseClient, table: string, apply?: CountFilter): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = c.from(table).select('id', { count: 'exact', head: true });
    if (apply) q = apply(q);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

function listFromJson(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>).filter((x): x is string => typeof x === 'string');
  return [];
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// ---- the loader (uncached) --------------------------------------------------

async function loadAll(): Promise<PublicIntelligenceBundle> {
  const c = readClient();
  if (!c) return emptyBundle();

  const todayIso = startOfTodayIso();

  const [
    totalSources,
    totalSignals,
    publishedReports,
    openReviews,
    activeSignals,
    publishedToday,
    traceabilityScore,
    latestSignals,
    categoryActivity,
    activityFeed,
  ] = await Promise.all([
    countOf(c, 'hsin_sources'),
    countOf(c, 'hsin_signals'),
    countOf(c, 'hsin_publications', (q) => q.eq('state', 'PUBLISHED')),
    countOf(c, 'hsin_signals', (q) => q.in('status', ['new', 'reviewing', 'needs_research'])),
    countOf(c, 'hsin_signals', (q) => q.neq('status', 'rejected')),
    countOf(c, 'hsin_publications', (q) => q.eq('state', 'PUBLISHED').gte('published_at', todayIso)),
    loadTraceability(c),
    loadLatestSignals(c),
    loadCategoryActivity(c),
    loadActivityFeed(c),
  ]);

  return {
    metrics: { totalSources, totalSignals, publishedReports, openReviews, traceabilityScore },
    latestSignals,
    activityFeed,
    categoryActivity,
    activityBar: { activeSignals, underReview: openReviews, publishedToday, traceabilityScore },
  };
}

async function loadTraceability(c: SupabaseClient): Promise<number> {
  try {
    const { data } = await c
      .from('hsin_publications')
      .select('trust_score')
      .eq('state', 'PUBLISHED')
      .not('trust_score', 'is', null)
      .limit(1000);
    const scores = ((data ?? []) as Array<{ trust_score: number | null }>)
      .map((r) => r.trust_score)
      .filter((n): n is number => typeof n === 'number');
    if (scores.length === 0) return 0;
    const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
    return Math.round(avg * 10) / 10;
  } catch {
    return 0;
  }
}

async function loadLatestSignals(c: SupabaseClient): Promise<PublicSignalItem[]> {
  // Primary: genuinely PUBLISHED signals (category only drives display risk).
  try {
    const { data } = await c
      .from('hsin_signals')
      .select('id, title, signal_category, status, created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(10);
    const rows = (data ?? []) as Array<{ id: string; title: string | null; signal_category: string | null; status: string | null; created_at: string }>;
    if (rows.length > 0) {
      return rows.map((r) => {
        const category = bucketOf(r.signal_category);
        return {
          id: r.id,
          title: r.title ?? 'Untitled signal',
          risk_level: riskForBucket(category),
          category,
          created_at: r.created_at,
          status: r.status ?? 'published',
        };
      });
    }
  } catch {
    /* fall through to publications */
  }

  // Fallback: PUBLISHED publications (anon-safe via RLS), shaped as signals.
  try {
    const { data } = await c
      .from('hsin_publications')
      .select('id, slug, title, categories, published_at, created_at')
      .eq('state', 'PUBLISHED')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(10);
    const rows = (data ?? []) as Array<{ id: string; slug: string | null; title: string | null; categories: unknown; published_at: string | null; created_at: string }>;
    return rows.map((r) => {
      const category = bucketOf(listFromJson(r.categories)[0]);
      return {
        id: r.slug ?? r.id,
        title: r.title ?? 'Untitled',
        risk_level: riskForBucket(category),
        category,
        created_at: r.published_at ?? r.created_at,
        status: 'published',
      };
    });
  } catch {
    return [];
  }
}

async function loadCategoryActivity(c: SupabaseClient): Promise<CategoryActivity[]> {
  // Primary: approved/published signals' categories.
  try {
    const { data } = await c
      .from('hsin_signals')
      .select('signal_category')
      .in('status', ['approved', 'published'])
      .limit(1000);
    const cats = ((data ?? []) as Array<{ signal_category: string | null }>).map((r) => r.signal_category);
    if (cats.length > 0) return normalizeCategoryActivity(cats);
  } catch {
    /* fall through */
  }
  // Fallback: published publications' category arrays.
  try {
    const { data } = await c
      .from('hsin_publications')
      .select('categories')
      .eq('state', 'PUBLISHED')
      .limit(1000);
    const cats = ((data ?? []) as Array<{ categories: unknown }>).flatMap((r) => listFromJson(r.categories));
    return normalizeCategoryActivity(cats);
  } catch {
    return [];
  }
}

async function loadActivityFeed(c: SupabaseClient): Promise<PublicActivityItem[]> {
  const events: PublicActivityItem[] = [];

  // Published publications → REPORT PUBLISHED + EVIDENCE LINKED (public content).
  try {
    const { data } = await c
      .from('hsin_publications')
      .select('id, title, source_count, published_at, created_at')
      .eq('state', 'PUBLISHED')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(6);
    const rows = (data ?? []) as Array<{ id: string; title: string | null; source_count: number | null; published_at: string | null; created_at: string }>;
    rows.slice(0, 3).forEach((r) =>
      events.push({ id: `pub-${r.id}`, kind: 'REPORT PUBLISHED', text: r.title ?? 'Intelligence report published', at: r.published_at ?? r.created_at }),
    );
    rows.filter((r) => (r.source_count ?? 0) > 0).slice(0, 2).forEach((r) =>
      events.push({ id: `ev-${r.id}`, kind: 'EVIDENCE LINKED', text: `${r.source_count} sources attached to “${r.title ?? 'a report'}”`, at: r.published_at ?? r.created_at }),
    );
  } catch { /* ignore */ }

  // Published signals → NEW SIGNAL (category only; never raw titles).
  try {
    const { data } = await c
      .from('hsin_signals')
      .select('id, signal_category, created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(3);
    const rows = (data ?? []) as Array<{ id: string; signal_category: string | null; created_at: string }>;
    rows.forEach((r) =>
      events.push({ id: `sig-${r.id}`, kind: 'NEW SIGNAL', text: `${bucketOf(r.signal_category)} narrative submitted`, at: r.created_at }),
    );
  } catch { /* ignore */ }

  // Signal reviews → REVIEW COMPLETED (generic; no reviewer/notes).
  try {
    const { data } = await c
      .from('hsin_signal_reviews')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .limit(2);
    const rows = (data ?? []) as Array<{ id: string; created_at: string }>;
    rows.forEach((r) => events.push({ id: `rev-${r.id}`, kind: 'REVIEW COMPLETED', text: 'Signal review completed', at: r.created_at }));
  } catch { /* ignore */ }

  // Active sources → SOURCE VERIFIED (generic; never source names).
  try {
    const { data } = await c
      .from('hsin_sources')
      .select('id, updated_at, created_at')
      .eq('status', 'active')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(2);
    const rows = (data ?? []) as Array<{ id: string; updated_at: string | null; created_at: string }>;
    rows.forEach((r) => events.push({ id: `src-${r.id}`, kind: 'SOURCE VERIFIED', text: 'New source verified', at: r.updated_at ?? r.created_at }));
  } catch { /* ignore */ }

  return events
    .filter((e) => Boolean(e.at))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 8);
}

// ---- cached public API ------------------------------------------------------

const loadBundleCached = unstable_cache(
  async (): Promise<PublicIntelligenceBundle> => loadAll(),
  ['public-intelligence:v1'],
  { revalidate: 60, tags: ['public-intelligence'] },
);

/** The full homepage data bundle (cached). Never throws. */
export async function getPublicIntelligenceBundle(): Promise<PublicIntelligenceBundle> {
  try {
    return await loadBundleCached();
  } catch {
    return emptyBundle();
  }
}

/** Computed platform metrics. Read-only, cached, anonymous-safe. */
export async function getPublicPlatformMetrics(): Promise<PublicPlatformMetrics> {
  return (await getPublicIntelligenceBundle()).metrics;
}

/** Latest published public signals (max 10, newest first). Empty when none. */
export async function getLatestPublicSignals(): Promise<PublicSignalItem[]> {
  return (await getPublicIntelligenceBundle()).latestSignals;
}

/** Latest public-safe activity events for the activity console. */
export async function getPublicActivityFeed(): Promise<PublicActivityItem[]> {
  return (await getPublicIntelligenceBundle()).activityFeed;
}

/** Narrative category frequencies for the globe (six public buckets). */
export async function getPublicCategoryActivity(): Promise<CategoryActivity[]> {
  return (await getPublicIntelligenceBundle()).categoryActivity;
}

// =============================================================================
// Phase 44 — Signal Library Intelligence Explorer data layer.
//
// Reuses the same read client, category mapping, and caching as the homepage
// (no duplicate query infrastructure). Reads the public, RLS-safe published
// intelligence (publications: PUBLISHED + ARCHIVED/RETRACTED) once, then derives
// the rich explorer cards, facet counts, category heatmap, and trend series.
// Public-safe: only published/aggregate fields; no raw signals, sources, or PII.
// =============================================================================

export type LibraryStatus = 'Published' | 'Archived';

export interface PublicLibrarySignal {
  id: string;
  title: string;
  summary: string;
  category: CategoryBucket;
  risk_level: 1 | 2 | 3 | 4 | 5;
  status: LibraryStatus;
  /** ISO publication date (or created fallback); undefined when unknown. */
  publishedAt?: string;
  /** Pre-formatted on the server (no client Date → no hydration drift). */
  dateLabel: string;
  evidenceCount: number;
  sourceCount: number;
  /** 0–100 traceability (publication trust score); undefined when unknown. */
  traceabilityScore?: number;
  confidence?: number;
  reviewStatus?: string;
}

export interface LibraryFacet<T extends string> {
  key: T;
  count: number;
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface SignalLibraryTrends {
  signalsOverTime: TrendPoint[];
  riskOverTime: TrendPoint[];
  publicationsOverTime: TrendPoint[];
}

export interface SignalLibraryData {
  signals: PublicLibrarySignal[];
  total: number;
  facets: {
    categories: LibraryFacet<CategoryBucket>[];
    risks: LibraryFacet<RiskTier>[];
    statuses: LibraryFacet<LibraryStatus>[];
  };
  categoryActivity: CategoryActivity[];
  trends: SignalLibraryTrends;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function monthLabel(key: string): string {
  const m = Number(key.slice(5, 7));
  return MONTHS[Math.max(0, Math.min(11, m - 1))] ?? key;
}

/** Per-month counts from a list of ISO timestamps (last 8 months, ascending). */
function monthCountSeries(isos: Array<string | null | undefined>): TrendPoint[] {
  const m = new Map<string, number>();
  for (const iso of isos) {
    if (!iso) continue;
    const k = iso.slice(0, 7);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([k, v]) => ({ label: monthLabel(k), value: v }));
}

function emptyLibrary(): SignalLibraryData {
  return {
    signals: [],
    total: 0,
    facets: {
      categories: CATEGORY_BUCKETS.map((key) => ({ key, count: 0 })),
      risks: RISK_TIERS.map((key) => ({ key, count: 0 })),
      statuses: [{ key: 'Published', count: 0 }, { key: 'Archived', count: 0 }],
    },
    categoryActivity: [],
    trends: { signalsOverTime: [], riskOverTime: [], publicationsOverTime: [] },
  };
}

async function loadLibrary(): Promise<SignalLibraryData> {
  const c = readClient();
  if (!c) return emptyLibrary();

  let signals: PublicLibrarySignal[] = [];
  try {
    const { data } = await c
      .from('hsin_publications')
      .select('id, slug, title, summary, categories, trust_score, confidence, evidence_count, source_count, review_status, state, published_at, created_at')
      .in('state', ['PUBLISHED', 'ARCHIVED', 'RETRACTED'])
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(300);
    const rows = (data ?? []) as Array<{
      id: string; slug: string | null; title: string | null; summary: string | null; categories: unknown;
      trust_score: number | null; confidence: number | null; evidence_count: number | null; source_count: number | null;
      review_status: string | null; state: string | null; published_at: string | null; created_at: string;
    }>;
    signals = rows.map((r) => {
      const category = bucketOf(listFromJson(r.categories)[0]);
      const publishedAt = r.published_at ?? r.created_at;
      return {
        id: r.slug ?? r.id,
        title: r.title ?? 'Untitled',
        summary: r.summary ?? '',
        category,
        risk_level: riskForBucket(category),
        status: (r.state === 'PUBLISHED' ? 'Published' : 'Archived') as LibraryStatus,
        publishedAt,
        dateLabel: fmtDate(publishedAt),
        evidenceCount: r.evidence_count ?? 0,
        sourceCount: r.source_count ?? 0,
        ...(typeof r.trust_score === 'number' ? { traceabilityScore: r.trust_score } : {}),
        ...(typeof r.confidence === 'number' ? { confidence: r.confidence } : {}),
        ...(r.review_status ? { reviewStatus: r.review_status } : {}),
      };
    });
  } catch {
    return emptyLibrary();
  }

  // Facets (derived in-memory — no extra queries).
  const categories = CATEGORY_BUCKETS.map((key) => ({ key, count: signals.filter((s) => s.category === key).length }));
  const risks = RISK_TIERS.map((key) => ({ key, count: signals.filter((s) => riskTier(s.risk_level) === key).length }));
  const statuses: LibraryFacet<LibraryStatus>[] = [
    { key: 'Published', count: signals.filter((s) => s.status === 'Published').length },
    { key: 'Archived', count: signals.filter((s) => s.status === 'Archived').length },
  ];
  const categoryActivity: CategoryActivity[] = categories.map(({ key, count }) => ({ category: key, count }));

  // Trends.
  const publicationsOverTime = monthCountSeries(signals.map((s) => s.publishedAt));
  const riskOverTime = (() => {
    const sum = new Map<string, { s: number; n: number }>();
    for (const s of signals) {
      if (!s.publishedAt) continue;
      const k = s.publishedAt.slice(0, 7);
      const e = sum.get(k) ?? { s: 0, n: 0 };
      e.s += s.risk_level; e.n += 1; sum.set(k, e);
    }
    return Array.from(sum.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([k, e]) => ({ label: monthLabel(k), value: Math.round((e.s / e.n) * 10) / 10 }));
  })();
  let signalsOverTime: TrendPoint[] = [];
  try {
    const { data } = await c.from('hsin_signals').select('created_at').order('created_at', { ascending: false }).limit(2000);
    const isos = ((data ?? []) as Array<{ created_at: string }>).map((r) => r.created_at);
    signalsOverTime = monthCountSeries(isos);
  } catch { /* ignore */ }
  if (signalsOverTime.length === 0) signalsOverTime = publicationsOverTime;

  return {
    signals,
    total: signals.length,
    facets: { categories, risks, statuses },
    categoryActivity,
    trends: { signalsOverTime, riskOverTime, publicationsOverTime },
  };
}

const loadLibraryCached = unstable_cache(
  async (): Promise<SignalLibraryData> => loadLibrary(),
  ['public-signal-library:v1'],
  { revalidate: 120, tags: ['public-intelligence'] },
);

/** Cached, anonymous-safe, public-safe Signal Library dataset. Never throws. */
export async function getSignalLibraryData(): Promise<SignalLibraryData> {
  try {
    return await loadLibraryCached();
  } catch {
    return emptyLibrary();
  }
}
