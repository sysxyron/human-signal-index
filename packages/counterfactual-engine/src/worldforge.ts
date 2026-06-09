// =============================================================================
// @hsi/counterfactual-engine — WorldForge alternative-timeline assembly.
//
// generateCounterfactualWorld turns a CounterfactualResult into an alternative
// WorldForge timeline: a scenario title ("What if the amplification spike never
// occurred?"), a summary, a worldState object of the alternate-timeline metrics,
// epochs + turningPoints derived from the counterfactual frames, and the
// confidence carried straight from the result. Pure assembly — no new modelling,
// no clocks, no randomness.
// =============================================================================

import type {
  CounterfactualInput,
  CounterfactualResult,
  CounterfactualWorld,
} from './types';

/** Map a scenario type to a human "what if …?" question. */
function titleFor(result: CounterfactualResult): string {
  const map: Record<string, string> = {
    remove_event: 'What if that event never happened?',
    delay_event: 'What if that event had been delayed?',
    accelerate_event: 'What if that event had happened sooner?',
    reduce_amplification: 'What if the amplification spike never occurred?',
    increase_amplification: 'What if the amplification had been even stronger?',
    remove_source: 'What if the narrative never spread to new sources?',
    add_source: 'What if even more sources had carried it?',
    remove_community: 'What if it never reached new communities?',
    increase_reliability: 'What if the narrative had been more credible?',
    decrease_reliability: 'What if the narrative had been less credible?',
    remove_contradiction: 'What if the contradictions never surfaced?',
    increase_contradiction: 'What if the contradictions had been louder?',
  };
  return map[result.scenarioType] ?? `What if "${result.scenarioName}"?`;
}

/**
 * Assemble an alternative WorldForge timeline from a counterfactual result.
 * Pure — derives everything from `result` + `input`.
 */
export function generateCounterfactualWorld(
  input: CounterfactualInput,
  result: CounterfactualWorldSource,
  _now: string,
): CounterfactualWorld {
  void _now;
  const cf = result.counterfactual;
  const frames = cf.frames;
  const last = frames[frames.length - 1];
  const first = frames[0];

  const scenarioTitle = titleFor(result);
  const scenarioSummary = `${result.summary} ${result.reasoning[1] ?? ''}`.trim();

  const worldState: Record<string, unknown> = {
    narrativeId: result.narrativeId,
    finalForecastState: cf.finalForecastState,
    finalSignals: last?.signals ?? 0,
    finalSources: last?.sources ?? 0,
    finalCommunities: last?.communities ?? 0,
    finalAmplification: last?.amplification ?? 0,
    signalDeltaPct: result.deltas.signalDeltaPct,
    amplificationDelta: result.deltas.amplificationDelta,
    growthDeltaPct: result.deltas.growthDeltaPct,
    forecastChanged: result.deltas.forecastChanged,
    baselineFinalForecastState: result.original.finalForecastState,
    confidenceBand: result.confidenceBand,
  };

  // Epochs: divide the altered frames into beginning / middle / end narrative.
  const epochs: { label: string; summary: string }[] = [];
  if (first) {
    epochs.push({
      label: 'Origin',
      summary: `Narrative starts at ${first.signals} signals across ${first.sources} sources (${first.forecast ?? 'unknown'}).`,
    });
  }
  if (frames.length >= 3) {
    const mid = frames[Math.floor(frames.length / 2)];
    epochs.push({
      label: 'Divergence',
      summary: `Under the intervention, mid-timeline shows ${mid.signals} signals, amplification ${mid.amplification} (${mid.forecast ?? 'unknown'}).`,
    });
  }
  if (last) {
    epochs.push({
      label: 'Outcome',
      summary:
        `Alternate timeline ends at ${last.signals} signals, ${last.communities} communities, ` +
        `amplification ${last.amplification}; forecast ${cf.finalForecastState}` +
        (result.deltas.forecastChanged
          ? ` (vs ${result.original.finalForecastState} in reality).`
          : ` (same as reality).`),
    });
  }

  // Turning points: frames where the per-frame forecast state changes in the
  // alternate timeline (where the divergent world "decides").
  const turningPoints: { at: string; description: string }[] = [];
  for (let i = 1; i < frames.length; i += 1) {
    if (frames[i].forecast !== frames[i - 1].forecast) {
      turningPoints.push({
        at: frames[i].timestamp,
        description: `Alternate forecast shifts ${frames[i - 1].forecast} → ${frames[i].forecast} (signals ${frames[i].signals}, amp ${frames[i].amplification}).`,
      });
    }
  }
  if (turningPoints.length === 0 && result.deltas.forecastChanged && last) {
    turningPoints.push({
      at: last.timestamp,
      description: `Intervention flips the final forecast to ${cf.finalForecastState}.`,
    });
  }

  void input;
  return {
    scenarioTitle,
    scenarioSummary,
    worldState,
    confidence: result.confidence,
    epochs,
    turningPoints,
  };
}

/** The fields of CounterfactualResult that worldforge consumes. */
type CounterfactualWorldSource = CounterfactualResult;
