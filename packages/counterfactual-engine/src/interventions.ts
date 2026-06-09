// =============================================================================
// @hsi/counterfactual-engine — ergonomic intervention wrappers.
//
// simulateIntervention maps high-level, human-friendly interventions ("Remove
// Amplification Spike", "Delay Community Growth", "Reduce Influence Transfer",
// "Increase Contradiction Rate") onto generateCounterfactual scenarios, then
// returns the same grounded CounterfactualResult. It NEVER claims certainty —
// the underlying engine carries confidence/limitations and the presets describe
// effects in ESTIMATE language. Deterministic — caller injects `now`.
// =============================================================================

import { generateCounterfactual } from './counterfactual';
import type {
  CounterfactualInput,
  CounterfactualResult,
  ScenarioType,
} from './types';

/** A high-level intervention preset key. */
export type InterventionKey =
  | 'remove_amplification_spike'
  | 'delay_community_growth'
  | 'reduce_influence_transfer'
  | 'increase_contradiction_rate'
  | 'remove_source_expansion'
  | 'add_sources'
  | 'boost_amplification';

/** A high-level intervention descriptor mapping to a low-level scenario. */
export interface InterventionPreset {
  key: InterventionKey;
  label: string;
  /** ESTIMATE-language description of what this intervention probes. */
  description: string;
  scenarioType: ScenarioType;
  /** Default magnitude (0..2; 1 = full strength). */
  magnitude: number;
}

/** The catalogue of high-level interventions. */
export const INTERVENTION_PRESETS: Record<InterventionKey, InterventionPreset> = {
  remove_amplification_spike: {
    key: 'remove_amplification_spike',
    label: 'Remove Amplification Spike',
    description:
      'Estimate the trajectory had the amplification spike never occurred.',
    scenarioType: 'reduce_amplification',
    magnitude: 1,
  },
  delay_community_growth: {
    key: 'delay_community_growth',
    label: 'Delay Community Growth',
    description:
      'Estimate the trajectory had communities grown more slowly (damped community spread).',
    scenarioType: 'remove_community',
    magnitude: 0.6,
  },
  reduce_influence_transfer: {
    key: 'reduce_influence_transfer',
    label: 'Reduce Influence Transfer',
    description:
      'Estimate the trajectory had the inbound influence push been weaker.',
    scenarioType: 'remove_event',
    magnitude: 0.7,
  },
  increase_contradiction_rate: {
    key: 'increase_contradiction_rate',
    label: 'Increase Contradiction Rate',
    description:
      'Estimate the trajectory had contradictions risen faster (more pushback).',
    scenarioType: 'increase_contradiction',
    magnitude: 1,
  },
  remove_source_expansion: {
    key: 'remove_source_expansion',
    label: 'Remove Source Expansion',
    description:
      'Estimate the trajectory had the narrative never spread to new sources.',
    scenarioType: 'remove_source',
    magnitude: 1,
  },
  add_sources: {
    key: 'add_sources',
    label: 'Add Sources',
    description: 'Estimate the trajectory had even more sources carried it.',
    scenarioType: 'add_source',
    magnitude: 1,
  },
  boost_amplification: {
    key: 'boost_amplification',
    label: 'Boost Amplification',
    description: 'Estimate the trajectory under stronger amplification.',
    scenarioType: 'increase_amplification',
    magnitude: 1,
  },
};

/**
 * Run a high-level intervention. Accepts either a preset key or a full preset
 * object (so callers can tweak magnitude). Returns a grounded result; never
 * claims certainty.
 */
export function simulateIntervention(
  input: CounterfactualInput,
  intervention: InterventionKey | InterventionPreset,
  now: string,
): CounterfactualResult {
  const preset =
    typeof intervention === 'string'
      ? INTERVENTION_PRESETS[intervention]
      : intervention;

  return generateCounterfactual(
    input,
    {
      type: preset.scenarioType,
      magnitude: preset.magnitude,
      name: preset.label,
    },
    now,
  );
}

/** List the available intervention presets (deterministic order). */
export function listInterventionPresets(): InterventionPreset[] {
  return Object.values(INTERVENTION_PRESETS);
}
