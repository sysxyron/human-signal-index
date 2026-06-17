// =============================================================================
// HSI Phase 51 — Alerts & Watchlists engine (SERVER-ONLY, read-only).
//
// A unified intelligence alerting surface: "what changed? what needs attention?
// what should I watch?" Generates intelligence watchlists, an alert feed,
// severity rollups, emerging-narrative detection, source/review alerts, an
// executive alert summary, and alert health — entirely by COMPOSING the existing
// cached intelligence layers (public / source / operations). No new queries, no
// N+1, no notification sending. Public-safe aggregates only.
// =============================================================================

import { getPublicIntelligenceBundle, getSignalLibraryData } from './public-intelligence';
import { getSourceIntelligence } from './source-intelligence';
import { getOperationsIntelligence } from './operations-intelligence';
import { CATEGORY_BUCKETS, type CategoryBucket } from './public-intelligence-mapping';

export type AlertSeverity = 'Critical' | 'High' | 'Moderate' | 'Low' | 'Informational';
export const SEVERITIES: AlertSeverity[] = ['Critical', 'High', 'Moderate', 'Low', 'Informational'];
export type AlertType =
  | 'NEW SIGNAL' | 'NEW EVIDENCE' | 'RISK INCREASE' | 'PUBLICATION'
  | 'SOURCE FAILURE' | 'SOURCE RECOVERY' | 'TRACEABILITY DROP' | 'REVIEW BACKLOG';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail: string;
  at: string;
  watchlist?: string;
}

export interface WatchlistReport { id: string; title: string; dateLabel: string; category: CategoryBucket; risk: number }
export interface WatchlistSource { category: CategoryBucket; sources: number; signals: number }

export interface Watchlist {
  id: string;
  name: string;
  count: number;
  activeAlerts: number;
  severity: AlertSeverity;
  description: string;
  category?: CategoryBucket;
  recentReports: WatchlistReport[];
  sourceContribution: WatchlistSource[];
}

export interface EmergingNarrative {
  label: string;
  reason: string;
  counts: { label: string; value: string }[];
}

export interface SourceAlerts {
  inactive: number;
  failing: number;
  recovered: number;
  highYield: number;
  coverageGaps: string[];
}

export interface ReviewAlerts {
  pending: number;
  aging: number;
  publicationDelays: number;
  backlogGrowth: string;
  queuePressure: 'Low' | 'Medium' | 'High';
}

export interface ExecAlertSummary {
  topRisk: string;
  fastestGrowing: string;
  largestBacklog: string;
  topSourceCategory: string;
  platformHealth: string;
}

export interface AlertHealth {
  total: number;
  active: number;
  resolved: number;
  newToday: number;
  criticalOpen: number;
  avgSeverity: AlertSeverity;
}

export interface NotificationChannel {
  channel: string;
  status: 'Reserved';
  description: string;
}

export interface AlertsIntelData {
  watchlists: Watchlist[];
  alerts: Alert[];
  severityDistribution: { severity: AlertSeverity; count: number }[];
  severityTrend: number[];
  emerging: EmergingNarrative[];
  sourceAlerts: SourceAlerts;
  reviewAlerts: ReviewAlerts;
  summary: ExecAlertSummary;
  health: AlertHealth;
  notificationChannels: NotificationChannel[];
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { Critical: 5, High: 4, Moderate: 3, Low: 2, Informational: 1 };

function startOfTodayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
function nowIso(): string {
  return new Date().toISOString();
}

export async function getAlertsIntelligence(): Promise<AlertsIntelData> {
  const [bundle, library, source, ops] = await Promise.all([
    getPublicIntelligenceBundle(),
    getSignalLibraryData(),
    getSourceIntelligence(),
    getOperationsIntelligence(),
  ]);

  const { metrics, activityFeed, categoryActivity } = bundle;
  const catCount = (b: CategoryBucket) => categoryActivity.find((c) => c.category === b)?.count ?? 0;
  const riskCount = (k: string) => library.facets.risks.find((r) => r.key === k)?.count ?? 0;
  const critical = riskCount('Critical');
  const high = riskCount('High');
  const stage = (name: string) => ops.pipeline.find((s) => s.stage === name)?.count ?? 0;
  const pendingPublication = stage('Review');
  const recoveredCount = activityFeed.filter((e) => e.kind === 'SOURCE VERIFIED').length;

  // ---- alerts ----
  const alerts: Alert[] = [];
  const now = nowIso();

  // condition alerts (current state)
  if (critical > 0) alerts.push({ id: 'cond-risk-crit', type: 'RISK INCREASE', severity: 'Critical', title: 'Critical-risk findings present', detail: `${critical} critical-risk ${critical === 1 ? 'finding' : 'findings'} in the catalog`, at: now, watchlist: 'High Risk Narratives' });
  else if (high > 0) alerts.push({ id: 'cond-risk-high', type: 'RISK INCREASE', severity: 'High', title: 'High-risk findings present', detail: `${high} high-risk findings`, at: now, watchlist: 'High Risk Narratives' });
  if (source.health.failing > 0) alerts.push({ id: 'cond-src-fail', type: 'SOURCE FAILURE', severity: 'High', title: 'Sources failing', detail: `${source.health.failing} ${source.health.failing === 1 ? 'source is' : 'sources are'} failing capture`, at: now });
  if (ops.review.backlog > 15) alerts.push({ id: 'cond-backlog', type: 'REVIEW BACKLOG', severity: ops.review.backlog > 50 ? 'Critical' : 'High', title: 'Review backlog elevated', detail: `${ops.review.backlog} items pending review`, at: now });
  if (metrics.traceabilityScore > 0 && metrics.traceabilityScore < 80) alerts.push({ id: 'cond-trace', type: 'TRACEABILITY DROP', severity: 'Moderate', title: 'Traceability below target', detail: `Average traceability ${metrics.traceabilityScore.toFixed(1)}%`, at: now });

  // event alerts (from the public activity feed)
  const EVENT_MAP: Record<string, { type: AlertType; severity: AlertSeverity } | undefined> = {
    'NEW SIGNAL': { type: 'NEW SIGNAL', severity: 'Low' },
    'EVIDENCE LINKED': { type: 'NEW EVIDENCE', severity: 'Informational' },
    'REPORT PUBLISHED': { type: 'PUBLICATION', severity: 'Informational' },
    'SOURCE VERIFIED': { type: 'SOURCE RECOVERY', severity: 'Low' },
  };
  for (const e of activityFeed) {
    const m = EVENT_MAP[e.kind];
    if (!m) continue;
    alerts.push({ id: `ev-${e.id}`, type: m.type, severity: m.severity, title: e.kind, detail: e.text, at: e.at });
  }
  alerts.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]));

  // ---- watchlists registry (detail embedded — composed from cached library/source) ----
  const wlSeverity = (count: number, base: AlertSeverity): AlertSeverity => (count === 0 ? 'Informational' : base);
  const alertsFor = (name: string) => alerts.filter((a) => a.watchlist === name).length;
  const reportsFor = (cat?: CategoryBucket, highRiskOnly = false): WatchlistReport[] => {
    let cases = library.signals;
    if (cat) cases = cases.filter((s) => s.category === cat);
    else if (highRiskOnly) cases = cases.filter((s) => s.risk_level >= 4);
    return cases.slice(0, 6).map((s) => ({ id: s.id, title: s.title, dateLabel: s.dateLabel, category: s.category, risk: s.risk_level }));
  };
  const sourcesFor = (cat?: CategoryBucket): WatchlistSource[] => (cat ? source.coverage.filter((c) => c.category === cat) : source.coverage.slice(0, 6));
  const mk = (id: string, name: string, count: number, severity: AlertSeverity, description: string, cat?: CategoryBucket, highRiskOnly = false): Watchlist => ({
    id, name, count, activeAlerts: alertsFor(name), severity, description, category: cat,
    recentReports: reportsFor(cat, highRiskOnly), sourceContribution: sourcesFor(cat),
  });
  const watchlists: Watchlist[] = [
    mk('wl-highrisk', 'High Risk Narratives', critical + high, critical > 0 ? 'Critical' : high > 0 ? 'High' : 'Informational', 'Critical and high-risk findings across all categories.', undefined, true),
    mk('wl-emerging', 'Emerging Narratives', 0, 'Moderate', 'Narratives showing rapid growth or concentration.'),
    mk('wl-recruitment', 'Recruitment Activity', catCount('Recruitment'), wlSeverity(catCount('Recruitment'), 'High'), 'Recruitment narratives and campaigns.', 'Recruitment'),
    mk('wl-influence', 'Influence Operations', catCount('Influence'), wlSeverity(catCount('Influence'), 'Moderate'), 'Coordinated influence and amplification.', 'Influence'),
    mk('wl-misinfo', 'Misinformation', catCount('Misinformation'), wlSeverity(catCount('Misinformation'), 'Moderate'), 'Misinformation and disinformation clusters.', 'Misinformation'),
    mk('wl-propaganda', 'Propaganda', catCount('Propaganda'), wlSeverity(catCount('Propaganda'), 'Moderate'), 'State-aligned and astroturfed propaganda.', 'Propaganda'),
    mk('wl-extremism', 'Extremism', catCount('Extremism'), wlSeverity(catCount('Extremism'), 'Critical'), 'Extremism, radicalization, and violence.', 'Extremism'),
    mk('wl-other', 'Other Narratives', catCount('Other'), 'Low', 'Emerging and uncategorized narratives.', 'Other'),
  ];

  // ---- emerging narratives ----
  const emerging: EmergingNarrative[] = [];
  const sig = library.trends.signalsOverTime;
  if (sig.length >= 2 && sig[sig.length - 1].value > sig[sig.length - 2].value * 1.3 && sig[sig.length - 1].value >= 3) {
    emerging.push({ label: 'Signal volume surge', reason: 'Latest period grew >30% over the previous period', counts: [{ label: 'Latest', value: String(sig[sig.length - 1].value) }, { label: 'Previous', value: String(sig[sig.length - 2].value) }] });
  }
  const pub = library.trends.publicationsOverTime;
  if (pub.length >= 2 && pub[pub.length - 1].value > pub[pub.length - 2].value * 1.3 && pub[pub.length - 1].value >= 2) {
    emerging.push({ label: 'Publication burst', reason: 'Publications grew sharply in the latest period', counts: [{ label: 'Latest', value: String(pub[pub.length - 1].value) }, { label: 'Previous', value: String(pub[pub.length - 2].value) }] });
  }
  const totalCat = categoryActivity.reduce((s, c) => s + c.count, 0);
  const topCat = [...categoryActivity].sort((a, b) => b.count - a.count)[0];
  if (topCat && totalCat > 0 && topCat.count / totalCat > 0.5) {
    emerging.push({ label: `${topCat.category} concentration`, reason: 'A single category accounts for over half of activity', counts: [{ label: topCat.category, value: String(topCat.count) }, { label: 'Total', value: String(totalCat) }] });
  }
  const topSrc = source.analytics.topSources[0];
  const totalSrcSignals = source.health.signalsGenerated;
  if (topSrc && totalSrcSignals > 0 && topSrc.value / totalSrcSignals > 0.4) {
    emerging.push({ label: 'Source concentration', reason: 'One source contributes a large share of signals', counts: [{ label: 'Top source', value: String(topSrc.value) }, { label: 'All sources', value: String(totalSrcSignals) }] });
  }
  watchlists[1].count = emerging.length;
  watchlists[1].activeAlerts = emerging.length;

  // ---- source + review alerts ----
  const coverageGaps = CATEGORY_BUCKETS.filter((b) => !source.coverage.some((c) => c.category === b && c.sources > 0));
  const sourceAlerts: SourceAlerts = {
    inactive: source.health.inactive,
    failing: source.health.failing,
    recovered: recoveredCount,
    highYield: source.health.highYield,
    coverageGaps,
  };
  const reviewAlerts: ReviewAlerts = {
    pending: ops.review.pending,
    aging: ops.review.pending,
    publicationDelays: pendingPublication,
    backlogGrowth: ops.review.backlog > 30 ? 'Rising' : 'Stable',
    queuePressure: ops.review.backlog > 50 ? 'High' : ops.review.backlog > 15 ? 'Medium' : 'Low',
  };

  // ---- severity rollups ----
  const severityDistribution = SEVERITIES.map((severity) => ({ severity, count: alerts.filter((a) => a.severity === severity).length }));
  const severityTrend = pub.map((p) => p.value); // proxy activity trend
  const todayIso = startOfTodayIso();
  const criticalOpen = alerts.filter((a) => a.severity === 'Critical').length;
  const avgRank = alerts.length > 0 ? alerts.reduce((s, a) => s + SEVERITY_RANK[a.severity], 0) / alerts.length : 1;
  const avgSeverity = (SEVERITIES.find((s) => SEVERITY_RANK[s] === Math.round(avgRank)) ?? 'Informational') as AlertSeverity;
  const health: AlertHealth = {
    total: alerts.length,
    active: alerts.length, // no resolution tracking in the read-only layer
    resolved: 0,
    newToday: alerts.filter((a) => a.at >= todayIso).length,
    criticalOpen,
    avgSeverity,
  };

  // ---- executive summary ----
  const topRisk = critical > 0 ? `Critical (${critical})` : high > 0 ? `High (${high})` : 'Low';
  const fastestGrowing = emerging[0]?.label ?? (topCat && topCat.count > 0 ? topCat.category : '—');
  const largestBacklog = `${ops.review.backlog} pending`;
  const topSourceCategory = [...source.coverage].sort((a, b) => b.sources - a.sources).find((c) => c.sources > 0)?.category ?? '—';
  const platformHealth = source.health.failing > 3 ? 'Degraded' : source.health.failing > 0 ? 'Watch' : 'Healthy';
  const summary: ExecAlertSummary = { topRisk, fastestGrowing, largestBacklog, topSourceCategory, platformHealth };

  // ---- future notification prep (architecture only) ----
  const notificationChannels: NotificationChannel[] = [
    { channel: 'Email', status: 'Reserved', description: 'Digest + per-alert email delivery (future phase).' },
    { channel: 'SMS', status: 'Reserved', description: 'Critical-only SMS escalation (future phase).' },
    { channel: 'Webhooks', status: 'Reserved', description: 'Outbound webhook on alert generation (future phase).' },
    { channel: 'Push', status: 'Reserved', description: 'In-app / browser push (future phase).' },
  ];

  return { watchlists, alerts, severityDistribution, severityTrend, emerging, sourceAlerts, reviewAlerts, summary, health, notificationChannels };
}
