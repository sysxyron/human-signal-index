// =============================================================================
// WorldForge Phase 6 — Governance view helpers (CLIENT-SAFE).
// Pure presentation helpers: status -> color/label, priority -> color/label,
// visibility -> color/icon, decision -> color/label, role labels, date format,
// and small typed casts for the jsonb `entitySummary` / `snapshot_json` payloads
// the persistence layer stores. NO server-only imports here — this module is
// imported by 'use client' components.
//
// The canonical record/view-model types live in '@hsi/shared-types' (owned by
// the persistence agent). We re-export the ones the UI consumes so governance
// components import from one place, and add the client-safe `DbResult` mirror,
// presentation maps, and typed view-casts on top.
// =============================================================================

import type {
  AppRole,
  NotificationType,
  PublicationVisibility,
  ReviewDecisionType,
  ReviewEntityType,
  ReviewPriority,
  ReviewQueueStatus,
} from '@hsi/shared-types';

export type {
  AppRole,
  NotificationType,
  PublicationVisibility,
  ReviewDecisionType,
  ReviewEntityType,
  ReviewPriority,
  ReviewQueueStatus,
};

// -----------------------------------------------------------------------------
// DbResult — mirrors the server-action contract exactly (importable from
// actions.ts at runtime, but re-declared here so client-safe modules / props
// can reference it without importing the server module).
// -----------------------------------------------------------------------------
export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';

export type DbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: DbResultCode };

// -----------------------------------------------------------------------------
// Status presentation
// -----------------------------------------------------------------------------
export interface StatusStyle {
  label: string;
  color: string;
  soft: string;
  border: string;
}

function style(label: string, color: string): StatusStyle {
  return {
    label,
    color,
    soft: `${color}1f`,
    border: `${color}55`,
  };
}

const STATUS_STYLES: Record<ReviewQueueStatus, StatusStyle> = {
  draft: style('Draft', '#64748B'),
  under_review: style('Under Review', '#3B82F6'),
  approved: style('Approved', '#10B981'),
  published: style('Published', '#06B6D4'),
  rejected: style('Rejected', '#EF4444'),
  needs_evidence: style('Needs Evidence', '#F59E0B'),
  escalated: style('Escalated', '#8B5CF6'),
};

export function statusStyle(status: string): StatusStyle {
  return STATUS_STYLES[status as ReviewQueueStatus] ?? style(status || 'Unknown', '#94A3B8');
}

export const REVIEW_STATUS_ORDER: ReviewQueueStatus[] = [
  'draft',
  'under_review',
  'needs_evidence',
  'escalated',
  'approved',
  'published',
  'rejected',
];

// -----------------------------------------------------------------------------
// Priority presentation
// -----------------------------------------------------------------------------
const PRIORITY_STYLES: Record<ReviewPriority, StatusStyle> = {
  low: style('Low', '#64748B'),
  medium: style('Medium', '#3B82F6'),
  high: style('High', '#F59E0B'),
  urgent: style('Urgent', '#EF4444'),
};

export function priorityStyle(priority: string): StatusStyle {
  return PRIORITY_STYLES[priority as ReviewPriority] ?? style(priority || 'Unknown', '#94A3B8');
}

export const PRIORITY_ORDER: ReviewPriority[] = ['urgent', 'high', 'medium', 'low'];

/** Sort weight so urgent floats to the top of worklists. */
export function priorityWeight(priority: string): number {
  const idx = PRIORITY_ORDER.indexOf(priority as ReviewPriority);
  return idx === -1 ? PRIORITY_ORDER.length : idx;
}

// -----------------------------------------------------------------------------
// Decision presentation
// -----------------------------------------------------------------------------
const DECISION_STYLES: Record<ReviewDecisionType, StatusStyle> = {
  APPROVE: style('Approved', '#10B981'),
  REJECT: style('Rejected', '#EF4444'),
  NEEDS_EVIDENCE: style('Needs more evidence', '#F59E0B'),
  ESCALATE: style('Escalated', '#8B5CF6'),
};

export function decisionStyle(decision: string): StatusStyle {
  return DECISION_STYLES[decision as ReviewDecisionType] ?? style(decision || 'Unknown', '#94A3B8');
}

export const DECISIONS: { value: ReviewDecisionType; label: string; help: string }[] = [
  { value: 'APPROVE', label: 'Approve', help: 'Endorse this entity for publication.' },
  { value: 'REJECT', label: 'Reject', help: 'Reject this entity from the pipeline.' },
  {
    value: 'NEEDS_EVIDENCE',
    label: 'Request more evidence',
    help: 'Send back for additional supporting evidence.',
  },
  { value: 'ESCALATE', label: 'Escalate', help: 'Raise to a curator/admin for adjudication.' },
];

// -----------------------------------------------------------------------------
// Visibility presentation
// -----------------------------------------------------------------------------
export type VisibilityIcon = 'lock' | 'users' | 'globe';

export interface VisibilityStyle extends StatusStyle {
  icon: VisibilityIcon;
  help: string;
}

const VISIBILITY_STYLES: Record<PublicationVisibility, VisibilityStyle> = {
  PRIVATE: {
    ...style('Private', '#64748B'),
    icon: 'lock',
    help: 'Visible only to its owner.',
  },
  TEAM: {
    ...style('Team', '#3B82F6'),
    icon: 'users',
    help: 'Visible to the curation team.',
  },
  PUBLIC: {
    ...style('Public', '#10B981'),
    icon: 'globe',
    help: 'Published to the public report surface.',
  },
};

export function visibilityStyle(visibility: string): VisibilityStyle {
  return (
    VISIBILITY_STYLES[visibility as PublicationVisibility] ?? {
      ...style(visibility || 'Unknown', '#94A3B8'),
      icon: 'lock',
      help: '',
    }
  );
}

export const VISIBILITIES: PublicationVisibility[] = ['PRIVATE', 'TEAM', 'PUBLIC'];

// -----------------------------------------------------------------------------
// Entity-type & role labels
// -----------------------------------------------------------------------------
const ENTITY_LABELS: Record<ReviewEntityType, string> = {
  research_run: 'Research run',
  consensus_report: 'Consensus report',
  evidence_summary: 'Evidence summary',
  worldforge_report: 'WorldForge report',
  evidence_source: 'Evidence source',
  publication: 'Publication',
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType as ReviewEntityType] ?? entityType;
}

const ROLE_LABELS: Record<AppRole, string> = {
  viewer: 'Viewer',
  researcher: 'Researcher',
  reviewer: 'Reviewer',
  curator: 'Curator',
  admin: 'Administrator',
};

/** Ascending privilege ladder. */
export const ROLE_ORDER: AppRole[] = ['viewer', 'researcher', 'reviewer', 'curator', 'admin'];

export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'Anonymous';
  return ROLE_LABELS[role as AppRole] ?? role;
}

/** True when `role` is at least `min` on the privilege ladder. */
export function roleAtLeast(role: string | null | undefined, min: AppRole): boolean {
  if (!role) return false;
  const have = ROLE_ORDER.indexOf(role as AppRole);
  const need = ROLE_ORDER.indexOf(min);
  if (have === -1 || need === -1) return false;
  return have >= need;
}

// -----------------------------------------------------------------------------
// Notification presentation
// -----------------------------------------------------------------------------
export function notificationTone(type: string): string {
  switch (type as NotificationType) {
    case 'escalation_created':
      return '#8B5CF6';
    case 'evidence_rejected':
      return '#EF4444';
    case 'publication_approved':
    case 'review_completed':
      return '#10B981';
    case 'comment_mention':
      return '#06B6D4';
    case 'review_assigned':
    case 'review_requested':
    default:
      return '#3B82F6';
  }
}

// -----------------------------------------------------------------------------
// Date / number formatting
// -----------------------------------------------------------------------------
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Compact "x ago" relative time for notifications/feeds. */
export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDateShort(iso);
}

export function fmtPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  // Accept either 0..1 or 0..100.
  const pct = value <= 1 ? value * 100 : value;
  return `${Math.round(pct)}%`;
}

// -----------------------------------------------------------------------------
// Typed view-casts for jsonb payloads (entitySummary / snapshot_json).
// We never use `any`; instead we read known optional fields defensively.
// -----------------------------------------------------------------------------

/** The governance-relevant fields the persistence layer denormalizes into a
 *  queue item / detail's `entitySummary` jsonb. All optional. */
export interface EntitySummaryView {
  title?: string;
  status?: string;
  conceptText?: string;
  /** 0..100 raw consensus confidence. */
  consensusConfidence?: number;
  /** 0..100 governed/evidence-weighted confidence. */
  governedConfidence?: number;
  /** 0..100 inter-agent agreement. */
  agreementScore?: number;
  /** 0..100 evidence coverage. */
  coverageScore?: number;
  contradictionCount?: number;
  supportRatio?: number;
  reviewStatus?: string;
  worldId?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Read an entitySummary jsonb blob into a typed, tolerant view. Tries a handful
 *  of likely key spellings so it survives small persistence-shape drift. */
export function readEntitySummary(
  raw: Record<string, unknown> | undefined | null,
): EntitySummaryView {
  const r = asRecord(raw) ?? {};
  const pick = (...keys: string[]): unknown => {
    for (const k of keys) {
      if (r[k] !== undefined && r[k] !== null) return r[k];
    }
    return undefined;
  };
  return {
    title: str(pick('title', 'name', 'label')),
    status: str(pick('status')),
    conceptText: str(pick('conceptText', 'concept_text', 'concept')),
    consensusConfidence: num(
      pick('consensusConfidence', 'consensus_confidence', 'overallConfidence', 'overall_confidence'),
    ),
    governedConfidence: num(
      pick(
        'governedConfidence',
        'governed_confidence',
        'evidenceWeightedConfidence',
        'evidence_weighted_confidence',
      ),
    ),
    agreementScore: num(pick('agreementScore', 'agreement_score')),
    coverageScore: num(pick('coverageScore', 'coverage_score')),
    contradictionCount: num(pick('contradictionCount', 'contradiction_count', 'contradictions')),
    supportRatio: num(pick('supportRatio', 'support_ratio')),
    reviewStatus: str(pick('reviewStatus', 'review_status')),
    worldId: str(pick('worldId', 'world_id')),
  };
}

/** A best-effort display label for a queue/publication entity. */
export function entityDisplayLabel(
  entityType: string,
  entityId: string,
  summary?: Record<string, unknown> | null,
): string {
  const view = readEntitySummary(summary);
  if (view.title) return view.title;
  if (view.conceptText) {
    return view.conceptText.length > 64
      ? `${view.conceptText.slice(0, 64)}…`
      : view.conceptText;
  }
  return `${entityLabel(entityType)} ${entityId.slice(0, 8)}`;
}

/** Cast a PublicationVersionRecord.snapshot_json into a tolerant PublicReportDraft
 *  view. Returns undefined when the blob is unusable. */
export interface PublicReportView {
  entityType?: string;
  entityId?: string;
  executiveSummary?: string;
  keyClaims: unknown[];
  evidenceSummary: Record<string, unknown>;
  supportRatio?: number;
  contradictions: unknown[];
  consensus: Record<string, unknown>;
  reviewerNotes: string[];
  metadata: Record<string, unknown>;
}

export function readPublicReport(
  raw: Record<string, unknown> | undefined | null,
): PublicReportView {
  const r = asRecord(raw) ?? {};
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const rec = (v: unknown): Record<string, unknown> => asRecord(v) ?? {};
  return {
    entityType: str(r.entityType ?? r.entity_type),
    entityId: str(r.entityId ?? r.entity_id),
    executiveSummary: str(r.executiveSummary ?? r.executive_summary),
    keyClaims: arr(r.keyClaims ?? r.key_claims),
    evidenceSummary: rec(r.evidenceSummary ?? r.evidence_summary),
    supportRatio: num(r.supportRatio ?? r.support_ratio),
    contradictions: arr(r.contradictions),
    consensus: rec(r.consensus),
    reviewerNotes: arr(r.reviewerNotes ?? r.reviewer_notes).filter(
      (n): n is string => typeof n === 'string',
    ),
    metadata: rec(r.metadata),
  };
}

/** Coerce an arbitrary key-claim entry into a readable string. */
export function claimToText(claim: unknown): string {
  if (typeof claim === 'string') return claim;
  const r = asRecord(claim);
  if (!r) return String(claim);
  return (
    str(r.text) ??
    str(r.claim) ??
    str(r.statement) ??
    str(r.title) ??
    JSON.stringify(r)
  );
}

// -----------------------------------------------------------------------------
// @mention parsing for the comment thread.
// -----------------------------------------------------------------------------
const MENTION_RE = /@([A-Za-z0-9._%+-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?|[A-Za-z0-9._-]+)/g;

/** Extract the raw @mention tokens (without the leading @) from comment text. */
export function parseMentions(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    if (m[1]) out.add(m[1]);
  }
  return Array.from(out);
}

/** Split comment text into plain + mention segments for highlighted rendering. */
export interface CommentSegment {
  text: string;
  mention: boolean;
}

export function segmentComment(text: string): CommentSegment[] {
  const segments: CommentSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ text: text.slice(last, m.index), mention: false });
    }
    segments.push({ text: m[0], mention: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last), mention: false });
  }
  return segments;
}

// -----------------------------------------------------------------------------
// JSON diff for publication version comparison (DiffViewer-style).
// -----------------------------------------------------------------------------
export interface JsonDiffEntry {
  path: string;
  before?: unknown;
  after?: unknown;
}

export interface JsonDiff {
  added: JsonDiffEntry[];
  removed: JsonDiffEntry[];
  changed: JsonDiffEntry[];
}

function flatten(
  value: unknown,
  prefix: string,
  out: Map<string, unknown>,
): void {
  if (value === null || typeof value !== 'object') {
    out.set(prefix || '(root)', value);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.set(prefix || '(root)', '[]');
      return;
    }
    value.forEach((v, i) => flatten(v, prefix ? `${prefix}[${i}]` : `[${i}]`, out));
    return;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    out.set(prefix || '(root)', '{}');
    return;
  }
  for (const [k, v] of entries) {
    flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
}

function leafEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Deep flatten-and-compare two jsonb snapshots into added/removed/changed leaves. */
export function diffSnapshots(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): JsonDiff {
  const a = new Map<string, unknown>();
  const b = new Map<string, unknown>();
  flatten(before ?? {}, '', a);
  flatten(after ?? {}, '', b);

  const diff: JsonDiff = { added: [], removed: [], changed: [] };
  const keys = new Set<string>([...a.keys(), ...b.keys()]);
  for (const path of Array.from(keys).sort()) {
    const hasA = a.has(path);
    const hasB = b.has(path);
    if (hasA && hasB) {
      if (!leafEqual(a.get(path), b.get(path))) {
        diff.changed.push({ path, before: a.get(path), after: b.get(path) });
      }
    } else if (hasB) {
      diff.added.push({ path, after: b.get(path) });
    } else {
      diff.removed.push({ path, before: a.get(path) });
    }
  }
  return diff;
}

export function fmtDiffValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 80)}…` : value;
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toPrecision(4);
  return String(value);
}
