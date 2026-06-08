// =============================================================================
// WorldForge Phase 5 — Evidence Intelligence view helpers (CLIENT-SAFE).
//
// Pure presentation helpers + a single client-safe TYPE SURFACE for the Phase 5
// evidence-intelligence / review-queue / claim-evidence-graph UI. No server-only
// imports here — this module is imported by 'use client' components
// (ProviderHealthGrid, EvidenceReviewControls, ClaimEvidenceGraphFlow, ...).
//
// TYPE OWNERSHIP: the canonical Phase 5 contract types
// (ProviderHealthRecord, EvidenceReviewQueueItem, EvidenceIntelligence,
// ClaimEvidenceGraph[Node|Edge], ClaimReliabilitySummary, ProviderHealthStatus)
// are owned by the persistence/shared-types agent and live in '@hsi/shared-types'.
// We re-export them here so every Phase 5 component imports ONE surface (mirroring
// how evidence-view.ts re-exports the Phase 4 records), and layer the
// presentation styles + UI-only extensions (ExtendedCoverageSummary,
// CoverageTimelinePoint, ClaimReliabilityView) on top.
// =============================================================================

import {
  Activity,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  CircleDot,
  type LucideIcon,
} from 'lucide-react';
import type {
  EvidenceCoverageSummary as BaseCoverageSummary,
  ClaimReliabilitySummary,
  ProviderHealthRecord,
  ProviderHealthStatus,
  EvidenceReviewQueueItem,
  EvidenceIntelligence,
  ClaimEvidenceGraph,
  ClaimEvidenceGraphNode,
  ClaimEvidenceGraphEdge,
} from '@hsi/shared-types';
import type { UiReviewStatus } from './evidence-view';

// -----------------------------------------------------------------------------
// CONTRACT TYPES — re-exported from the canonical '@hsi/shared-types' surface so
// components have a single import point.
// -----------------------------------------------------------------------------
export type {
  ProviderHealthRecord,
  ProviderHealthStatus,
  EvidenceReviewQueueItem,
  EvidenceIntelligence,
  ClaimEvidenceGraph,
  ClaimEvidenceGraphNode,
  ClaimEvidenceGraphEdge,
  ClaimReliabilitySummary,
};

/** A single point on the coverage timeline (== EvidenceIntelligence.coverageTimeline[number]). */
export type CoverageTimelinePoint = EvidenceIntelligence['coverageTimeline'][number];

/**
 * UI extension of the canonical EvidenceCoverageSummary. The shared-types summary
 * already carries the persisted evidence-weighted fields; here we add the two
 * derived display-only fields the UI may compute locally (evidenceConfidence,
 * delta) without requiring them to be persisted.
 */
export interface ExtendedCoverageSummary extends BaseCoverageSummary {
  /** 0..100 — confidence from evidence alone (UI-derived; not always persisted). */
  evidenceConfidence?: number;
  /** evidenceWeightedConfidence - researchConfidence (UI-derived). */
  delta?: number;
}

/**
 * A per-claim reliability view. Extends the canonical ClaimReliabilitySummary
 * with optional display extras the UI may attach.
 */
export interface ClaimReliabilityView extends ClaimReliabilitySummary {
  supportType?: string;
  text?: string;
}

/**
 * Read the extended (evidence-weighted) coverage fields off ANY coverage
 * summary without a hard compile dependency on the parallel shared-types update.
 * Pure, typed, no `any` in the public signature.
 */
export function extendedCoverage(
  coverage: BaseCoverageSummary | ExtendedCoverageSummary,
): ExtendedCoverageSummary {
  return coverage as ExtendedCoverageSummary;
}

// -----------------------------------------------------------------------------
// Provider-health presentation.
// -----------------------------------------------------------------------------

export interface ProviderHealthStyle {
  label: string;
  color: string;
  soft: string;
  border: string;
  icon: LucideIcon;
}

export const PROVIDER_HEALTH_STYLES: Record<
  ProviderHealthStatus,
  ProviderHealthStyle
> = {
  HEALTHY: {
    label: 'Healthy',
    color: '#10B981',
    soft: 'rgba(16,185,129,0.14)',
    border: 'rgba(16,185,129,0.45)',
    icon: ShieldCheck,
  },
  DEGRADED: {
    label: 'Degraded',
    color: '#F59E0B',
    soft: 'rgba(245,158,11,0.14)',
    border: 'rgba(245,158,11,0.45)',
    icon: ShieldAlert,
  },
  OFFLINE: {
    label: 'Offline',
    color: '#EF4444',
    soft: 'rgba(239,68,68,0.16)',
    border: 'rgba(239,68,68,0.5)',
    icon: ShieldX,
  },
};

export function providerHealthStyle(status: string): ProviderHealthStyle {
  return (
    PROVIDER_HEALTH_STYLES[status as ProviderHealthStatus] ??
    PROVIDER_HEALTH_STYLES.OFFLINE
  );
}

// -----------------------------------------------------------------------------
// Review-queue status → UI status mapping (per spec):
//   validated  → "Verified"   (green)
//   rejected   → "Rejected"   (red)
//   needs_more → "Needs More" (amber)
//   pending    → "Pending"    (slate)
// -----------------------------------------------------------------------------

export interface QueueStatusStyle {
  label: string;
  color: string;
  soft: string;
  border: string;
  icon: LucideIcon;
}

const QUEUE_STATUS_STYLES: Record<UiReviewStatus, QueueStatusStyle> = {
  validated: {
    label: 'Verified',
    color: '#10B981',
    soft: 'rgba(16,185,129,0.14)',
    border: 'rgba(16,185,129,0.45)',
    icon: ShieldCheck,
  },
  rejected: {
    label: 'Rejected',
    color: '#EF4444',
    soft: 'rgba(239,68,68,0.16)',
    border: 'rgba(239,68,68,0.5)',
    icon: ShieldX,
  },
  needs_more: {
    label: 'Needs More',
    color: '#F59E0B',
    soft: 'rgba(245,158,11,0.14)',
    border: 'rgba(245,158,11,0.45)',
    icon: ShieldAlert,
  },
  pending: {
    label: 'Pending',
    color: '#94A3B8',
    soft: 'rgba(148,163,184,0.14)',
    border: 'rgba(148,163,184,0.4)',
    icon: CircleDot,
  },
  unreviewed: {
    label: 'Pending',
    color: '#94A3B8',
    soft: 'rgba(148,163,184,0.12)',
    border: 'rgba(148,163,184,0.35)',
    icon: CircleDot,
  },
};

export function queueStatusStyle(status: string): QueueStatusStyle {
  return (
    QUEUE_STATUS_STYLES[status as UiReviewStatus] ?? QUEUE_STATUS_STYLES.pending
  );
}

/** Normalize a possibly-string queue status to a UiReviewStatus. */
export function normalizeQueueStatus(status: string | undefined): UiReviewStatus {
  switch (status) {
    case 'validated':
    case 'rejected':
    case 'needs_more':
    case 'pending':
    case 'unreviewed':
      return status;
    default:
      return 'pending';
  }
}

// -----------------------------------------------------------------------------
// Ratio / number formatting.
// -----------------------------------------------------------------------------

/** Format a 0..1 ratio as a percentage; null/NaN → em-dash. */
export function fmtRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  // Heuristic: values > 1 are already percentages.
  const pct = value > 1 ? value : value * 100;
  return `${Math.round(pct)}%`;
}

/** Round a 0..100 score to an integer; NaN → 0. */
export function asScore(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Color for a 0..1 support-style ratio: higher support = greener. */
export function supportRatioColor(ratio: number): string {
  const r = ratio > 1 ? ratio / 100 : ratio;
  if (r >= 0.6) return '#10B981';
  if (r >= 0.35) return '#3B82F6';
  if (r > 0) return '#F59E0B';
  return '#94A3B8';
}

/** Color for a 0..1 contradiction/unsupported ratio: higher = redder/amber. */
export function riskRatioColor(ratio: number, kind: 'contradiction' | 'unsupported'): string {
  const r = ratio > 1 ? ratio / 100 : ratio;
  if (r <= 0) return '#94A3B8';
  if (kind === 'contradiction') {
    return r >= 0.25 ? '#EF4444' : '#F59E0B';
  }
  return r >= 0.4 ? '#F59E0B' : '#3B82F6';
}

/** Short relative-ish date label (YYYY-MM-DD) from an ISO string. */
export function shortDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

/** Icon for the provider-health section header. */
export const PROVIDER_HEALTH_HEADER_ICON: LucideIcon = Activity;
