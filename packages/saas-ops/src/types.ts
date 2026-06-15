// =============================================================================
// @hsi/saas-ops — domain types (HSI Phase 39, v1.1). SaaS operations + analytics:
// revenue, churn, cohorts, LTV, subscription health, usage rollups, proration,
// forecasting, and webhook dead-letter ops. PURE — these describe what we compute
// and persist, independent of Stripe/DB/UI.
// =============================================================================

export type HealthStatus = 'healthy' | 'warning' | 'at-risk';
export type ChurnRisk = 'low' | 'medium' | 'high';
export type RollupPeriod = 'current_month' | 'previous_month' | 'lifetime';
export type PlanChangeKind = 'upgrade' | 'downgrade' | 'none';
export type ChangeTiming = 'immediate' | 'next_cycle';

/** A revenue-bearing subscription as seen by the analytics engine. */
export interface OpsSubscription {
  organizationId: string;
  planSlug: string;
  status: string; // active|trial|trialing|past_due|paused|expired|canceled
  billingCycle: 'monthly' | 'annual';
  /** Monthly-equivalent revenue in minor units (0 for trials/non-paying). */
  mrr: number;
  startedAt: string | null; // ISO — subscription start (for duration/LTV)
  createdAt: string | null; // ISO — org signup (for cohorts)
}

export interface RevenueMetrics {
  mrr: number;
  arr: number;
  growthRate: number; // fraction vs prior MRR (0.1 = +10%)
  expansionRevenue: number; // minor units gained from upgrades
  contractionRevenue: number; // minor units lost from downgrades
  churnedRevenue: number; // minor units lost from cancellations
  netNewRevenue: number; // expansion - contraction - churned
  currency: string;
}

export interface ChurnFactors {
  usageTrend: number; // fraction change vs prior period (negative = declining)
  daysSinceActivity: number;
  paymentFailures: number;
  trialDaysRemaining: number; // 0 when not trialing
  isTrialing: boolean;
}

export interface ChurnAssessment {
  risk: ChurnRisk;
  score: number; // 0..100 (higher = more likely to churn)
  reasons: string[];
}

export interface HealthFactors {
  activeUsers: number;
  usageTrend: number; // fraction change vs prior period
  daysSinceLogin: number;
  contentCreated: number; // signals + publications in period
  investigationActivity: number;
  publicationActivity: number;
}

export interface HealthAssessment {
  status: HealthStatus;
  score: number; // 0..100 (higher = healthier)
  reasons: string[];
}

export interface UsageRollup {
  period: RollupPeriod;
  signals: number;
  investigations: number;
  publications: number;
  storage: number;
  users: number;
}

export interface OverageRow {
  metric: 'users' | 'storage' | 'publications' | 'investigations' | 'signals';
  limit: number | null; // null = unlimited
  usage: number;
  overage: number; // max(0, usage - limit); 0 when unlimited
}

export interface LtvMetrics {
  totalRevenue: number; // minor units to date
  subscriptionMonths: number;
  averageMonthlyRevenue: number; // minor units
  projectedValue: number; // minor units (avg * expected lifetime)
}

export interface CohortRow {
  cohort: string; // e.g. '2026-01' or 'professional'
  size: number;
  retained: number;
  churned: number;
  retentionRate: number; // 0..1
  engagementRate: number; // 0..1
}

export interface RevenueForecast {
  nextMonthMrr: number;
  nextQuarterArr: number;
  churnProjection: number; // projected churned MRR next month (minor units)
  growthProjection: number; // projected net-new MRR next month (minor units)
  currency: string;
}

/** Proration preview for a plan change (Stripe is the source of truth). */
export interface ProrationResult {
  kind: PlanChangeKind;
  timing: ChangeTiming;
  credit: number; // minor units credited for unused current plan
  charge: number; // minor units charged for the new plan remainder
  netAmount: number; // charge - credit (can be negative = credit balance)
  immediate: boolean;
}

/** A failed webhook event eligible for replay / dead-letter handling. */
export interface DeadLetterEvent {
  stripeEventId: string;
  type: string;
  attempts: number;
  lastError: string | null;
}

export interface ReplayDecision {
  replay: boolean;
  reason: 'eligible' | 'max_attempts' | 'unknown_event';
}
