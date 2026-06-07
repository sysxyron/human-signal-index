// =============================================================================
// @hsi/simulation-engine — provenance
// Extends the sem_debug-inspired traceability idea from @hsi/traceability:
// every COMPUTED value carries a Provenance record stating WHERE it came from,
// WHY it has the value it does, what it DEPENDS ON, and how confident we are
// (both numerically and on the scientific-confidence ladder).
// =============================================================================

import type { ScientificConfidence } from '../scientific-confidence';

/** Provenance attached to every computed graph node / report field. */
export interface Provenance {
  /** Origin system, e.g. 'Simulation Engine'. */
  source: string;
  /** Human-readable reason this value is what it is. */
  reason: string;
  /** Node ids / labels this value was derived from. */
  dependsOn: string[];
  /** 0..1 confidence in the computation itself. */
  confidence: number;
  /** Scientific-confidence tag (known-science .. violates-known-physics). */
  scientificConfidence: ScientificConfidence;
}

/** Build a Provenance record. */
export function buildProvenance(args: {
  source?: string;
  reason: string;
  dependsOn?: string[];
  confidence?: number;
  scientificConfidence: ScientificConfidence;
}): Provenance {
  return {
    source: args.source ?? 'Simulation Engine',
    reason: args.reason,
    dependsOn: args.dependsOn ?? [],
    confidence: args.confidence ?? args.scientificConfidence.confidence,
    scientificConfidence: args.scientificConfidence,
  };
}
