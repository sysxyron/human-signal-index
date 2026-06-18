// =============================================================================
// HSI Phase 52 — Forecasting & Early Warning engine (SERVER-ONLY, read-only).
//
// A forecasting layer built ENTIRELY from observed, cached platform data — no
// black-box scoring, no fabricated forecasts, nothing presented as certainty.
// Every output is framed as likelihood / direction / velocity + an EXPLAINABLE
// confidence (derived from sample size, data continuity, and consistency).
// Momentum windows (7 / 30 / 90 day) are computed from real publication
// timestamps. Composes the existing cached layers (alerts / public / source /
// operations) — no duplicate reads, no N+1.
// =============================================================================

import { getPublicIntelligenceBundle, getSignalLibraryData, type PublicLibrarySignal } from './public-intelligence';
import { getSourceIntelligence } from './source-intelligence';
import { getOperationsIntelligence } from './operations-intelligence';
import { getAlertsIntelligence } from './alerts-intelligence';
import { CATEGORY_BUCKETS, riskForBucket, riskTier, type CategoryBucket } from './public-intelligence-mapping';

export type Confidence = 'Low' | 'Moderate' | 'High';
export type Direction = 'Increasing' | 'Stable' | 'Declining';

export interface MomentumWindow {
  period: '7d' | '30d' | '90d';
  current: number;
  prior: number;
  deltaPct: number;
  direction: Direction;
  confidence: Confidence;
  confidenceReason: string;
}

export interface RiskTrajectory {
  category: CategoryBucket;
  currentRisk: string;
  direction: Direction;
  velocity: number; // change in observed count (30d current − prior)
  confidence: Confidence;
}

export interface NarrativeMomentum {
  fastestGrowing: { category: CategoryBucket; deltaPct: number; current: number }[];
  mostPersistent: { category: CategoryBucket; periods: number }[];
  emerging: { label: string; reason: string }[];
  dormant: { category: CategoryBucket; lastSeen: string }[];
}

export interface SourceForecast { label: string; value: string; confidence: Confidence; note: string }
export interface SourceForecasts {
  likelyFailures: SourceForecast;
  likelyRecoveries: SourceForecast;
  coverageGaps: SourceForecast;
  coverageExpansion: SourceForecast;
  highYieldTrajectory: SourceForecast;
}

export interface ReviewForecast {
  backlogTrend: Direction;
  throughputTrend: Direction;
  publicationTrend: Direction;
  estimatedPressure: 'Low' | 'Medium' | 'High';
  confidence: Confidence;
}

export interface ExecutiveOutlook {
  topEmergingRisk: string;
  topGrowingCategory: string;
  sourceConcern: string;
  operationalPressure: string;
  platformOutlook: string;
  outlookTone: 'green' | 'amber' | 'red';
}

export interface EarlyWarning { label: string; indicator: string; confidence: Confidence }

export interface ForecastHistory { available: boolean; items: { label: string; outcome: string; observed: string }[]; successRate: number | null }

export interface ForecastData {
  earlyWarnings: EarlyWarning[];
  trendMomentum: MomentumWindow[];
  riskTrajectory: RiskTrajectory[];
  narrativeMomentum: NarrativeMomentum;
  sourceForecasts: SourceForecasts;
  reviewForecast: ReviewForecast;
  outlook: ExecutiveOutlook;
  history: ForecastHistory;
}

const DAY = 86_400_000;

function inWindow(iso: string | undefined, now: number, days: number, offsetDays = 0): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const age = now - t;
  return age >= offsetDays * DAY && age < (offsetDays + days) * DAY;
}

function directionOf(current: number, prior: number): { direction: Direction; deltaPct: number } {
  if (prior === 0) return current > 0 ? { direction: 'Increasing', deltaPct: 100 } : { direction: 'Stable', deltaPct: 0 };
  const pct = Math.round(((current - prior) / prior) * 100);
  return { direction: pct > 10 ? 'Increasing' : pct < -10 ? 'Declining' : 'Stable', deltaPct: pct };
}

function confidenceOf(current: number, prior: number): { confidence: Confidence; reason: string } {
  const total = current + prior;
  if (total < 4) return { confidence: 'Low', reason: 'Small sample — interpret with caution' };
  if (total < 12 || prior === 0 || current === 0) return { confidence: 'Moderate', reason: 'Limited continuity across periods' };
  return { confidence: 'High', reason: 'Consistent multi-period observations' };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export async function getForecastData(): Promise<ForecastData> {
  const [bundle, library, source, ops, alerts] = await Promise.all([
    getPublicIntelligenceBundle(),
    getSignalLibraryData(),
    getSourceIntelligence(),
    getOperationsIntelligence(),
    getAlertsIntelligence(),
  ]);

  const now = Date.now();
  const items: PublicLibrarySignal[] = library.signals;
  const countAll = (days: number, offset = 0) => items.filter((s) => inWindow(s.publishedAt, now, days, offset)).length;
  const countCat = (cat: CategoryBucket, days: number, offset = 0) => items.filter((s) => s.category === cat && inWindow(s.publishedAt, now, days, offset)).length;

  // ---- trend momentum (7 / 30 / 90 day, observed publications) ----
  const trendMomentum: MomentumWindow[] = ([7, 30, 90] as const).map((d) => {
    const current = countAll(d, 0);
    const prior = countAll(d, d);
    const { direction, deltaPct } = directionOf(current, prior);
    const { confidence, reason } = confidenceOf(current, prior);
    return { period: `${d}d` as MomentumWindow['period'], current, prior, deltaPct, direction, confidence, confidenceReason: reason };
  });

  // ---- risk trajectory (per category, 30-day window) ----
  const riskTrajectory: RiskTrajectory[] = CATEGORY_BUCKETS.map((category) => {
    const current = countCat(category, 30, 0);
    const prior = countCat(category, 30, 30);
    const { direction } = directionOf(current, prior);
    const { confidence } = confidenceOf(current, prior);
    return { category, currentRisk: riskTier(riskForBucket(category)), direction, velocity: current - prior, confidence };
  });

  // ---- narrative momentum ----
  const growth = CATEGORY_BUCKETS.map((category) => {
    const current = countCat(category, 30, 0);
    const prior = countCat(category, 30, 30);
    return { category, current, ...directionOf(current, prior) };
  });
  const fastestGrowing = growth.filter((g) => g.current > 0 && g.deltaPct > 0).sort((a, b) => b.deltaPct - a.deltaPct).slice(0, 4)
    .map((g) => ({ category: g.category, deltaPct: g.deltaPct, current: g.current }));
  const mostPersistent = CATEGORY_BUCKETS.map((category) => ({
    category,
    periods: [countCat(category, 7, 0), countCat(category, 30, 0), countCat(category, 90, 0)].filter((c) => c > 0).length,
  })).filter((p) => p.periods >= 2).sort((a, b) => b.periods - a.periods).slice(0, 4);
  const dormant = CATEGORY_BUCKETS.map((category) => {
    const recent = countCat(category, 30, 0);
    const older = countCat(category, 90, 30);
    const last = items.filter((s) => s.category === category).map((s) => s.publishedAt).filter(Boolean).sort().slice(-1)[0];
    return { category, recent, older, lastSeen: monthLabel(last) };
  }).filter((d) => d.recent === 0 && d.older > 0).map((d) => ({ category: d.category, lastSeen: d.lastSeen }));
  const narrativeMomentum: NarrativeMomentum = {
    fastestGrowing,
    mostPersistent,
    emerging: alerts.emerging.map((e) => ({ label: e.label, reason: e.reason })),
    dormant,
  };

  // ---- source forecasts (activity patterns only) ----
  const atRisk = source.sources.filter((s) => s.status === 'Active' && s.recentSignals === 0).length;
  const coverageGapsList = CATEGORY_BUCKETS.filter((b) => !source.coverage.some((c) => c.category === b && c.sources > 0));
  const expanding = source.sources.filter((s) => s.recentSignals > 0).length;
  const topYield = source.analytics.topSources[0];
  const sourceForecasts: SourceForecasts = {
    likelyFailures: { label: 'Likely source failures', value: String(atRisk + source.health.failing), confidence: confidenceOf(atRisk, source.health.failing).confidence, note: `${source.health.failing} failing + ${atRisk} active-but-silent` },
    likelyRecoveries: { label: 'Likely recoveries', value: String(source.health.failing), confidence: source.health.failing > 0 ? 'Moderate' : 'Low', note: 'Failing sources eligible to recover on next capture' },
    coverageGaps: { label: 'Coverage gaps', value: String(coverageGapsList.length), confidence: 'High', note: coverageGapsList.length ? coverageGapsList.join(', ') : 'All categories covered' },
    coverageExpansion: { label: 'Coverage expansion', value: String(expanding), confidence: confidenceOf(expanding, source.health.total - expanding).confidence, note: 'Sources active in the last 30 days' },
    highYieldTrajectory: { label: 'High-yield trajectory', value: topYield ? topYield.name : '—', confidence: topYield ? 'Moderate' : 'Low', note: topYield ? topYield.hint : 'No high-yield source yet' },
  };

  // ---- review forecasting ----
  const pubTrend = library.trends.publicationsOverTime;
  const pubDir = pubTrend.length >= 2 ? directionOf(pubTrend[pubTrend.length - 1].value, pubTrend[pubTrend.length - 2].value).direction : 'Stable';
  const sigTrend = library.trends.signalsOverTime;
  const sigDir = sigTrend.length >= 2 ? directionOf(sigTrend[sigTrend.length - 1].value, sigTrend[sigTrend.length - 2].value).direction : 'Stable';
  const reviewForecast: ReviewForecast = {
    backlogTrend: ops.review.backlog > 30 ? 'Increasing' : ops.review.backlog > 0 ? 'Stable' : 'Declining',
    throughputTrend: ops.review.approvedToday + ops.review.rejectedToday > 0 ? 'Increasing' : 'Stable',
    publicationTrend: pubDir,
    estimatedPressure: ops.review.backlog > 50 ? 'High' : ops.review.backlog > 15 ? 'Medium' : 'Low',
    confidence: pubTrend.length >= 3 ? 'Moderate' : 'Low',
  };

  // ---- early warnings (only when indicators support them) ----
  const earlyWarnings: EarlyWarning[] = [];
  const m30 = trendMomentum[1];
  if (m30.direction === 'Increasing' && m30.confidence !== 'Low') earlyWarnings.push({ label: 'Rising narratives', indicator: `Publications up ${m30.deltaPct}% over 30d (${m30.current} vs ${m30.prior})`, confidence: m30.confidence });
  const risingRisk = riskTrajectory.filter((r) => (r.currentRisk === 'Critical' || r.currentRisk === 'High') && r.direction === 'Increasing');
  if (risingRisk.length > 0) earlyWarnings.push({ label: 'Risk acceleration', indicator: `${risingRisk.map((r) => r.category).join(', ')} rising`, confidence: risingRisk[0].confidence });
  if (source.health.failing > 0) earlyWarnings.push({ label: 'Source failures', indicator: `${source.health.failing} source(s) failing capture`, confidence: 'High' });
  if (pubDir === 'Increasing') earlyWarnings.push({ label: 'Publication surge', indicator: 'Publication output rising period-over-period', confidence: pubTrend.length >= 3 ? 'Moderate' : 'Low' });
  if (reviewForecast.backlogTrend === 'Increasing') earlyWarnings.push({ label: 'Review backlog acceleration', indicator: `${ops.review.backlog} items pending`, confidence: 'Moderate' });
  for (const e of alerts.emerging) if (/concentration/i.test(e.label)) earlyWarnings.push({ label: 'Category concentration', indicator: e.reason, confidence: 'Moderate' });

  // ---- executive outlook ----
  const topGrowingCategory = fastestGrowing[0]?.category ?? '—';
  const topEmergingRisk = risingRisk[0]?.category ?? (alerts.emerging[0]?.label ?? '—');
  const sourceConcern = source.health.failing > 0 ? `${source.health.failing} failing` : coverageGapsList.length ? `${coverageGapsList.length} coverage gaps` : 'Stable';
  const operationalPressure = reviewForecast.estimatedPressure;
  const outlookTone: ExecutiveOutlook['outlookTone'] = source.health.failing > 3 || risingRisk.length > 0 ? 'red' : earlyWarnings.length > 0 ? 'amber' : 'green';
  const outlook: ExecutiveOutlook = {
    topEmergingRisk,
    topGrowingCategory,
    sourceConcern,
    operationalPressure,
    platformOutlook: outlookTone === 'green' ? 'Stable' : outlookTone === 'amber' ? 'Watch' : 'Elevated',
    outlookTone,
  };

  // ---- forecast history (no stored forecasts yet → graceful empty) ----
  const history: ForecastHistory = { available: false, items: [], successRate: null };

  return { earlyWarnings, trendMomentum, riskTrajectory, narrativeMomentum, sourceForecasts, reviewForecast, outlook, history };
}
