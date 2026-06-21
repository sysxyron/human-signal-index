// =============================================================================
// HSI Phase 74 — Executive Intelligence DAL (SERVER-ONLY, reviewer+). Composes
// REAL data from the operations center (70.3/70.4/72/73), the platform auditor
// (73.2/73.3), and the forecast engine (67), then runs the deterministic
// warning, risk, divergence, and brief layers. No fabricated metrics; no caching
// of cookie reads (force-dynamic). Degrades to safe empties.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { getOperationsCenter } from '@/lib/operations-center/data';
import { getPlatformAuditReport } from '@/lib/platform-audit/data';
import { listForecastsDal, scoredForecastsDal } from '@/lib/forecasts/persistence';
import { buildAlerts } from './warnings';
import { computeRisks, overallRisk } from './risk';
import { toDivergenceRow, summarizeDivergence } from './divergence';
import { buildExecutiveBrief } from './brief';
import type { ExecutiveAlert, RiskCard, RiskStatus, ForecastDivergenceRow, ExecutiveBrief } from './types';

export interface PlatformHealthSignal { label: string; status: 'PASS' | 'WARNING' | 'FAIL' | 'NOT_OBSERVED' | 'NOT_CONFIGURED' }

export interface ExecutiveIntelligence {
  overview: { activeSignals: number; openInvestigations: number; reviewQueue: number; publishedReports: number };
  narrativeVelocity: { id: string; name: string; status: string | null; signalCount: number; evidenceCount: number; forecastCount: number }[];
  trustOverview: { high: number; medium: number; low: number; observed: number };
  forecastHealth: { onTrack: number; diverging: number; missed: number; unresolved: number; total: number };
  divergenceRows: ForecastDivergenceRow[];
  blindSpots: { key: string; severity: string }[];
  contradictions: { key: string; contradicts: number; supports: number }[];
  geo: { geoReadySources: number; geoActiveSignals: number; geoActiveNarratives: number };
  alerts: ExecutiveAlert[];
  risks: RiskCard[]; overallRisk: RiskStatus;
  brief: ExecutiveBrief;
  platformHealth: PlatformHealthSignal[];
}

const MISSION_TO_HEALTH: Record<string, PlatformHealthSignal['status']> = { GREEN: 'PASS', YELLOW: 'WARNING', RED: 'FAIL' };

export async function getExecutiveIntelligence(): Promise<ExecutiveIntelligence> {
  const nowIso = new Date().toISOString();
  const db = createClient();

  const [ops, audit, forecasts, scored] = await Promise.all([
    getOperationsCenter(),
    getPlatformAuditReport().catch(() => null),
    listForecastsDal(db, { limit: 2000 }).catch(() => []),
    scoredForecastsDal(db, 2000).catch(() => []),
  ]);

  // ---- forecast divergence --------------------------------------------------
  const scoreById = new Map(scored.map((s) => [s.id, s.result] as const));
  const divergenceRows = forecasts.map((f) => toDivergenceRow({
    id: f.id, title: f.title, owner: f.source ?? f.agentId ?? 'unknown', confidence: f.confidence, outcome: f.outcome,
    status: f.status, scoreResult: scoreById.get(f.id) ?? null, forecastDateIso: f.forecastDate, resolutionDateIso: f.resolutionDate, nowIso,
  }));
  const fc = summarizeDivergence(divergenceRows);

  // ---- derived inputs from the operations center ----------------------------
  const timelineNew = (label: string) => ops.timeline.find((t) => t.label === label) ?? { last7: 0, last30: 0 };
  const narrTl = timelineNew('New narratives');
  const sourcesTotal = ops.health.source.healthy + ops.health.source.degraded + ops.health.source.offline + ops.health.source.unknown;
  const narrativesMissingEvidence = ops.narrativeWatch.top.filter((n) => n.evidenceCount === 0 && n.signalCount > 0).length;
  const regionsWithNarratives = ops.geoWatch.topCountries.filter((c) => c.narrativeCount > 0).length;
  const topContradiction = ops.narrativeWatch.mostContradicted[0] ?? null;

  // ---- alerts ---------------------------------------------------------------
  const alerts = buildAlerts({
    narrativeNewRecent: narrTl.last7, narrativeNewPrior: Math.max(0, narrTl.last30 - narrTl.last7),
    topContradiction, blindSpotCount: ops.geoWatch.blindSpots.length, narrativesMissingEvidence,
    forecastDiverging: fc.diverging, forecastMissed: fc.missed,
    trustLow: ops.health.trust.low, trustObserved: ops.health.trust.observed,
    regionsWithNarratives, reviewBacklog: ops.overview.pendingReview,
    sourcesOffline: ops.health.source.offline, sourcesTotal,
  }, nowIso);

  // ---- risk -----------------------------------------------------------------
  const risks = computeRisks({
    narrativesMissingEvidence, narrativesTotal: ops.narrativeWatch.top.length,
    signalsWithEvidence: ops.transparencyWatch.signalWithEvidence, totalSignals: ops.transparencyWatch.totalSignals,
    trustLow: ops.health.trust.low, trustObserved: ops.health.trust.observed,
    forecastDiverging: fc.diverging, forecastMissed: fc.missed, forecastTotal: fc.total,
    attentionCritical: ops.attention.filter((a) => a.severity === 'critical').length,
    sourcesOffline: ops.health.source.offline, sourcesTotal,
    reviewBacklog: ops.overview.pendingReview,
    geoReady: ops.health.map.geoReady, sourcesAll: ops.health.map.total,
  });

  // ---- executive brief ------------------------------------------------------
  const tl = (l: string) => timelineNew(l);
  const brief = buildExecutiveBrief({
    nowIso,
    newLast7: { sources: tl('New sources').last7, signals: tl('New signals').last7, narratives: tl('New narratives').last7, evidence: tl('New evidence').last7, forecasts: tl('New forecasts').last7 },
    newPrior: { sources: Math.max(0, tl('New sources').last30 - tl('New sources').last7), signals: Math.max(0, tl('New signals').last30 - tl('New signals').last7), narratives: Math.max(0, tl('New narratives').last30 - tl('New narratives').last7), evidence: Math.max(0, tl('New evidence').last30 - tl('New evidence').last7), forecasts: Math.max(0, tl('New forecasts').last30 - tl('New forecasts').last7) },
    reviewBacklog: ops.overview.pendingReview,
    forecastDiverging: fc.diverging, forecastMissed: fc.missed, forecastUnresolved: fc.unresolved,
    trustLow: ops.health.trust.low, trustObserved: ops.health.trust.observed,
    blindSpotRegions: ops.geoWatch.blindSpots.map((b) => b.key), narrativesMissingEvidence,
    alerts,
  });

  // ---- platform health signals ----------------------------------------------
  const platformHealth: PlatformHealthSignal[] = ops.mission.domains.map((d) => ({ label: d.label, status: MISSION_TO_HEALTH[d.status] ?? 'WARNING' }));
  if (audit) {
    for (const c of audit.checks.filter((x) => ['supabase', 'storage', 'infrastructure', 'migrations'].includes(x.area))) {
      platformHealth.push({ label: c.title, status: c.status });
    }
  }

  return {
    overview: { activeSignals: ops.overview.signals, openInvestigations: ops.overview.investigations, reviewQueue: ops.overview.pendingReview, publishedReports: ops.overview.publishedReports },
    narrativeVelocity: ops.narrativeWatch.top,
    trustOverview: ops.health.trust,
    forecastHealth: fc,
    divergenceRows: divergenceRows.filter((r) => r.status !== 'on_track').slice(0, 25),
    blindSpots: ops.geoWatch.blindSpots,
    contradictions: ops.narrativeWatch.mostContradicted,
    geo: { geoReadySources: ops.health.map.geoReady, geoActiveSignals: ops.geoWatch.topCountries.reduce((n, c) => n + c.signalCount, 0), geoActiveNarratives: ops.geoWatch.topCountries.reduce((n, c) => n + c.narrativeCount, 0) },
    alerts, risks, overallRisk: overallRisk(risks), brief, platformHealth,
  };
}
