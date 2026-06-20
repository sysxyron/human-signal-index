// =============================================================================
// HSI Phase 73 — Global Operations Center DAL (SERVER-ONLY, reviewer+).
// COMPOSES existing intelligence — source network (70.3), signal network (70.4),
// geospatial intelligence (72), geo readiness (72), plus exact COUNT queries for
// the executive overview. Adds deterministic mission status, attention queue,
// relationship integrity, and timeline. Real counts only; missing relationships
// are NOT OBSERVED. Memoized (Step 14). Degrades to empty.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { getSourceNetworkDashboard } from '@/lib/source-network/data';
import { getSignalNetworkDashboard, getSignalReadiness } from '@/lib/signal-network/data';
import { getGeospatialIntelligence } from '@/lib/narrative-map/data';
import { ratioStatus, inverseRatioStatus, backlogStatus, overallMission } from './mission';
import { buildAttentionQueue } from './attention';
import type { MissionStatus, MissionDomain, AttentionItem, IntegrityCheck, TimelineRow } from './types';

type DB = ReturnType<typeof createClient>;

async function countRows(db: DB, table: string): Promise<number> {
  try { const { count } = await db.from(table).select('id', { count: 'exact', head: true }); return count ?? 0; } catch { return 0; }
}
async function countWhere(db: DB, table: string, build: (q: any) => any): Promise<number> {
  try { const { count } = await build(db.from(table).select('id', { count: 'exact', head: true })); return count ?? 0; } catch { return 0; }
}
async function countSince(db: DB, table: string, iso: string): Promise<number> {
  return countWhere(db, table, (q) => q.gte('created_at', iso));
}

export interface ExecutiveOverview {
  sources: number; signals: number; narratives: number; evidence: number; forecasts: number;
  investigations: number; publishedReports: number; pendingReview: number; activeWatchlists: number; activeAlerts: number; trustRecords: number;
}

export interface IntelligenceHealth {
  source: { healthy: number; degraded: number; offline: number; unknown: number };
  signal: { healthy: number; degraded: number; offline: number; unknown: number }; // mapped from signal lifecycle
  trust: { high: number; medium: number; low: number; observed: number };
  map: { geoReady: number; partial: number; missing: number; total: number };
}

export interface OperationsCenterData {
  overview: ExecutiveOverview;
  mission: { overall: MissionStatus; domains: MissionDomain[] };
  attention: AttentionItem[];
  health: IntelligenceHealth;
  narrativeWatch: { top: { id: string; name: string; status: string | null; signalCount: number; evidenceCount: number; forecastCount: number }[]; mostContradicted: { key: string; contradicts: number; supports: number }[] };
  forecastWatch: { byStatus: { status: string; count: number }[]; lackingNarrative: number; total: number };
  geoWatch: { topCountries: { key: string; signalCount: number; narrativeCount: number }[]; highestTrust: { key: string; avg: number }[]; lowestTrust: { key: string; avg: number }[]; highestContradiction: { key: string; ratio: number }[]; blindSpots: { key: string; severity: string }[] };
  transparencyWatch: { signalWithSource: number; signalWithEvidence: number; signalWithNarrative: number; totalSignals: number; forecastWithNarrative: number; totalForecasts: number; brokenChains: number };
  integrity: IntegrityCheck[];
  timeline: TimelineRow[];
}

// NOTE (hotfix): NOT wrapped in unstable_cache — it composes cookie-bound RLS
// reads (createClient + the source/signal/geo network DALs). Caching cookie reads
// crashes the Server Component. The page is force-dynamic; per-user RLS preserved.
export async function getOperationsCenter(): Promise<OperationsCenterData> {
  const db = createClient();
  const nowIso = new Date().toISOString();
  const d7 = new Date(new Date(nowIso).getTime() - 7 * 86400000).toISOString();
  const d30 = new Date(new Date(nowIso).getTime() - 30 * 86400000).toISOString();

  const [srcNet, sigNet, sigReady, geo] = await Promise.all([
    getSourceNetworkDashboard(), getSignalNetworkDashboard(), getSignalReadiness(), getGeospatialIntelligence(),
  ]);

  // ---- executive overview (exact counts) -----------------------------------
  const [sources, signals, narratives, evidence, forecasts, investigations, publishedReports, pendingReview, activeWatchlists, activeAlerts, trustRecords] = await Promise.all([
    countRows(db, 'hsin_sources'), countRows(db, 'hsin_signals'), countRows(db, 'narratives'),
    countRows(db, 'hsin_evidence_claims'), countRows(db, 'forecasts'), countRows(db, 'hsin_investigations'),
    countWhere(db, 'public_reports', (q) => q.eq('published', true)),
    countWhere(db, 'hsin_signals', (q) => q.in('status', ['new', 'reviewing', 'needs_research'])),
    countRows(db, 'hsin_watchlists'),
    countWhere(db, 'source_monitoring_alerts', (q) => q.is('acknowledged_at', null)),
    countRows(db, 'hsin_source_trust'),
  ]);
  const overview: ExecutiveOverview = { sources, signals, narratives, evidence, forecasts, investigations, publishedReports, pendingReview, activeWatchlists, activeAlerts, trustRecords };

  // ---- intelligence health (reused) ----------------------------------------
  const st = srcNet.totals;
  const sigHealth = (k: string) => sigNet.healthBreakdown.find((b) => b.health === k)?.count ?? 0;
  const trustHigh = srcNet.rows.filter((r) => r.trustBand === 'high').length;
  const trustMed = srcNet.rows.filter((r) => r.trustBand === 'medium').length;
  const trustLow = srcNet.rows.filter((r) => r.trustBand === 'low').length;
  const health: IntelligenceHealth = {
    source: { healthy: st.healthy, degraded: st.degraded, offline: st.offline + st.blocked, unknown: st.unknown },
    signal: { healthy: sigHealth('ACTIVE') + sigHealth('ESCALATING'), degraded: sigHealth('CONTRADICTED'), offline: sigHealth('DORMANT') + sigHealth('ARCHIVED'), unknown: sigHealth('UNKNOWN') },
    trust: { high: trustHigh, medium: trustMed, low: trustLow, observed: trustHigh + trustMed + trustLow },
    map: { geoReady: geo.totals.sources, partial: 0, missing: Math.max(0, sources - geo.totals.sources), total: sources },
  };

  // ---- narrative watch (real counts) ---------------------------------------
  const top = sigNet.narrativeAttribution.slice(0, 10).map((nr) => ({ id: nr.id, name: nr.name, status: nr.status, signalCount: nr.signalCount, evidenceCount: nr.evidenceCount, forecastCount: nr.forecastCount }));
  const mostContradicted = [...geo.byRegion].filter((b) => b.contradicts > 0).sort((a, b) => b.contradicts - a.contradicts).slice(0, 8).map((b) => ({ key: b.key, contradicts: b.contradicts, supports: b.supports }));

  // ---- forecast watch ------------------------------------------------------
  const fcByStatus = await Promise.all((['draft', 'active', 'resolved', 'expired', 'cancelled'] as const).map(async (s) => ({ status: s, count: await countWhere(db, 'forecasts', (q) => q.eq('status', s)) })));
  const forecastsLackingNarrative = await countWhere(db, 'forecasts', (q) => q.is('narrative_id', null));

  // ---- geo watch -----------------------------------------------------------
  const trustRegions = geo.byCountry.filter((b) => b.trust.avg != null);
  const geoWatch = {
    topCountries: geo.byCountry.slice(0, 8).map((b) => ({ key: b.key, signalCount: b.signalCount, narrativeCount: b.narrativeCount })),
    highestTrust: [...trustRegions].sort((a, b) => (b.trust.avg ?? 0) - (a.trust.avg ?? 0)).slice(0, 5).map((b) => ({ key: b.key, avg: b.trust.avg as number })),
    lowestTrust: [...trustRegions].sort((a, b) => (a.trust.avg ?? 0) - (b.trust.avg ?? 0)).slice(0, 5).map((b) => ({ key: b.key, avg: b.trust.avg as number })),
    highestContradiction: [...geo.byCountry].filter((b) => b.contradictionRatio > 0).sort((a, b) => b.contradictionRatio - a.contradictionRatio).slice(0, 5).map((b) => ({ key: b.key, ratio: b.contradictionRatio })),
    blindSpots: geo.byRegion.filter((b) => b.blindSpot.isBlindSpot).slice(0, 8).map((b) => ({ key: b.key, severity: b.blindSpot.severity })),
  };

  // ---- transparency watch --------------------------------------------------
  const brokenChains = await countWhere(db, 'public_reports', (q) => q.eq('published', true).is('signal_id', null));
  const forecastsWithNarrative = Math.max(0, forecasts - forecastsLackingNarrative);
  const transparencyWatch = {
    signalWithSource: sigReady.withSourceLineage, signalWithEvidence: sigNet.totals.withEvidence, signalWithNarrative: sigNet.totals.withNarrative,
    totalSignals: sigReady.totalSignals, forecastWithNarrative: forecastsWithNarrative, totalForecasts: forecasts, brokenChains,
  };

  // ---- relationship integrity (NOT OBSERVED where uncomputable) -------------
  const [signalsWithoutSource, forecastsWithoutNarrative] = await Promise.all([
    countWhere(db, 'hsin_signals', (q) => q.is('source_id', null)),
    countWhere(db, 'forecasts', (q) => q.is('narrative_id', null)),
  ]);
  const memberNarrIds = await safeArray(db.from('narrative_members').select('narrative_id').limit(60000));
  const narrWithMembers = new Set(memberNarrIds.map((m) => m.narrative_id));
  const narrativesWithoutMembers = Math.max(0, narratives - narrWithMembers.size);
  const integrity: IntegrityCheck[] = [
    { key: 'signals_without_source', label: 'Signals without source', count: signalsWithoutSource, observed: true, note: 'hsin_signals.source_id is null.' },
    { key: 'forecasts_without_narrative', label: 'Forecasts without narrative', count: forecastsWithoutNarrative, observed: true, note: 'forecasts.narrative_id is null (geo/attribution unknown).' },
    { key: 'narratives_without_members', label: 'Narratives without members', count: narrativesWithoutMembers, observed: true, note: 'No rows in narrative_members.' },
    { key: 'broken_transparency_links', label: 'Broken transparency links', count: brokenChains, observed: true, note: 'Published reports with no linked signal.' },
    { key: 'broken_graph_edges', label: 'Broken graph edges', count: 0, observed: true, note: 'Foreign-key enforced — structurally impossible.' },
    { key: 'evidence_without_signal', label: 'Evidence without signal', count: null, observed: false, note: 'NOT OBSERVED — no direct evidence→signal column; would require full graph traversal.' },
    { key: 'orphaned_records', label: 'Orphaned records (sum of observed)', count: signalsWithoutSource + forecastsWithoutNarrative + narrativesWithoutMembers, observed: true, note: 'Sum of the observable orphan checks above.' },
  ];

  // ---- timeline (exact counts via created_at windows) ----------------------
  const timeline: TimelineRow[] = await buildTimeline(db, d7, d30);

  // ---- attention queue (deterministic) -------------------------------------
  const missingFeeds = srcNet.rows.filter((r) => r.capabilityTier === 'medium' || r.capabilityTier === 'low').length;
  const narrativesMissingEvidence = sigNet.narrativeAttribution.filter((nr) => nr.evidenceCount === 0 && nr.signalCount > 0).length;
  const signalsMissingAttribution = sigNet.rows.filter((r) => !r.attribution.hasRelationship && !r.attribution.hasSourceLineage).length;
  const forecastsAwaitingReview = await countWhere(db, 'forecasts', (q) => q.eq('status', 'active').lte('resolution_date', nowIso));
  const attention = buildAttentionQueue({
    blockedSources: st.blocked, offlineSources: st.offline, missingFeeds, lowTrustSources: trustLow,
    blindSpots: geoWatch.blindSpots.length, forecastsAwaitingReview, narrativesMissingEvidence, signalsMissingAttribution,
    missingGeoSources: health.map.missing, brokenTransparencyChains: brokenChains,
  });

  // ---- mission summary (documented thresholds) -----------------------------
  const sourceTotal = st.total;
  const domains: MissionDomain[] = [
    mk('system', 'System Health', ratioStatus(st.healthy, sourceTotal), `${st.healthy}/${sourceTotal} sources healthy.`),
    mk('collection', 'Collection Health', inverseRatioStatus(st.offline + st.blocked, sourceTotal), `${st.offline + st.blocked}/${sourceTotal} sources offline/blocked.`),
    mk('review', 'Review Health', backlogStatus(pendingReview), `${pendingReview} signals pending review.`),
    mk('trust', 'Trust Health', ratioStatus(trustHigh + trustMed, health.trust.observed), `${trustHigh + trustMed}/${health.trust.observed} scored sources at medium+ trust.`),
    mk('forecast', 'Forecast Health', ratioStatus(forecastsWithNarrative, forecasts), `${forecastsWithNarrative}/${forecasts} forecasts have narrative attribution.`),
    mk('geo', 'Geo Health', ratioStatus(geo.totals.sources, sources), `${geo.totals.sources}/${sources} sources are map-ready.`),
    mk('transparency', 'Transparency Health', inverseRatioStatus(brokenChains, overview.publishedReports), `${brokenChains}/${overview.publishedReports} published reports untraceable.`),
  ];

  return {
    overview, mission: { overall: overallMission(domains), domains }, attention, health,
    narrativeWatch: { top, mostContradicted },
    forecastWatch: { byStatus: fcByStatus, lackingNarrative: forecastsLackingNarrative, total: forecasts },
    geoWatch, transparencyWatch, integrity, timeline,
  };
}

function mk(key: string, label: string, status: MissionStatus, detail: string): MissionDomain { return { key, label, status, detail }; }

async function safeArray<T>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try { const { data } = await p; return data ?? []; } catch { return []; }
}

async function buildTimeline(db: DB, d7: string, d30: string): Promise<TimelineRow[]> {
  const specs: Array<{ label: string; table: string }> = [
    { label: 'New sources', table: 'hsin_sources' }, { label: 'New signals', table: 'hsin_signals' },
    { label: 'New narratives', table: 'narratives' }, { label: 'New evidence', table: 'hsin_evidence_claims' },
    { label: 'New forecasts', table: 'forecasts' }, { label: 'New investigations', table: 'hsin_investigations' },
  ];
  const rows = await Promise.all(specs.map(async (s) => ({ label: s.label, last7: await countSince(db, s.table, d7), last30: await countSince(db, s.table, d30) })));
  return rows;
}

