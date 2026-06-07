// =============================================================================
// WorldForge Phase 4 — Evidence view helpers (CLIENT-SAFE).
// Pure presentation helpers + small typed view-casts for the evidence bundle the
// persistence layer returns. No server-only imports here — this module is
// imported by 'use client' components (SupportTypeBadge, RefreshEvidenceButton,
// ClaimEvidenceList, EvidenceReviewControl, ...).
//
// RECORD TYPES: the canonical evidence record/bundle types are owned by the
// persistence agent and live in '@hsi/shared-types'. We import + re-export them
// here so every evidence component shares ONE type surface (mirroring how
// research-view.ts re-exports the research records), and layer the client-safe
// `DbResult`, presentation styles, and pure grouping helpers on top.
// =============================================================================

import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Layers,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  Beaker,
  type LucideIcon,
} from 'lucide-react';

// -----------------------------------------------------------------------------
// DbResult mirrors the persistence layer contract exactly (same as research-view).
// -----------------------------------------------------------------------------
export type DbResultCode = 'AUTH_REQUIRED' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: DbResultCode };

// -----------------------------------------------------------------------------
// CONTRACT TYPES — re-exported from the canonical '@hsi/shared-types' surface.
// -----------------------------------------------------------------------------
import type {
  EvidenceSourceRecord,
  ClaimEvidenceLinkRecord,
  EvidenceReviewRecord,
  EvidenceCoverageSummary,
  RunEvidenceBundle,
  EvidenceSupportType,
  EvidenceReviewStatus,
} from '@hsi/shared-types';

export type {
  EvidenceSourceRecord,
  ClaimEvidenceLinkRecord,
  EvidenceReviewRecord,
  EvidenceCoverageSummary,
  RunEvidenceBundle,
  EvidenceSupportType,
  EvidenceReviewStatus,
};

/** Alias kept for component prop ergonomics (== EvidenceSupportType). */
export type SupportType = EvidenceSupportType;

/** Aggregate per-claim coverage verdict (UI-derived; not a DB column). */
export type ClaimCoverage =
  | 'supported'
  | 'contradicted'
  | 'background'
  | 'unsupported';

/**
 * UI reviewer status. The canonical EvidenceReviewStatus
 * ('pending'|'validated'|'rejected'|'needs_more') describes a PERSISTED review;
 * the UI also needs an 'unreviewed' state for sources with no review row yet.
 */
export type UiReviewStatus = EvidenceReviewStatus | 'unreviewed';

// -----------------------------------------------------------------------------
// jsonb / metadata narrowing — keep casts in ONE place (no `any`).
// -----------------------------------------------------------------------------

/** Safely read a string field off a jsonb metadata blob. */
export function metaString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const v = metadata?.[key];
  return typeof v === 'string' ? v : undefined;
}

// -----------------------------------------------------------------------------
// Support-type presentation — supports/contradicts/background/unclear.
// -----------------------------------------------------------------------------

export interface SupportTypeStyle {
  label: string;
  short: string;
  color: string;
  soft: string;
  border: string;
  icon: LucideIcon;
  description: string;
}

export const SUPPORT_TYPE_STYLES: Record<SupportType, SupportTypeStyle> = {
  supports: {
    label: 'Supports',
    short: 'Supports',
    color: '#10B981',
    soft: 'rgba(16,185,129,0.14)',
    border: 'rgba(16,185,129,0.45)',
    icon: CheckCircle2,
    description: 'This source affirms the claim.',
  },
  contradicts: {
    label: 'Contradicts',
    short: 'Contradicts',
    color: '#EF4444',
    soft: 'rgba(239,68,68,0.16)',
    border: 'rgba(239,68,68,0.5)',
    icon: XCircle,
    description: 'This source argues against the claim.',
  },
  background: {
    label: 'Background',
    short: 'Background',
    color: '#3B82F6',
    soft: 'rgba(59,130,246,0.14)',
    border: 'rgba(59,130,246,0.45)',
    icon: Layers,
    description: 'Relevant context — neither affirming nor contradicting.',
  },
  unclear: {
    label: 'Unclear',
    short: 'Unclear',
    color: '#94A3B8',
    soft: 'rgba(148,163,184,0.12)',
    border: 'rgba(148,163,184,0.35)',
    icon: HelpCircle,
    description: 'Matched, but the relationship could not be determined.',
  },
};

export function supportTypeStyle(support: string): SupportTypeStyle {
  return SUPPORT_TYPE_STYLES[support as SupportType] ?? SUPPORT_TYPE_STYLES.unclear;
}

/** Support types ordered strongest signal → weakest (for legends/grouping). */
export const SUPPORT_TYPE_ORDER: SupportType[] = [
  'supports',
  'contradicts',
  'background',
  'unclear',
];

// -----------------------------------------------------------------------------
// Claim-coverage presentation — supported / contradicted / background /
// unsupported. "Unsupported" is amber/muted and ALWAYS visible (honest).
// -----------------------------------------------------------------------------

export interface CoverageStyle {
  label: string;
  color: string;
  soft: string;
  border: string;
}

export const COVERAGE_STYLES: Record<ClaimCoverage, CoverageStyle> = {
  supported: {
    label: 'Supported',
    color: '#10B981',
    soft: 'rgba(16,185,129,0.14)',
    border: 'rgba(16,185,129,0.45)',
  },
  contradicted: {
    label: 'Contradicted',
    color: '#EF4444',
    soft: 'rgba(239,68,68,0.16)',
    border: 'rgba(239,68,68,0.5)',
  },
  background: {
    label: 'Background only',
    color: '#3B82F6',
    soft: 'rgba(59,130,246,0.14)',
    border: 'rgba(59,130,246,0.45)',
  },
  unsupported: {
    label: 'Unsupported',
    color: '#F59E0B',
    soft: 'rgba(245,158,11,0.14)',
    border: 'rgba(245,158,11,0.45)',
  },
};

export function coverageStyle(coverage: string): CoverageStyle {
  return COVERAGE_STYLES[coverage as ClaimCoverage] ?? COVERAGE_STYLES.unsupported;
}

// -----------------------------------------------------------------------------
// Reliability tier — derived from a 0..1 reliability_score (or label).
// -----------------------------------------------------------------------------

export type ReliabilityTier = 'high' | 'medium' | 'low' | 'unsupported';

export interface ReliabilityTierStyle {
  tier: ReliabilityTier;
  label: string;
  color: string;
  soft: string;
  border: string;
}

const RELIABILITY_STYLES: Record<ReliabilityTier, ReliabilityTierStyle> = {
  high: {
    tier: 'high',
    label: 'High reliability',
    color: '#10B981',
    soft: 'rgba(16,185,129,0.14)',
    border: 'rgba(16,185,129,0.45)',
  },
  medium: {
    tier: 'medium',
    label: 'Medium reliability',
    color: '#3B82F6',
    soft: 'rgba(59,130,246,0.14)',
    border: 'rgba(59,130,246,0.45)',
  },
  low: {
    tier: 'low',
    label: 'Low reliability',
    color: '#F59E0B',
    soft: 'rgba(245,158,11,0.14)',
    border: 'rgba(245,158,11,0.45)',
  },
  unsupported: {
    tier: 'unsupported',
    label: 'Unsupported',
    color: '#94A3B8',
    soft: 'rgba(148,163,184,0.12)',
    border: 'rgba(148,163,184,0.35)',
  },
};

/** Map a 0..1 reliability score to a coarse tier + style. */
export function reliabilityTierStyle(
  score: number | null | undefined,
): ReliabilityTierStyle {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return RELIABILITY_STYLES.unsupported;
  }
  if (score >= 0.75) return RELIABILITY_STYLES.high;
  if (score >= 0.5) return RELIABILITY_STYLES.medium;
  if (score > 0) return RELIABILITY_STYLES.low;
  return RELIABILITY_STYLES.unsupported;
}

// -----------------------------------------------------------------------------
// Publication-type label (human-friendly).
// -----------------------------------------------------------------------------

const PUBLICATION_LABELS: Record<string, string> = {
  'peer-reviewed': 'Peer-reviewed',
  preprint: 'Preprint',
  review: 'Review',
  encyclopedia: 'Encyclopedia',
  web: 'Web',
  dataset: 'Dataset',
  unknown: 'Unknown type',
};

export function publicationLabel(pub: string | undefined): string {
  if (!pub) return 'Unknown type';
  return PUBLICATION_LABELS[pub] ?? pub;
}

// -----------------------------------------------------------------------------
// Evidence mode label + badge style (FIXTURE clearly labeled "Demo evidence").
// -----------------------------------------------------------------------------

export interface ModeStyle {
  label: string;
  detail: string;
  color: string;
  soft: string;
  border: string;
  icon: LucideIcon;
  /** True when this is fixture/demo evidence (no API keys). */
  isDemo: boolean;
}

export function modeStyle(mode: string): ModeStyle {
  switch (mode) {
    case 'live':
      return {
        label: 'Live evidence',
        detail: 'Retrieved from public research APIs.',
        color: '#10B981',
        soft: 'rgba(16,185,129,0.14)',
        border: 'rgba(16,185,129,0.45)',
        icon: ShieldCheck,
        isDemo: false,
      };
    case 'mixed':
      return {
        label: 'Mixed evidence',
        detail: 'A mix of live API results and curated demo fixtures.',
        color: '#3B82F6',
        soft: 'rgba(59,130,246,0.14)',
        border: 'rgba(59,130,246,0.45)',
        icon: ShieldQuestion,
        isDemo: true,
      };
    case 'fixture':
    default:
      return {
        label: 'Demo evidence',
        detail: 'Curated fixtures — works locally without API keys.',
        color: '#F59E0B',
        soft: 'rgba(245,158,11,0.14)',
        border: 'rgba(245,158,11,0.45)',
        icon: Beaker,
        isDemo: true,
      };
  }
}

// -----------------------------------------------------------------------------
// Reviewer-status presentation.
// -----------------------------------------------------------------------------

export interface ReviewStatusStyle {
  label: string;
  color: string;
  soft: string;
  border: string;
}

const REVIEW_STATUS_STYLES: Record<UiReviewStatus, ReviewStatusStyle> = {
  unreviewed: {
    label: 'Unreviewed',
    color: '#94A3B8',
    soft: 'rgba(148,163,184,0.12)',
    border: 'rgba(148,163,184,0.35)',
  },
  pending: {
    label: 'Pending review',
    color: '#3B82F6',
    soft: 'rgba(59,130,246,0.14)',
    border: 'rgba(59,130,246,0.45)',
  },
  validated: {
    label: 'Validated',
    color: '#10B981',
    soft: 'rgba(16,185,129,0.14)',
    border: 'rgba(16,185,129,0.45)',
  },
  rejected: {
    label: 'Rejected',
    color: '#EF4444',
    soft: 'rgba(239,68,68,0.16)',
    border: 'rgba(239,68,68,0.5)',
  },
  needs_more: {
    label: 'Needs more evidence',
    color: '#F59E0B',
    soft: 'rgba(245,158,11,0.14)',
    border: 'rgba(245,158,11,0.45)',
  },
};

export function reviewStatusStyle(status: string): ReviewStatusStyle {
  return (
    REVIEW_STATUS_STYLES[status as UiReviewStatus] ??
    REVIEW_STATUS_STYLES.unreviewed
  );
}

export const REVIEW_STATUS_ICON: Record<UiReviewStatus, LucideIcon> = {
  unreviewed: ShieldQuestion,
  pending: ShieldQuestion,
  validated: ShieldCheck,
  rejected: ShieldX,
  needs_more: ShieldQuestion,
};

// -----------------------------------------------------------------------------
// Formatting helpers.
// -----------------------------------------------------------------------------

/** Format a 0..1 score as a percentage; null/NaN → em-dash. */
export function fmtPct01(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value * 100)}%`;
}

/** Coverage ring/bar color from a 0..100 coverage score. */
export function coverageScoreColor(score: number): string {
  if (score >= 75) return '#10B981';
  if (score >= 50) return '#3B82F6';
  if (score >= 30) return '#F59E0B';
  return '#EF4444';
}

/** Trim an abstract to a card-friendly excerpt. */
export function abstractExcerpt(text: string | undefined, max = 240): string {
  if (!text) return '';
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Format an author list compactly (et al. past 3). */
export function fmtAuthors(authors: string[] | undefined): string {
  if (!authors || authors.length === 0) return 'Unknown authors';
  if (authors.length <= 3) return authors.join(', ');
  return `${authors.slice(0, 3).join(', ')} et al.`;
}

// -----------------------------------------------------------------------------
// Link → claim grouping. Builds a claimId → links map for the provenance upgrade
// and the evidence tab. Pure + deterministic.
// -----------------------------------------------------------------------------

export interface ClaimEvidenceGroup {
  claimId: string;
  links: ClaimEvidenceLinkRecord[];
  /** Aggregate coverage verdict for the claim (honest about unsupported). */
  coverage: ClaimCoverage;
  /** Strongest support relationship across links. */
  bestSupport: SupportType | null;
  /** Highest relevance among links (0 when none). */
  topRelevance: number;
}

const SUPPORT_RANK: Record<string, number> = {
  supports: 3,
  contradicts: 3,
  background: 1,
  unclear: 0,
};

/** Narrow a possibly-undefined/string support_type to a known SupportType. */
export function normalizeSupport(value: string | undefined): SupportType {
  if (value === 'supports' || value === 'contradicts' || value === 'background') {
    return value;
  }
  return 'unclear';
}

/** Derive a claim's coverage verdict from its links (mirrors the engine). */
export function coverageForLinks(
  links: ClaimEvidenceLinkRecord[],
): ClaimCoverage {
  if (links.length === 0) return 'unsupported';
  if (links.some((l) => l.support_type === 'supports')) return 'supported';
  if (links.some((l) => l.support_type === 'contradicts')) return 'contradicted';
  if (links.some((l) => l.support_type === 'background')) return 'background';
  return 'unsupported';
}

/** Build a claimId → grouped-links map from a run's links. */
export function groupLinksByClaim(
  links: ClaimEvidenceLinkRecord[],
): Map<string, ClaimEvidenceGroup> {
  const map = new Map<string, ClaimEvidenceLinkRecord[]>();
  for (const link of links) {
    // claim_id is optional on the record; fall back to the link id so a
    // claim-less link still groups deterministically rather than being dropped.
    const key = link.claim_id ?? link.id;
    const list = map.get(key);
    if (list) list.push(link);
    else map.set(key, [link]);
  }

  const out = new Map<string, ClaimEvidenceGroup>();
  for (const [claimId, group] of map) {
    // Rank links best-first: stronger support, then higher relevance.
    const sorted = [...group].sort((a, b) => {
      const ra = SUPPORT_RANK[a.support_type ?? 'unclear'] ?? 0;
      const rb = SUPPORT_RANK[b.support_type ?? 'unclear'] ?? 0;
      if (rb !== ra) return rb - ra;
      return (b.relevance_score ?? 0) - (a.relevance_score ?? 0);
    });
    const bestSupport = sorted[0]
      ? normalizeSupport(sorted[0].support_type)
      : null;
    const topRelevance = sorted.reduce(
      (m, l) => Math.max(m, l.relevance_score ?? 0),
      0,
    );
    out.set(claimId, {
      claimId,
      links: sorted,
      coverage: coverageForLinks(sorted),
      bestSupport,
      topRelevance,
    });
  }
  return out;
}

/** Index sources by id for fast lookup from a link. */
export function indexSources(
  sources: EvidenceSourceRecord[],
): Map<string, EvidenceSourceRecord> {
  const m = new Map<string, EvidenceSourceRecord>();
  for (const s of sources) m.set(s.id, s);
  return m;
}

/**
 * Index the latest reviewer status per evidence_source_id. The canonical
 * RunEvidenceBundle does not carry reviews, so callers typically pass undefined;
 * when reviews are supplied separately, the last one for a source wins.
 */
export function indexReviewStatus(
  reviews: EvidenceReviewRecord[] | undefined,
): Map<string, UiReviewStatus> {
  const m = new Map<string, UiReviewStatus>();
  if (!reviews) return m;
  for (const r of reviews) {
    m.set(r.evidence_source_id, (r.status as UiReviewStatus) ?? 'unreviewed');
  }
  return m;
}
