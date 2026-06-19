// =============================================================================
// HSI Phase 63 — Monitoring dashboard data (SERVER-ONLY, read).
//
// Composes the LIVE Phase 61 reliability snapshot (current classifications +
// collections + executive lists) with the PERSISTED monitoring history (alert
// feed, state-change counts, per-source score trends). Reads monitoring tables
// through the caller's RLS client (reviewer+); getSourceReliability uses its own
// cached read. Every number is computed — nothing fabricated. Never throws.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { getSourceReliability } from '@/lib/source-reliability';
import { toSignal, classifyAll } from './classify';
import { reliabilityTrend, type TrendResult } from './policy';
import { readPriorStates, readRecentAlerts, readRecentEvents, readScoreHistory, type AlertRow } from './persistence';
import type { Classification, SourceState, ReliabilityTrend } from './types';

export interface MonitoringOverview {
  total: number; healthy: number; warning: number; degraded: number;
  stale: number; blocked: number; unreachable: number; failed: number;
}
export interface BandDistribution { tier: string; count: number }
export interface ChangeCounts { stateChanges: number; failures: number; recoveries: number }
export interface CollectionStats { fetchesPerDay: number; successPct: number; failurePct: number; avgLatencyMs: number | null }
export interface TrendRow { sourceId: string; sourceName: string; state: SourceState; trend: ReliabilityTrend; detail: string }
export interface RiskRow { sourceName: string; state: SourceState; reason: string }

export interface MonitoringExecutive {
  question: string;
  verdict: string;
  mostReliable: { name: string; score: number }[];
  mostFragile: { name: string; score: number }[];
  newFailures: AlertRow[];
  recovered: AlertRow[];
  coverageRisk: string;
  categoryRisks: { label: string; detail: string }[];
  topRisks: RiskRow[];
}

export interface MonitoringDashboard {
  overview: MonitoringOverview;
  distribution: BandDistribution[];
  changes: ChangeCounts;
  collections: CollectionStats;
  alerts: AlertRow[];
  trends: TrendRow[];
  executive: MonitoringExecutive;
  lastRunAt: string | null;
}

const STATE_SEVERITY: Record<SourceState, number> = {
  FAILED: 7, UNREACHABLE: 6, BLOCKED: 5, STALE: 4, DEGRADED: 3, WARNING: 2, RECOVERED: 1, HEALTHY: 0,
};

const FAILURE_KINDS = new Set(['SOURCE_FAILED', 'SOURCE_BLOCKED', 'SOURCE_STALE', 'COLLECTION_GAP', 'RELIABILITY_DROP', 'SOURCE_DEGRADED']);

export async function getMonitoringDashboard(): Promise<MonitoringDashboard> {
  const db = createClient();
  const nowIso = new Date().toISOString();

  const rel = await getSourceReliability();
  const signals = rel.sources.map(toSignal);
  const priors = await readPriorStates(db);
  const classifications = classifyAll(signals, priors, nowIso);

  // overview (live classifications)
  const overview: MonitoringOverview = { total: signals.length, healthy: 0, warning: 0, degraded: 0, stale: 0, blocked: 0, unreachable: 0, failed: 0 };
  for (const cls of classifications.values()) {
    switch (cls.state) {
      case 'HEALTHY': case 'RECOVERED': overview.healthy += 1; break;
      case 'WARNING': overview.warning += 1; break;
      case 'DEGRADED': overview.degraded += 1; break;
      case 'STALE': overview.stale += 1; break;
      case 'BLOCKED': overview.blocked += 1; break;
      case 'UNREACHABLE': overview.unreachable += 1; break;
      case 'FAILED': overview.failed += 1; break;
    }
  }

  // reliability band distribution (live)
  const bandMap = new Map<string, number>([['Excellent', 0], ['Healthy', 0], ['At Risk', 0], ['Failing', 0]]);
  for (const s of signals) bandMap.set(s.tier, (bandMap.get(s.tier) ?? 0) + 1);
  const distribution: BandDistribution[] = Array.from(bandMap.entries()).map(([tier, count]) => ({ tier, count }));

  // persisted alert feed + change counts
  const [alerts, events] = await Promise.all([readRecentAlerts(db, 100), readRecentEvents(db, 300)]);
  const changes: ChangeCounts = {
    stateChanges: events.length,
    failures: events.filter((e) => e.kind != null && FAILURE_KINDS.has(e.kind)).length,
    recoveries: events.filter((e) => e.kind === 'SOURCE_RECOVERED' || e.toState === 'RECOVERED').length,
  };

  // collections (live analytics)
  const collections: CollectionStats = {
    fetchesPerDay: rel.analytics.fetchesPerDay, successPct: rel.analytics.successPct,
    failurePct: rel.analytics.failurePct, avgLatencyMs: rel.analytics.avgLatencyMs,
  };

  // trends for the most-notable sources (bounded queries)
  const notable = signals
    .map((s) => ({ s, cls: classifications.get(s.id)! }))
    .filter((x) => x.cls && x.cls.state !== 'HEALTHY')
    .sort((a, b) => STATE_SEVERITY[b.cls.state] - STATE_SEVERITY[a.cls.state])
    .slice(0, 8);
  const trends: TrendRow[] = [];
  for (const x of notable) {
    const history = await readScoreHistory(db, x.s.id, 12);
    const series = history.length ? history : [x.cls.score];
    const t: TrendResult = reliabilityTrend(series);
    trends.push({ sourceId: x.s.id, sourceName: x.s.name, state: x.cls.state, trend: t.trend, detail: t.detail });
  }

  // executive summary
  const ranked = Array.from(classifications.values());
  const failing = overview.failed + overview.blocked + overview.unreachable + overview.stale;
  const healthyPct = overview.total > 0 ? Math.round((overview.healthy / overview.total) * 100) : 0;
  const verdict = overview.total === 0
    ? 'No sources are being monitored yet.'
    : failing === 0
      ? `Yes — ${healthyPct}% of ${overview.total} sources are healthy with no active failures.`
      : `Caution — ${failing} of ${overview.total} sources need attention (${healthyPct}% healthy).`;

  const riskRows: RiskRow[] = signals
    .map((s) => ({ name: s.name, cls: classifications.get(s.id) }))
    .filter((x): x is { name: string; cls: Classification } => !!x.cls && x.cls.state !== 'HEALTHY' && x.cls.state !== 'RECOVERED')
    .sort((a, b) => STATE_SEVERITY[b.cls.state] - STATE_SEVERITY[a.cls.state])
    .slice(0, 5)
    .map((x) => ({ sourceName: x.name, state: x.cls.state, reason: x.cls.reason }));

  const executive: MonitoringExecutive = {
    question: 'Can we trust our source network today?',
    verdict,
    mostReliable: rel.summary.mostReliable,
    mostFragile: rel.summary.mostFragile,
    newFailures: alerts.filter((a) => FAILURE_KINDS.has(a.kind)).slice(0, 5),
    recovered: alerts.filter((a) => a.kind === 'SOURCE_RECOVERED').slice(0, 5),
    coverageRisk: rel.summary.coverageRisk,
    categoryRisks: rel.dependencies.map((d) => ({ label: d.label, detail: d.coverageImpact })),
    topRisks: riskRows,
  };

  // last run = newest evaluated_at on state
  let lastRunAt: string | null = null;
  try {
    const { data } = await db.from('source_monitoring_state').select('evaluated_at').order('evaluated_at', { ascending: false }).limit(1);
    lastRunAt = (data?.[0] as { evaluated_at?: string } | undefined)?.evaluated_at ?? null;
  } catch { /* ignore */ }

  return { overview, distribution, changes, collections, alerts, trends, executive, lastRunAt };
}
