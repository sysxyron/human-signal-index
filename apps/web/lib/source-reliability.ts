// =============================================================================
// HSI Phase 61 — Source Reliability & Crawl Orchestration (SERVER-ONLY, read).
//
// Observability over the EXISTING ingestion: reads source_capture_events +
// hsin_source_health and reuses the cached getSourceIntelligence(). Produces
// per-source health/score, status & type breakdowns, crawl schedule (policy +
// observed timings), retry/backoff visibility, block detection, collection
// analytics, dependency risks, and an executive summary. No fetching, no engine
// changes, no bypass — display only. Cached (loaders ≤ 5: this + source-intel).
// =============================================================================

import { unstable_cache } from 'next/cache';
import { readPublicClient } from './public-intelligence';
import { getSourceIntelligence } from './source-intelligence';
import {
  classifyFailure, detectProtection, computeHealthScore, backoffStage, typeBucketOf,
  SOURCE_TYPE_BUCKETS, type SourceTypeBucket, type FailureType, type Protection, type HealthStatus, type ScoreTier,
} from './source-reliability-classify';

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// Capture cadence policy by source type (the documented scheduler intervals).
const INTERVAL: Record<SourceTypeBucket, { label: string; minutes: number }> = {
  RSS: { label: '15 min', minutes: 15 },
  Website: { label: '30 min', minutes: 30 },
  API: { label: '30 min', minutes: 30 },
  Reddit: { label: '30 min', minutes: 30 },
  Social: { label: '30 min', minutes: 30 },
  YouTube: { label: '1 hr', minutes: 60 },
  Government: { label: '1 hr', minutes: 60 },
  Forum: { label: '1 hr', minutes: 60 },
  Research: { label: '6 hr', minutes: 360 },
  Podcast: { label: '12 hr', minutes: 720 },
  Other: { label: '1 hr', minutes: 60 },
};

export interface ReliabilitySource {
  id: string;
  name: string;
  type: SourceTypeBucket;
  status: HealthStatus;
  score: number;
  tier: ScoreTier;
  scoreExplanation: string;
  factors: { label: string; value: string }[];
  failureType: FailureType;
  failureDetail: string;
  protection: Protection | null;
  events: number;
  successPct: number;
  consecutiveFailures: number;
  lastSuccessLabel: string;
  retryStage: string;
  nextRetry: string;
  signals: number;
  // Phase 63 — raw recency exposed for the monitoring engine (stale detection).
  lastSuccessIso: string | null;
  lastSuccessAgeDays: number | null;
}

export interface StatusBreakdown { total: number; active: number; healthy: number; warning: number; failed: number; blocked: number; loginRequired: number }
export interface TypeBreakdown { type: SourceTypeBucket; total: number; healthy: number; warning: number; failed: number }
export interface ScheduleRow { type: SourceTypeBucket; interval: string; sources: number; lastFetchLabel: string; nextFetchLabel: string; avgDurationLabel: string }
export interface BlockRow { protection: Protection; firstSeenLabel: string; lastSeenLabel: string; affected: number }
export interface CollectionAnalytics { fetchesPerDay: number; successPct: number; failurePct: number; avgLatencyMs: number | null; contentVolume: number; newSignals: number; signalsPerSource: number }
export interface DependencyRisk { label: string; severity: 'high' | 'medium'; coverageImpact: string; suggestion: string }
export interface ReliabilityExec {
  healthyPct: number; failingPct: number; blockedPct: number; coverageRisk: string;
  mostReliable: { name: string; score: number }[];
  mostFragile: { name: string; score: number }[];
  recommendations: string[];
}

export interface SourceReliabilityData {
  breakdown: StatusBreakdown;
  byType: TypeBreakdown[];
  sources: ReliabilitySource[];
  schedule: ScheduleRow[];
  blocks: BlockRow[];
  analytics: CollectionAnalytics;
  dependencies: DependencyRisk[];
  summary: ReliabilityExec;
}

interface Tally {
  type: SourceTypeBucket;
  total: number;
  healthy: number;
  parseErrors: number;
  consecutiveFailures: number;
  countingConsecutive: boolean;
  lastSuccessAt?: string;
  latestStatus?: string;
  latestReason?: string | null;
  latestError?: string | null;
  items: number;
}

function empty(): SourceReliabilityData {
  return {
    breakdown: { total: 0, active: 0, healthy: 0, warning: 0, failed: 0, blocked: 0, loginRequired: 0 },
    byType: [], sources: [], schedule: [], blocks: [],
    analytics: { fetchesPerDay: 0, successPct: 0, failurePct: 0, avgLatencyMs: null, contentVolume: 0, newSignals: 0, signalsPerSource: 0 },
    dependencies: [],
    summary: { healthyPct: 0, failingPct: 0, blockedPct: 0, coverageRisk: '—', mostReliable: [], mostFragile: [], recommendations: ['Connect a data source to populate reliability intelligence.'] },
  };
}

async function loadReliability(): Promise<SourceReliabilityData> {
  const c = readPublicClient();
  if (!c) return empty();

  const src = await getSourceIntelligence();

  // ---- one bounded capture-events read → per-source + global tallies (no N+1) ----
  const byId = new Map<string, Tally>();
  const blocks = new Map<Protection, { first: string; last: string; affected: Set<string> }>();
  let totalEvents = 0;
  let healthyEvents = 0;
  let items = 0;
  let minAt: string | undefined;
  let maxAt: string | undefined;
  try {
    const { data } = await c
      .from('source_capture_events')
      .select('source_id, source_type, status, reason, error, items_captured, captured_at')
      .order('captured_at', { ascending: false })
      .limit(10000);
    const rows = (data ?? []) as Array<{ source_id: string | null; source_type: string | null; status: string | null; reason: string | null; error: string | null; items_captured: number | null; captured_at: string }>;
    for (const r of rows) {
      if (!r.source_id) continue;
      totalEvents += 1;
      const isHealthy = r.status === 'healthy';
      if (isHealthy) healthyEvents += 1;
      items += r.items_captured ?? 0;
      if (!maxAt || r.captured_at > maxAt) maxAt = r.captured_at;
      if (!minAt || r.captured_at < minAt) minAt = r.captured_at;

      let t = byId.get(r.source_id);
      if (!t) {
        t = { type: typeBucketOf(r.source_type), total: 0, healthy: 0, parseErrors: 0, consecutiveFailures: 0, countingConsecutive: true, items: 0, latestStatus: r.status ?? undefined, latestReason: r.reason, latestError: r.error };
        byId.set(r.source_id, t);
      }
      t.total += 1;
      t.items += r.items_captured ?? 0;
      if (isHealthy) {
        t.healthy += 1;
        if (!t.lastSuccessAt) t.lastSuccessAt = r.captured_at;
        t.countingConsecutive = false; // a healthy event breaks the leading failure run
      } else {
        if (t.countingConsecutive) t.consecutiveFailures += 1;
        const f = classifyFailure(r.status, r.reason, r.error);
        if (f.type === 'Parse Error') t.parseErrors += 1;
        const prot = detectProtection(r.reason, r.error);
        if (prot) {
          const b = blocks.get(prot) ?? { first: r.captured_at, last: r.captured_at, affected: new Set<string>() };
          if (r.captured_at < b.first) b.first = r.captured_at;
          if (r.captured_at > b.last) b.last = r.captured_at;
          b.affected.add(r.source_id);
          blocks.set(prot, b);
        }
      }
    }
  } catch { /* capture events optional */ }

  // ---- latest health row per source (avg latency) ----
  const latencyById = new Map<string, number>();
  try {
    const { data } = await c.from('hsin_source_health').select('source_id, response_time, created_at').order('created_at', { ascending: false }).limit(2000);
    for (const r of (data ?? []) as Array<{ source_id: string | null; response_time: number | null; created_at: string }>) {
      if (r.source_id && !latencyById.has(r.source_id) && typeof r.response_time === 'number') latencyById.set(r.source_id, r.response_time);
    }
  } catch { /* ignore */ }

  const now = Date.now();
  // ---- per-source rows ----
  const sources: ReliabilitySource[] = src.sources.map((s) => {
    const t = byId.get(s.id);
    const type = t?.type ?? 'Other';
    const lastSuccessAgeDays = t?.lastSuccessAt ? Math.floor((now - Date.parse(t.lastSuccessAt)) / DAY) : null;
    const hs = computeHealthScore({ total: t?.total ?? 0, healthy: t?.healthy ?? 0, parseErrors: t?.parseErrors ?? 0, consecutiveFailures: t?.consecutiveFailures ?? 0, lastSuccessAgeDays });
    const failure = classifyFailure(t?.latestStatus, t?.latestReason, t?.latestError);
    const protection = detectProtection(t?.latestReason, t?.latestError);
    const bo = backoffStage(t?.consecutiveFailures ?? 0);
    return {
      id: s.id, name: s.name, type,
      status: hs.status, score: hs.score, tier: hs.tier, scoreExplanation: hs.explanation, factors: hs.factors,
      failureType: failure.type, failureDetail: failure.detail, protection,
      events: t?.total ?? 0,
      successPct: t && t.total > 0 ? Math.round((t.healthy / t.total) * 100) : 0,
      consecutiveFailures: t?.consecutiveFailures ?? 0,
      lastSuccessLabel: t?.lastSuccessAt ? fmtDate(t.lastSuccessAt) : 'never',
      retryStage: bo.stage, nextRetry: bo.nextRetry,
      signals: s.signals,
      lastSuccessIso: t?.lastSuccessAt ?? null,
      lastSuccessAgeDays,
    };
  });

  // ---- breakdowns ----
  const breakdown: StatusBreakdown = {
    total: src.health.total,
    active: src.health.active,
    healthy: sources.filter((s) => s.status === 'HEALTHY').length,
    warning: sources.filter((s) => s.status === 'WARNING').length,
    failed: sources.filter((s) => s.status === 'FAILED').length,
    blocked: sources.filter((s) => s.protection !== null && s.status !== 'HEALTHY').length,
    loginRequired: sources.filter((s) => s.failureType === 'Login Required').length,
  };
  const byType: TypeBreakdown[] = SOURCE_TYPE_BUCKETS.map((type) => {
    const rows = sources.filter((s) => s.type === type);
    return { type, total: rows.length, healthy: rows.filter((r) => r.status === 'HEALTHY').length, warning: rows.filter((r) => r.status === 'WARNING').length, failed: rows.filter((r) => r.status === 'FAILED').length };
  }).filter((b) => b.total > 0);

  // ---- crawl schedule (policy interval + observed timing per type) ----
  const schedule: ScheduleRow[] = byType.map((b) => {
    const typeSources = sources.filter((s) => s.type === b.type);
    const lats = typeSources.map((s) => latencyById.get(s.id)).filter((n): n is number => typeof n === 'number');
    const avg = lats.length ? Math.round(lats.reduce((a, x) => a + x, 0) / lats.length) : null;
    return {
      type: b.type, interval: INTERVAL[b.type].label, sources: b.total,
      lastFetchLabel: maxAt ? fmtDate(maxAt) : '—',
      nextFetchLabel: `every ${INTERVAL[b.type].label}`,
      avgDurationLabel: avg == null ? '—' : `${avg} ms`,
    };
  });

  // ---- block detection ----
  const blockRows: BlockRow[] = Array.from(blocks.entries()).map(([protection, b]) => ({
    protection, firstSeenLabel: fmtDate(b.first), lastSeenLabel: fmtDate(b.last), affected: b.affected.size,
  })).sort((a, b) => b.affected - a.affected);

  // ---- collection analytics ----
  const windowDays = minAt && maxAt ? Math.max(1, Math.round((Date.parse(maxAt) - Date.parse(minAt)) / DAY) || 1) : 1;
  const allLats = Array.from(latencyById.values());
  const analytics: CollectionAnalytics = {
    fetchesPerDay: Math.round(totalEvents / windowDays),
    successPct: totalEvents > 0 ? Math.round((healthyEvents / totalEvents) * 100) : 0,
    failurePct: totalEvents > 0 ? Math.round(((totalEvents - healthyEvents) / totalEvents) * 100) : 0,
    avgLatencyMs: allLats.length ? Math.round(allLats.reduce((a, x) => a + x, 0) / allLats.length) : null,
    contentVolume: items,
    newSignals: src.health.signalsGenerated,
    signalsPerSource: src.health.active > 0 ? Math.round((src.health.signalsGenerated / src.health.active) * 10) / 10 : 0,
  };

  // ---- dependency risks (reuse source-intelligence coverage + analytics) ----
  const dependencies: DependencyRisk[] = [];
  const top = src.analytics.topSources[0];
  if (top && src.health.signalsGenerated > 0) {
    const share = Math.round((top.value / src.health.signalsGenerated) * 100);
    if (share >= 40) dependencies.push({ label: 'Single-source dependency', severity: share >= 60 ? 'high' : 'medium', coverageImpact: `${share}% of signals from ${top.name}`, suggestion: 'Diversify high-yield collection across more sources.' });
  }
  const topCov = [...src.coverage].sort((a, b) => b.signals - a.signals)[0];
  const totalCovSignals = src.coverage.reduce((a, x) => a + x.signals, 0);
  if (topCov && totalCovSignals > 0) {
    const share = Math.round((topCov.signals / totalCovSignals) * 100);
    if (share >= 50) dependencies.push({ label: 'Category concentration', severity: 'medium', coverageImpact: `${share}% of signals in ${topCov.category}`, suggestion: `Broaden coverage beyond ${topCov.category}.` });
  }
  const gaps = src.coverage.filter((c2) => c2.sources === 0).map((c2) => c2.category);
  if (gaps.length > 0) dependencies.push({ label: 'Coverage gaps', severity: 'medium', coverageImpact: `No active sources for ${gaps.join(', ')}`, suggestion: 'Add sources for the uncovered categories.' });

  // ---- executive summary ----
  const total = Math.max(1, src.health.total);
  const ranked = [...sources].filter((s) => s.events > 0).sort((a, b) => b.score - a.score);
  const summary: ReliabilityExec = {
    healthyPct: Math.round((breakdown.healthy / total) * 100),
    failingPct: Math.round((breakdown.failed / total) * 100),
    blockedPct: Math.round((breakdown.blocked / total) * 100),
    coverageRisk: gaps.length ? `${gaps.length} coverage gap${gaps.length === 1 ? '' : 's'}` : 'Full coverage',
    mostReliable: ranked.slice(0, 3).map((s) => ({ name: s.name, score: s.score })),
    mostFragile: ranked.slice(-3).reverse().map((s) => ({ name: s.name, score: s.score })),
    recommendations: [],
  };
  if (breakdown.failed > 0) summary.recommendations.push(`Investigate ${breakdown.failed} failed source${breakdown.failed === 1 ? '' : 's'}.`);
  if (breakdown.blocked > 0) summary.recommendations.push(`${breakdown.blocked} source(s) hit anti-bot protection — respect robots/ToS; do not bypass.`);
  if (breakdown.loginRequired > 0) summary.recommendations.push(`${breakdown.loginRequired} source(s) need login — only capture public content.`);
  for (const d of dependencies) summary.recommendations.push(d.suggestion);
  if (summary.recommendations.length === 0) summary.recommendations.push('Collection network is healthy — no action required.');

  return { breakdown, byType, sources, schedule, blocks: blockRows, analytics, dependencies, summary };
}

const loadReliabilityCached = unstable_cache(
  async (): Promise<SourceReliabilityData> => loadReliability(),
  ['source-reliability:v1'],
  { revalidate: 120, tags: ['source-intelligence'] },
);

/** Cached, read-only source reliability + crawl observability. Never throws. */
export async function getSourceReliability(): Promise<SourceReliabilityData> {
  try {
    return await loadReliabilityCached();
  } catch {
    return empty();
  }
}
