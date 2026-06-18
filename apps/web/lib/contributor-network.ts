// =============================================================================
// HSI Phase 54 — Contributor Network & Reputation intelligence (SERVER-ONLY,
// read-only). Aggregate contribution intelligence — NOT social media, NOT
// profiles. Composes the existing cached layers (public / source / operations /
// collaboration) + aggregate role counts (admin-only). Public-safe: aggregate
// counts + an EXPLAINABLE, no-black-box reputation/quality model. NO identities.
// The existing per-contributor reliability board (Phase 20) is preserved on the
// page as the contributor explorer.
// =============================================================================

import { getPublicIntelligenceBundle, getSignalLibraryData } from './public-intelligence';
import { getSourceIntelligence } from './source-intelligence';
import { getOperationsIntelligence } from './operations-intelligence';
import { getCollaborationData } from './collaboration-intelligence';
import { getBetaOperations } from './beta-operations';
import { CATEGORY_BUCKETS, type CategoryBucket } from './public-intelligence-mapping';

export interface ContributorOverview {
  available: boolean; // false for non-admins (aggregate user counts are admin-only)
  active: number;
  newRecent: number;
  researchers: number;
  reviewers: number;
  admins: number;
  contributors: number;
  roleDistribution: { role: string; count: number }[];
}

export interface ContributionHealth {
  signalsSubmitted: number;
  evidenceAdded: number;
  reviewsCompleted: number;
  reportsPublished: number;
  approvalRate: number | null;
  rejectionRate: number | null;
}

export interface ScoreExplained { label: 'Low' | 'Moderate' | 'High'; reason: string }

export interface ContributorQuality {
  traceabilityAvg: number;
  publicationSuccessRate: number;
  reviewOutcomeQuality: number | null;
  consistency: ScoreExplained;
  confidence: ScoreExplained;
}

export interface CategoryCoverage {
  category: CategoryBucket;
  contributors: number;
  signals: number;
  publications: number;
  gap: boolean;
}

export interface ReputationTier { tier: string; criteria: string }

export interface NetworkHealth {
  coverageStrength: { covered: number; total: number; pct: number };
  reviewerCapacity: string;
  researchCapacity: string;
  dependencyRisks: string[];
  growthRate: string;
  retention: string;
}

export interface ContributorSummary {
  growth: string;
  quality: string;
  coverageRisk: string;
  reviewerPressure: string;
  outlook: string;
  tone: 'green' | 'amber' | 'red';
}

export interface ContributorNetworkData {
  role: string | null;
  isAdmin: boolean;
  overview: ContributorOverview;
  health: ContributionHealth;
  quality: ContributorQuality;
  coverage: CategoryCoverage[];
  reputationModel: ReputationTier[];
  networkHealth: NetworkHealth;
  summary: ContributorSummary;
}

const REPUTATION_MODEL: ReputationTier[] = [
  { tier: 'Emerging', criteria: 'New contributor with a small but growing set of approved contributions; limited history.' },
  { tier: 'Established', criteria: 'Consistent approved contributions across multiple periods with solid traceability.' },
  { tier: 'Trusted', criteria: 'Sustained high approval rate and high average traceability over continued activity.' },
  { tier: 'Expert', criteria: 'Top-tier traceability and publication outcomes with breadth across categories.' },
  { tier: 'Inactive', criteria: 'No contributions observed in the recent activity window.' },
];

function pct(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num / den) * 1000) / 10;
}

export async function getContributorNetwork(role: string | null): Promise<ContributorNetworkData> {
  const isAdmin = role === 'admin';

  const [bundle, library, source, ops, collab, beta] = await Promise.all([
    getPublicIntelligenceBundle(),
    getSignalLibraryData(),
    getSourceIntelligence(),
    getOperationsIntelligence(),
    getCollaborationData(role),
    isAdmin ? getBetaOperations() : Promise.resolve(null),
  ]);

  const { metrics } = bundle;

  // ---- overview (aggregate role counts — admin only) ----
  const overview: ContributorOverview = beta
    ? {
        available: true,
        active: beta.overview.activeUsers,
        newRecent: beta.overview.newThisWeek,
        researchers: beta.overview.researchers,
        reviewers: beta.overview.reviewers,
        admins: beta.overview.admins,
        contributors: beta.overview.contributors,
        roleDistribution: beta.overview.roleDistribution,
      }
    : { available: false, active: 0, newRecent: 0, researchers: 0, reviewers: 0, admins: 0, contributors: 0, roleDistribution: [] };

  // ---- contribution health ----
  const published = library.signals.filter((s) => s.status === 'Published');
  const archived = library.signals.filter((s) => s.status === 'Archived');
  const evidenceAdded = library.signals.reduce((s, x) => s + x.evidenceCount, 0);
  const reviewedToday = ops.review.approvedToday + ops.review.rejectedToday;
  const approvalRate = reviewedToday > 0 ? pct(ops.review.approvedToday, reviewedToday) : null;
  const rejectionRate = reviewedToday > 0 ? pct(ops.review.rejectedToday, reviewedToday) : null;
  const health: ContributionHealth = {
    signalsSubmitted: metrics.totalSignals,
    evidenceAdded,
    reviewsCompleted: reviewedToday,
    reportsPublished: metrics.publishedReports,
    approvalRate,
    rejectionRate,
  };

  // ---- contributor quality (explainable) ----
  const publicationSuccessRate = pct(published.length, published.length + archived.length);
  const pubTrend = library.trends.publicationsOverTime;
  const consistency: ScoreExplained = pubTrend.length >= 3
    ? { label: 'High', reason: 'Output observed across 3+ periods' }
    : pubTrend.length === 2
      ? { label: 'Moderate', reason: 'Output observed across 2 periods' }
      : { label: 'Low', reason: 'Insufficient multi-period history' };
  const sample = metrics.totalSignals + metrics.publishedReports;
  const confidence: ScoreExplained = sample >= 50
    ? { label: 'High', reason: 'Large observed sample' }
    : sample >= 12
      ? { label: 'Moderate', reason: 'Moderate observed sample' }
      : { label: 'Low', reason: 'Small sample — interpret with caution' };
  const quality: ContributorQuality = {
    traceabilityAvg: metrics.traceabilityScore,
    publicationSuccessRate,
    reviewOutcomeQuality: approvalRate,
    consistency,
    confidence,
  };

  // ---- category coverage ----
  const pubByCat = new Map<CategoryBucket, number>();
  for (const s of published) pubByCat.set(s.category, (pubByCat.get(s.category) ?? 0) + 1);
  const coverage: CategoryCoverage[] = CATEGORY_BUCKETS.map((category) => {
    const cov = source.coverage.find((c) => c.category === category);
    return {
      category,
      contributors: cov?.sources ?? 0,
      signals: cov?.signals ?? 0,
      publications: pubByCat.get(category) ?? 0,
      gap: (cov?.sources ?? 0) === 0,
    };
  });

  // ---- network health ----
  const covered = coverage.filter((c) => c.contributors > 0).length;
  const dependencyRisks: string[] = [];
  for (const c of coverage) if (c.contributors === 1) dependencyRisks.push(`${c.category}: single source`);
  if (collab.crossTeam.sourceConcentration && collab.crossTeam.sourceConcentration !== '—') {
    const m = /(\d+)%/.exec(collab.crossTeam.sourceConcentration);
    if (m && Number(m[1]) >= 40) dependencyRisks.push(`Source concentration (${collab.crossTeam.sourceConcentration})`);
  }
  const reviewerCapacity = overview.available
    ? `${overview.reviewers} reviewer(s) · ${ops.review.backlog} backlog`
    : `${ops.review.backlog} backlog (${collab.workload.backlogPressure} pressure)`;
  const researchCapacity = overview.available ? `${overview.researchers} researcher(s)` : '—';
  const growthRate = overview.available ? (overview.newRecent > 0 ? `+${overview.newRecent} / 7d` : 'Flat') : '—';
  const retention = overview.available ? `${pct(overview.active, beta!.overview.totalUsers)}% active` : '—';
  const networkHealth: NetworkHealth = {
    coverageStrength: { covered, total: CATEGORY_BUCKETS.length, pct: pct(covered, CATEGORY_BUCKETS.length) },
    reviewerCapacity,
    researchCapacity,
    dependencyRisks,
    growthRate,
    retention,
  };

  // ---- executive summary ----
  const gaps = coverage.filter((c) => c.gap).length;
  const tone: ContributorSummary['tone'] = dependencyRisks.length > 1 || ops.review.backlog > 30 ? 'red' : gaps > 0 || ops.review.backlog > 15 ? 'amber' : 'green';
  const summary: ContributorSummary = {
    growth: overview.available ? growthRate : `${metrics.publishedReports} reports`,
    quality: `${metrics.traceabilityScore.toFixed(1)}% traceable`,
    coverageRisk: gaps > 0 ? `${gaps} coverage gap${gaps === 1 ? '' : 's'}` : 'Full coverage',
    reviewerPressure: collab.workload.backlogPressure,
    outlook: tone === 'green' ? 'Healthy' : tone === 'amber' ? 'Watch' : 'At risk',
    tone,
  };

  return { role, isAdmin, overview, health, quality, coverage, reputationModel: REPUTATION_MODEL, networkHealth, summary };
}
