// =============================================================================
// nli/heuristicClassifier.ts — deterministic support classifier (Phase 5).
//
// Reuses the Phase-4 honesty logic (`supportTypeFor`) and adds explicit
// confidence + a rationale. PRESERVES UNCERTAINTY: when there is no explicit
// fixture stance and relevance is weak/ambiguous it returns 'unclear' with low
// confidence — it does NOT force a class. HONESTY: speculative / fictional /
// physics-violating claims are never 'supports' on weak evidence (capped at
// 'background') unless the fixture carries an explicit stance:'supports'.
// =============================================================================

import type { Claim } from '@hsi/research-agents';
import type { EvidenceResult } from '../types';
import {
  confidenceFor,
  extractStance,
  supportTypeFor,
  RELEVANCE_SUPPORT_THRESHOLD,
} from '../score';
import type { SupportClassification, SupportClassifier } from './types';

/** Pure classification used by both the engine and the heuristic classifier. */
export function classifyHeuristic(
  claim: Claim,
  result: EvidenceResult,
  relevance: number,
): SupportClassification {
  const stance = extractStance(result);
  const supportType = supportTypeFor(claim, result, relevance);
  const confidence = confidenceFor(result.reliabilityScore, relevance, supportType);

  let rationale: string;
  if (stance && stance === supportType) {
    rationale = `Curated fixture stance '${stance}' for this source.`;
  } else if (stance === 'supports' && supportType !== 'supports') {
    rationale = `Fixture stance 'supports' was honesty-capped to '${supportType}' for a ${claim.tier} claim.`;
  } else if (supportType === 'contradicts') {
    rationale = 'Contradiction cue detected in title/abstract.';
  } else if (supportType === 'supports') {
    rationale = `High lexical relevance (${relevance.toFixed(2)} ≥ ${RELEVANCE_SUPPORT_THRESHOLD}) for a grounded claim.`;
  } else if (supportType === 'background') {
    rationale = `Some topical overlap (relevance ${relevance.toFixed(2)}) but not strong enough to affirm/contradict.`;
  } else {
    rationale = `Relevance too low (${relevance.toFixed(2)}) to determine a relationship; preserving uncertainty.`;
  }

  return { classification: supportType, confidence, rationale };
}

/** The deterministic heuristic SupportClassifier. */
export function createHeuristicClassifier(): SupportClassifier {
  return {
    name: 'heuristic',
    mode: 'fixture',
    async classify(claim, result, relevance): Promise<SupportClassification> {
      return classifyHeuristic(claim, result, relevance);
    },
  };
}
