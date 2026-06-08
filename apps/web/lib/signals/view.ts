// =============================================================================
// HSI Phase 7 — client-safe view helpers for the Human Signal Intelligence UI.
//
// PURE + CLIENT-SAFE: no server-only imports (no next/headers, no Supabase
// server client, no actions). These map domain unions → color/label, format
// dates, and derive labeled DEMO view-models from the @hsi/source-intelligence
// fixtures so the UI renders fully offline when actions return NOT_CONFIGURED.
//
// Charts: small SVG primitives (LineChart) live in @hsi/ui — view helpers only
// shape data into the {date;count}[] series those charts consume.
// =============================================================================

import type {
  HsinAlertSeverity,
  HsinAlertStatus,
  HsinAlertType,
  HsinSignalAlertRecord,
  HsinSignalCategory,
  HsinSignalStatus,
  HsinSourceRecord,
  HsinSourceStatus,
  HsinSourceType,
  HsinSignalRecord,
  HsinWatchlistRecord,
  IntelligenceOverview,
  SignalWithContext,
  SourceWithStats,
} from '@hsi/shared-types';
import {
  DEMO_SIGNALS,
  DEMO_SOURCES,
  DEFAULT_WATCHLISTS,
  FIXTURE_NOW,
} from '@hsi/source-intelligence';

/* -------------------------------------------------------------------------- */
/* Role gating (pure — safe in client + server). Roles cascade by privilege.   */
/* -------------------------------------------------------------------------- */

const ROLE_RANK: Record<string, number> = {
  viewer: 0,
  contributor: 1,
  researcher: 2,
  reviewer: 3,
  editor: 3,
  admin: 4,
  owner: 5,
};

function rank(role?: string | null): number {
  if (!role) return -1;
  return ROLE_RANK[role.toLowerCase()] ?? -1;
}

/** Researcher or above (can add/edit/disable sources, create research runs). */
export function canManageSources(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}

/** Researcher or above (can create research runs / watchlists, capture). */
export function canResearch(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}

/** Researcher or above can trigger a capture. */
export function canCapture(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}

/** Reviewer or above (can record review decisions, act on alerts). */
export function canReview(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.reviewer;
}

/* -------------------------------------------------------------------------- */
/* Color / tone vocabulary (shared with @hsi/ui token palette)                */
/* -------------------------------------------------------------------------- */

export type Tone = 'neutral' | 'blue' | 'purple' | 'green' | 'orange' | 'red';

export interface Decorated {
  label: string;
  /** hex color for the dominant accent. */
  color: string;
  tone: Tone;
}

const TONE_COLORS: Record<Tone, string> = {
  neutral: '#94A3B8',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  green: '#10B981',
  orange: '#F59E0B',
  red: '#EF4444',
};

/** Resolve a Tone to its hex color (used by inline-styled chips). */
export function toneColor(tone: Tone): string {
  return TONE_COLORS[tone];
}

/* -------------------------------------------------------------------------- */
/* Source type / status / health                                               */
/* -------------------------------------------------------------------------- */

const SOURCE_TYPE_LABELS: Record<string, string> = {
  website: 'Website',
  rss: 'RSS',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  podcast: 'Podcast',
  forum: 'Forum',
  document: 'Document',
  manual: 'Manual',
};

export function sourceTypeLabel(type: HsinSourceType | string): string {
  return SOURCE_TYPE_LABELS[String(type)] ?? titleize(String(type));
}

export function sourceStatusDecor(status: HsinSourceStatus): Decorated {
  switch (status) {
    case 'active':
      return { label: 'Active', color: TONE_COLORS.green, tone: 'green' };
    case 'paused':
      return { label: 'Paused', color: TONE_COLORS.orange, tone: 'orange' };
    case 'error':
      return { label: 'Error', color: TONE_COLORS.red, tone: 'red' };
    case 'disabled':
    default:
      return { label: 'Disabled', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
}

/**
 * Map a free-form source-health status string to a decorated badge. Unknown
 * statuses degrade to neutral so we never hide an odd value.
 */
export function sourceHealthDecor(status?: string): Decorated {
  const s = (status ?? 'unknown').toLowerCase();
  if (s === 'healthy' || s === 'ok' || s === 'up') {
    return { label: 'Healthy', color: TONE_COLORS.green, tone: 'green' };
  }
  if (s === 'degraded' || s === 'slow') {
    return { label: 'Degraded', color: TONE_COLORS.orange, tone: 'orange' };
  }
  if (s === 'failing' || s === 'down' || s === 'error') {
    return { label: 'Failing', color: TONE_COLORS.red, tone: 'red' };
  }
  return { label: titleize(s), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/* -------------------------------------------------------------------------- */
/* Signal category / status                                                    */
/* -------------------------------------------------------------------------- */

const CATEGORY_TONES: Record<string, Tone> = {
  ideology: 'purple',
  recruitment: 'red',
  radicalization: 'red',
  misinformation: 'orange',
  disinformation: 'orange',
  propaganda: 'orange',
  extremism: 'red',
  extinction: 'red',
  coordination: 'purple',
  mobilization: 'purple',
  narrative_shift: 'blue',
  self_harm: 'red',
  violence: 'red',
  targeting: 'red',
  financing: 'orange',
  technology: 'blue',
  population: 'orange',
  collapse: 'orange',
  other: 'neutral',
};

export function signalCategoryDecor(
  category?: HsinSignalCategory | string,
): Decorated {
  const key = String(category ?? 'other');
  const tone = CATEGORY_TONES[key] ?? 'neutral';
  return { label: titleize(key), color: TONE_COLORS[tone], tone };
}

export function signalStatusDecor(status: HsinSignalStatus): Decorated {
  switch (status) {
    case 'new':
      return { label: 'New', color: TONE_COLORS.blue, tone: 'blue' };
    case 'reviewing':
      return { label: 'Reviewing', color: TONE_COLORS.orange, tone: 'orange' };
    case 'approved':
      return { label: 'Approved', color: TONE_COLORS.green, tone: 'green' };
    case 'rejected':
      return { label: 'Rejected', color: TONE_COLORS.red, tone: 'red' };
    case 'needs_research':
      return {
        label: 'Needs research',
        color: TONE_COLORS.purple,
        tone: 'purple',
      };
    case 'published':
      return { label: 'Published', color: TONE_COLORS.green, tone: 'green' };
    default:
      return { label: titleize(String(status)), color: TONE_COLORS.neutral, tone: 'neutral' };
  }
}

/* -------------------------------------------------------------------------- */
/* Alert severity / status / type                                              */
/* -------------------------------------------------------------------------- */

export function alertSeverityDecor(severity: HsinAlertSeverity): Decorated {
  switch (severity) {
    case 'CRITICAL':
      return { label: 'Critical', color: '#B91C1C', tone: 'red' };
    case 'HIGH':
      return { label: 'High', color: TONE_COLORS.red, tone: 'red' };
    case 'MEDIUM':
      return { label: 'Medium', color: TONE_COLORS.orange, tone: 'orange' };
    case 'LOW':
    default:
      return { label: 'Low', color: TONE_COLORS.blue, tone: 'blue' };
  }
}

/** Rank for sorting — higher = more urgent, so the worst alerts surface first. */
export function alertSeverityRank(severity: HsinAlertSeverity): number {
  return { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }[severity] ?? 0;
}

export function alertStatusDecor(status: HsinAlertStatus): Decorated {
  switch (status) {
    case 'open':
      return { label: 'Open', color: TONE_COLORS.red, tone: 'red' };
    case 'acknowledged':
      return { label: 'Acknowledged', color: TONE_COLORS.blue, tone: 'blue' };
    case 'escalated':
      return { label: 'Escalated', color: TONE_COLORS.purple, tone: 'purple' };
    case 'resolved':
    default:
      return { label: 'Resolved', color: TONE_COLORS.green, tone: 'green' };
  }
}

const ALERT_TYPE_LABELS: Record<HsinAlertType, string> = {
  new_signal: 'New signal',
  source_changed: 'Source changed',
  narrative_shift: 'Narrative shift',
  watchlist_match: 'Watchlist match',
  high_risk_signal: 'High-risk signal',
  review_escalation: 'Review escalation',
  research_created: 'Research created',
  publication_created: 'Publication created',
};

export function alertTypeLabel(type: HsinAlertType | string): string {
  return ALERT_TYPE_LABELS[type as HsinAlertType] ?? titleize(String(type));
}

/* -------------------------------------------------------------------------- */
/* Watchlist severity                                                          */
/* -------------------------------------------------------------------------- */

export function watchlistSeverityDecor(severity?: HsinAlertSeverity): Decorated {
  return alertSeverityDecor(severity ?? 'MEDIUM');
}

/* -------------------------------------------------------------------------- */
/* Confidence                                                                  */
/* -------------------------------------------------------------------------- */

/** Format a 0..1 confidence as a whole-percent string; '—' when absent. */
export function confidencePct(confidence?: number): string {
  if (confidence == null || Number.isNaN(confidence)) return '—';
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Confidence band — we NEVER hide low confidence; it is shown honestly with a
 * cautionary tone so reviewers can weigh it.
 */
export function confidenceDecor(confidence?: number): Decorated {
  if (confidence == null || Number.isNaN(confidence)) {
    return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
  if (confidence >= 0.75) {
    return { label: 'High', color: TONE_COLORS.green, tone: 'green' };
  }
  if (confidence >= 0.45) {
    return { label: 'Moderate', color: TONE_COLORS.orange, tone: 'orange' };
  }
  return { label: 'Low', color: TONE_COLORS.red, tone: 'red' };
}

/* -------------------------------------------------------------------------- */
/* Date formatting                                                             */
/* -------------------------------------------------------------------------- */

/** Absolute, locale-independent date+time. Returns '—' for empty input. */
export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/** Date-only formatting (YYYY-MM-DD). */
export function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

/** Coarse relative time ("3h ago", "just now"). Returns '—' for empty input. */
export function relativeTime(iso?: string, now: number = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = now - t;
  const abs = Math.abs(diff);
  const past = diff >= 0;
  const mins = Math.round(abs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return rel(mins, 'min', past);
  const hours = Math.round(mins / 60);
  if (hours < 24) return rel(hours, 'h', past);
  const days = Math.round(hours / 24);
  if (days < 30) return rel(days, 'd', past);
  const months = Math.round(days / 30);
  if (months < 12) return rel(months, 'mo', past);
  return rel(Math.round(months / 12), 'y', past);
}

function rel(n: number, unit: string, past: boolean): string {
  const body = `${n}${unit}`;
  return past ? `${body} ago` : `in ${body}`;
}

/* -------------------------------------------------------------------------- */
/* Misc string helpers                                                         */
/* -------------------------------------------------------------------------- */

export function titleize(s: string): string {
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Safe truncation for raw excerpts. */
export function excerpt(text?: string, max = 280): string {
  if (!text) return '';
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/* -------------------------------------------------------------------------- */
/* DEMO mappers — fixtures → view-models, ALWAYS labeled "Demo" in the UI      */
/* -------------------------------------------------------------------------- */

/**
 * The result of resolving a fetch: either live data or a clearly-labeled demo
 * view derived from fixtures. `isDemo` MUST drive a visible "Demo" badge.
 */
export interface Resolved<T> {
  data: T;
  isDemo: boolean;
}

function demoSourceRecord(
  fx: (typeof DEMO_SOURCES)[number],
  i: number,
): HsinSourceRecord {
  const statuses: HsinSourceStatus[] = ['active', 'active', 'paused'];
  return {
    id: fx.id,
    name: fx.name,
    description: fx.description,
    source_type: fx.sourceType,
    platform: fx.sourceType === 'rss' ? 'RSS feed' : 'Web',
    homepage_url: fx.homepageUrl,
    rss_url: fx.rssUrl,
    status: statuses[i % statuses.length],
    risk_level: fx.riskLevel != null ? Math.round(fx.riskLevel * 5) : undefined,
    monitoring_enabled: true,
    last_checked_at: FIXTURE_NOW,
    created_at: FIXTURE_NOW,
    updated_at: FIXTURE_NOW,
  };
}

/** Demo SourceWithStats[] for the source registry offline view. */
export function demoSourcesWithStats(): SourceWithStats[] {
  return DEMO_SOURCES.map((fx, i) => {
    const source = demoSourceRecord(fx, i);
    const signalCount = DEMO_SIGNALS.filter((s) => s.sourceId === fx.id).length;
    return {
      source,
      health: {
        id: `health_${fx.id}`,
        source_id: fx.id,
        status: i === 2 ? 'degraded' : 'healthy',
        response_time: 220 + i * 90,
        failure_count: i === 2 ? 2 : 0,
        created_at: FIXTURE_NOW,
      },
      signalCount,
      alertCount: signalCount > 0 ? 1 : 0,
      watchlists: DEFAULT_WATCHLISTS.slice(0, (i % 2) + 1).map((w) => w.name),
    };
  });
}

function demoSignalRecord(
  fx: (typeof DEMO_SIGNALS)[number],
  i: number,
): HsinSignalRecord {
  const statuses: HsinSignalStatus[] = ['new', 'reviewing', 'approved', 'new'];
  return {
    id: `sig_demo_${i}`,
    source_id: fx.sourceId,
    title: fx.title,
    summary: fx.summary,
    raw_content: fx.rawContent,
    content_hash: fx.contentHash,
    signal_type: fx.signalType,
    signal_category: fx.signalCategory,
    confidence: fx.confidence,
    status: statuses[i % statuses.length],
    captured_at: fx.capturedAt,
    created_at: fx.capturedAt,
  };
}

/** Demo SignalWithContext[] for the signal dashboard offline view. */
export function demoSignalsWithContext(): SignalWithContext[] {
  return DEMO_SIGNALS.map((fx, i) => {
    const signal = demoSignalRecord(fx, i);
    const source = DEMO_SOURCES.find((s) => s.id === fx.sourceId);
    return {
      signal,
      source: source ? demoSourceRecord(source, 0) : undefined,
      versionCount: 1,
      tags: fx.tags ?? [],
      alerts:
        (fx.confidence ?? 0) >= 0.7
          ? [demoAlertForSignal(signal, i)]
          : [],
      reviewStatus: signal.status === 'approved' ? 'APPROVE' : undefined,
      researchRunIds: [],
    };
  });
}

/** Find one demo signal-with-context by its demo id. */
export function demoSignalById(id: string): SignalWithContext | undefined {
  return demoSignalsWithContext().find((s) => s.signal.id === id);
}

/** Find one demo source-with-stats by id. */
export function demoSourceById(id: string): SourceWithStats | undefined {
  return demoSourcesWithStats().find((s) => s.source.id === id);
}

function demoAlertForSignal(
  signal: HsinSignalRecord,
  i: number,
): HsinSignalAlertRecord {
  const sev: HsinAlertSeverity = (signal.confidence ?? 0) >= 0.8 ? 'HIGH' : 'MEDIUM';
  return {
    id: `alert_demo_${i}`,
    signal_id: signal.id,
    source_id: signal.source_id,
    alert_type: 'watchlist_match',
    severity: sev,
    title: `Watchlist match: ${signal.title}`,
    explanation: `Matched a monitored watchlist term in "${signal.title}" with capture confidence ${confidencePct(signal.confidence)}. Raised for human review — not auto-actioned.`,
    status: 'open',
    created_at: signal.created_at,
  };
}

/** Demo alerts derived from the demo signals (for the alert center offline view). */
export function demoAlerts(): HsinSignalAlertRecord[] {
  return demoSignalsWithContext().flatMap((s) => s.alerts);
}

/** Demo watchlists from DEFAULT_WATCHLISTS, shaped as records. */
export function demoWatchlists(): HsinWatchlistRecord[] {
  return DEFAULT_WATCHLISTS.map((w, i) => ({
    id: w.id ?? `wl_demo_${i}`,
    name: w.name,
    description: w.description,
    severity: w.severity,
    terms: w.terms,
    created_at: FIXTURE_NOW,
  }));
}

/** Source-id → number of demo sources scoped, for watchlist source counts. */
export function demoWatchlistSourceCount(): number {
  return DEMO_SOURCES.length;
}

/** Build a demo IntelligenceOverview from the fixtures. */
export function demoIntelligenceOverview(): IntelligenceOverview {
  const sources = demoSourcesWithStats();
  const signals = demoSignalsWithContext();
  const reviewed = signals.filter(
    (s) => s.signal.status === 'approved' || s.signal.status === 'rejected',
  ).length;
  const healthSummary: Record<string, number> = {};
  for (const s of sources) {
    const k = s.health?.status ?? 'unknown';
    healthSummary[k] = (healthSummary[k] ?? 0) + 1;
  }
  return {
    totalSources: sources.length,
    activeSources: sources.filter((s) => s.source.status === 'active').length,
    signalsCaptured: signals.length,
    signalsReviewed: reviewed,
    watchlistMatches: demoAlerts().length,
    narrativeShifts: 1,
    researchRunsGenerated: 0,
    publicationsGenerated: 0,
    sourceHealthSummary: healthSummary,
    signalVelocity: demoSeries([2, 1, 3, 0, 2, 4, 1]),
    alertActivity: demoSeries([0, 1, 1, 0, 2, 1, 0]),
  };
}

/** Build a {date;count}[] series ending today from a count array. */
export function demoSeries(counts: number[]): { date: string; count: number }[] {
  const today = new Date(FIXTURE_NOW).getTime();
  const day = 86400000;
  return counts.map((count, i) => ({
    date: new Date(today - (counts.length - 1 - i) * day)
      .toISOString()
      .slice(0, 10),
    count,
  }));
}

/* -------------------------------------------------------------------------- */
/* Chart adapters                                                              */
/* -------------------------------------------------------------------------- */

/** Pull the numeric series out of a {date;count}[] for the SVG LineChart. */
export function toCountSeries(points: { date: string; count: number }[]): number[] {
  return points.map((p) => p.count);
}

/** Short x-axis labels (first / mid / last) for a dated series. */
export function seriesXLabels(
  points: { date: string; count: number }[],
): string[] {
  if (points.length === 0) return [];
  const fmt = (d: string) => d.slice(5); // MM-DD
  if (points.length <= 2) return points.map((p) => fmt(p.date));
  const mid = Math.floor(points.length / 2);
  return [fmt(points[0].date), fmt(points[mid].date), fmt(points[points.length - 1].date)];
}

/* -------------------------------------------------------------------------- */
/* Alert sorting (never hide; surface most urgent first)                       */
/* -------------------------------------------------------------------------- */

export function sortAlertsByUrgency(
  alerts: HsinSignalAlertRecord[],
): HsinSignalAlertRecord[] {
  return [...alerts].sort((a, b) => {
    const openA = a.status === 'open' || a.status === 'escalated' ? 1 : 0;
    const openB = b.status === 'open' || b.status === 'escalated' ? 1 : 0;
    if (openA !== openB) return openB - openA;
    const sev = alertSeverityRank(b.severity) - alertSeverityRank(a.severity);
    if (sev !== 0) return sev;
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });
}
