// =============================================================================
// @hsi/research-agents — Chronid showcase demo
// The flagship concept: a being whose subjective day equals 1,000 Earth years.
// chronidResearchDemo() runs the full pipeline. The resulting agent outputs cover
// Chronid biology, a frozen super-Earth environment, crystal genetics, geological
// neural networks, slow metabolism, temporal-niche theory (C(t) ≈ E(t): under-
// adapted to fast, balanced to geological), and a risk comparison vs humans.
// =============================================================================

import { runResearch } from './orchestrator';
import type { ResearchRunResult } from './types';

/**
 * The canonical Chronid concept. The parser extracts subjectiveDayYears = 1000
 * (⇒ ultra-slow metabolism, geological neural substrate, crystal genetics on a
 * frozen super-Earth) from this enriched description.
 */
export const CHRONID_RESEARCH_CONCEPT =
  'A being whose subjective day equals 1,000 Earth years. It lives on a frozen ' +
  'super-Earth orbiting a red dwarf, has crystal genetics and a geological ' +
  'mineral neural network, an ultra-slow metabolism, and a billion-year lifespan.';

/** Run the full research pipeline on the Chronid concept (deterministic). */
export function chronidResearchDemo(): ResearchRunResult {
  return runResearch(CHRONID_RESEARCH_CONCEPT, { seed: 'chronid' });
}

// example: run the Chronid research and inspect the consensus + temporal niche
//   import { chronidResearchDemo } from '@hsi/research-agents';
//   const run = chronidResearchDemo();
//   run.consensus.overallConfidence;        // 0..100 aggregate confidence
//   run.consensus.classificationBreakdown;  // claims per scientific tier
//   run.agentOutputs.find(a => a.domain === 'mathematics')?.recommendedParameters;
//     // -> temporal.bestNiche === 'geological', under-adapted to 'fast'

// example: turn the blueprint into a real, simulatable WorldState
//   import { chronidResearchDemo, blueprintToWorldState } from '@hsi/research-agents';
//   import { evaluateWorld } from '@hsi/simulation-engine';
//   const world = blueprintToWorldState(chronidResearchDemo().blueprint);
//   const report = evaluateWorld(world);    // habitability, risks, etc.
