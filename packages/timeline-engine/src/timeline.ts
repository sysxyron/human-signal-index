// =============================================================================
// @hsi/simulation-engine — Timeline Engine
// generateTimeline(state, kind, span) emits ordered events computed from state.
// Milestones are LOG-SCALED so a billion-year span still renders sensibly: each
// milestone is placed at a fraction of the total span on a log axis, gated by
// the relevant state properties (evolutionRate, intelligence, technology, star).
// =============================================================================

import { getUniverse, clamp01, type WorldState } from '@hsi/world-models';
import { formulas } from '@hsi/simulation-engine';

export type TimelineKind = 'evolution' | 'civilization' | 'planetary' | 'stellar';

export interface TimelineEvent {
  /** Years from t=0 (present). */
  tYears: number;
  title: string;
  description: string;
  category: TimelineKind;
  /** 0..1 confidence this event occurs as described. */
  confidence: number;
}

const GYR = 1e9;

/** Place a fraction `f` (0..1) of a span on a log axis from `minYears` to span. */
function logPlace(f: number, span: number, minYears: number): number {
  const lo = Math.log10(Math.max(minYears, 1));
  const hi = Math.log10(Math.max(span, minYears * 10));
  return Math.pow(10, lo + clamp01(f) * (hi - lo));
}

/**
 * Generate a timeline. `span` is total years to cover (e.g. 4.5e9 for the Sun's
 * remaining life). Events past the span are dropped.
 */
export function generateTimeline(
  state: WorldState,
  kind: TimelineKind,
  span: number,
): TimelineEvent[] {
  const events =
    kind === 'evolution'
      ? evolutionTimeline(state, span)
      : kind === 'civilization'
        ? civilizationTimeline(state, span)
        : kind === 'planetary'
          ? planetaryTimeline(state, span)
          : stellarTimeline(state, span);

  return events
    .filter((e) => e.tYears <= span && e.tYears >= 0)
    .sort((a, b) => a.tYears - b.tYears);
}

function evolutionTimeline(state: WorldState, span: number): TimelineEvent[] {
  // Faster evolution compresses milestones toward t=0 (earlier in the span).
  const rate = clamp01(state.biology.evolutionRate) || 0.01;
  const speed = 0.4 + 0.6 * rate; // higher rate => smaller placement fraction
  const mk = (f: number, title: string, desc: string, conf: number): TimelineEvent => ({
    tYears: logPlace(f / speed, span, 1e5),
    title,
    description: desc,
    category: 'evolution',
    confidence: conf,
  });
  return [
    mk(0.05, 'Abiogenesis', 'First self-replicating chemistry forms.', 0.6 * state.chemistry.stabilityIndex + 0.2),
    mk(0.2, 'Single-celled life', 'Prokaryote-equivalent cells dominate.', 0.7),
    mk(0.4, 'Photosynthesis-equivalent', 'Energy capture reshapes the atmosphere.', 0.6),
    mk(0.6, 'Multicellularity', 'Cells cooperate into complex organisms.', 0.55 * state.biology.complexityIndex + 0.2),
    mk(0.8, 'Complex ecosystems', 'Diverse biomes and food webs establish.', 0.5),
    mk(0.95, 'Nervous systems', 'Centralized cognition becomes possible.', state.intelligence.present ? 0.6 : 0.25),
  ];
}

function civilizationTimeline(state: WorldState, span: number): TimelineEvent[] {
  if (!state.civilization.present) {
    return [
      {
        tYears: logPlace(0.5, span, 1e3),
        title: 'No civilization',
        description: 'Intelligence did not give rise to a technological civilization in this world.',
        category: 'civilization',
        confidence: 0.7,
      },
    ];
  }
  const tech = clamp01(state.civilization.technologyLevel / 3);
  const mk = (f: number, title: string, desc: string, conf: number): TimelineEvent => ({
    tYears: logPlace(f, span, 1e3),
    title,
    description: desc,
    category: 'civilization',
    confidence: conf,
  });
  return [
    mk(0.1, 'Tool use & language', 'Symbolic communication and tools emerge.', 0.7),
    mk(0.3, 'Agriculture & settlement', 'Surplus enables cities and specialization.', 0.65),
    mk(0.5, 'Formal mathematics', 'Abstraction unlocks engineering.', 0.5 + 0.4 * state.civilization.mathematicsLevel),
    mk(0.7, 'Industrialization', 'Energy harnessed at scale (Kardashev ~0.7).', 0.4 + 0.4 * tech),
    mk(0.85, 'Planetary-scale technology', 'Approaching Kardashev I.', 0.3 + 0.5 * tech),
    mk(0.97, 'Stellar-scale ambitions', 'Reaching beyond the home world.', 0.2 + 0.5 * tech * state.civilization.riskManagementIndex),
  ];
}

function planetaryTimeline(state: WorldState, span: number): TimelineEvent[] {
  const planet = state.planets[0];
  const mk = (f: number, title: string, desc: string, conf: number): TimelineEvent => ({
    tYears: logPlace(f, span, 1e6),
    title,
    description: desc,
    category: 'planetary',
    confidence: conf,
  });
  return [
    mk(0.1, 'Crust stabilizes', 'Surface cools enough for solid crust.', 0.8),
    mk(0.3, 'Solvent oceans', `${state.chemistry.solvent} accumulates on the surface.`, 0.6 + 0.3 * (planet?.waterCoverage ?? 0)),
    mk(0.5, 'Plate tectonics / resurfacing', 'Geological cycling regulates climate.', 0.55),
    mk(0.75, 'Climate excursions', 'Major glaciations and warm periods alternate.', 0.5),
    mk(0.95, 'Atmospheric loss begins', 'Stellar evolution starts stripping the atmosphere.', 0.5),
  ];
}

function stellarTimeline(state: WorldState, span: number): TimelineEvent[] {
  const consts = getUniverse(state.universeType).constants;
  const totalLife = formulas.stellarLifetimeGyr(state.star.massSolar, consts) * GYR;
  const remaining = state.risks.stellarLifetimeRemainingGyr * GYR;
  const mk = (tYears: number, title: string, desc: string, conf: number): TimelineEvent => ({
    tYears,
    title,
    description: desc,
    category: 'stellar',
    confidence: conf,
  });
  return [
    mk(0, 'Present main sequence', `Star burning hydrogen; ~${state.risks.stellarLifetimeRemainingGyr.toFixed(1)} Gyr remain.`, 0.9),
    mk(remaining * 0.8, 'Brightening', 'Luminosity rises; inner habitable zone moves outward.', 0.7),
    mk(remaining, 'Main-sequence exit', 'Hydrogen core exhausted.', 0.8),
    mk(remaining + totalLife * 0.05, 'Red-giant phase', 'Envelope expands, engulfing inner planets.', 0.7),
    mk(remaining + totalLife * 0.1, 'Remnant', state.star.massSolar > 8 ? 'Core collapses to a neutron star.' : 'Core becomes a white dwarf.', 0.7),
  ];
}
