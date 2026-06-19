// =============================================================================
// HSI Phase 65 — Narrative Intelligence: shared types (PURE, no I/O).
//
// A narrative is an observable information structure (a deterministic cluster over
// the Phase 64 evidence graph). These are the vocabulary + data shapes; the pure
// clustering / health / alert logic lives in ./clustering and ./health.
// =============================================================================

import type { NodeType } from '@/lib/evidence-graph/types';
import type { NotificationSeverity } from '@/lib/notifications/types';

export const NARRATIVE_STATUSES = ['emerging', 'active', 'dominant', 'fragmenting', 'declining', 'archived'] as const;
export type NarrativeStatus = (typeof NARRATIVE_STATUSES)[number];

export const NARRATIVE_ALERT_TYPES = [
  'NARRATIVE_EMERGING', 'NARRATIVE_GROWING', 'NARRATIVE_DOMINANT', 'NARRATIVE_DECLINING', 'NARRATIVE_FRAGMENTING',
] as const;
export type NarrativeAlertType = (typeof NARRATIVE_ALERT_TYPES)[number];

export type Stance = 'supporting' | 'contradicting' | 'neutral';

export function isNarrativeStatus(v: unknown): v is NarrativeStatus {
  return typeof v === 'string' && (NARRATIVE_STATUSES as readonly string[]).includes(v);
}

export interface Narrative {
  id: string;
  name: string;
  slug: string | null;
  summary: string | null;
  status: NarrativeStatus;
  seedNodeId: string | null;
  graphNodeId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface NarrativeMember {
  nodeId: string;
  memberType: NodeType;
  label: string;
  reason: string;
  confidence: number;
  depth: number;
  stance?: Stance;
}

/** Tally of a narrative's membership, by node type + stance (computed). */
export interface MemberComposition {
  total: number;
  sources: number;
  signals: number;
  evidence: number;   // EVIDENCE + CLAIM
  reports: number;
  investigations: number;
  actors: number;
  events: number;
  organizations: number;
  supporting: number;
  contradicting: number;
  distinctSources: number;
  distinctActors: number;
}

export interface NarrativeHealth {
  coverage: number;          // 0–1
  sourceDiversity: number;   // 0–1
  evidenceDensity: number;   // 0–1
  claimDensity: number;      // 0–1
  actorDiversity: number;    // 0–1
  contradictionRatio: number; // 0–1
  stabilityScore: number;    // 0–100
  failingSources: number;
  explanation: string;
  factors: { label: string; value: string }[];
}

export interface NarrativeSnapshot {
  memberCount: number;
  signalCount: number;
  evidenceCount: number;
  sourceCount: number;
  actorCount: number;
  contradictionRatio: number;
  stabilityScore: number;
  snapshotAt: string;
}

export interface TimelinePoint {
  at: string;
  members: number;
  signals: number;
  evidence: number;
  sources: number;
}

export interface NarrativeTimeline {
  points: TimelinePoint[];
  firstAppearance: string | null;
  peakAt: string | null;
  peakMembers: number;
  latestActivity: string | null;
  phase: 'emerging' | 'growing' | 'peak' | 'declining' | 'stable' | 'insufficient';
}

export interface NarrativeAlert {
  alertType: NarrativeAlertType;
  severity: NotificationSeverity;
  reason: string;
  evidence: Record<string, unknown>;
}

export interface NarrativeRelationship {
  narrativeId: string;
  name: string;
  relationship: 'overlaps' | 'shares_sources' | 'shares_actors' | 'shares_events';
  sharedCount: number;
}

export interface NarrativeSummary {
  narrative: Narrative;
  composition: MemberComposition;
  health: NarrativeHealth;
  members: NarrativeMember[];
}
