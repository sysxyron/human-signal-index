// =============================================================================
// HSI Phase 53 — Collaboration & Investigation Network (SERVER-ONLY, read-only).
//
// Structured operational coordination (NOT chat): who is working on what, where
// the bottlenecks are, what needs attention, what is publication-ready. Composes
// the existing cached layers (operations / public / source / forecasting) — no
// duplicate reads, no N+1, no workflow changes. Public-safe AGGREGATES only — NO
// identities are ever exposed. Per-analyst load ratios are admin-only (computed
// from aggregate role counts; never names).
// =============================================================================

import { getPublicIntelligenceBundle, getSignalLibraryData } from './public-intelligence';
import { getSourceIntelligence } from './source-intelligence';
import { getOperationsIntelligence } from './operations-intelligence';
import { getForecastData } from './forecasting-intelligence';
import { getBetaOperations } from './beta-operations';
import { CATEGORY_BUCKETS, type CategoryBucket } from './public-intelligence-mapping';

export interface TeamOps {
  active: number;
  assigned: number;
  pendingReview: number;
  pendingPublication: number;
  recentlyCompleted: number;
  escalated: number;
}

export interface Ownership {
  unassigned: number;
  assigned: number;
  awaitingReview: number;
  awaitingPublication: number;
  published: number;
}

export interface Workload {
  casesPerAnalyst: number | null;
  casesPerReviewer: number | null;
  avgQueueAge: string;
  priorityDistribution: { key: string; count: number }[];
  backlogPressure: 'Low' | 'Medium' | 'High';
}

export interface EscalationItem { label: string; severity: 'high' | 'medium'; detail: string }

export interface CrossTeam {
  mostActive: { category: CategoryBucket; count: number }[];
  fastestGrowing: { category: CategoryBucket; deltaPct: number }[];
  mostPublished: { category: CategoryBucket; count: number }[];
  sourceConcentration: string;
}

export interface InvestigationHealth {
  healthy: number;
  atRisk: number;
  delayed: number;
  blocked: number;
  published: number;
}

export interface CollabSummary {
  workload: string;
  bottleneck: string;
  priorityArea: string;
  publicationReadiness: string;
  coordinationStatus: string;
  tone: 'green' | 'amber' | 'red';
}

export interface CollaborationData {
  role: string | null;
  isAdmin: boolean;
  canReview: boolean;
  teamOps: TeamOps;
  ownership: Ownership;
  workload: Workload;
  escalations: EscalationItem[];
  timeline: { id: string; kind: string; text: string; at: string }[];
  crossTeam: CrossTeam;
  health: InvestigationHealth;
  summary: CollabSummary;
}

const DAY = 86_400_000;

export async function getCollaborationData(role: string | null): Promise<CollaborationData> {
  const isAdmin = role === 'admin';
  const canReview = role === 'reviewer' || role === 'curator' || role === 'admin';

  const [bundle, library, source, ops, forecast, beta] = await Promise.all([
    getPublicIntelligenceBundle(),
    getSignalLibraryData(),
    getSourceIntelligence(),
    getOperationsIntelligence(),
    getForecastData(),
    isAdmin ? getBetaOperations() : Promise.resolve(null),
  ]);

  const { metrics, activityBar, activityFeed } = bundle;
  const stage = (name: string) => ops.pipeline.find((s) => s.stage === name)?.count ?? 0;
  const signalC = stage('Signal');
  const evidenceC = stage('Evidence');
  const analysisC = stage('Analysis');
  const reviewC = stage('Review');
  const publicationC = stage('Publication');
  const riskCount = (k: string) => library.facets.risks.find((r) => r.key === k)?.count ?? 0;
  const critical = riskCount('Critical');
  const high = riskCount('High');

  const teamOps: TeamOps = {
    active: signalC + evidenceC + analysisC,
    assigned: evidenceC + analysisC,
    pendingReview: ops.review.pending,
    pendingPublication: reviewC,
    recentlyCompleted: activityBar.publishedToday,
    escalated: critical,
  };

  const ownership: Ownership = {
    unassigned: signalC,
    assigned: evidenceC + analysisC,
    awaitingReview: ops.review.pending,
    awaitingPublication: reviewC,
    published: publicationC,
  };

  // workload balancing — per-analyst/reviewer ratios are admin-only (aggregate).
  const researchers = beta?.overview.researchers ?? 0;
  const reviewers = beta?.overview.reviewers ?? 0;
  const workload: Workload = {
    casesPerAnalyst: isAdmin && researchers > 0 ? Math.round(((signalC + evidenceC + analysisC) / researchers) * 10) / 10 : null,
    casesPerReviewer: isAdmin && reviewers > 0 ? Math.round((ops.review.pending / reviewers) * 10) / 10 : null,
    avgQueueAge: '—',
    priorityDistribution: library.facets.risks.map((r) => ({ key: r.key, count: r.count })),
    backlogPressure: ops.review.backlog > 50 ? 'High' : ops.review.backlog > 15 ? 'Medium' : 'Low',
  };

  // escalation center — only when thresholds exceeded.
  const now = Date.now();
  const staleCount = library.signals.filter((s) => s.publishedAt && now - Date.parse(s.publishedAt) > 180 * DAY).length;
  const escalations: EscalationItem[] = [];
  if (critical > 0) escalations.push({ label: 'Critical risk', severity: 'high', detail: `${critical} critical-risk ${critical === 1 ? 'finding' : 'findings'}` });
  if (high > 0) escalations.push({ label: 'High risk', severity: 'high', detail: `${high} high-risk findings` });
  if (staleCount > 0) escalations.push({ label: 'Aging investigations', severity: 'medium', detail: `${staleCount} published >180 days ago` });
  if (reviewC > 10) escalations.push({ label: 'Publication delays', severity: 'medium', detail: `${reviewC} approved, awaiting publication` });
  if (metrics.traceabilityScore > 0 && metrics.traceabilityScore < 80) escalations.push({ label: 'Traceability failures', severity: 'medium', detail: `Average traceability ${metrics.traceabilityScore.toFixed(1)}%` });
  if (ops.review.backlog > 20) escalations.push({ label: 'Review bottleneck', severity: 'high', detail: `${ops.review.backlog} items pending review` });

  // cross-team intelligence.
  const mostPublishedMap = new Map<CategoryBucket, number>();
  for (const s of library.signals.filter((x) => x.status === 'Published')) mostPublishedMap.set(s.category, (mostPublishedMap.get(s.category) ?? 0) + 1);
  const topSrc = source.analytics.topSources[0];
  const totalSrcSignals = source.health.signalsGenerated;
  const crossTeam: CrossTeam = {
    mostActive: [...bundle.categoryActivity].sort((a, b) => b.count - a.count).filter((c) => c.count > 0).slice(0, 5),
    fastestGrowing: forecast.narrativeMomentum.fastestGrowing.map((g) => ({ category: g.category, deltaPct: g.deltaPct })),
    mostPublished: Array.from(mostPublishedMap.entries()).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count).slice(0, 5),
    sourceConcentration: topSrc && totalSrcSignals > 0 ? `${topSrc.name} — ${Math.round((topSrc.value / totalSrcSignals) * 100)}% of signals` : '—',
  };

  // investigation health (observable workflow state only).
  const health: InvestigationHealth = {
    healthy: signalC + analysisC,
    atRisk: critical + high,
    delayed: reviewC,
    blocked: evidenceC,
    published: publicationC,
  };

  // executive collaboration summary.
  const stages = [
    { name: 'New', count: signalC }, { name: 'Evidence', count: evidenceC }, { name: 'Analysis', count: analysisC },
    { name: 'Review', count: ops.review.pending }, { name: 'Publication', count: reviewC },
  ];
  const bottleneck = [...stages].sort((a, b) => b.count - a.count)[0];
  const priorityArea = [...bundle.categoryActivity].sort((a, b) => b.count - a.count).find((c) => c.count > 0)?.category ?? '—';
  const tone: CollabSummary['tone'] = escalations.some((e) => e.severity === 'high') ? 'red' : escalations.length > 0 ? 'amber' : 'green';
  const summary: CollabSummary = {
    workload: `${teamOps.active} active`,
    bottleneck: bottleneck && bottleneck.count > 0 ? `${bottleneck.name} (${bottleneck.count})` : 'None',
    priorityArea,
    publicationReadiness: `${reviewC} ready`,
    coordinationStatus: tone === 'green' ? 'Coordinated' : tone === 'amber' ? 'Watch' : 'Action needed',
    tone,
  };

  return {
    role, isAdmin, canReview,
    teamOps, ownership, workload, escalations,
    timeline: activityFeed.map((e) => ({ id: e.id, kind: e.kind, text: e.text, at: e.at })),
    crossTeam, health, summary,
  };
}
