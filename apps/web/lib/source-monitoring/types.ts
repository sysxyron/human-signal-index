// =============================================================================
// HSI Phase 63 — Automated Source Monitoring: shared types (PURE, no I/O).
//
// The normalized source state model, the alert vocabulary, and the data shapes
// the monitoring engine produces. Consumes the Phase 61 reliability vocabulary
// (ScoreTier / SourceTypeBucket / FailureType / Protection / HealthStatus) and the
// Phase 62 severity scale. PURE: no imports beyond types, no clocks, no I/O.
// =============================================================================

import type {
  ScoreTier, SourceTypeBucket, FailureType, Protection, HealthStatus,
} from '@/lib/source-reliability-classify';
import type { NotificationSeverity } from '@/lib/notifications/types';

/** Normalized monitoring states (Deliverable 2). */
export type SourceState =
  | 'HEALTHY' | 'WARNING' | 'FAILED' | 'BLOCKED' | 'STALE' | 'UNREACHABLE' | 'DEGRADED' | 'RECOVERED';

export const SOURCE_STATES: SourceState[] = [
  'HEALTHY', 'WARNING', 'DEGRADED', 'STALE', 'BLOCKED', 'UNREACHABLE', 'FAILED', 'RECOVERED',
];

/** Monitoring alert kinds (Deliverable 3). */
export type AlertKind =
  | 'SOURCE_FAILED' | 'SOURCE_RECOVERED' | 'SOURCE_BLOCKED' | 'SOURCE_STALE'
  | 'SOURCE_DEGRADED' | 'COLLECTION_GAP' | 'RELIABILITY_DROP';

export const ALERT_KINDS: AlertKind[] = [
  'SOURCE_FAILED', 'SOURCE_RECOVERED', 'SOURCE_BLOCKED', 'SOURCE_STALE',
  'SOURCE_DEGRADED', 'COLLECTION_GAP', 'RELIABILITY_DROP',
];

/** Reuse the Phase 62 severity scale (computed; never hardcoded per-alert). */
export type MonitorSeverity = NotificationSeverity; // INFO | NOTICE | WARNING | CRITICAL

export type ReliabilityTrend = 'Improving' | 'Stable' | 'Declining' | 'Insufficient Data';

/** A source's telemetry, normalized from a Phase 61 ReliabilitySource. */
export interface SourceSignal {
  id: string;
  name: string;
  type: SourceTypeBucket;
  status: HealthStatus; // HEALTHY | WARNING | FAILED (Phase 61 coarse status)
  score: number;
  tier: ScoreTier;
  failureType: FailureType;
  protection: Protection | null;
  events: number;        // capture attempts observed in the reliability window
  successPct: number;
  consecutiveFailures: number;
  lastSuccessIso: string | null;
  lastSuccessAgeDays: number | null;
  signals: number;
}

/** The prior persisted monitoring snapshot for a source (or null on first run). */
export interface PriorState {
  state: SourceState;
  score: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  updatedAt: string | null;
}

/** An explainable classification (Deliverable 2: reason + evidence + recency). */
export interface Classification {
  state: SourceState;
  reason: string;
  evidence: Record<string, unknown>;
  score: number;
  lastSuccess: string | null;
  lastFailure: string | null;
}

/** A generated monitoring alert (Deliverable 3 / 4 alert feed). */
export interface MonitoringAlert {
  sourceId: string;
  sourceName: string;
  sourceType: SourceTypeBucket;
  kind: AlertKind;
  severity: MonitorSeverity;
  state: SourceState;
  reason: string;
  evidence: Record<string, unknown>;
  scoreBefore: number | null;
  scoreAfter: number;
  lastSuccess: string | null;
  lastFailure: string | null;
}

/** Map a monitoring alert kind onto the FIXED Phase 62 notification type set.
 *  (Phase 62 is not modified; the precise kind is carried in title + metadata.) */
export function notificationTypeForKind(kind: AlertKind): 'SOURCE_RECOVERED' | 'SOURCE_FAILURE' {
  return kind === 'SOURCE_RECOVERED' ? 'SOURCE_RECOVERED' : 'SOURCE_FAILURE';
}

export function isAlertKind(v: unknown): v is AlertKind {
  return typeof v === 'string' && (ALERT_KINDS as readonly string[]).includes(v);
}
export function isSourceState(v: unknown): v is SourceState {
  return typeof v === 'string' && (SOURCE_STATES as readonly string[]).includes(v);
}

/** A negative (problem) state — used for change-detection + recovery logic. */
export function isProblemState(s: SourceState): boolean {
  return s !== 'HEALTHY' && s !== 'RECOVERED';
}
