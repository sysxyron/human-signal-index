// =============================================================================
// HSI Phase 73 — Global Operations Center: shared types (PURE).
//
// The executive command surface. It COMPOSES existing intelligence (source
// network, signal network, narratives, forecasts, trust, geo, transparency) into
// one operational view that answers "what requires attention right now?" while
// preserving traceability. Nothing here fabricates a metric or a conclusion;
// every number is a real count and every status uses documented thresholds.
// Missing relationships are surfaced as NOT OBSERVED. PURE: no I/O, no @/ values.
// =============================================================================

export const MISSION_STATUSES = ['GREEN', 'YELLOW', 'RED'] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface MissionDomain {
  key: string;
  label: string;
  status: MissionStatus;
  detail: string;
}

export interface AttentionItem {
  key: string;
  label: string;
  count: number;
  severity: Severity;
  detail: string;
  href: string;
}

/** A relationship-integrity check. `count: null` means NOT OBSERVED (the check
 *  cannot be computed from existing records — never inferred). */
export interface IntegrityCheck {
  key: string;
  label: string;
  count: number | null;     // null = NOT OBSERVED
  observed: boolean;
  note: string;
}

export interface TimelineRow { label: string; last7: number; last30: number }
