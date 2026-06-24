// =============================================================================
// HSI Phase 55 — Beta Release Candidate readiness (SERVER-ONLY, read-only).
//
// The capstone: composes EVERY intelligence layer built in phases 43–54 into one
// launch-readiness model. No new workflows, no new data models, no new queries —
// it only aggregates the existing cached layers (all deduped by unstable_cache and
// fetched via Promise.all). Produces platform readiness, an explainable system-
// health status (READY / MONITORING / AT RISK / NOT READY), a launch brief, and a
// pass/warning/fail release checklist. Role-aware; public-safe aggregates only.
// =============================================================================

import { getPublicIntelligenceBundle, getSignalLibraryData } from './public-intelligence';
import { getSourceIntelligence } from './source-intelligence';
import { getOperationsIntelligence } from './operations-intelligence';
import { getTrustData } from './trust-intelligence';
import { getAlertsIntelligence } from './alerts-intelligence';
import { getForecastData } from './forecasting-intelligence';
import { getCollaborationData } from './collaboration-intelligence';
import { getContributorNetwork } from './contributor-network';
import {
  deriveReleaseStatus,
  degradedReadiness,
  type CheckStatus,
  type ChecklistItem,
  type HealthRow,
  type LaunchBrief,
  type MetricRow,
  type ReleaseReadinessData,
  type RiskRow,
} from './release-readiness-status';

// Types live in the dependency-free `release-readiness-status` module so the pure
// status logic stays unit-testable; re-exported here for existing importers.
export type {
  ReleaseStatus,
  CheckStatus,
  MetricRow,
  HealthRow,
  ChecklistItem,
  RiskRow,
  LaunchBrief,
  ReleaseReadinessData,
} from './release-readiness-status';

/**
 * Composes EVERY intelligence layer into one launch-readiness model. Because it
 * aggregates all nine cached layers through a single `Promise.all`, ANY one layer
 * throwing (e.g. a missing table/column or a transient backend error in
 * production) would otherwise crash the entire route. `getReleaseReadiness`
 * therefore wraps the composition in a guard that degrades to a safe, empty
 * `available:false` result so the page renders an internal empty state instead.
 */
export async function getReleaseReadiness(role: string | null): Promise<ReleaseReadinessData> {
  try {
    return await computeReleaseReadiness(role);
  } catch {
    return degradedReadiness(role);
  }
}

async function computeReleaseReadiness(role: string | null): Promise<ReleaseReadinessData> {
  const isAdmin = role === 'admin';

  const [bundle, library, source, ops, trust, alerts, forecast, collab, network] = await Promise.all([
    getPublicIntelligenceBundle(),
    getSignalLibraryData(),
    getSourceIntelligence(),
    getOperationsIntelligence(),
    getTrustData(),
    getAlertsIntelligence(),
    getForecastData(),
    getCollaborationData(role),
    getContributorNetwork(role),
  ]);

  const { metrics } = bundle;
  const adminCounts = network.overview.available ? network.overview : null;
  const humanReviewLabel = trust.overview.humanReviewedPct == null ? 'Not enough data yet' : `${trust.overview.humanReviewedPct}%`;

  // ---- Part 2 — platform readiness ----
  const platformReadiness: MetricRow[] = [
    { label: 'Signals', value: metrics.totalSignals.toLocaleString('en-US') },
    { label: 'Publications', value: library.total.toLocaleString('en-US') },
    { label: 'Reports', value: metrics.publishedReports.toLocaleString('en-US') },
    { label: 'Sources', value: source.health.total.toLocaleString('en-US') },
    { label: 'Contributors', value: adminCounts ? adminCounts.contributors.toLocaleString('en-US') : '—' },
    { label: 'Reviewers', value: adminCounts ? adminCounts.reviewers.toLocaleString('en-US') : '—' },
    { label: 'Admins', value: adminCounts ? adminCounts.admins.toLocaleString('en-US') : '—' },
    { label: 'Traceability', value: `${metrics.traceabilityScore.toFixed(1)}%` },
    { label: 'Human review', value: humanReviewLabel },
    { label: 'Trust score', value: `${metrics.traceabilityScore.toFixed(1)}%` },
  ];

  // ---- Part 3 — system health (each dimension → status) ----
  const sev = (pass: boolean, warn: boolean): CheckStatus => (pass ? 'Pass' : warn ? 'Warning' : 'Fail');
  const sourceHealth = sev(source.health.failing === 0, source.health.failing <= 2);
  const reviewHealth = sev(ops.review.backlog <= 15, ops.review.backlog <= 50);
  const publicationHealth = sev(metrics.publishedReports > 0, true); // warning if none published yet
  const coverageGapsList = network.coverage.filter((c) => c.gap).map((c) => c.category);
  const coverageHealth = sev(coverageGapsList.length === 0, coverageGapsList.length <= 2);
  const contributorHealth: CheckStatus = adminCounts
    ? sev(adminCounts.reviewers > 0 && adminCounts.researchers > 0, adminCounts.reviewers + adminCounts.researchers > 0)
    : sev(collab.workload.backlogPressure === 'Low', collab.workload.backlogPressure !== 'High');
  const platformHealthStatus = sev(source.health.failing === 0 && alerts.health.criticalOpen === 0, source.health.failing <= 3);

  const systemHealth: HealthRow[] = [
    { label: 'Source health', status: sourceHealth, detail: `${source.health.active} active · ${source.health.failing} failing` },
    { label: 'Review health', status: reviewHealth, detail: `${ops.review.backlog} backlog` },
    { label: 'Publication health', status: publicationHealth, detail: `${metrics.publishedReports} published` },
    { label: 'Coverage health', status: coverageHealth, detail: coverageGapsList.length ? `${coverageGapsList.length} gap(s)` : 'Full coverage' },
    { label: 'Contributor health', status: contributorHealth, detail: adminCounts ? `${adminCounts.reviewers} reviewers · ${adminCounts.researchers} researchers` : `${collab.workload.backlogPressure} pressure` },
    { label: 'Platform health', status: platformHealthStatus, detail: `${alerts.health.criticalOpen} critical alerts` },
  ];

  // ---- Part 4 — beta operations ----
  const betaOps: MetricRow[] = [
    { label: 'User growth', value: adminCounts ? (adminCounts.newRecent > 0 ? `+${adminCounts.newRecent} / 7d` : 'Flat') : '—' },
    { label: 'Participation', value: network.networkHealth.researchCapacity },
    { label: 'Retention', value: network.networkHealth.retention },
    { label: 'Contribution activity', value: metrics.totalSignals.toLocaleString('en-US') },
    { label: 'Operational load', value: collab.workload.backlogPressure },
    { label: 'Backlog', value: ops.review.backlog.toLocaleString('en-US') },
  ];

  // ---- Part 5 — intelligence health ----
  const intelligenceHealth: MetricRow[] = [
    { label: 'Coverage', value: `${network.networkHealth.coverageStrength.covered}/${network.networkHealth.coverageStrength.total}` },
    { label: 'Quality', value: `${network.quality.publicationSuccessRate}% pub success` },
    { label: 'Traceability', value: `${metrics.traceabilityScore.toFixed(1)}%` },
    { label: 'Forecast confidence', value: forecast.trendMomentum[1]?.confidence ?? '—' },
    { label: 'Risk trajectory', value: forecast.outlook.platformOutlook },
  ];

  // ---- Part 6 — alerts & risks (triggered only) ----
  const alertsRisks: RiskRow[] = [];
  if (alerts.health.criticalOpen > 0) alertsRisks.push({ label: 'Critical alerts', severity: 'high', detail: `${alerts.health.criticalOpen} open` });
  if (coverageGapsList.length > 0) alertsRisks.push({ label: 'Coverage gaps', severity: 'medium', detail: coverageGapsList.join(', ') });
  if (ops.review.backlog > 20) alertsRisks.push({ label: 'Reviewer bottleneck', severity: 'high', detail: `${ops.review.backlog} pending` });
  if (source.health.failing > 0) alertsRisks.push({ label: 'Source failures', severity: 'high', detail: `${source.health.failing} failing` });
  const pendingPub = ops.pipeline.find((s) => s.stage === 'Review')?.count ?? 0;
  if (pendingPub > 10) alertsRisks.push({ label: 'Publication delays', severity: 'medium', detail: `${pendingPub} awaiting publication` });
  for (const w of forecast.earlyWarnings) alertsRisks.push({ label: `Forecast: ${w.label}`, severity: w.confidence === 'High' ? 'high' : 'medium', detail: w.indicator });

  // ---- Part 7 — network readiness (explained score) ----
  const netRows: MetricRow[] = [
    { label: 'Research capacity', value: network.networkHealth.researchCapacity },
    { label: 'Review capacity', value: network.networkHealth.reviewerCapacity },
    { label: 'Dependency risks', value: String(network.networkHealth.dependencyRisks.length) },
    { label: 'Growth', value: network.networkHealth.growthRate },
    { label: 'Retention', value: network.networkHealth.retention },
  ];
  // score = coverage strength − dependency-risk penalty − backlog penalty.
  const netBase = network.networkHealth.coverageStrength.pct;
  const netPenalty = network.networkHealth.dependencyRisks.length * 8 + (collab.workload.backlogPressure === 'High' ? 20 : collab.workload.backlogPressure === 'Medium' ? 8 : 0);
  const netScore = Math.max(0, Math.min(100, Math.round(netBase - netPenalty)));
  const networkReadiness = {
    rows: netRows,
    score: netScore,
    scoreReason: `Coverage ${network.networkHealth.coverageStrength.pct}% − ${network.networkHealth.dependencyRisks.length} dependency risk(s) − ${collab.workload.backlogPressure.toLowerCase()} backlog pressure`,
  };

  // ---- Part 8 — trust & governance ----
  const sc = (label: string) => trust.scorecard.find((s) => s.label === label)?.pct ?? null;
  const evidenceLinkedPct = sc('Evidence Linked');
  // Transparency score = mean of the MEASURABLE scorecard items (null entries —
  // e.g. "Version Controlled" when no data — are excluded, never counted as 0).
  const measured = trust.scorecard.map((x) => x.pct).filter((p): p is number => p != null);
  const transparencyScore = measured.length > 0 ? Math.round(measured.reduce((s, p) => s + p, 0) / measured.length) : null;
  const trustGovernance: MetricRow[] = [
    { label: 'Human review', value: humanReviewLabel },
    { label: 'Evidence linked', value: evidenceLinkedPct == null ? 'Not enough data yet' : `${evidenceLinkedPct}%` },
    { label: 'Traceability', value: `${trust.overview.traceabilityPct.toFixed(1)}%` },
    { label: 'Corrections logged', value: trust.overview.correctionsIssued.toLocaleString('en-US') },
    { label: 'Transparency score', value: transparencyScore == null ? 'Not enough data yet' : `${transparencyScore}%` },
    { label: 'Audit readiness', value: trust.audit.length > 0 ? 'Audit trail active' : 'No events yet' },
  ];

  // ---- Part 10 — release checklist ----
  const trustOk = metrics.traceabilityScore >= 90;
  const trustWarn = metrics.traceabilityScore >= 80 || metrics.publishedReports === 0;
  const checklist: ChecklistItem[] = [
    { label: 'Platform stable', status: platformHealthStatus, detail: systemHealth[5].detail },
    { label: 'Review workflow healthy', status: reviewHealth, detail: `${ops.review.backlog} backlog` },
    { label: 'Sources healthy', status: sourceHealth, detail: `${source.health.failing} failing` },
    { label: 'Coverage acceptable', status: coverageHealth, detail: coverageGapsList.length ? `${coverageGapsList.length} gap(s)` : 'Full coverage' },
    { label: 'Trust thresholds met', status: sev(trustOk, trustWarn), detail: `Traceability ${metrics.traceabilityScore.toFixed(1)}%` },
    { label: 'Contributor capacity sufficient', status: contributorHealth, detail: adminCounts ? `${adminCounts.reviewers} reviewers` : `${collab.workload.backlogPressure} pressure` },
    { label: 'No critical alerts', status: alerts.health.criticalOpen === 0 ? 'Pass' : 'Fail', detail: `${alerts.health.criticalOpen} critical open` },
  ];

  // ---- overall status + score (pure, unit-tested derivation) ----
  const hardFail = alerts.health.criticalOpen > 0 || platformHealthStatus === 'Fail';
  const { status, score, statusReasons } = deriveReleaseStatus(checklist, hardFail);

  // ---- Part 9 — executive launch brief ----
  const strengths = checklist.filter((c) => c.status === 'Pass').map((c) => c.label);
  const risks = checklist.filter((c) => c.status === 'Fail').map((c) => `${c.label} — ${c.detail}`);
  const warnings = checklist.filter((c) => c.status === 'Warning').map((c) => `${c.label} — ${c.detail}`);
  const recommendation =
    status === 'READY' ? 'All checks pass — beta launch is recommended.'
      : status === 'MONITORING' ? 'Launch is viable with monitoring — address warnings in parallel.'
        : status === 'AT RISK' ? 'Resolve the failing checks before launch; proceed only with mitigation.'
          : 'Do not launch — critical readiness checks are failing.';
  const launchBrief: LaunchBrief = { strengths, risks, warnings, coverageGaps: coverageGapsList, recommendation };

  return {
    role, isAdmin, available: true, status, score, statusReasons,
    platformReadiness, systemHealth, betaOps, intelligenceHealth, alertsRisks,
    networkReadiness, trustGovernance, launchBrief, checklist,
  };
}
