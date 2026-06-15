// =============================================================================
// Deterministic demo fixtures for OFFLINE outcome views + tests. No randomness.
// =============================================================================

import type { AttributionEdge, ImpactInputs } from './types';

export const demoImpactHigh: ImpactInputs = {
  acceptedFindings: 6, governanceActions: 4, publicationQuality: 88, traceability: 90, evidenceQuality: 82, verificationLevel: 0.9,
};
export const demoImpactLow: ImpactInputs = {
  acceptedFindings: 0, governanceActions: 0, publicationQuality: 30, traceability: 25, evidenceQuality: 20, verificationLevel: 0.1,
};

// A small attribution graph: 2 signals → 1 investigation → 1 publication → 1 outcome,
// plus a contributor credit edge. Owners differ (no self-attribution).
export const demoEdges: AttributionEdge[] = [
  { origin: { type: 'signal', id: 's1' }, destination: { type: 'investigation', id: 'i1' }, relationship: 'signal_to_investigation', weight: 0.6, originOwner: 'u1', destinationOwner: 'u2' },
  { origin: { type: 'signal', id: 's2' }, destination: { type: 'investigation', id: 'i1' }, relationship: 'signal_to_investigation', weight: 0.4, originOwner: 'u3', destinationOwner: 'u2' },
  { origin: { type: 'investigation', id: 'i1' }, destination: { type: 'publication', id: 'p1' }, relationship: 'investigation_to_publication', weight: 0.9, originOwner: 'u2', destinationOwner: 'u4' },
  { origin: { type: 'publication', id: 'p1' }, destination: { type: 'outcome', id: 'o1' }, relationship: 'publication_to_outcome', weight: 1.0, originOwner: 'u4', destinationOwner: 'u4' },
  { origin: { type: 'contributor', id: 'u2' }, destination: { type: 'outcome', id: 'o1' }, relationship: 'contributor_to_outcome', weight: 0.7, originOwner: 'u2', destinationOwner: 'u4' },
];

export interface DemoOutcomeRow { id: string; type: string; title: string; impact: number; team: string; at: string }
export const demoOutcomes: DemoOutcomeRow[] = [
  { id: 'o1', type: 'VERIFIED_FINDING', title: 'Coordinated narrative confirmed', impact: 86, team: 'research', at: '2026-06-12T10:00:00Z' },
  { id: 'o2', type: 'GOVERNANCE_ACTION', title: 'Sensitive claim escalated + cleared', impact: 74, team: 'governance', at: '2026-06-11T10:00:00Z' },
  { id: 'o3', type: 'PUBLICATION_RELEASED', title: 'Quarterly threat brief published', impact: 68, team: 'curation', at: '2026-06-10T10:00:00Z' },
];
