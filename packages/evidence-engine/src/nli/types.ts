// =============================================================================
// nli/types.ts — support/contradiction classification contract (Phase 5).
// =============================================================================

import type { Claim } from '@hsi/research-agents';
import type { EvidenceResult, SupportType } from '../types';

/** The outcome of classifying one result against one claim. */
export interface SupportClassification {
  /** How the result relates to the claim. */
  classification: SupportType; // 'supports'|'contradicts'|'background'|'unclear'
  /** 0..1 — confidence in THIS classification (not in the claim itself). */
  confidence: number;
  /** A short, human-readable justification. */
  rationale: string;
}

/**
 * A support classifier. MUST preserve uncertainty (return 'unclear' with low
 * confidence when ambiguous) and MUST never throw — degrade to a safe,
 * low-confidence 'unclear'/'background' on any failure.
 */
export interface SupportClassifier {
  /** Human-readable name, e.g. 'heuristic', 'llm(gpt-4o-mini)'. */
  name: string;
  /** Whether this is the deterministic fixture/default or a live classifier. */
  mode: 'fixture' | 'live';
  /**
   * Classify one result against one claim, given the result's relevance (0..1).
   */
  classify(
    claim: Claim,
    result: EvidenceResult,
    relevance: number,
    now?: string,
  ): Promise<SupportClassification>;
}
