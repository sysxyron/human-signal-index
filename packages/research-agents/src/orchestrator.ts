// =============================================================================
// @hsi/research-agents — orchestrator
// runResearch() runs the 9 domain agents in dependency order, then the skeptic
// (challenges), then consensus (synthesis), and assembles the ResearchRunResult
// + blueprint. Fully deterministic: no Date.now() / Math.random(); any tie-break
// uses opts.seed. Timestamps are passed in, never read from the clock.
// =============================================================================

import { parseConcept } from './concept';
import { DOMAIN_AGENTS, skepticAgent, consensusAgent, buildDisputes, buildConsensusReport } from './agents';
import { consensusToBlueprint } from './blueprint';
import type {
  AgentContext,
  AgentDomain,
  AgentOutput,
  ResearchConcept,
  ResearchRunResult,
} from './types';

export interface RunResearchOptions {
  /** Deterministic seed for any tie-break (never used for randomness). */
  seed?: string;
}

/**
 * Run the full research pipeline on a concept (string or pre-parsed).
 * Returns the 9 domain outputs + skeptic output, the disputes, the consensus
 * report, and a ready-to-build SimulationBlueprint.
 */
export function runResearch(
  concept: ResearchConcept | string,
  opts: RunResearchOptions = {},
): ResearchRunResult {
  const parsed: ResearchConcept =
    typeof concept === 'string' ? parseConcept(concept) : concept;

  const prior = new Map<AgentDomain, AgentOutput>();
  const agentOutputs: AgentOutput[] = [];

  // 1) Domain agents in dependency order.
  for (const agent of DOMAIN_AGENTS) {
    const ctx: AgentContext = { prior, seed: opts.seed };
    const out = agent.analyze(parsed, ctx);
    prior.set(agent.domain, out);
    agentOutputs.push(out);
  }

  // 2) Skeptic — falsification pass over all domain outputs.
  const skepticCtx: AgentContext = { prior, seed: opts.seed };
  const skepticOut = skepticAgent.analyze(parsed, skepticCtx);
  prior.set('skeptic', skepticOut);
  agentOutputs.push(skepticOut);

  // The disputes are the single source of truth (skeptic + consensus share them).
  const disputes = buildDisputes(skepticCtx);

  // 3) Consensus — synthesis over everything + disputes.
  const consensusCtx: AgentContext = { prior, disputes, seed: opts.seed };
  const consensusOut = consensusAgent.analyze(parsed, consensusCtx);
  prior.set('consensus', consensusOut);
  const consensus = buildConsensusReport(consensusCtx);

  // 4) Blueprint from the consensus.
  const result: ResearchRunResult = {
    concept: parsed,
    agentOutputs, // 9 domain agents + skeptic (consensus lives in `consensus`)
    disputes,
    consensus,
    blueprint: {
      // placeholder, replaced below once we can reference the full result
      worldName: parsed.title ?? 'Researched World',
      universeType: 'standard-physics',
      stateOverrides: {},
      rationale: [],
      confidence: consensus.overallConfidence,
    },
    createdAtSeed: opts.seed,
  };
  result.blueprint = consensusToBlueprint(result);
  return result;
}
