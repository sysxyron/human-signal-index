// =============================================================================
// @hsi/research-agents — agent registry
// Named exports for every agent plus an ordered ALL_AGENTS array and an
// AGENTS_BY_DOMAIN lookup. Domain agents are listed in dependency order, then
// the skeptic (falsification), then the consensus (synthesis).
// =============================================================================

import type { Agent, AgentDomain } from '../types';
import { physicsAgent } from './physics';
import { planetologyAgent } from './planetology';
import { chemistryAgent } from './chemistry';
import { biologyAgent } from './biology';
import { evolutionAgent } from './evolution';
import { intelligenceAgent } from './intelligence';
import { civilizationAgent } from './civilization';
import { mathematicsAgent } from './mathematics';
import { riskAgent } from './risk';
import { skepticAgent } from './skeptic';
import { consensusAgent } from './consensus';

export {
  physicsAgent,
  planetologyAgent,
  chemistryAgent,
  biologyAgent,
  evolutionAgent,
  intelligenceAgent,
  civilizationAgent,
  mathematicsAgent,
  riskAgent,
  skepticAgent,
  consensusAgent,
};
export { buildDisputes } from './skeptic';
export { buildConsensusReport } from './consensus';
export type { RiskComparisonRow } from './risk';
export {
  ClaimBuilder,
  scoresFromClaims,
  finalize,
  eq,
  placeholder,
  claimId,
  round1,
  fmtRateHz,
} from './helpers';

/** The 9 domain agents in dependency order. */
export const DOMAIN_AGENTS: Agent[] = [
  physicsAgent,
  planetologyAgent,
  chemistryAgent,
  biologyAgent,
  evolutionAgent,
  intelligenceAgent,
  civilizationAgent,
  mathematicsAgent,
  riskAgent,
];

/** All 11 agents: domain agents, then skeptic, then consensus. */
export const ALL_AGENTS: Agent[] = [...DOMAIN_AGENTS, skepticAgent, consensusAgent];

/** Lookup any agent by its domain. */
export const AGENTS_BY_DOMAIN: Record<AgentDomain, Agent> = ALL_AGENTS.reduce(
  (acc, a) => {
    acc[a.domain] = a;
    return acc;
  },
  {} as Record<AgentDomain, Agent>,
);
