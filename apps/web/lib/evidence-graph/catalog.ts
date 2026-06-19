// =============================================================================
// HSI Phase 64 — Evidence Graph catalog + DETERMINISTIC confidence (PURE).
//
// Relationship display metadata + the rules that assign edge confidence from
// stored facts (support/challenge tallies, explicit strength, explicit FKs).
// Confidence is computed or explicitly assigned — NEVER random, NEVER AI-inferred.
// PURE: no I/O.
// =============================================================================

import type { RelationshipType, NodeType } from './types';

export const RELATIONSHIP_LABEL: Record<RelationshipType, string> = {
  SUPPORTS: 'Supports', CONTRADICTS: 'Contradicts', REFERENCES: 'References', DUPLICATES: 'Duplicates',
  DERIVED_FROM: 'Derived from', RELATED_TO: 'Related to', SAME_SOURCE: 'Same source', SAME_ACTOR: 'Same actor',
  SAME_EVENT: 'Same event', PART_OF: 'Part of', PUBLISHED_AS: 'Published as', CORRECTED_BY: 'Corrected by',
  WATCHES: 'Watches', MENTIONS: 'Mentions', INVESTIGATES: 'Investigates',
};

export const NODE_LABEL: Record<NodeType, string> = {
  SOURCE: 'Source', SIGNAL: 'Signal', EVIDENCE: 'Evidence', CLAIM: 'Claim', INVESTIGATION: 'Investigation',
  REPORT: 'Report', CORRECTION: 'Correction', WATCHLIST: 'Watchlist', NARRATIVE: 'Narrative', ACTOR: 'Actor',
  EVENT: 'Event', ORGANIZATION: 'Organization',
};

function round2(n: number): number { return Math.round(Math.max(0, Math.min(1, n)) * 100) / 100; }

/** Net stance of an evidence claim from its support/challenge tallies. */
export function stanceFor(support: number, challenge: number): 'SUPPORTS' | 'CONTRADICTS' {
  return support >= challenge ? 'SUPPORTS' : 'CONTRADICTS';
}

/**
 * Confidence for a SUPPORTS/CONTRADICTS edge derived from a claim:
 *  - prefer an explicit, valid `strength` (0..1);
 *  - else the majority share of support vs challenge;
 *  - else 0.5 when there is no signal (neutral, not fabricated).
 */
export function stanceConfidence(support: number, challenge: number, strength: number | null): number {
  if (strength != null && strength >= 0 && strength <= 1) return round2(strength);
  const total = support + challenge;
  if (total <= 0) return 0.5;
  return round2(Math.max(support, challenge) / total);
}

/** Confidence for an explicit foreign-key edge (a recorded fact). Always 1.0. */
export const FK_CONFIDENCE = 1;
/** Confidence for structural relatedness (shared container). */
export const STRUCTURAL_CONFIDENCE = 0.5;
