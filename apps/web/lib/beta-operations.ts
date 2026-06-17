// =============================================================================
// HSI Phase 50 — Beta Operations Center data (SERVER-ONLY, read-only).
//
// Answers "how is the platform itself performing?" for administrators. Reuses the
// EXISTING cached intelligence layers (public / source / operations / library) —
// no duplicate queries — and adds aggregate user/role counts (admin-only page).
// Public-safe AGGREGATES only: counts and role distribution, NEVER emails, names,
// or any PII. Metrics that require analytics we don't yet collect (logins, DAU,
// retention, page usage) are returned as null and rendered honestly as "—".
// =============================================================================

import { unstable_cache } from 'next/cache';
import { readPublicClient, getPublicIntelligenceBundle, getSignalLibraryData } from './public-intelligence';
import { getSourceIntelligence } from './source-intelligence';
import { getOperationsIntelligence } from './operations-intelligence';
import { CATEGORY_BUCKETS, type CategoryBucket } from './public-intelligence-mapping';

export interface RoleCount { role: string; count: number }

export interface BetaOverview {
  totalUsers: number;
  activeUsers: number;
  newThisWeek: number;
  researchers: number;
  reviewers: number;
  admins: number;
  contributors: number;
  roleDistribution: RoleCount[];
}

export interface BetaHealth {
  signalsSubmitted: number;
  signalsPublished: number;
  reportsPublished: number;
  reviewsCompleted: number;
  sourcesActive: number;
  traceability: number;
  trendSignals: number[];
  trendPublications: number[];
}

export interface BetaActivity {
  recentSubmissions: number;
  recentPublications: number;
  recentReviews: number;
  recentLogins: number | null;
}

export interface BetaEngagement {
  dau: number | null;
  wau: number | null;
  retention: number | null;
  participationRate: number;
  contributionRate: number;
}

export interface BetaWorkload {
  reviewBacklog: number;
  openInvestigations: number;
  pendingPublication: number;
  avgTurnaround: string;
  queuePressure: 'Low' | 'Medium' | 'High';
}

export interface BetaAdoption {
  mostActiveRoles: RoleCount[];
  mostActiveCategories: { category: CategoryBucket; count: number }[];
  pageAnalyticsAvailable: boolean;
}

export interface BetaRisk { label: string; severity: 'low' | 'medium' | 'high'; detail: string }

export interface BetaFeedback { total: number; open: number; resolved: number; available: boolean }

export interface BetaSummary {
  health: string;
  growth: string;
  participation: string;
  trust: string;
  risk: string;
  readiness: string;
  readinessTone: 'green' | 'amber' | 'red';
}

export interface BetaOperationsData {
  overview: BetaOverview;
  health: BetaHealth;
  activity: BetaActivity;
  engagement: BetaEngagement;
  workload: BetaWorkload;
  adoption: BetaAdoption;
  risks: BetaRisk[];
  feedback: BetaFeedback;
  summary: BetaSummary;
}

function pct(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num / den) * 1000) / 10;
}

function roleName(v: unknown): string | null {
  if (!v) return null;
  if (Array.isArray(v)) return roleName(v[0]);
  if (typeof v === 'object' && 'name' in (v as Record<string, unknown>)) {
    const n = (v as { name?: unknown }).name;
    return typeof n === 'string' ? n : null;
  }
  return null;
}

interface UserStats { total: number; active: number; newThisWeek: number; roles: Map<string, number> }

async function loadUserStats(): Promise<UserStats> {
  const empty: UserStats = { total: 0, active: 0, newThisWeek: 0, roles: new Map() };
  const c = readPublicClient();
  if (!c) return empty;

  let total = 0;
  let active = 0;
  let newThisWeek = 0;
  try {
    const { count } = await c.from('users').select('id', { count: 'exact', head: true });
    total = count ?? 0;
  } catch { /* ignore */ }
  try {
    const { count } = await c.from('users').select('id', { count: 'exact', head: true }).eq('status', 'active');
    active = count ?? 0;
  } catch { active = total; }
  try {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { count } = await c.from('users').select('id', { count: 'exact', head: true }).gte('created_at', since);
    newThisWeek = count ?? 0;
  } catch { /* ignore */ }

  const roles = new Map<string, number>();
  try {
    const { data } = await c.from('user_roles').select('roles(name)').limit(20000);
    for (const r of (data ?? []) as Array<{ roles: unknown }>) {
      const name = roleName(r.roles);
      if (name) roles.set(name, (roles.get(name) ?? 0) + 1);
    }
  } catch { /* ignore */ }

  return { total, active: active || total, newThisWeek, roles };
}

const loadUserStatsCached = unstable_cache(
  async (): Promise<UserStats> => loadUserStats(),
  ['beta-user-stats:v1'],
  { revalidate: 120, tags: ['beta-operations'] },
);

export async function getBetaOperations(): Promise<BetaOperationsData> {
  const [bundle, library, source, ops, users] = await Promise.all([
    getPublicIntelligenceBundle(),
    getSignalLibraryData(),
    getSourceIntelligence(),
    getOperationsIntelligence(),
    loadUserStatsCached().catch(() => ({ total: 0, active: 0, newThisWeek: 0, roles: new Map<string, number>() })),
  ]);

  const { metrics, activityBar } = bundle;
  const stage = (name: string) => ops.pipeline.find((s) => s.stage === name)?.count ?? 0;
  const signalC = stage('Signal');
  const evidenceC = stage('Evidence');
  const analysisC = stage('Analysis');
  const reviewC = stage('Review');
  const publicationC = stage('Publication');

  const role = (k: string) => users.roles.get(k) ?? 0;
  const researchers = role('researcher');
  const reviewers = role('reviewer');
  const admins = role('admin');
  const contributors = role('contributor');
  const curators = role('curator');
  const roleDistribution: RoleCount[] = Array.from(users.roles.entries())
    .map(([r, count]) => ({ role: r.charAt(0).toUpperCase() + r.slice(1), count }))
    .sort((a, b) => b.count - a.count);

  const overview: BetaOverview = {
    totalUsers: users.total,
    activeUsers: users.active,
    newThisWeek: users.newThisWeek,
    researchers, reviewers, admins, contributors,
    roleDistribution,
  };

  const health: BetaHealth = {
    signalsSubmitted: metrics.totalSignals,
    signalsPublished: publicationC,
    reportsPublished: metrics.publishedReports,
    reviewsCompleted: ops.review.approvedToday + ops.review.rejectedToday,
    sourcesActive: source.health.active,
    traceability: metrics.traceabilityScore,
    trendSignals: library.trends.signalsOverTime.map((p) => p.value),
    trendPublications: library.trends.publicationsOverTime.map((p) => p.value),
  };

  const activity: BetaActivity = {
    recentSubmissions: signalC,
    recentPublications: activityBar.publishedToday,
    recentReviews: ops.review.approvedToday + ops.review.rejectedToday,
    recentLogins: null,
  };

  const engaged = researchers + reviewers + curators + admins;
  const engagement: BetaEngagement = {
    dau: null,
    wau: null,
    retention: null,
    participationRate: pct(engaged, users.total),
    contributionRate: pct(contributors + engaged, users.total),
  };

  const queuePressure: BetaWorkload['queuePressure'] = ops.review.backlog > 50 ? 'High' : ops.review.backlog > 15 ? 'Medium' : 'Low';
  const workload: BetaWorkload = {
    reviewBacklog: ops.review.backlog,
    openInvestigations: signalC + evidenceC + analysisC,
    pendingPublication: reviewC,
    avgTurnaround: ops.review.avgReviewHours == null ? '—' : `${ops.review.avgReviewHours}h`,
    queuePressure,
  };

  const adoption: BetaAdoption = {
    mostActiveRoles: roleDistribution.slice(0, 5),
    mostActiveCategories: [...source.coverage]
      .map((c) => ({ category: c.category, count: c.signals }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    pageAnalyticsAvailable: false,
  };

  // Platform risks (only triggered flags).
  const risks: BetaRisk[] = [];
  if (ops.review.backlog > 20) risks.push({ label: 'Review bottleneck', severity: 'high', detail: `${ops.review.backlog} items pending review` });
  if (metrics.traceabilityScore > 0 && metrics.traceabilityScore < 80) risks.push({ label: 'Low traceability', severity: 'medium', detail: `Average traceability ${metrics.traceabilityScore.toFixed(1)}%` });
  const gaps = CATEGORY_BUCKETS.filter((b) => !source.coverage.some((c) => c.category === b && c.sources > 0));
  if (gaps.length > 0) risks.push({ label: 'Inactive source categories', severity: 'medium', detail: `No active sources for ${gaps.join(', ')}` });
  if (reviewC > 10) risks.push({ label: 'Publication delays', severity: 'medium', detail: `${reviewC} approved, awaiting publication` });
  const critical = library.facets.risks.find((r) => r.key === 'Critical')?.count ?? 0;
  if (critical > 0) risks.push({ label: 'Critical backlog', severity: 'high', detail: `${critical} critical-risk findings` });

  const feedback: BetaFeedback = { total: 0, open: 0, resolved: 0, available: false };

  const highRisks = risks.filter((r) => r.severity === 'high').length;
  const healthLabel = source.health.failing > 3 ? 'Degraded' : source.health.failing > 0 ? 'Watch' : 'Healthy';
  const readinessTone: BetaSummary['readinessTone'] = highRisks > 0 || source.health.failing > 3 ? 'red' : risks.length > 0 ? 'amber' : 'green';
  const summary: BetaSummary = {
    health: healthLabel,
    growth: users.newThisWeek > 0 ? `+${users.newThisWeek} users / 7d` : 'Flat',
    participation: `${engagement.participationRate}%`,
    trust: `${metrics.traceabilityScore.toFixed(1)}% traceable`,
    risk: risks.length > 0 ? `${risks.length} ${risks.length === 1 ? 'flag' : 'flags'}` : 'Low',
    readiness: readinessTone === 'green' ? 'Beta-ready' : readinessTone === 'amber' ? 'Monitoring' : 'Needs attention',
    readinessTone,
  };

  return { overview, health, activity, engagement, workload, adoption, risks, feedback, summary };
}
