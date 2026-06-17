// =============================================================================
// HSI Phase 46 — Source Registry intelligence (SERVER-ONLY, read-only).
//
// Turns the Source Registry into a source-intelligence observatory without
// touching ingestion, cron, or the review workflow. Reuses the SAME read client
// strategy (service-role → anon → null) and caching (`unstable_cache`) as the
// public-intelligence layer. Derives, in-memory from a bounded read, the source
// intelligence cards, a health dashboard, a coverage map, analytics, and the
// per-source detail (relationships / timeline / reliability).
//
// PUBLIC-SAFE: only safe source fields (name, type, status, risk level,
// timestamps) + aggregate signal tallies. NEVER PII, reviewer identities,
// internal/moderation notes, created_by, or other admin-only metadata.
// =============================================================================

import { unstable_cache } from 'next/cache';
import { readPublicClient } from './public-intelligence';
import { bucketOf, type CategoryBucket } from './public-intelligence-mapping';

export type SourceTypeBucket = 'Websites' | 'YouTube' | 'Podcasts' | 'RSS' | 'Social' | 'Documents' | 'Other';
export type SourceStatusLabel = 'Active' | 'Paused' | 'Disabled' | 'Failing';

export interface SourceIntelItem {
  id: string;
  name: string;
  type: SourceTypeBucket;
  status: SourceStatusLabel;
  riskLevel: number;
  coverageCategory: CategoryBucket;
  signals: number;
  recentSignals: number; // last ~30 days
  lastActivity?: string;
  lastActivityLabel: string;
  addedAt?: string;
  addedLabel: string;
  healthScore: number; // 0–100 operational health
  trustScore: number;  // 0–100 signal-quality reliability
  trend: number[];     // last 6 months signal counts (oldest→newest)
  approved: number;    // signals reaching approved/published (review outcome)
  rejected: number;
  categoryCounts: { category: CategoryBucket; count: number }[];
}

export interface SourceHealthSummary {
  total: number;
  active: number;
  inactive: number;
  failing: number;
  highYield: number;
  signalsGenerated: number;
  reportsInfluenced: number;
}

export interface SourceCoverage {
  category: CategoryBucket;
  signals: number;
  sources: number;
}

export interface SourceRank {
  id: string;
  name: string;
  value: number;
  hint: string;
}

export interface SourceAnalytics {
  topSources: SourceRank[];
  fastestGrowing: SourceRank[];
  mostInfluential: SourceRank[];
  mostActiveCategories: { category: CategoryBucket; count: number }[];
}

export interface SourceIntelData {
  sources: SourceIntelItem[];
  health: SourceHealthSummary;
  coverage: SourceCoverage[];
  analytics: SourceAnalytics;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function typeBucket(raw: string | null | undefined): SourceTypeBucket {
  const s = (raw ?? '').toLowerCase();
  if (s.includes('youtube')) return 'YouTube';
  if (s.includes('podcast')) return 'Podcasts';
  if (s.includes('rss') || s.includes('feed') || s.includes('atom')) return 'RSS';
  if (/(twitter|^x$|facebook|reddit|telegram|instagram|tiktok|mastodon|social|forum)/.test(s)) return 'Social';
  if (s.includes('doc') || s.includes('pdf') || s.includes('paper') || s.includes('report')) return 'Documents';
  if (s.includes('web') || s.includes('site') || s.includes('url') || s.includes('http') || s.includes('news')) return 'Websites';
  return 'Other';
}

function statusLabel(raw: string | null | undefined): SourceStatusLabel {
  switch ((raw ?? '').toLowerCase()) {
    case 'active': return 'Active';
    case 'paused': return 'Paused';
    case 'disabled': return 'Disabled';
    case 'error': return 'Failing';
    default: return 'Paused';
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function emptyData(): SourceIntelData {
  return {
    sources: [],
    health: { total: 0, active: 0, inactive: 0, failing: 0, highYield: 0, signalsGenerated: 0, reportsInfluenced: 0 },
    coverage: [],
    analytics: { topSources: [], fastestGrowing: [], mostInfluential: [], mostActiveCategories: [] },
  };
}

interface Tally {
  total: number;
  recent: number;
  approved: number;
  rejected: number;
  lastAt?: string;
  byCategory: Map<CategoryBucket, number>;
  byMonth: Map<string, number>;
}

async function loadSources(): Promise<SourceIntelData> {
  const c = readPublicClient();
  if (!c) return emptyData();

  // 1. Sources (safe columns only).
  let srcRows: Array<{ id: string; name: string | null; source_type: string | null; status: string | null; risk_level: number | null; created_at: string; updated_at: string | null; last_checked_at: string | null; last_changed_at: string | null }> = [];
  try {
    const { data } = await c
      .from('hsin_sources')
      .select('id, name, source_type, status, risk_level, created_at, updated_at, last_checked_at, last_changed_at')
      .order('created_at', { ascending: false })
      .limit(500);
    srcRows = (data ?? []) as typeof srcRows;
  } catch {
    return emptyData();
  }

  // 2. One bounded signals read → per-source tallies (no N+1).
  const tallies = new Map<string, Tally>();
  const signalsByCategory = new Map<CategoryBucket, number>();
  const nowMs = Date.now();
  const monthKeys = recentMonthKeys(6);
  try {
    const { data } = await c
      .from('hsin_signals')
      .select('source_id, signal_category, status, created_at')
      .order('created_at', { ascending: false })
      .limit(8000);
    const rows = (data ?? []) as Array<{ source_id: string | null; signal_category: string | null; status: string | null; created_at: string }>;
    for (const r of rows) {
      const cat = bucketOf(r.signal_category);
      signalsByCategory.set(cat, (signalsByCategory.get(cat) ?? 0) + 1);
      if (!r.source_id) continue;
      let t = tallies.get(r.source_id);
      if (!t) { t = { total: 0, recent: 0, approved: 0, rejected: 0, byCategory: new Map(), byMonth: new Map() }; tallies.set(r.source_id, t); }
      t.total += 1;
      const ts = Date.parse(r.created_at);
      if (!Number.isNaN(ts) && nowMs - ts <= 30 * 86_400_000) t.recent += 1;
      if (!t.lastAt || r.created_at > t.lastAt) t.lastAt = r.created_at;
      const st = (r.status ?? '').toLowerCase();
      if (st === 'approved' || st === 'published') t.approved += 1;
      else if (st === 'rejected') t.rejected += 1;
      t.byCategory.set(cat, (t.byCategory.get(cat) ?? 0) + 1);
      const mk = r.created_at.slice(0, 7);
      t.byMonth.set(mk, (t.byMonth.get(mk) ?? 0) + 1);
    }
  } catch { /* signals optional */ }

  // 3. Reports influenced (aggregate published count).
  let reportsInfluenced = 0;
  try {
    const { count } = await c.from('hsin_publications').select('id', { count: 'exact', head: true }).eq('state', 'PUBLISHED');
    reportsInfluenced = count ?? 0;
  } catch { /* ignore */ }

  // 4. Build source items.
  const sources: SourceIntelItem[] = srcRows.map((r) => {
    const t = tallies.get(r.id);
    const status = statusLabel(r.status);
    const lastActivity = mostRecent([t?.lastAt, r.last_changed_at, r.last_checked_at, r.updated_at]);
    const coverageCategory = topCategory(t?.byCategory) ?? 'Other';
    const signals = t?.total ?? 0;
    const recent = t?.recent ?? 0;
    const approved = t?.approved ?? 0;
    const rejected = t?.rejected ?? 0;
    const trend = monthKeys.map((k) => t?.byMonth.get(k) ?? 0);

    const recencyDays = lastActivity ? (nowMs - Date.parse(lastActivity)) / 86_400_000 : Infinity;
    const healthBase = status === 'Active' ? 88 : status === 'Paused' ? 55 : status === 'Disabled' ? 35 : 20;
    const recencyAdj = recencyDays <= 7 ? 10 : recencyDays <= 30 ? 3 : recencyDays <= 90 ? -5 : -15;
    const healthScore = clamp(healthBase + recencyAdj + Math.min(8, signals / 10));

    const reviewed = approved + rejected;
    const approvedRatio = reviewed > 0 ? approved / reviewed : 0.5;
    const trustBase = status === 'Active' ? 60 : status === 'Paused' ? 48 : status === 'Disabled' ? 35 : 25;
    const trustScore = clamp(trustBase + approvedRatio * 28 + Math.min(10, signals / 20) - Math.max(0, (r.risk_level ?? 1) - 3) * 2);

    return {
      id: r.id,
      name: r.name ?? 'Unnamed source',
      type: typeBucket(r.source_type),
      status,
      riskLevel: r.risk_level ?? 1,
      coverageCategory,
      signals,
      recentSignals: recent,
      ...(lastActivity ? { lastActivity } : {}),
      lastActivityLabel: fmtDate(lastActivity),
      addedAt: r.created_at,
      addedLabel: fmtDate(r.created_at),
      healthScore,
      trustScore,
      trend,
      approved,
      rejected,
      categoryCounts: Array.from(t?.byCategory.entries() ?? []).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    };
  });

  // 5. Health summary.
  const yieldThreshold = 10;
  const health: SourceHealthSummary = {
    total: sources.length,
    active: sources.filter((s) => s.status === 'Active').length,
    inactive: sources.filter((s) => s.status === 'Paused' || s.status === 'Disabled').length,
    failing: sources.filter((s) => s.status === 'Failing').length,
    highYield: sources.filter((s) => s.signals >= yieldThreshold).length,
    signalsGenerated: sources.reduce((sum, s) => sum + s.signals, 0),
    reportsInfluenced,
  };

  // 6. Coverage map (signals + sources per category).
  const sourcesByCategory = new Map<CategoryBucket, number>();
  for (const s of sources) sourcesByCategory.set(s.coverageCategory, (sourcesByCategory.get(s.coverageCategory) ?? 0) + 1);
  const allCats = new Set<CategoryBucket>([...signalsByCategory.keys(), ...sourcesByCategory.keys()]);
  const coverage: SourceCoverage[] = Array.from(allCats)
    .map((category) => ({ category, signals: signalsByCategory.get(category) ?? 0, sources: sourcesByCategory.get(category) ?? 0 }))
    .sort((a, b) => b.signals - a.signals);

  // 7. Analytics.
  const topSources = rankBy(sources, (s) => s.signals, (s) => `${s.signals} signals`).slice(0, 5);
  const fastestGrowing = rankBy(sources.filter((s) => s.recentSignals > 0), (s) => s.recentSignals, (s) => `${s.recentSignals} in 30d`).slice(0, 5);
  const mostInfluential = rankBy(sources.filter((s) => s.signals > 0), (s) => Math.round(s.signals * (s.trustScore / 100)), (s) => `${s.trustScore}% reliability`).slice(0, 5);
  const mostActiveCategories = Array.from(signalsByCategory.entries()).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);

  return { sources, health, coverage, analytics: { topSources, fastestGrowing, mostInfluential, mostActiveCategories } };
}

function rankBy(items: SourceIntelItem[], value: (s: SourceIntelItem) => number, hint: (s: SourceIntelItem) => string): SourceRank[] {
  return [...items]
    .sort((a, b) => value(b) - value(a))
    .map((s) => ({ id: s.id, name: s.name, value: value(s), hint: hint(s) }));
}

function topCategory(m?: Map<CategoryBucket, number>): CategoryBucket | null {
  if (!m || m.size === 0) return null;
  let best: CategoryBucket | null = null;
  let bestN = -1;
  for (const [k, v] of m) if (v > bestN) { best = k; bestN = v; }
  return best;
}

function mostRecent(isos: Array<string | null | undefined>): string | undefined {
  let best: string | undefined;
  for (const i of isos) if (i && (!best || i > best)) best = i;
  return best;
}

function recentMonthKeys(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(dd.toISOString().slice(0, 7));
  }
  return out;
}

const loadSourcesCached = unstable_cache(
  async (): Promise<SourceIntelData> => loadSources(),
  ['source-intelligence:v1'],
  { revalidate: 120, tags: ['source-intelligence'] },
);

/** Cached, read-only, public-safe Source Registry intelligence. Never throws. */
export async function getSourceIntelligence(): Promise<SourceIntelData> {
  try {
    return await loadSourcesCached();
  } catch {
    return emptyData();
  }
}
