// =============================================================================
// HSI Phase 68 — Transparency data services (SERVER-ONLY, read-only, cached).
//
// PUBLIC-SAFE: reads via readPublicClient (service-role → anon → null) but selects
// ONLY aggregate / published / resolved intelligence — never PII, reviewer
// identities, internal notes, unpublished content, private evidence, or alerts.
// Reuses Phase 61 (source reliability), Phase 65 (narratives), Phase 67 (forecasts)
// — NO duplicate logic, NO new engines. Cached (unstable_cache, 300s); no N+1.
// Never throws; degrades to zeros/empty.
// =============================================================================

import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readPublicClient } from '@/lib/public-intelligence';
import { getSourceReliability } from '@/lib/source-reliability';
import { listForecastsDal, readEvalRecords, getSnapshotsDal, getCalibrationDal } from '@/lib/forecasts/persistence';
import { performanceMetrics } from '@/lib/forecasts/calibration';
import { listNarrativesDal, latestSnapshotByNarrative, latestMetricsByNarrative } from '@/lib/narrative-intelligence/persistence';
import type {
  TransparencyOverview, ForecastTransparency, NarrativeTransparency, SourceTransparency,
  CorrectionTransparency, PublicForecast, PublicNarrative, PublicSource, PublicCorrection,
} from './types';

/** Await a head-count query (built by `make`), degrading to 0 on error. */
async function countRows(make: () => PromiseLike<{ count: number | null }>): Promise<number> {
  try { const { count } = await make(); return count ?? 0; } catch { return 0; }
}
type CountQuery = PromiseLike<{ count: number | null }>;
function headCount(c: SupabaseClient, table: string) {
  return c.from(table).select('id', { count: 'exact', head: true });
}

// ---- overview ---------------------------------------------------------------

async function loadOverview(): Promise<TransparencyOverview> {
  const empty: TransparencyOverview = { totalSignals: 0, totalEvidence: 0, totalNarratives: 0, totalForecasts: 0, totalForecastOutcomes: 0, sourceCoverage: 0, sourceHealthPct: 0, totalSources: 0, activeSources: 0, publicationVolume: 0, correctionVolume: 0 };
  const c = readPublicClient();
  if (!c) return empty;
  const rel = await getSourceReliability();
  const [signals, evidence, narratives, forecasts, outcomes, publications, corrections] = await Promise.all([
    countRows(() => headCount(c, 'hsin_signals').in('status', ['approved', 'published']) as unknown as CountQuery),
    countRows(() => headCount(c, 'hsin_evidence_claims') as unknown as CountQuery),
    countRows(() => headCount(c, 'narratives').neq('status', 'archived') as unknown as CountQuery),
    countRows(() => headCount(c, 'forecasts').not('status', 'in', '(draft,cancelled)') as unknown as CountQuery),
    countRows(() => headCount(c, 'forecast_outcomes') as unknown as CountQuery),
    countRows(() => headCount(c, 'hsin_publications').eq('state', 'PUBLISHED') as unknown as CountQuery),
    countRows(() => headCount(c, 'hsin_publication_versions').eq('to_state', 'RETRACTED') as unknown as CountQuery),
  ]);
  const coverage = rel.byType.length;
  const healthPct = rel.breakdown.total > 0 ? Math.round((rel.breakdown.healthy / rel.breakdown.total) * 100) : 0;
  return {
    totalSignals: signals, totalEvidence: evidence, totalNarratives: narratives, totalForecasts: forecasts,
    totalForecastOutcomes: outcomes, sourceCoverage: coverage, sourceHealthPct: healthPct,
    totalSources: rel.breakdown.total, activeSources: rel.breakdown.active,
    publicationVolume: publications, correctionVolume: corrections,
  };
}

// ---- forecasts (Phase 67, public-safe) -------------------------------------

function toPublicForecast(f: { id: string; title: string; predictionType: string; status: string; confidence: number | null; outcome: string | null; resolutionDate: string | null; source: string | null; narrativeId: string | null; graphNodeId: string | null }, result: string | null): PublicForecast {
  return { id: f.id, title: f.title, predictionType: f.predictionType, status: f.status, confidence: f.confidence, outcome: f.outcome, result, resolutionDate: f.resolutionDate, hasNarrative: !!f.narrativeId, hasGraphNode: !!f.graphNodeId, source: f.source };
}

async function loadForecasts(): Promise<ForecastTransparency> {
  const empty: ForecastTransparency = { active: 0, resolved: 0, correct: 0, incorrect: 0, expired: 0, accuracy: 0, calibrationScore: 0, resolutionRate: 0, calibration: [], accuracyTrend: [], resolutionTimeline: [], activeForecasts: [] };
  const c = readPublicClient();
  if (!c) return empty;
  const records = await readEvalRecords(c);
  const perf = performanceMetrics(records);
  const correct = records.filter((r) => r.result === 'correct').length;
  const incorrect = records.filter((r) => r.result === 'incorrect').length;
  const active = records.filter((r) => r.status === 'active').length;

  const [resolvedList, activeList, snaps, calib] = await Promise.all([
    listForecastsDal(c, { status: 'resolved', limit: 20 }),
    listForecastsDal(c, { status: 'active', limit: 20 }),
    getSnapshotsDal(c, 60),
    getCalibrationDal(c),
  ]);
  // result per forecast from scores
  const scoreResult = new Map<string, string | null>();
  try {
    const ids = [...resolvedList, ...activeList].map((f) => f.id);
    if (ids.length) { const { data } = await c.from('forecast_scores').select('forecast_id, result').in('forecast_id', ids); for (const r of (data ?? []) as Array<{ forecast_id: string; result: string | null }>) scoreResult.set(r.forecast_id, r.result); }
  } catch { /* ignore */ }

  return {
    active, resolved: perf.resolved, correct, incorrect, expired: perf.expired,
    accuracy: perf.accuracy, calibrationScore: perf.calibrationScore, resolutionRate: perf.resolutionRate,
    calibration: calib.map((b) => ({ bucket: b.bucket, predictedConfidence: b.predictedConfidence, actualAccuracy: b.actualAccuracy, count: b.count })),
    accuracyTrend: snaps.map((s) => ({ at: s.snapshotAt, accuracy: s.accuracy, calibration: s.calibrationScore, volume: s.volume })),
    resolutionTimeline: resolvedList.map((f) => toPublicForecast(f, scoreResult.get(f.id) ?? null)),
    activeForecasts: activeList.map((f) => toPublicForecast(f, scoreResult.get(f.id) ?? null)),
  };
}

// ---- narratives (Phase 65, public-safe) ------------------------------------

async function loadNarratives(): Promise<NarrativeTransparency> {
  const empty: NarrativeTransparency = { byStatus: {}, emerging: [], growing: [], dominant: [], fragmenting: [], declining: [] };
  const c = readPublicClient();
  if (!c) return empty;
  const narratives = (await listNarrativesDal(c, { limit: 300 })).filter((nNar) => nNar.status !== 'archived');
  const snaps = await latestSnapshotByNarrative(c);
  const metrics = await latestMetricsByNarrative(c);
  const byStatus: Record<string, number> = {};
  const toPublic = (nNar: { id: string; name: string; status: string }): PublicNarrative => {
    const s = snaps.get(nNar.id); const m = metrics.get(nNar.id);
    return { id: nNar.id, name: nNar.name, status: nNar.status, sourceDiversity: m?.sourceDiversity ?? null, evidenceDensity: m?.evidenceDensity ?? null, contradictionRatio: s?.contradictionRatio ?? m?.contradiction ?? null, stabilityScore: s?.stabilityScore ?? m?.stability ?? null };
  };
  for (const nNar of narratives) byStatus[nNar.status] = (byStatus[nNar.status] ?? 0) + 1;
  const pick = (status: string) => narratives.filter((nNar) => nNar.status === status).map(toPublic).slice(0, 12);
  return { byStatus, emerging: pick('emerging'), growing: pick('active'), dominant: pick('dominant'), fragmenting: pick('fragmenting'), declining: pick('declining') };
}

// ---- sources (Phase 61 + 63, public-safe) ----------------------------------

async function loadSources(): Promise<SourceTransparency> {
  const rel = await getSourceReliability();
  const stale = rel.sources.filter((s) => s.lastSuccessAgeDays != null && s.lastSuccessAgeDays > 7).length;
  const sources: PublicSource[] = [...rel.sources]
    .sort((a, b) => a.score - b.score)
    .slice(0, 100)
    .map((s) => ({ name: s.name, type: s.type, status: s.status, score: s.score, successPct: s.successPct, consecutiveFailures: s.consecutiveFailures, lastSuccessLabel: s.lastSuccessLabel }));
  const dist = new Map<string, number>([['Excellent', 0], ['Healthy', 0], ['At Risk', 0], ['Failing', 0]]);
  for (const s of rel.sources) dist.set(s.tier, (dist.get(s.tier) ?? 0) + 1);
  return {
    total: rel.breakdown.total, active: rel.breakdown.active, healthy: rel.breakdown.healthy,
    warning: rel.breakdown.warning, failed: rel.breakdown.failed, blocked: rel.breakdown.blocked, stale,
    collectionSuccessPct: rel.analytics.successPct, failureCount: rel.breakdown.failed + rel.breakdown.blocked,
    mostReliable: rel.summary.mostReliable, mostFragile: rel.summary.mostFragile,
    reliabilityDistribution: Array.from(dist.entries()).map(([tier, count]) => ({ tier, count })),
    sources,
  };
}

// ---- corrections (public correction log) -----------------------------------

async function loadCorrections(): Promise<CorrectionTransparency> {
  const empty: CorrectionTransparency = { retractions: 0, revisions: 0, entries: [] };
  const c = readPublicClient();
  if (!c) return empty;
  try {
    const { data } = await c.from('hsin_publication_versions').select('id, publication_id, from_state, to_state, reason, created_at').not('reason', 'is', null).order('created_at', { ascending: false }).limit(100);
    const rows = (data ?? []) as Array<{ id: string; publication_id: string | null; from_state: string | null; to_state: string | null; reason: string | null; created_at: string }>;
    // resolve publication titles (only PUBLISHED/RETRACTED are world-readable)
    const pubIds = Array.from(new Set(rows.map((r) => r.publication_id).filter((x): x is string => !!x)));
    const titleById = new Map<string, string>();
    if (pubIds.length) {
      const { data: pubs } = await c.from('hsin_publications').select('id, title, state').in('id', pubIds);
      for (const p of (pubs ?? []) as Array<{ id: string; title: string | null; state: string | null }>) if (p.state === 'PUBLISHED' || p.state === 'RETRACTED') titleById.set(p.id, p.title ?? 'Publication');
    }
    const entries: PublicCorrection[] = rows
      .filter((r) => r.publication_id && titleById.has(r.publication_id))
      .map((r) => ({ id: r.id, publicationTitle: titleById.get(r.publication_id!) ?? 'Publication', fromState: r.from_state, toState: r.to_state ?? '—', reason: r.reason, at: r.created_at, kind: r.to_state === 'RETRACTED' ? 'retraction' as const : 'revision' as const }));
    return { retractions: entries.filter((e) => e.kind === 'retraction').length, revisions: entries.filter((e) => e.kind === 'revision').length, entries };
  } catch { return empty; }
}

// ---- cached public services -------------------------------------------------

const TAGS = ['source-intelligence'];
export const getTransparencyOverview = unstable_cache(loadOverview, ['transparency:overview:v1'], { revalidate: 300, tags: TAGS });
export const getForecastTransparency = unstable_cache(loadForecasts, ['transparency:forecasts:v1'], { revalidate: 300, tags: TAGS });
export const getNarrativeTransparency = unstable_cache(loadNarratives, ['transparency:narratives:v1'], { revalidate: 300, tags: TAGS });
export const getSourceTransparency = unstable_cache(loadSources, ['transparency:sources:v1'], { revalidate: 300, tags: TAGS });
export const getCorrectionTransparency = unstable_cache(loadCorrections, ['transparency:corrections:v1'], { revalidate: 300, tags: TAGS });
