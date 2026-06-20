// =============================================================================
// HSI Phase 70.3.3 — Source Network Intelligence DAL (SERVER-ONLY, reviewer+).
// Loads REAL rows (hsin_sources, source_monitoring_state, source_capture_events,
// hsin_source_trust, hsin_signals, hsin_evidence_claims, public_reports,
// source_candidates) and assembles the network view via the pure classifiers.
// Never throws — degrades to empty. Nothing here activates/publishes/crawls.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { getSourceIdentityKey, domainOf } from '@/lib/source-discovery/duplicates';
import { computeSourceHealth } from './health';
import { computeCollectionCapability } from './capability';
import { computeGeoReadiness } from './geo';
import { computeCollectionPriority } from './priority';
import { summarizeYield, EMPTY_YIELD } from './yield';
import { groupSourceFamilies } from './family';
import { recommendNextAction } from './advice';
import type {
  SourceHealth, CapabilityTier, GeoReadiness, CollectionPriority, YieldSummary, YieldCounts, SourceFamily, FamilyInput,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SourceNetworkRow {
  id: string; name: string; sourceType: string | null; platform: string | null; homepageUrl: string | null; feedUrl: string | null;
  category: string | null; status: string | null;
  health: SourceHealth; healthReason: string;
  capabilityTier: CapabilityTier; capabilityScore: number; capabilityReason: string;
  geoReadiness: GeoReadiness; geoReason: string;
  priority: CollectionPriority; priorityReason: string;
  yield: YieldSummary;
  trustScore: number | null; trustBand: string | null;
  identityKey: string | null; familyKey: string;
  nextAction: string;
}

// ---- raw row shapes (only the columns we read) ------------------------------
interface SrcRow { id: string; name: string | null; source_type: string | null; platform: string | null; homepage_url: string | null; rss_url: string | null; status: string | null; risk_level: number | null; monitoring_enabled: boolean | null; }
interface MonRow { source_id: string | null; source_name: string | null; state: string | null; last_success_at: string | null; last_failure_at: string | null; }
interface TrustRow { source_id: string; trust_score: number | null; band: string | null; }
interface EventRow { source_id: string | null; status: string | null; captured_at: string | null; }
interface SignalRow { source_id: string | null; captured_at: string | null; created_at: string | null; }
interface CandRow { source_id: string | null; classification_category: string | null; tags: string[] | null; identity_key: string | null; country: string | null; region: string | null; city: string | null; latitude: number | null; longitude: number | null; geo_confidence: number | null; geo_source: string | null; }

async function safe<T>(p: PromiseLike<{ data: T | null }>, fallback: T): Promise<T> {
  try { const { data } = await p; return (data as T) ?? fallback; } catch { return fallback; }
}

function ageDays(iso: string | null, now: number): number | null {
  if (!iso) return null; const t = new Date(iso).getTime(); return Number.isNaN(t) ? null : (now - t) / DAY_MS;
}

interface NetworkBundle {
  sources: SrcRow[]; mon: Map<string, MonRow>; monByName: Map<string, MonRow>; trust: Map<string, TrustRow>;
  eventsBySource: Map<string, EventRow[]>; signalsBySource: Map<string, SignalRow[]>;
  evidenceByDomain: Map<string, number>; reportsBySource: Map<string, number>;
  candBySource: Map<string, CandRow>; watchlistTerms: string[]; narrativeNames: string[];
}

async function loadBundle(db: ReturnType<typeof createClient>): Promise<NetworkBundle> {
  const [sources, monRows, trustRows, eventRows, signalRows, evidenceRows, reportRows, candRows, signalIdRows, wlRows, narrRows] = await Promise.all([
    safe(db.from('hsin_sources').select('id, name, source_type, platform, homepage_url, rss_url, status, risk_level, monitoring_enabled').limit(5000), [] as SrcRow[]),
    safe(db.from('source_monitoring_state').select('source_id, source_name, state, last_success_at, last_failure_at').limit(5000), [] as MonRow[]),
    safe(db.from('hsin_source_trust').select('source_id, trust_score, band').limit(5000), [] as TrustRow[]),
    safe(db.from('source_capture_events').select('source_id, status, captured_at').order('captured_at', { ascending: false }).limit(8000), [] as EventRow[]),
    safe(db.from('hsin_signals').select('source_id, captured_at, created_at').limit(20000), [] as SignalRow[]),
    safe(db.from('hsin_evidence_claims').select('source_ref').limit(20000), [] as { source_ref: string | null }[]),
    safe(db.from('public_reports').select('signal_id').limit(20000), [] as { signal_id: string | null }[]),
    safe(db.from('source_candidates').select('source_id, classification_category, tags, identity_key, country, region, city, latitude, longitude, geo_confidence, geo_source').not('source_id', 'is', null).limit(10000), [] as CandRow[]),
    safe(db.from('hsin_signals').select('id, source_id').limit(20000), [] as { id: string; source_id: string | null }[]),
    safe(db.from('hsin_watchlists').select('terms').limit(1000), [] as { terms: string[] | null }[]),
    safe(db.from('narratives').select('name').neq('status', 'archived').limit(2000), [] as { name: string | null }[]),
  ]);

  const mon = new Map<string, MonRow>(); const monByName = new Map<string, MonRow>();
  for (const m of monRows) { if (m.source_id) mon.set(m.source_id, m); if (m.source_name) monByName.set(m.source_name.toLowerCase(), m); }
  const trust = new Map<string, TrustRow>(); for (const t of trustRows) if (t.source_id) trust.set(t.source_id, t);

  const eventsBySource = new Map<string, EventRow[]>();
  for (const e of eventRows) { if (!e.source_id) continue; const a = eventsBySource.get(e.source_id) ?? []; if (a.length < 10) a.push(e); eventsBySource.set(e.source_id, a); }

  const signalsBySource = new Map<string, SignalRow[]>();
  for (const s of signalRows) { if (!s.source_id) continue; const a = signalsBySource.get(s.source_id) ?? []; a.push(s); signalsBySource.set(s.source_id, a); }

  // evidence by domain (source_ref is a free-text URL/reference)
  const evidenceByDomain = new Map<string, number>();
  for (const ev of evidenceRows) { const d = domainOf(ev.source_ref); if (!d) continue; evidenceByDomain.set(d, (evidenceByDomain.get(d) ?? 0) + 1); }

  // reports per source: public_reports.signal_id → signal.source_id
  const signalToSource = new Map<string, string>();
  for (const r of signalIdRows) if (r.id && r.source_id) signalToSource.set(r.id, r.source_id);
  const reportsBySource = new Map<string, number>();
  for (const rep of reportRows) { const sid = rep.signal_id ? signalToSource.get(rep.signal_id) : null; if (!sid) continue; reportsBySource.set(sid, (reportsBySource.get(sid) ?? 0) + 1); }

  const candBySource = new Map<string, CandRow>();
  for (const c of candRows) if (c.source_id) candBySource.set(c.source_id, c);

  const watchlistTerms = wlRows.flatMap((w) => (w.terms ?? [])).map((t) => t.toLowerCase());
  const narrativeNames = narrRows.map((n) => (n.name ?? '').toLowerCase()).filter(Boolean);

  return { sources, mon, monByName, trust, eventsBySource, signalsBySource, evidenceByDomain, reportsBySource, candBySource, watchlistTerms, narrativeNames };
}

function computeYield(b: NetworkBundle, src: SrcRow, now: number): YieldCounts {
  const signals = b.signalsBySource.get(src.id) ?? [];
  let recent = 0; let prior = 0; let lastAt: string | null = null;
  for (const s of signals) {
    const when = s.captured_at ?? s.created_at;
    const age = ageDays(when, now);
    if (age != null) { if (age <= 30) recent++; else if (age <= 60) prior++; }
    if (when && (!lastAt || new Date(when).getTime() > new Date(lastAt).getTime())) lastAt = when;
  }
  const dom = domainOf(src.homepage_url || src.rss_url);
  const evidence = dom ? (b.evidenceByDomain.get(dom) ?? 0) : 0;
  const reports = b.reportsBySource.get(src.id) ?? 0;
  // narratives/forecasts: no reliable per-source attribution path exists in the
  // current schema (narratives/forecasts key off graph nodes, not source_id).
  // Reported as 0 / not-yet-observed rather than fabricated. See docs.
  return { ...EMPTY_YIELD, signals: signals.length, evidence, reports, lastSignalAt: lastAt, signalsRecent: recent, signalsPrior: prior };
}

function relevance(text: string, terms: string[]): boolean {
  if (!text || terms.length === 0) return false;
  const t = text.toLowerCase();
  return terms.some((term) => term.length > 3 && t.includes(term));
}

function buildRow(b: NetworkBundle, src: SrcRow, now: number, nowIso: string): SourceNetworkRow {
  const mon = b.mon.get(src.id) ?? (src.name ? b.monByName.get(src.name.toLowerCase()) : undefined);
  const trust = b.trust.get(src.id);
  const cand = b.candBySource.get(src.id);
  const events = b.eventsBySource.get(src.id) ?? [];

  const health = computeSourceHealth({
    status: src.status, monitoringEnabled: src.monitoring_enabled, monitoringState: mon?.state ?? null,
    lastSuccessAt: mon?.last_success_at ?? null, lastFailureAt: mon?.last_failure_at ?? null,
    recentEvents: events.map((e) => ({ status: e.status, capturedAt: e.captured_at })), nowIso,
  });
  const blocked = health.value === 'blocked';
  const capability = computeCollectionCapability({
    sourceType: src.source_type, hasFeed: !!src.rss_url, hasUrl: !!src.homepage_url, ingestionMode: null, blocked,
  });
  const geo = computeGeoReadiness({
    sourceType: src.source_type, country: cand?.country ?? null, region: cand?.region ?? null, city: cand?.city ?? null,
    latitude: cand?.latitude ?? null, longitude: cand?.longitude ?? null, geoConfidence: cand?.geo_confidence ?? null, geoSource: cand?.geo_source ?? null,
  });
  const yieldCounts = computeYield(b, src, now);
  const yieldSummary = summarizeYield(yieldCounts);

  const text = `${src.name ?? ''} ${cand?.tags?.join(' ') ?? ''}`;
  const priority = computeCollectionPriority({
    baselineRisk: src.risk_level, category: cand?.classification_category ?? null, sourceType: src.source_type,
    signals: yieldCounts.signals, trustScore: trust?.trust_score ?? null,
    watchlistRelevant: relevance(text, b.watchlistTerms), narrativeRelevant: relevance(text, b.narrativeNames),
    manualPriority: null, health: health.value,
  });

  const identityKey = cand?.identity_key ?? getSourceIdentityKey({ sourceType: src.source_type, primaryUrl: src.homepage_url, feedOrApiUrl: src.rss_url }).identityKey;
  const familyInput: FamilyInput = {
    id: src.id, name: src.name, homepageUrl: src.homepage_url, feedUrl: src.rss_url, sourceType: src.source_type,
    identityKey, platform: src.platform, tags: cand?.tags ?? [], organization: null,
  };

  return {
    id: src.id, name: src.name ?? 'Source', sourceType: src.source_type, platform: src.platform, homepageUrl: src.homepage_url, feedUrl: src.rss_url,
    category: cand?.classification_category ?? null, status: src.status,
    health: health.value, healthReason: health.reason,
    capabilityTier: capability.tier, capabilityScore: capability.score, capabilityReason: capability.reason,
    geoReadiness: geo.value, geoReason: geo.reason,
    priority: priority.value, priorityReason: priority.reason,
    yield: yieldSummary,
    trustScore: trust?.trust_score ?? null, trustBand: trust?.band ?? null,
    identityKey, familyKey: '', // filled after family grouping
    nextAction: recommendNextAction({ health: health.value, capabilityTier: capability.tier, geoReadiness: geo.value, yieldObserved: yieldSummary.observed, status: src.status, hasFeed: !!src.rss_url }),
  };
}

export interface SourceNetworkDashboard {
  rows: SourceNetworkRow[];
  totals: { total: number; active: number; paused: number; blocked: number; archived: number; offline: number; degraded: number; healthy: number; unknown: number };
  healthBreakdown: { health: SourceHealth; count: number }[];
  capabilityBreakdown: { tier: CapabilityTier; count: number }[];
  priorityBreakdown: { priority: CollectionPriority; count: number }[];
  geoBreakdown: { readiness: GeoReadiness; count: number }[];
  topYield: SourceNetworkRow[];
  lowYield: SourceNetworkRow[];
  missingFeed: SourceNetworkRow[];
  needsReview: SourceNetworkRow[];
  priorityQueue: SourceNetworkRow[];
  families: SourceFamily[];
}

const PRIORITY_RANK: Record<CollectionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3, archive: 4 };

export async function getSourceNetworkDashboard(): Promise<SourceNetworkDashboard> {
  const db = createClient();
  const nowIso = new Date().toISOString();
  const now = new Date(nowIso).getTime();
  const b = await loadBundle(db);

  const rows = b.sources.map((s) => buildRow(b, s, now, nowIso));

  // families (and back-fill familyKey on rows)
  const families = groupSourceFamilies(rows.map((r) => ({ id: r.id, name: r.name, homepageUrl: r.homepageUrl, feedUrl: r.feedUrl, sourceType: r.sourceType, identityKey: r.identityKey, platform: r.platform, tags: [], organization: null })));
  const familyKeyById = new Map<string, string>();
  for (const f of families) for (const id of f.memberIds) familyKeyById.set(id, f.familyKey);
  for (const r of rows) r.familyKey = familyKeyById.get(r.id) ?? '';

  const count = <K extends string>(key: (r: SourceNetworkRow) => K, keys: readonly K[]) => keys.map((k) => ({ k, count: rows.filter((r) => key(r) === k).length }));

  const totals = {
    total: rows.length,
    active: rows.filter((r) => (r.status ?? '') === 'active').length,
    paused: rows.filter((r) => r.health === 'paused').length,
    blocked: rows.filter((r) => r.health === 'blocked').length,
    archived: rows.filter((r) => r.health === 'archived').length,
    offline: rows.filter((r) => r.health === 'offline').length,
    degraded: rows.filter((r) => r.health === 'degraded').length,
    healthy: rows.filter((r) => r.health === 'healthy').length,
    unknown: rows.filter((r) => r.health === 'unknown').length,
  };

  const SORTED = [...rows];
  const topYield = [...SORTED].sort((a, b2) => b2.yield.total - a.yield.total).filter((r) => r.yield.total > 0).slice(0, 10);
  const lowYield = [...SORTED].filter((r) => r.yield.total === 0 && r.health !== 'archived').slice(0, 10);
  const missingFeed = SORTED.filter((r) => !r.feedUrl && (r.capabilityTier === 'medium' || r.capabilityTier === 'low')).slice(0, 25);
  const needsReview = SORTED.filter((r) => r.health === 'offline' || r.health === 'blocked' || r.health === 'degraded').slice(0, 25);
  const priorityQueue = [...SORTED].sort((a, b2) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b2.priority] || b2.yield.signals - a.yield.signals).slice(0, 25);

  return {
    rows, totals,
    healthBreakdown: count((r) => r.health, ['healthy', 'degraded', 'offline', 'blocked', 'paused', 'archived', 'unknown'] as const).map(({ k, count }) => ({ health: k, count })),
    capabilityBreakdown: count((r) => r.capabilityTier, ['high', 'medium', 'low', 'manual', 'degraded'] as const).map(({ k, count }) => ({ tier: k, count })),
    priorityBreakdown: count((r) => r.priority, ['critical', 'high', 'medium', 'low', 'archive'] as const).map(({ k, count }) => ({ priority: k, count })),
    geoBreakdown: count((r) => r.geoReadiness, ['geo_ready', 'partial_geo', 'missing_geo', 'not_applicable'] as const).map(({ k, count }) => ({ readiness: k, count })),
    topYield, lowYield, missingFeed, needsReview, priorityQueue, families,
  };
}

// ---- source detail ----------------------------------------------------------

export interface SourceNetworkDetail {
  row: SourceNetworkRow;
  family: SourceFamily | null;
  linkedSignals: { id: string; whenLabel: string }[];
  evidenceCount: number; reportsCount: number; narrativesCount: number; forecastsCount: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dlabel(iso: string | null): string { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; }

export async function getSourceNetworkDetail(id: string): Promise<SourceNetworkDetail | null> {
  const db = createClient();
  const nowIso = new Date().toISOString();
  const now = new Date(nowIso).getTime();
  const b = await loadBundle(db);
  const src = b.sources.find((s) => s.id === id);
  if (!src) return null;

  const row = buildRow(b, src, now, nowIso);
  const families = groupSourceFamilies(b.sources.map((s) => ({ id: s.id, name: s.name, homepageUrl: s.homepage_url, feedUrl: s.rss_url, sourceType: s.source_type, identityKey: b.candBySource.get(s.id)?.identity_key ?? getSourceIdentityKey({ sourceType: s.source_type, primaryUrl: s.homepage_url, feedOrApiUrl: s.rss_url }).identityKey, platform: s.platform, tags: [], organization: null })));
  const family = families.find((f) => f.memberIds.includes(id)) ?? null;
  if (family) row.familyKey = family.familyKey;

  const linkedSignals = (b.signalsBySource.get(id) ?? [])
    .sort((a, c) => new Date(c.captured_at ?? c.created_at ?? 0).getTime() - new Date(a.captured_at ?? a.created_at ?? 0).getTime())
    .slice(0, 20)
    .map((s, i) => ({ id: `${id}-sig-${i}`, whenLabel: dlabel(s.captured_at ?? s.created_at) }));

  return {
    row, family, linkedSignals,
    evidenceCount: row.yield.evidence, reportsCount: row.yield.reports,
    narrativesCount: 0, forecastsCount: 0, // no per-source attribution path (documented)
  };
}

// ---- Phase 71 readiness report ---------------------------------------------

export interface Phase71Readiness {
  geoReadySources: number; partialGeoSources: number; missingGeoSources: number; notApplicableSources: number;
  geoReadyCandidates: number; partialGeoCandidates: number; missingGeoCandidates: number;
  geoReadySignals: number; geoReadyNarratives: number; geoReadyForecasts: number;
  topMapReadyCategories: { category: string; count: number }[];
  biggestGaps: string[];
}

export async function getPhase71Readiness(): Promise<Phase71Readiness> {
  const db = createClient();
  const b = await loadBundle(db);
  const nowIso = new Date().toISOString(); const now = new Date(nowIso).getTime();
  const rows = b.sources.map((s) => buildRow(b, s, now, nowIso));

  const geoReadySources = rows.filter((r) => r.geoReadiness === 'geo_ready').length;
  const partialGeoSources = rows.filter((r) => r.geoReadiness === 'partial_geo').length;
  const missingGeoSources = rows.filter((r) => r.geoReadiness === 'missing_geo').length;
  const notApplicableSources = rows.filter((r) => r.geoReadiness === 'not_applicable').length;

  // candidates carry real geo columns
  const cands = await safe(db.from('source_candidates').select('classification_category, latitude, longitude, country, region, city').limit(10000), [] as Array<{ classification_category: string | null; latitude: number | null; longitude: number | null; country: string | null; region: string | null; city: string | null }>);
  let geoReadyCandidates = 0; let partialGeoCandidates = 0; let missingGeoCandidates = 0;
  const catMap = new Map<string, number>();
  for (const c of cands) {
    const ready = c.latitude != null && c.longitude != null;
    const partial = !ready && (!!c.country || !!c.region || !!c.city);
    if (ready) { geoReadyCandidates++; const k = c.classification_category ?? 'unclassified'; catMap.set(k, (catMap.get(k) ?? 0) + 1); }
    else if (partial) partialGeoCandidates++; else missingGeoCandidates++;
  }
  const topMapReadyCategories = Array.from(catMap.entries()).map(([category, count]) => ({ category, count })).sort((a, c) => c.count - a.count).slice(0, 5);

  const gaps: string[] = [];
  if (geoReadySources + geoReadyCandidates === 0) gaps.push('No sources or candidates have coordinates yet — the map has no points to plot.');
  if (missingGeoSources > 0) gaps.push(`${missingGeoSources} active sources lack geo (hsin_sources has no geo columns; geo lives only on candidates).`);
  if (partialGeoSources + partialGeoCandidates > 0) gaps.push(`${partialGeoSources + partialGeoCandidates} have place text but no coordinates — geocoding would unlock them.`);
  gaps.push('Signals, narratives, and forecasts have no geo columns — they can only inherit location from their source.');

  return {
    geoReadySources, partialGeoSources, missingGeoSources, notApplicableSources,
    geoReadyCandidates, partialGeoCandidates, missingGeoCandidates,
    geoReadySignals: 0, geoReadyNarratives: 0, geoReadyForecasts: 0, // no geo columns on these tables (gap)
    topMapReadyCategories, biggestGaps: gaps,
  };
}
