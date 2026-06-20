// =============================================================================
// HSI Phase 70.4 — Signal Network Intelligence DAL (SERVER-ONLY, reviewer+).
// READS existing intelligence only: hsin_signals + the Phase 64 evidence graph
// (graph_nodes/graph_edges) + Phase 65 narratives (narrative_members) + Phase 67
// forecasts + source geo (source_candidates). It NEVER creates nodes/edges,
// never infers relationships, never fabricates metrics. Degrades to empty.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { computeSignalHealth, signalHealthLabel } from './health';
import { summarizeInfluence, influenceRank, attributionFlags, EMPTY_INFLUENCE } from './influence';
import { tallyRelationships, type EdgeRef } from './relationships';
import type { SignalHealth, InfluenceSummary, AttributionFlags, SignalRelationship } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 30;

async function safe<T>(p: PromiseLike<{ data: T | null }>, fb: T): Promise<T> {
  try { const { data } = await p; return (data as T) ?? fb; } catch { return fb; }
}
function ageDays(iso: string | null, now: number): number | null { if (!iso) return null; const t = new Date(iso).getTime(); return Number.isNaN(t) ? null : (now - t) / DAY_MS; }

// ---- raw shapes -------------------------------------------------------------
interface SignalRow { id: string; source_id: string | null; title: string | null; summary: string | null; signal_type: string | null; signal_category: string | null; confidence: number | null; status: string | null; captured_at: string | null; created_at: string | null; }
interface NodeRow { id: string; node_type: string; entity_id: string; label: string | null; created_at: string | null; }
interface EdgeRow { id: string; source_node_id: string; target_node_id: string; relationship_type: string; created_at: string | null; }
interface MemberRow { narrative_id: string; node_id: string; member_type: string | null; created_at: string | null; }
interface NarrativeRow { id: string; name: string | null; status: string | null; }
interface ForecastRow { id: string; title: string | null; status: string | null; narrative_id: string | null; graph_node_id: string | null; }

export interface SignalNetworkRow {
  id: string; title: string; sourceId: string | null; category: string | null; status: string | null; createdLabel: string;
  health: SignalHealth; healthReason: string;
  influence: InfluenceSummary; rank: number;
  relationships: Record<SignalRelationship, number>; relationshipTotal: number;
  narrativeIds: string[]; forecastIds: string[];
  attribution: AttributionFlags;
}

interface Bundle {
  signals: SignalRow[];
  nodeIdBySignal: Map<string, string>; signalByNodeId: Map<string, string>;
  nodeById: Map<string, NodeRow>; realNodeIds: Set<string>;
  edgesByNode: Map<string, EdgeRow[]>;
  narrativesByNode: Map<string, { narrativeId: string; createdAt: string | null }[]>;
  signalsByNarrative: Map<string, Set<string>>; evidenceByNarrative: Map<string, number>;
  narrativeById: Map<string, NarrativeRow>;
  forecastsByNarrative: Map<string, ForecastRow[]>; forecastsByNode: Map<string, ForecastRow[]>;
  geoSourceIds: Set<string>; sourceNameById: Map<string, string>;
  forecasts: ForecastRow[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dlabel(iso: string | null): string { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; }

async function loadBundle(db: ReturnType<typeof createClient>): Promise<Bundle> {
  const [signals, nodes, edges, members, narrs, forecasts, cands, sources] = await Promise.all([
    safe(db.from('hsin_signals').select('id, source_id, title, summary, signal_type, signal_category, confidence, status, captured_at, created_at').limit(20000), [] as SignalRow[]),
    safe(db.from('graph_nodes').select('id, node_type, entity_id, label, created_at').limit(40000), [] as NodeRow[]),
    safe(db.from('graph_edges').select('id, source_node_id, target_node_id, relationship_type, created_at').limit(60000), [] as EdgeRow[]),
    safe(db.from('narrative_members').select('narrative_id, node_id, member_type, created_at').limit(40000), [] as MemberRow[]),
    safe(db.from('narratives').select('id, name, status').limit(5000), [] as NarrativeRow[]),
    safe(db.from('forecasts').select('id, title, status, narrative_id, graph_node_id').limit(10000), [] as ForecastRow[]),
    safe(db.from('source_candidates').select('source_id, latitude, longitude').not('source_id', 'is', null).limit(10000), [] as Array<{ source_id: string | null; latitude: number | null; longitude: number | null }>),
    safe(db.from('hsin_sources').select('id, name').limit(5000), [] as Array<{ id: string; name: string | null }>),
  ]);

  const nodeById = new Map<string, NodeRow>(); const realNodeIds = new Set<string>();
  const nodeIdBySignal = new Map<string, string>(); const signalByNodeId = new Map<string, string>();
  for (const nd of nodes) {
    nodeById.set(nd.id, nd); realNodeIds.add(nd.id);
    if (nd.node_type === 'SIGNAL') { nodeIdBySignal.set(nd.entity_id, nd.id); signalByNodeId.set(nd.id, nd.entity_id); }
  }

  const edgesByNode = new Map<string, EdgeRow[]>();
  for (const e of edges) {
    (edgesByNode.get(e.source_node_id) ?? edgesByNode.set(e.source_node_id, []).get(e.source_node_id)!).push(e);
    (edgesByNode.get(e.target_node_id) ?? edgesByNode.set(e.target_node_id, []).get(e.target_node_id)!).push(e);
  }

  const narrativesByNode = new Map<string, { narrativeId: string; createdAt: string | null }[]>();
  const signalsByNarrative = new Map<string, Set<string>>(); const evidenceByNarrative = new Map<string, number>();
  for (const m of members) {
    (narrativesByNode.get(m.node_id) ?? narrativesByNode.set(m.node_id, []).get(m.node_id)!).push({ narrativeId: m.narrative_id, createdAt: m.created_at });
    const nd = nodeById.get(m.node_id);
    if (nd?.node_type === 'SIGNAL') { (signalsByNarrative.get(m.narrative_id) ?? signalsByNarrative.set(m.narrative_id, new Set()).get(m.narrative_id)!).add(nd.entity_id); }
    if (nd && (nd.node_type === 'EVIDENCE' || nd.node_type === 'CLAIM')) evidenceByNarrative.set(m.narrative_id, (evidenceByNarrative.get(m.narrative_id) ?? 0) + 1);
  }

  const narrativeById = new Map<string, NarrativeRow>(); for (const nr of narrs) narrativeById.set(nr.id, nr);
  const forecastsByNarrative = new Map<string, ForecastRow[]>(); const forecastsByNode = new Map<string, ForecastRow[]>();
  for (const f of forecasts) {
    if (f.narrative_id) (forecastsByNarrative.get(f.narrative_id) ?? forecastsByNarrative.set(f.narrative_id, []).get(f.narrative_id)!).push(f);
    if (f.graph_node_id) (forecastsByNode.get(f.graph_node_id) ?? forecastsByNode.set(f.graph_node_id, []).get(f.graph_node_id)!).push(f);
  }

  const geoSourceIds = new Set<string>();
  for (const c of cands) if (c.source_id && c.latitude != null && c.longitude != null) geoSourceIds.add(c.source_id);
  const sourceNameById = new Map<string, string>(); for (const s of sources) sourceNameById.set(s.id, s.name ?? 'Source');

  return { signals, nodeIdBySignal, signalByNodeId, nodeById, realNodeIds, edgesByNode, narrativesByNode, signalsByNarrative, evidenceByNarrative, narrativeById, forecastsByNarrative, forecastsByNode, geoSourceIds, sourceNameById, forecasts };
}

interface PerSignal { row: SignalNetworkRow; nodeId: string | null; edges: EdgeRow[]; }

function computeSignal(b: Bundle, s: SignalRow, now: number, nowIso: string): PerSignal {
  const nodeId = b.nodeIdBySignal.get(s.id) ?? null;
  const edges = nodeId ? (b.edgesByNode.get(nodeId) ?? []) : [];

  const edgeRefs: EdgeRef[] = edges.map((e) => ({ relationshipType: e.relationship_type, otherNodeId: e.source_node_id === nodeId ? e.target_node_id : e.source_node_id, direction: e.target_node_id === nodeId ? 'incoming' : 'outgoing' }));
  const tally = tallyRelationships(edgeRefs, b.realNodeIds);

  let incomingContradicts = 0; let publishedAs = 0; let correctedBy = 0;
  const connected = new Set<string>(); let evidenceCount = 0; let reportCount = 0;
  let recentActivity = 0; let priorActivity = 0; let lastActivity: string | null = null;
  for (const e of edges) {
    const other = e.source_node_id === nodeId ? e.target_node_id : e.source_node_id;
    const incoming = e.target_node_id === nodeId;
    if (!b.realNodeIds.has(other)) continue;
    connected.add(other);
    if (incoming && e.relationship_type === 'CONTRADICTS') incomingContradicts++;
    if (e.relationship_type === 'PUBLISHED_AS') publishedAs++;
    if (e.relationship_type === 'CORRECTED_BY') correctedBy++;
    const ond = b.nodeById.get(other);
    if (ond?.node_type === 'EVIDENCE' || ond?.node_type === 'CLAIM') evidenceCount++;
    if (ond?.node_type === 'REPORT') reportCount++;
    const age = ageDays(e.created_at, now); if (age != null) { if (age <= RECENT_DAYS) recentActivity++; else if (age <= RECENT_DAYS * 2) priorActivity++; }
    if (e.created_at && (!lastActivity || new Date(e.created_at).getTime() > new Date(lastActivity).getTime())) lastActivity = e.created_at;
  }

  const memberships = nodeId ? (b.narrativesByNode.get(nodeId) ?? []) : [];
  const narrativeIds = Array.from(new Set(memberships.map((m) => m.narrativeId)));
  for (const m of memberships) { const age = ageDays(m.createdAt, now); if (age != null) { if (age <= RECENT_DAYS) recentActivity++; else if (age <= RECENT_DAYS * 2) priorActivity++; } if (m.createdAt && (!lastActivity || new Date(m.createdAt).getTime() > new Date(lastActivity).getTime())) lastActivity = m.createdAt; }

  // forecasts attributed via the signal's narratives or its own node
  const forecastIds = new Set<string>();
  for (const nid of narrativeIds) for (const f of (b.forecastsByNarrative.get(nid) ?? [])) forecastIds.add(f.id);
  if (nodeId) for (const f of (b.forecastsByNode.get(nodeId) ?? [])) forecastIds.add(f.id);

  const health = computeSignalHealth({
    hasNode: !!nodeId, signalStatus: s.status, incomingContradicts, publishedAsCount: publishedAs, correctedByCount: correctedBy,
    totalEdges: tally.total, narrativeCount: narrativeIds.length, recentActivity, priorActivity, lastActivityAt: lastActivity, nowIso,
  });

  const influence = summarizeInfluence({
    ...EMPTY_INFLUENCE, evidenceCount, reportCount, narrativeCount: narrativeIds.length, forecastCount: forecastIds.size,
    relationshipCount: tally.total, supportsCount: tally.byType.SUPPORTS, contradictsCount: tally.byType.CONTRADICTS,
    referencesCount: tally.byType.REFERENCES, derivedFromCount: tally.byType.DERIVED_FROM, relatedToCount: tally.byType.RELATED_TO,
    distinctConnectedNodes: connected.size, recentActivity,
  });

  const attribution = attributionFlags({ sourceId: s.source_id, narrativeCount: narrativeIds.length, forecastCount: forecastIds.size, relationshipCount: tally.total, evidenceCount, hasGeo: !!(s.source_id && b.geoSourceIds.has(s.source_id)) });

  return {
    nodeId, edges,
    row: {
      id: s.id, title: s.title ?? 'Signal', sourceId: s.source_id, category: s.signal_category, status: s.status, createdLabel: dlabel(s.captured_at ?? s.created_at),
      health: health.value, healthReason: health.reason, influence, rank: influenceRank(influence),
      relationships: tally.byType, relationshipTotal: tally.total, narrativeIds, forecastIds: Array.from(forecastIds), attribution,
    },
  };
}

// ---- dashboard (D6) ---------------------------------------------------------

export interface SignalNetworkDashboard {
  totals: { signals: number; withNarrative: number; withForecast: number; withRelationship: number; withEvidence: number };
  healthBreakdown: { health: SignalHealth; count: number }[];
  relationshipCounts: { type: SignalRelationship; count: number }[];
  topInfluence: SignalNetworkRow[];
  narrativeAttribution: { id: string; name: string; status: string | null; signalCount: number; evidenceCount: number; forecastCount: number }[];
  forecastAttribution: { id: string; title: string; status: string | null; narrativeId: string | null; narrativeName: string | null; signalCount: number; evidenceCount: number }[];
  rows: SignalNetworkRow[];
}

export async function getSignalNetworkDashboard(): Promise<SignalNetworkDashboard> {
  const db = createClient();
  const nowIso = new Date().toISOString(); const now = new Date(nowIso).getTime();
  const b = await loadBundle(db);
  const rows = b.signals.map((s) => computeSignal(b, s, now, nowIso).row);

  const healthKeys: SignalHealth[] = ['ESCALATING', 'ACTIVE', 'DORMANT', 'CONTRADICTED', 'RESOLVED', 'ARCHIVED', 'UNKNOWN'];
  const relKeys: SignalRelationship[] = ['SUPPORTS', 'CONTRADICTS', 'REFERENCES', 'DERIVED_FROM', 'RELATED_TO'];
  const relCounts = relKeys.map((t) => ({ type: t, count: rows.reduce((n, r) => n + r.relationships[t], 0) }));

  const narrativeAttribution = Array.from(b.signalsByNarrative.entries()).map(([id, sigs]) => ({
    id, name: b.narrativeById.get(id)?.name ?? 'Narrative', status: b.narrativeById.get(id)?.status ?? null,
    signalCount: sigs.size, evidenceCount: b.evidenceByNarrative.get(id) ?? 0, forecastCount: (b.forecastsByNarrative.get(id) ?? []).length,
  })).sort((a, c) => c.signalCount - a.signalCount).slice(0, 25);

  const forecastAttribution = b.forecasts.map((f) => {
    const sigCount = f.narrative_id ? (b.signalsByNarrative.get(f.narrative_id)?.size ?? 0) : 0;
    return { id: f.id, title: f.title ?? 'Forecast', status: f.status, narrativeId: f.narrative_id, narrativeName: f.narrative_id ? (b.narrativeById.get(f.narrative_id)?.name ?? null) : null, signalCount: sigCount, evidenceCount: f.narrative_id ? (b.evidenceByNarrative.get(f.narrative_id) ?? 0) : 0 };
  }).sort((a, c) => c.signalCount - a.signalCount).slice(0, 25);

  return {
    totals: {
      signals: rows.length,
      withNarrative: rows.filter((r) => r.attribution.hasNarrative).length,
      withForecast: rows.filter((r) => r.attribution.hasForecast).length,
      withRelationship: rows.filter((r) => r.attribution.hasRelationship).length,
      withEvidence: rows.filter((r) => r.attribution.hasEvidence).length,
    },
    healthBreakdown: healthKeys.map((k) => ({ health: k, count: rows.filter((r) => r.health === k).length })),
    relationshipCounts: relCounts,
    topInfluence: [...rows].filter((r) => r.influence.observed).sort((a, c) => c.rank - a.rank).slice(0, 15),
    narrativeAttribution, forecastAttribution, rows,
  };
}

// ---- detail (D7) ------------------------------------------------------------

export interface SignalNetworkDetail {
  row: SignalNetworkRow; signalSummary: string | null; signalType: string | null; confidence: number | null;
  sourceName: string | null; sourceId: string | null;
  evidence: { id: string; label: string; type: string }[];
  reports: { id: string; label: string }[];
  relationships: { type: string; label: string; direction: 'incoming' | 'outgoing'; targetType: string }[];
  narratives: { id: string; name: string; status: string | null }[];
  forecasts: { id: string; title: string; status: string | null }[];
}

export async function getSignalNetworkDetail(id: string): Promise<SignalNetworkDetail | null> {
  const db = createClient();
  const nowIso = new Date().toISOString(); const now = new Date(nowIso).getTime();
  const b = await loadBundle(db);
  const s = b.signals.find((x) => x.id === id);
  if (!s) return null;
  const ps = computeSignal(b, s, now, nowIso);
  const nodeId = ps.nodeId;

  const evidence: { id: string; label: string; type: string }[] = [];
  const reports: { id: string; label: string }[] = [];
  const relationships: { type: string; label: string; direction: 'incoming' | 'outgoing'; targetType: string }[] = [];
  for (const e of ps.edges) {
    const other = e.source_node_id === nodeId ? e.target_node_id : e.source_node_id;
    const ond = b.nodeById.get(other); if (!ond) continue; // only real records
    const direction: 'incoming' | 'outgoing' = e.target_node_id === nodeId ? 'incoming' : 'outgoing';
    relationships.push({ type: e.relationship_type, label: ond.label ?? ond.entity_id, direction, targetType: ond.node_type });
    if (ond.node_type === 'EVIDENCE' || ond.node_type === 'CLAIM') evidence.push({ id: ond.entity_id, label: ond.label ?? ond.entity_id, type: ond.node_type });
    if (ond.node_type === 'REPORT') reports.push({ id: ond.entity_id, label: ond.label ?? ond.entity_id });
  }

  const narratives = ps.row.narrativeIds.map((nid) => ({ id: nid, name: b.narrativeById.get(nid)?.name ?? 'Narrative', status: b.narrativeById.get(nid)?.status ?? null }));
  const forecasts = ps.row.forecastIds.map((fid) => { const f = b.forecasts.find((x) => x.id === fid); return { id: fid, title: f?.title ?? 'Forecast', status: f?.status ?? null }; });

  return {
    row: ps.row, signalSummary: s.summary, signalType: s.signal_type, confidence: s.confidence,
    sourceId: s.source_id, sourceName: s.source_id ? (b.sourceNameById.get(s.source_id) ?? null) : null,
    evidence, reports, relationships, narratives, forecasts,
  };
}

// ---- Phase 71 readiness (D8) -----------------------------------------------

export interface SignalReadiness {
  totalSignals: number;
  withSourceLineage: number; withNarrative: number; withForecast: number; withRelationship: number; withGeo: number;
  missingGeo: number; missingNarrative: number; missingEvidence: number;
  healthLabels: { label: string; count: number }[];
}

export async function getSignalReadiness(): Promise<SignalReadiness> {
  const db = createClient();
  const nowIso = new Date().toISOString(); const now = new Date(nowIso).getTime();
  const b = await loadBundle(db);
  const rows = b.signals.map((s) => computeSignal(b, s, now, nowIso).row);
  const a = (f: (r: SignalNetworkRow) => boolean) => rows.filter(f).length;
  const healthSet = new Set(rows.map((r) => r.health));
  return {
    totalSignals: rows.length,
    withSourceLineage: a((r) => r.attribution.hasSourceLineage),
    withNarrative: a((r) => r.attribution.hasNarrative),
    withForecast: a((r) => r.attribution.hasForecast),
    withRelationship: a((r) => r.attribution.hasRelationship),
    withGeo: a((r) => r.attribution.hasGeo),
    missingGeo: a((r) => !r.attribution.hasGeo),
    missingNarrative: a((r) => !r.attribution.hasNarrative),
    missingEvidence: a((r) => !r.attribution.hasEvidence),
    healthLabels: Array.from(healthSet).map((h) => ({ label: signalHealthLabel(h), count: a((r) => r.health === h) })),
  };
}
