// =============================================================================
// HSI Phase 66 — Agent handlers (SERVER-ONLY). One deterministic handler per
// agent_key. Each REUSES an existing Phase 61–65 layer (no duplicate logic) and
// returns explainable findings + an observable action log. Handlers never write
// to the consumed systems — they only read, analyze, and report. No truth scoring,
// no publishing, no review decisions, no moderation. Bounded + reproducible.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSourceReliability } from '@/lib/source-reliability';
import { getCountsDal, topConnectedDal } from '@/lib/evidence-graph/persistence';
import { listNarrativesDal, latestSnapshotByNarrative, growthByNarrative } from '@/lib/narrative-intelligence/persistence';
import { validateDueForecasts } from '@/lib/forecasts/engine';
import { readEvalRecords } from '@/lib/forecasts/persistence';
import { performanceMetrics } from '@/lib/forecasts/calibration';
import { runSourceDiscovery as runDiscovery, runSignalScout as runScout } from '@/lib/source-discovery/engine';
import type { AgentKey, AgentHandlerResult, Finding } from './types';

type Handler = (writer: SupabaseClient) => Promise<AgentHandlerResult>;

function f(finding: string, severity: Finding['severity'], category: string, source: string, evidence: Record<string, unknown> = {}): Finding {
  return { finding, severity, category, source, evidence };
}

// ---- 5. Source Health Agent (Phase 61 + 63) --------------------------------
const sourceHealth: Handler = async (writer) => {
  const actions: string[] = ['Loaded Phase 61 source reliability'];
  const findings: Finding[] = [];
  const rel = await getSourceReliability();
  const b = rel.breakdown;
  if (b.failed > 0) findings.push(f(`${b.failed} source(s) failing`, b.failed >= 3 ? 'CRITICAL' : 'WARNING', 'source_failure', 'source-reliability', { failed: b.failed }));
  if (b.blocked > 0) findings.push(f(`${b.blocked} source(s) blocked by protection (reported, not bypassed)`, 'WARNING', 'source_blocked', 'source-reliability', { blocked: b.blocked }));
  if (b.loginRequired > 0) findings.push(f(`${b.loginRequired} source(s) require login`, 'NOTICE', 'source_login', 'source-reliability', { loginRequired: b.loginRequired }));
  // stale + reliability drops from per-source signals (bounded)
  const stale = rel.sources.filter((s) => s.lastSuccessAgeDays != null && s.lastSuccessAgeDays > 7).slice(0, 10);
  for (const s of stale) findings.push(f(`Stale source: ${s.name} (${s.lastSuccessAgeDays}d since success)`, 'WARNING', 'source_stale', s.id, { ageDays: s.lastSuccessAgeDays, score: s.score }));
  const drops = rel.sources.filter((s) => s.status === 'FAILED' && s.score < 50).slice(0, 10);
  for (const s of drops) findings.push(f(`Reliability drop: ${s.name} (score ${s.score})`, s.score === 0 ? 'CRITICAL' : 'WARNING', 'reliability_drop', s.id, { score: s.score, failureType: s.failureType }));
  actions.push('Read Phase 63 monitoring state');
  try {
    const { count } = await writer.from('source_monitoring_state').select('source_id', { count: 'exact', head: true }).in('state', ['FAILED', 'BLOCKED', 'STALE', 'UNREACHABLE']);
    if ((count ?? 0) > 0) findings.push(f(`${count} source(s) in a bad monitoring state`, 'NOTICE', 'monitoring_state', 'source-monitoring', { count }));
  } catch { /* ignore */ }
  if (findings.length === 0) findings.push(f('All monitored sources are healthy', 'INFO', 'source_health', 'source-reliability'));
  return { findings, actions };
};

// ---- 6. Narrative Watch Agent (Phase 65) -----------------------------------
const narrativeWatch: Handler = async (writer) => {
  const actions: string[] = ['Loaded Phase 65 narratives'];
  const findings: Finding[] = [];
  const narratives = await listNarrativesDal(writer, { limit: 500 });
  const snaps = await latestSnapshotByNarrative(writer);
  const growth = await growthByNarrative(writer);
  actions.push(`Evaluated ${narratives.length} narratives`);
  for (const nar of narratives) {
    const g = growth.get(nar.id) ?? 0;
    const s = snaps.get(nar.id);
    if (nar.status === 'fragmenting') findings.push(f(`Narrative fragmenting: ${nar.name}`, 'WARNING', 'narrative_fragmenting', nar.id, { status: nar.status }));
    else if (nar.status === 'dominant') findings.push(f(`Narrative dominant: ${nar.name}`, 'NOTICE', 'narrative_dominant', nar.id, { members: s?.memberCount ?? 0 }));
    if (g >= 0.5) findings.push(f(`Narrative growing: ${nar.name} (+${Math.round(g * 100)}%)`, g >= 1 ? 'WARNING' : 'NOTICE', 'narrative_growth', nar.id, { growth: g }));
    if (g <= -0.3) findings.push(f(`Narrative declining: ${nar.name} (${Math.round(g * 100)}%)`, 'NOTICE', 'narrative_decline', nar.id, { growth: g }));
    if (s && s.contradictionRatio >= 0.6) findings.push(f(`Contradiction spike: ${nar.name} (${Math.round(s.contradictionRatio * 100)}%)`, 'WARNING', 'narrative_contradiction', nar.id, { contradiction: s.contradictionRatio }));
  }
  if (findings.length === 0) findings.push(f(narratives.length === 0 ? 'No narratives to watch yet' : 'No narrative anomalies detected', 'INFO', 'narrative_watch', 'narratives'));
  return { findings: findings.slice(0, 40), actions };
};

// ---- 7. Graph Analyst Agent (Phase 64) -------------------------------------
const graphAnalyst: Handler = async (writer) => {
  const actions: string[] = ['Loaded Phase 64 graph counts'];
  const findings: Finding[] = [];
  const counts = await getCountsDal(writer);
  const avg = counts.nodes > 0 ? Math.round(((counts.edges * 2) / counts.nodes) * 100) / 100 : 0;
  findings.push(f(`Graph: ${counts.nodes} nodes, ${counts.edges} edges (avg connectivity ${avg})`, 'INFO', 'graph_overview', 'evidence-graph', { ...counts, avg }));
  // isolated nodes
  try {
    const { data: edgeRows } = await writer.from('graph_edges').select('source_node_id, target_node_id').limit(20000);
    const connected = new Set<string>();
    for (const r of (edgeRows ?? []) as Array<{ source_node_id: string; target_node_id: string }>) { connected.add(r.source_node_id); connected.add(r.target_node_id); }
    const { data: nodeRows } = await writer.from('graph_nodes').select('id').limit(20000);
    const isolated = ((nodeRows ?? []) as Array<{ id: string }>).filter((n) => !connected.has(n.id)).length;
    actions.push('Computed isolated nodes + concentration');
    if (isolated > 0) findings.push(f(`${isolated} isolated node(s) (no relationships)`, isolated > counts.nodes * 0.5 ? 'WARNING' : 'NOTICE', 'graph_isolation', 'evidence-graph', { isolated, total: counts.nodes }));
  } catch { /* ignore */ }
  const top = await topConnectedDal(writer, null, 3);
  for (const t of top) if (t.degree >= 10) findings.push(f(`Highly connected entity: ${t.node.label} (${t.degree} links)`, 'NOTICE', 'graph_concentration', t.node.id, { degree: t.degree, type: t.node.nodeType }));
  const topSource = (await topConnectedDal(writer, 'SOURCE', 1))[0];
  if (topSource && counts.edges > 0 && topSource.degree > counts.edges * 0.4) findings.push(f(`Source concentration: ${topSource.node.label} drives ${Math.round((topSource.degree / (counts.edges * 2)) * 100)}% of links`, 'WARNING', 'source_concentration', topSource.node.id, { degree: topSource.degree }));
  return { findings, actions };
};

// ---- 8. Review Queue Agent (submissions + reviews) -------------------------
const reviewQueue: Handler = async (writer) => {
  const actions: string[] = ['Read submission + review queues'];
  const findings: Finding[] = [];
  try {
    const { data } = await writer.from('signal_submissions').select('id, status, created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(2000);
    const pending = (data ?? []) as Array<{ id: string; created_at: string }>;
    const now = Date.now();
    const aging = pending.filter((p) => now - Date.parse(p.created_at) > 7 * 86_400_000).length;
    if (pending.length >= 25) findings.push(f(`Review backlog: ${pending.length} pending submissions`, pending.length >= 100 ? 'CRITICAL' : 'WARNING', 'review_backlog', 'submission-queue', { pending: pending.length }));
    else if (pending.length > 0) findings.push(f(`${pending.length} pending submission(s)`, 'NOTICE', 'review_pending', 'submission-queue', { pending: pending.length }));
    if (aging > 0) findings.push(f(`${aging} submission(s) aging beyond 7 days`, 'WARNING', 'review_aging', 'submission-queue', { aging }));
  } catch { /* ignore */ }
  try {
    const { data } = await writer.from('hsin_signal_reviews').select('reviewer_id').limit(5000);
    const byReviewer = new Map<string, number>();
    for (const r of (data ?? []) as Array<{ reviewer_id: string | null }>) if (r.reviewer_id) byReviewer.set(r.reviewer_id, (byReviewer.get(r.reviewer_id) ?? 0) + 1);
    const counts = Array.from(byReviewer.values());
    if (counts.length >= 2) {
      const max = Math.max(...counts), min = Math.min(...counts);
      if (max > min * 3) findings.push(f(`Reviewer imbalance detected (recommendation: rebalance; no auto-assignment)`, 'NOTICE', 'reviewer_imbalance', 'review-queue', { max, min, reviewers: counts.length }));
    }
  } catch { /* ignore */ }
  if (findings.length === 0) findings.push(f('Review queue is healthy', 'INFO', 'review_queue', 'review-queue'));
  return { findings, actions };
};

// ---- 9. Publication Monitor Agent ------------------------------------------
const publicationMonitor: Handler = async (writer) => {
  const actions: string[] = ['Read publications + corrections'];
  const findings: Finding[] = [];
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  try {
    const { count: total } = await writer.from('hsin_publications').select('id', { count: 'exact', head: true }).eq('state', 'PUBLISHED');
    const { count: recent } = await writer.from('hsin_publications').select('id', { count: 'exact', head: true }).eq('state', 'PUBLISHED').gte('published_at', since);
    findings.push(f(`Publication velocity: ${recent ?? 0} published in last 30d (${total ?? 0} total)`, 'INFO', 'publication_velocity', 'publications', { recent: recent ?? 0, total: total ?? 0 }));
  } catch { /* ignore */ }
  try {
    const { count: corrections } = await writer.from('hsin_publication_versions').select('id', { count: 'exact', head: true }).eq('to_state', 'RETRACTED');
    const { count: recentCorr } = await writer.from('hsin_publication_versions').select('id', { count: 'exact', head: true }).eq('to_state', 'RETRACTED').gte('created_at', since);
    if ((corrections ?? 0) > 0) findings.push(f(`${corrections} retraction(s)/correction(s) on record (${recentCorr ?? 0} recent)`, (recentCorr ?? 0) >= 3 ? 'WARNING' : 'NOTICE', 'correction_trend', 'publications', { corrections: corrections ?? 0, recent: recentCorr ?? 0 }));
    if ((recentCorr ?? 0) >= 3) findings.push(f(`Correction cluster: ${recentCorr} corrections in 30d`, 'WARNING', 'correction_cluster', 'publications', { recent: recentCorr }));
  } catch { /* ignore */ }
  if (findings.length === 0) findings.push(f('No publication activity to report', 'INFO', 'publication_health', 'publications'));
  return { findings, actions };
};

// ---- 10. Trust Anomaly Agent (Phase 64 + 65, flag only) --------------------
const trustAnomaly: Handler = async (writer) => {
  const actions: string[] = ['Cross-checked graph + narratives (flag only)'];
  const findings: Finding[] = [];
  const rel = await getSourceReliability();
  for (const d of rel.dependencies) findings.push(f(`Source/coverage concentration: ${d.coverageImpact}`, d.severity === 'high' ? 'WARNING' : 'NOTICE', 'trust_concentration', 'source-reliability', { label: d.label }));
  try {
    const growth = await growthByNarrative(writer);
    const rapid = Array.from(growth.values()).filter((g) => Math.abs(g) >= 0.75).length;
    if (rapid > 0) findings.push(f(`${rapid} narrative(s) with rapid change (±75%)`, 'NOTICE', 'trust_narrative_shift', 'narratives', { rapid }));
  } catch { /* ignore */ }
  const counts = await getCountsDal(writer);
  const topEvidence = (await topConnectedDal(writer, 'EVIDENCE', 1))[0];
  if (topEvidence && counts.edges > 0 && topEvidence.degree > counts.edges * 0.3) findings.push(f(`Evidence concentration anomaly: ${topEvidence.node.label}`, 'NOTICE', 'evidence_anomaly', topEvidence.node.id, { degree: topEvidence.degree }));
  if (findings.length === 0) findings.push(f('No trust anomalies flagged', 'INFO', 'trust_anomaly', 'trust'));
  return { findings, actions };
};

// ---- 11. Executive Brief Agent ---------------------------------------------
const executiveBrief: Handler = async (writer) => {
  const actions: string[] = ['Composed executive brief from Phases 61/64/65'];
  const findings: Finding[] = [];
  const rel = await getSourceReliability();
  findings.push(f(`Source network: ${rel.summary.healthyPct}% healthy, ${rel.summary.failingPct}% failing, ${rel.summary.blockedPct}% blocked`, 'INFO', 'brief_sources', 'source-reliability', { ...rel.summary }));
  try {
    const narratives = await listNarrativesDal(writer, { limit: 500 });
    const byStatus: Record<string, number> = {};
    for (const nNar of narratives) byStatus[nNar.status] = (byStatus[nNar.status] ?? 0) + 1;
    findings.push(f(`Narratives: ${narratives.length} tracked (${byStatus.dominant ?? 0} dominant, ${byStatus.fragmenting ?? 0} fragmenting)`, 'INFO', 'brief_narratives', 'narratives', byStatus));
  } catch { /* ignore */ }
  const counts = await getCountsDal(writer);
  findings.push(f(`Graph: ${counts.nodes} nodes, ${counts.edges} edges`, 'INFO', 'brief_graph', 'evidence-graph', { nodes: counts.nodes, edges: counts.edges }));
  try {
    const { count: pending } = await writer.from('signal_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    findings.push(f(`Review queue: ${pending ?? 0} pending submissions`, 'INFO', 'brief_review', 'review-queue', { pending: pending ?? 0 }));
  } catch { /* ignore */ }
  return { findings, actions };
};

// ---- 12. Forecast Prep Agent (readiness only, no forecasting) --------------
const forecastPrep: Handler = async (writer) => {
  const actions: string[] = ['Computed forecast-readiness indicators'];
  const findings: Finding[] = [];
  const rel = await getSourceReliability();
  const sourceStability = rel.summary.healthyPct;
  findings.push(f(`Source stability: ${sourceStability}% healthy`, sourceStability >= 70 ? 'INFO' : 'NOTICE', 'readiness_sources', 'source-reliability', { sourceStability }));
  findings.push(f(`Coverage risk: ${rel.summary.coverageRisk}`, 'INFO', 'readiness_coverage', 'source-reliability', { coverageRisk: rel.summary.coverageRisk }));
  const counts = await getCountsDal(writer);
  const graphCompleteness = counts.nodes > 0 ? Math.min(100, Math.round(((counts.edges * 2) / counts.nodes) * 25)) : 0;
  findings.push(f(`Graph completeness: ${graphCompleteness}% (connectivity-based)`, graphCompleteness >= 50 ? 'INFO' : 'NOTICE', 'readiness_graph', 'evidence-graph', { graphCompleteness, nodes: counts.nodes, edges: counts.edges }));
  try {
    const snaps = await latestSnapshotByNarrative(writer);
    const stabilities = Array.from(snaps.values()).map((s) => s.stabilityScore);
    const narrativeStability = stabilities.length ? Math.round(stabilities.reduce((a, x) => a + x, 0) / stabilities.length) : 0;
    findings.push(f(`Narrative stability: ${narrativeStability}/100 avg`, narrativeStability >= 60 ? 'INFO' : 'NOTICE', 'readiness_narratives', 'narratives', { narrativeStability, count: stabilities.length }));
  } catch { /* ignore */ }
  const dataCompleteness = Math.round(((rel.analytics.successPct) + graphCompleteness) / 2);
  findings.push(f(`Forecast data completeness: ${dataCompleteness}% (collection + graph)`, dataCompleteness >= 60 ? 'INFO' : 'NOTICE', 'readiness_data', 'forecast-prep', { dataCompleteness }));
  return { findings, actions };
};

// ---- Phase 67. Forecast Validation Agent (validation only, no forecasting) --
const forecastValidation: Handler = async (writer) => {
  const actions: string[] = ['Validated due forecasts (Phase 67)'];
  const findings: Finding[] = [];
  const summary = await validateDueForecasts(writer, new Date().toISOString(), null);
  findings.push(f(`${summary.due} forecast(s) due — ${summary.evaluated} evaluated, ${summary.flagged} awaiting outcome`, summary.flagged > 0 ? 'NOTICE' : 'INFO', 'forecast_validation', 'forecasts', { ...summary }));
  const perf = performanceMetrics(await readEvalRecords(writer));
  if (perf.resolved > 0) findings.push(f(`Forecast accuracy ${perf.accuracy}% · calibration ${perf.calibrationScore}/100 (${perf.resolved} resolved)`, perf.calibrationScore < 50 ? 'WARNING' : 'INFO', 'forecast_performance', 'forecasts', { accuracy: perf.accuracy, calibration: perf.calibrationScore, resolved: perf.resolved }));
  return { findings, actions };
};

// ---- Phase 70.3. Source Discovery + Signal Scout (suggest only; human-gated) --
const sourceDiscovery: Handler = async (writer) => {
  const r = await runDiscovery(writer, null, 'scheduled');
  return { actions: ['Scanned referenced domains for new source candidates (Phase 70.3)'], findings: [f(`${r.candidates} source candidate(s) suggested from ${r.findings} referenced domain(s) — all in review`, r.candidates > 0 ? 'NOTICE' : 'INFO', 'source_discovery', 'source-discovery', { ...r })] };
};
const signalScout: Handler = async (writer) => {
  const r = await runScout(writer, null);
  return { actions: ['Scouted recent signals for narrative/watchlist matches (Phase 70.3)'], findings: [f(`${r.candidates} signal candidate(s) suggested for review — none published`, r.candidates > 0 ? 'NOTICE' : 'INFO', 'signal_scout', 'source-discovery', { ...r })] };
};

export const HANDLERS: Record<AgentKey, Handler> = {
  SOURCE_HEALTH_AGENT: sourceHealth,
  NARRATIVE_WATCH_AGENT: narrativeWatch,
  GRAPH_ANALYST_AGENT: graphAnalyst,
  REVIEW_QUEUE_AGENT: reviewQueue,
  PUBLICATION_MONITOR_AGENT: publicationMonitor,
  TRUST_ANOMALY_AGENT: trustAnomaly,
  EXECUTIVE_BRIEF_AGENT: executiveBrief,
  FORECAST_PREP_AGENT: forecastPrep,
  FORECAST_VALIDATION_AGENT: forecastValidation,
  SOURCE_DISCOVERY_AGENT: sourceDiscovery,
  SIGNAL_SCOUT_AGENT: signalScout,
};
