// =============================================================================
// @hsi/temporal-intelligence — deterministic demo fixtures (OFFLINE showcase).
//
// A small, hand-built world that exercises every path:
//   * "ai-jobs"      — GROWING (young + accelerating → emerging/rising),
//   * "crypto-crash" — DECLINING → DEAD (stale, amplification collapses),
//   * "climate-core" — the parent of a SPLIT,
//   * "climate-tech" / "climate-policy" — SPLIT children of climate-core,
//   * "energy-merge" — MERGE of two earlier energy narratives,
//   * "solar-boom" + "wind-boom" — the two merge parents,
//   * an INFLUENCE chain ai-jobs → ai-regulation → ai-litigation,
//   * a GENEALOGY derived_from: ai-regulation derived_from ai-jobs.
//
// Everything is timestamped relative to FIXTURE_NOW so the same inputs always
// produce the same outputs. No network, no clocks, no randomness.
// =============================================================================

import { evolutionSeries } from './evolution';
import { forecastNarrativeTrajectory } from './forecast';
import { buildNarrativeGenealogy } from './genealogy';
import { buildInfluenceNetwork } from './influence';
import { captureNarrativeSnapshot } from './snapshots';
import type {
  EvolutionRecord,
  GenealogyEdge,
  InfluenceEdge,
  NarrativeForecast,
  NarrativeInput,
  NarrativeSnapshot,
  NarrativeStats,
  SignalInput,
  TemporalDeps,
} from './types';

/** Fixed "now" for all fixtures — everything is relative to this. */
export const FIXTURE_NOW = '2026-02-01T00:00:00.000Z';

function daysBefore(days: number): string {
  return new Date(Date.parse(FIXTURE_NOW) - days * 24 * 60 * 60 * 1000).toISOString();
}

// ---- Narratives -------------------------------------------------------------

export const DEMO_NARRATIVES: NarrativeInput[] = [
  // Growing, young.
  {
    id: 'ai-jobs',
    name: 'AI displacing jobs surge',
    category: 'economy',
    signalIds: ['s-aj-1', 's-aj-2', 's-aj-3', 's-aj-4'],
    entityIds: ['openai', 'labor', 'automation'],
    sourceIds: ['src-tech', 'src-news', 'src-blog'],
    communityIds: ['c-ai', 'c-econ'],
    firstSeenAt: daysBefore(10),
    lastSeenAt: daysBefore(0),
  },
  // Derived from ai-jobs, also part of the influence chain.
  {
    id: 'ai-regulation',
    name: 'AI regulation automation labor push',
    category: 'policy',
    signalIds: ['s-ar-1', 's-ar-2'],
    entityIds: ['openai', 'labor', 'congress'],
    sourceIds: ['src-news', 'src-gov'],
    communityIds: ['c-ai', 'c-policy'],
    firstSeenAt: daysBefore(6),
    lastSeenAt: daysBefore(0),
  },
  // Last in the influence chain.
  {
    id: 'ai-litigation',
    name: 'AI regulation labor lawsuits congress',
    category: 'policy',
    signalIds: ['s-al-1', 's-al-2'],
    entityIds: ['labor', 'congress', 'courts'],
    sourceIds: ['src-gov', 'src-legal'],
    communityIds: ['c-policy'],
    firstSeenAt: daysBefore(3),
    lastSeenAt: daysBefore(0),
  },
  // Declining → dead.
  {
    id: 'crypto-crash',
    name: 'Crypto market crash panic',
    category: 'finance',
    signalIds: ['s-cc-1', 's-cc-2', 's-cc-3'],
    entityIds: ['bitcoin', 'exchange'],
    sourceIds: ['src-fin'],
    communityIds: ['c-crypto'],
    firstSeenAt: daysBefore(60),
    lastSeenAt: daysBefore(40),
  },
  // Split parent.
  {
    id: 'climate-core',
    name: 'Climate change action urgency global',
    category: 'climate',
    signalIds: ['s-cl-1', 's-cl-2', 's-cl-3'],
    entityIds: ['emissions', 'policy', 'energy', 'temperature', 'ipcc'],
    sourceIds: ['src-sci', 'src-news', 'src-gov'],
    communityIds: ['c-climate'],
    firstSeenAt: daysBefore(30),
    lastSeenAt: daysBefore(5),
  },
  // Split child (subset of climate-core, tech angle).
  {
    id: 'climate-tech',
    name: 'Climate change energy emissions tech',
    category: 'climate',
    signalIds: ['s-ct-1'],
    entityIds: ['emissions', 'energy'],
    sourceIds: ['src-sci', 'src-news'],
    communityIds: ['c-climate', 'c-tech'],
    firstSeenAt: daysBefore(8),
    lastSeenAt: daysBefore(0),
  },
  // Merge parents.
  {
    id: 'solar-boom',
    name: 'Solar power energy growth',
    category: 'energy',
    signalIds: ['s-sb-1', 's-sb-2'],
    entityIds: ['solar', 'energy', 'grid'],
    sourceIds: ['src-energy', 'src-news'],
    communityIds: ['c-energy'],
    firstSeenAt: daysBefore(40),
    lastSeenAt: daysBefore(20),
  },
  {
    id: 'wind-boom',
    name: 'Wind power energy growth',
    category: 'energy',
    signalIds: ['s-wb-1', 's-wb-2'],
    entityIds: ['wind', 'energy', 'grid'],
    sourceIds: ['src-energy', 'src-gov'],
    communityIds: ['c-energy'],
    firstSeenAt: daysBefore(38),
    lastSeenAt: daysBefore(18),
  },
  // Merge child of solar-boom + wind-boom.
  {
    id: 'energy-merge',
    name: 'Renewable energy solar wind power grid growth',
    category: 'energy',
    signalIds: ['s-em-1', 's-em-2', 's-em-3'],
    entityIds: ['solar', 'wind', 'energy', 'grid'],
    sourceIds: ['src-energy', 'src-news', 'src-gov'],
    communityIds: ['c-energy'],
    firstSeenAt: daysBefore(10),
    lastSeenAt: daysBefore(0),
  },
];

// ---- Signals ----------------------------------------------------------------

function sig(
  id: string,
  narrativeId: string,
  sourceId: string,
  ageDays: number,
  title: string,
  entityIds: string[],
): SignalInput {
  return {
    id,
    narrativeId,
    sourceId,
    capturedAt: daysBefore(ageDays),
    title,
    bodyText: title,
    entityIds,
  };
}

export const DEMO_SIGNALS: SignalInput[] = [
  // ai-jobs (growing).
  sig('s-aj-1', 'ai-jobs', 'src-tech', 10, 'AI displacing jobs surge spreading', ['openai', 'labor']),
  sig('s-aj-2', 'ai-jobs', 'src-news', 7, 'Automation jobs surge viral everywhere', ['automation', 'labor']),
  sig('s-aj-3', 'ai-jobs', 'src-blog', 3, 'AI jobs surge spiking', ['openai', 'automation']),
  sig('s-aj-4', 'ai-jobs', 'src-news', 1, 'AI displacing labor surge soaring', ['labor', 'automation']),
  // ai-regulation (derived + influence middle).
  sig('s-ar-1', 'ai-regulation', 'src-news', 6, 'AI regulation labor automation push', ['openai', 'labor']),
  sig('s-ar-2', 'ai-regulation', 'src-gov', 2, 'Congress AI regulation labor automation', ['congress', 'labor']),
  // ai-litigation (influence end).
  sig('s-al-1', 'ai-litigation', 'src-gov', 3, 'AI regulation labor lawsuits congress', ['congress', 'labor']),
  sig('s-al-2', 'ai-litigation', 'src-legal', 1, 'Labor lawsuits courts congress regulation', ['courts', 'congress']),
  // crypto-crash (declining/dead).
  sig('s-cc-1', 'crypto-crash', 'src-fin', 60, 'Crypto market crash panic bitcoin', ['bitcoin']),
  sig('s-cc-2', 'crypto-crash', 'src-fin', 52, 'Bitcoin exchange crash panic', ['bitcoin', 'exchange']),
  sig('s-cc-3', 'crypto-crash', 'src-fin', 41, 'Crypto crash exchange panic', ['exchange']),
  // climate-core (split parent).
  sig('s-cl-1', 'climate-core', 'src-sci', 30, 'Climate change action urgency emissions', ['emissions', 'policy']),
  sig('s-cl-2', 'climate-core', 'src-news', 18, 'Climate change global energy temperature', ['energy', 'temperature']),
  sig('s-cl-3', 'climate-core', 'src-gov', 6, 'Climate change policy ipcc emissions', ['policy', 'ipcc']),
  // climate-tech (split child).
  sig('s-ct-1', 'climate-tech', 'src-sci', 8, 'Climate change energy emissions tech', ['emissions', 'energy']),
  // solar-boom / wind-boom (merge parents).
  sig('s-sb-1', 'solar-boom', 'src-energy', 40, 'Solar power energy growth grid', ['solar', 'energy']),
  sig('s-sb-2', 'solar-boom', 'src-news', 22, 'Solar energy grid growth', ['solar', 'grid']),
  sig('s-wb-1', 'wind-boom', 'src-energy', 38, 'Wind power energy growth grid', ['wind', 'energy']),
  sig('s-wb-2', 'wind-boom', 'src-gov', 20, 'Wind energy grid growth', ['wind', 'grid']),
  // energy-merge (merge child).
  sig('s-em-1', 'energy-merge', 'src-energy', 10, 'Renewable energy solar wind power grid', ['solar', 'wind']),
  sig('s-em-2', 'energy-merge', 'src-news', 5, 'Renewable solar wind energy growth grid', ['energy', 'grid']),
  sig('s-em-3', 'energy-merge', 'src-gov', 1, 'Renewable energy solar wind grid growth', ['solar', 'grid']),
];

// ---- Multi-snapshot histories ----------------------------------------------
// Each tuple drives a distinct trajectory. Stats are hand-set so evolution +
// forecast exercise growth/decline/split/merge/stable + emerging/rising/dead.

function snap(
  narrativeId: string,
  ageDays: number,
  stats: Omit<NarrativeStats, 'narrativeId'>,
  metadata?: Record<string, unknown>,
): NarrativeSnapshot {
  return captureNarrativeSnapshot(
    { narrativeId, ...stats },
    daysBefore(ageDays),
    { metadata },
  );
}

export const DEMO_SNAPSHOTS: NarrativeSnapshot[] = [
  // ai-jobs: young + accelerating → emerging/rising.
  snap('ai-jobs', 10, { signalCount: 1, sourceCount: 1, communityCount: 1, amplificationScore: 20, reliabilityScore: 55, supportRatio: 0.6, contradictionRatio: 0.1 }, { category: 'economy' }),
  snap('ai-jobs', 6, { signalCount: 4, sourceCount: 2, communityCount: 1, amplificationScore: 38, reliabilityScore: 56, supportRatio: 0.62, contradictionRatio: 0.1 }, { category: 'economy' }),
  snap('ai-jobs', 2, { signalCount: 12, sourceCount: 3, communityCount: 2, amplificationScore: 64, reliabilityScore: 58, supportRatio: 0.65, contradictionRatio: 0.08 }, { category: 'economy' }),

  // ai-regulation (for influence amplification-transfer + forecast).
  snap('ai-regulation', 6, { signalCount: 1, sourceCount: 1, communityCount: 1, amplificationScore: 18, reliabilityScore: 60, supportRatio: 0.6, contradictionRatio: 0.05 }, { category: 'policy' }),
  snap('ai-regulation', 2, { signalCount: 5, sourceCount: 2, communityCount: 2, amplificationScore: 40, reliabilityScore: 62, supportRatio: 0.62, contradictionRatio: 0.05 }, { category: 'policy' }),

  // ai-litigation (end of chain).
  snap('ai-litigation', 3, { signalCount: 1, sourceCount: 1, communityCount: 1, amplificationScore: 15, reliabilityScore: 64, supportRatio: 0.6, contradictionRatio: 0.05 }, { category: 'policy' }),
  snap('ai-litigation', 1, { signalCount: 4, sourceCount: 2, communityCount: 1, amplificationScore: 30, reliabilityScore: 65, supportRatio: 0.6, contradictionRatio: 0.05 }, { category: 'policy' }),

  // crypto-crash: declining then stale → dead. Last snapshot is 40d before now.
  snap('crypto-crash', 60, { signalCount: 30, sourceCount: 4, communityCount: 3, amplificationScore: 80, reliabilityScore: 50, supportRatio: 0.4, contradictionRatio: 0.3 }, { category: 'finance' }),
  snap('crypto-crash', 50, { signalCount: 18, sourceCount: 3, communityCount: 2, amplificationScore: 50, reliabilityScore: 48, supportRatio: 0.35, contradictionRatio: 0.35 }, { category: 'finance' }),
  snap('crypto-crash', 40, { signalCount: 6, sourceCount: 1, communityCount: 1, amplificationScore: 22, reliabilityScore: 45, supportRatio: 0.3, contradictionRatio: 0.4 }, { category: 'finance' }),

  // climate-core: SPLIT — breadth jumps, amplification diverges.
  snap('climate-core', 30, { signalCount: 10, sourceCount: 2, communityCount: 1, amplificationScore: 60, reliabilityScore: 70, supportRatio: 0.7, contradictionRatio: 0.1 }, { category: 'climate' }),
  snap('climate-core', 5, { signalCount: 14, sourceCount: 6, communityCount: 4, amplificationScore: 45, reliabilityScore: 70, supportRatio: 0.68, contradictionRatio: 0.12 }, { category: 'climate' }),

  // energy-merge: MERGE — communities converge (down) while signals & sources rise.
  snap('energy-merge', 10, { signalCount: 4, sourceCount: 2, communityCount: 3, amplificationScore: 30, reliabilityScore: 65, supportRatio: 0.6, contradictionRatio: 0.1 }, { category: 'energy' }),
  snap('energy-merge', 1, { signalCount: 16, sourceCount: 5, communityCount: 1, amplificationScore: 55, reliabilityScore: 66, supportRatio: 0.62, contradictionRatio: 0.1 }, { category: 'energy' }),

  // climate-tech (split child) — modest growth.
  snap('climate-tech', 8, { signalCount: 1, sourceCount: 1, communityCount: 1, amplificationScore: 20, reliabilityScore: 60, supportRatio: 0.6, contradictionRatio: 0.1 }, { category: 'climate' }),
  snap('climate-tech', 1, { signalCount: 3, sourceCount: 2, communityCount: 2, amplificationScore: 32, reliabilityScore: 61, supportRatio: 0.6, contradictionRatio: 0.1 }, { category: 'climate' }),

  // solar-boom / wind-boom: older parents (stable, then quiet — used for merge genealogy).
  snap('solar-boom', 40, { signalCount: 6, sourceCount: 2, communityCount: 1, amplificationScore: 40, reliabilityScore: 62, supportRatio: 0.6, contradictionRatio: 0.1 }, { category: 'energy' }),
  snap('solar-boom', 20, { signalCount: 7, sourceCount: 2, communityCount: 1, amplificationScore: 41, reliabilityScore: 62, supportRatio: 0.6, contradictionRatio: 0.1 }, { category: 'energy' }),
  snap('wind-boom', 38, { signalCount: 5, sourceCount: 2, communityCount: 1, amplificationScore: 38, reliabilityScore: 60, supportRatio: 0.6, contradictionRatio: 0.1 }, { category: 'energy' }),
  snap('wind-boom', 18, { signalCount: 6, sourceCount: 2, communityCount: 1, amplificationScore: 39, reliabilityScore: 60, supportRatio: 0.6, contradictionRatio: 0.1 }, { category: 'energy' }),
];

// ---- End-to-end demo --------------------------------------------------------

export interface TemporalDemoResult {
  now: string;
  snapshots: NarrativeSnapshot[];
  evolution: EvolutionRecord[];
  genealogy: GenealogyEdge[];
  influence: InfluenceEdge[];
  forecasts: NarrativeForecast[];
}

/**
 * Run the full temporal chain over the fixtures (snapshots → evolution →
 * genealogy → influence → forecast). Fully OFFLINE & DETERMINISTIC — the UI/app
 * can call this to showcase the engine without any network or keys.
 */
export async function temporalDemo(
  deps: TemporalDeps = { now: FIXTURE_NOW },
): Promise<TemporalDemoResult> {
  const now = deps.now;

  // Group snapshots by narrative for per-narrative evolution + forecast.
  const byNarrative = new Map<string, NarrativeSnapshot[]>();
  for (const s of DEMO_SNAPSHOTS) {
    const list = byNarrative.get(s.narrativeId) ?? [];
    list.push(s);
    byNarrative.set(s.narrativeId, list);
  }

  const evolution: EvolutionRecord[] = [];
  const forecasts: NarrativeForecast[] = [];
  for (const n of DEMO_NARRATIVES) {
    const snaps = byNarrative.get(n.id) ?? [];
    if (snaps.length < 2) {
      // Single-snapshot narratives still get a (thin-data) forecast.
      forecasts.push(
        forecastNarrativeTrajectory({ narrativeId: n.id, snapshots: snaps, evolution: [], now }),
      );
      continue;
    }
    const series = evolutionSeries(snaps, now);
    evolution.push(...series);
    forecasts.push(
      forecastNarrativeTrajectory({ narrativeId: n.id, snapshots: snaps, evolution: series, now }),
    );
  }

  const genealogy = await buildNarrativeGenealogy(DEMO_NARRATIVES, DEMO_SIGNALS, deps);
  const influence = buildInfluenceNetwork(
    DEMO_NARRATIVES,
    DEMO_SNAPSHOTS,
    DEMO_SIGNALS,
    deps,
  );

  return { now, snapshots: DEMO_SNAPSHOTS, evolution, genealogy, influence, forecasts };
}
