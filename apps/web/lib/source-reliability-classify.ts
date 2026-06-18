// =============================================================================
// HSI Phase 61 — source reliability classification (PURE, no I/O).
//
// Maps a capture event's free-text reason/error into a failure type and any
// detected anti-bot protection, classifies source type into the reporting
// buckets, and computes an EXPLAINABLE health score. Pure → unit-testable. This
// is OBSERVABILITY only: it classifies what the existing ingestion already
// recorded; it performs no fetching, no bypass, no evasion.
// =============================================================================

export type SourceTypeBucket =
  | 'RSS' | 'Website' | 'API' | 'Government' | 'Research' | 'Podcast'
  | 'YouTube' | 'Reddit' | 'Forum' | 'Social' | 'Other';

export const SOURCE_TYPE_BUCKETS: SourceTypeBucket[] = [
  'RSS', 'Website', 'API', 'Government', 'Research', 'Podcast', 'YouTube', 'Reddit', 'Forum', 'Social', 'Other',
];

export function typeBucketOf(raw: string | null | undefined): SourceTypeBucket {
  const s = (raw ?? '').toLowerCase();
  if (s.includes('rss') || s.includes('atom') || s.includes('feed')) return 'RSS';
  if (s.includes('youtube')) return 'YouTube';
  if (s.includes('reddit')) return 'Reddit';
  if (s.includes('podcast')) return 'Podcast';
  if (s.includes('forum')) return 'Forum';
  if (s.includes('gov')) return 'Government';
  if (s.includes('research') || s.includes('arxiv') || s.includes('paper') || s.includes('journal')) return 'Research';
  if (s.includes('api')) return 'API';
  if (/(twitter|^x$|facebook|instagram|tiktok|mastodon|telegram|social)/.test(s)) return 'Social';
  if (s.includes('web') || s.includes('site') || s.includes('news') || s.includes('http') || s.includes('url')) return 'Website';
  return 'Other';
}

export type FailureType =
  | 'Healthy' | 'Rate Limited' | 'Cloudflare Protected' | 'Login Required'
  | 'Access Denied' | 'Offline' | 'Timeout' | 'Parse Error' | 'Manual Review';

export interface FailureClassification { type: FailureType; detail: string }

/** Classify an event's failure from its status + free-text reason/error. */
export function classifyFailure(status: string | null | undefined, reason: string | null | undefined, error: string | null | undefined): FailureClassification {
  if (status === 'healthy') return { type: 'Healthy', detail: 'Last fetch succeeded.' };
  const t = `${reason ?? ''} ${error ?? ''}`.toLowerCase();
  if (/\b429\b|rate.?limit|too many requests/.test(t)) return { type: 'Rate Limited', detail: '429 / rate-limit responses detected.' };
  if (/cloudflare|cf-ray|just a moment|challenge|akamai|imperva|datadome/.test(t)) return { type: 'Cloudflare Protected', detail: 'Anti-bot challenge page detected.' };
  if (/captcha|recaptcha|hcaptcha/.test(t)) return { type: 'Cloudflare Protected', detail: 'CAPTCHA challenge detected.' };
  if (/login|sign.?in|auth(entication)? required|401|unauthorized|paywall/.test(t)) return { type: 'Login Required', detail: 'Authentication / login required.' };
  if (/\b403\b|forbidden|access denied|robots/.test(t)) return { type: 'Access Denied', detail: '403 / robots-disallowed response.' };
  if (/timeout|timed out|abort/.test(t)) return { type: 'Timeout', detail: 'Request timed out.' };
  if (/econnrefused|enotfound|network|connection|dns|offline|unreachable|5\d\d/.test(t)) return { type: 'Offline', detail: 'Connection failed or server error.' };
  if (/parse|invalid (xml|json|html)|malformed|unexpected token|empty (feed|body)/.test(t)) return { type: 'Parse Error', detail: 'Content fetched but parsing failed.' };
  return { type: 'Manual Review', detail: reason || error || 'Unknown failure reason.' };
}

export type Protection = 'Cloudflare' | 'Akamai' | 'Imperva' | 'DataDome' | 'CAPTCHA' | 'Robots block' | 'Login wall';

/** Detect a named protection vendor from event text, or null. */
export function detectProtection(reason: string | null | undefined, error: string | null | undefined): Protection | null {
  const t = `${reason ?? ''} ${error ?? ''}`.toLowerCase();
  if (/akamai/.test(t)) return 'Akamai';
  if (/imperva|incapsula/.test(t)) return 'Imperva';
  if (/datadome/.test(t)) return 'DataDome';
  if (/cloudflare|cf-ray|just a moment/.test(t)) return 'Cloudflare';
  if (/captcha/.test(t)) return 'CAPTCHA';
  if (/robots/.test(t)) return 'Robots block';
  if (/login|sign.?in|paywall|401|unauthorized/.test(t)) return 'Login wall';
  return null;
}

export type HealthStatus = 'HEALTHY' | 'WARNING' | 'FAILED';
export type ScoreTier = 'Excellent' | 'Healthy' | 'At Risk' | 'Failing';

export interface HealthScore {
  score: number; // 0–100
  tier: ScoreTier;
  status: HealthStatus;
  explanation: string;
  factors: { label: string; value: string }[];
}

export function scoreTier(score: number): ScoreTier {
  if (score >= 95) return 'Excellent';
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'At Risk';
  return 'Failing';
}

/**
 * Explainable health score from observed capture stats. No black box — the
 * weighting (success 60% + parse 20% + recency 20%, minus a consecutive-failure
 * penalty) is stated in the returned explanation/factors.
 */
export function computeHealthScore(input: {
  total: number;
  healthy: number;
  parseErrors: number;
  consecutiveFailures: number;
  lastSuccessAgeDays: number | null;
}): HealthScore {
  const { total, healthy, parseErrors, consecutiveFailures, lastSuccessAgeDays } = input;
  if (total === 0) {
    return { score: 50, tier: 'At Risk', status: 'WARNING', explanation: 'No capture events recorded yet — health is unknown.', factors: [{ label: 'Events', value: '0' }] };
  }
  const successRate = healthy / total;
  const parseRate = (total - parseErrors) / total;
  const recency = lastSuccessAgeDays == null ? 0 : lastSuccessAgeDays <= 1 ? 1 : lastSuccessAgeDays <= 7 ? 0.6 : lastSuccessAgeDays <= 30 ? 0.3 : 0;
  let score = successRate * 60 + parseRate * 20 + recency * 20;
  score -= Math.min(40, consecutiveFailures * 5);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const tier = scoreTier(score);
  const status: HealthStatus = score >= 80 ? 'HEALTHY' : score >= 60 ? 'WARNING' : 'FAILED';
  const factors = [
    { label: 'Success rate', value: `${Math.round(successRate * 100)}%` },
    { label: 'Parse success', value: `${Math.round(parseRate * 100)}%` },
    { label: 'Last success', value: lastSuccessAgeDays == null ? 'never' : `${lastSuccessAgeDays}d ago` },
    { label: 'Consecutive failures', value: String(consecutiveFailures) },
  ];
  const explanation = `Score = success ${Math.round(successRate * 100)}%×0.6 + parse ${Math.round(parseRate * 100)}%×0.2 + recency ${Math.round(recency * 100)}%×0.2 − ${Math.min(40, consecutiveFailures * 5)} (consecutive failures).`;
  return { score, tier, status, explanation, factors };
}

/** Observed backoff stage from consecutive failures (mirrors exponential policy; display only). */
export function backoffStage(consecutiveFailures: number): { stage: string; nextRetry: string } {
  if (consecutiveFailures === 0) return { stage: 'None', nextRetry: 'On schedule' };
  if (consecutiveFailures === 1) return { stage: 'Immediate retry', nextRetry: 'Next cycle' };
  if (consecutiveFailures <= 4) return { stage: `Exponential backoff (×${2 ** consecutiveFailures})`, nextRetry: `~${2 ** consecutiveFailures} cycles` };
  return { stage: 'Escalated failure', nextRetry: 'Manual review' };
}
