// =============================================================================
// Deterministic demo lineage for OFFLINE views + tests. A complete chain:
//   signal s1,s2 → investigation i1 → {evidence e1, publication p1} → outcome o1,
//   with contributor u1 touching i1. Plus an orphan signal s9 (no edges).
// =============================================================================

import type { LineageEdge, LineageNode } from './types';

const n = (kind: LineageNode['kind'], id: string, label?: string): LineageNode => ({ kind, id, label });

export const demoEdges: LineageEdge[] = [
  { from: n('signal', 's1', 'Coordinated posts'), to: n('investigation', 'i1', 'Narrative spike'), relation: 'signal_to_investigation' },
  { from: n('signal', 's2', 'Bot cluster'), to: n('investigation', 'i1'), relation: 'signal_to_investigation' },
  { from: n('investigation', 'i1'), to: n('evidence', 'e1', 'Archived posts'), relation: 'investigation_to_evidence' },
  { from: n('investigation', 'i1'), to: n('publication', 'p1', 'Threat brief'), relation: 'investigation_to_publication' },
  { from: n('publication', 'p1'), to: n('evidence', 'e1'), relation: 'publication_to_evidence' },
  { from: n('publication', 'p1'), to: n('outcome', 'o1', 'Verified finding'), relation: 'publication_to_outcome' },
  { from: n('contributor', 'u1'), to: n('investigation', 'i1'), relation: 'contributor_touched' },
];

/** A broken-chain demo: a publication with no source. */
export const demoBrokenEdges: LineageEdge[] = [
  { from: n('publication', 'pX'), to: n('outcome', 'oX'), relation: 'publication_to_outcome' },
];

/** An orphan node demo (isolated signal). */
export const demoOrphanNode: LineageNode = n('signal', 's9', 'Unlinked signal');
