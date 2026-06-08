// =============================================================================
// HSI Phase 10 — client-safe view helpers for the Temporal Intelligence UI
// (evolution / genealogy / influence / forecast + operations highlights).
//
// "Git history for ideas." PURE + CLIENT-SAFE: no server-only imports (no
// next/headers, no Supabase server client, no actions). These map the Phase-10
// domain unions → color/label, format growth percentages and 0..1 probabilities,
// safely read typed values out of jsonb payloads, and build clearly-LABELED demo
// view-models from the @hsi/temporal-intelligence `temporalDemo()` fixtures so
// every Phase-10 page renders fully offline when an action returns NOT_CONFIGURED.
//
// Forecasts are PROBABILISTIC — these helpers never present a state as certain.
// =============================================================================

import type {
  EvolutionView,
  ForecastView,
  GenealogyView,
  HsinNarrativeEvolutionRecord,
  HsinNarrativeForecastRecord,
  HsinNarrativeGenealogyRecord,
  HsinNarrativeInfluenceRecord,
  HsinNarrativeRecord,
  HsinNarrativeSnapshotRecord,
  InfluenceView,
  NarrativeChangeType,
  NarrativeForecastState,
  NarrativeGenealogyRelationship,
  NarrativeHistory,
  TemporalHighlights,
} from '@hsi/shared-types';
import {
  type EvolutionRecord,
  type ForecastState,
  type GenealogyEdge,
  type InfluenceEdge,
  type NarrativeForecast,
  type NarrativeSnapshot,
  temporalDemo,
  DEMO_NARRATIVES,
} from '@hsi/temporal-intelligence';

/* -------------------------------------------------------------------------- */
/* Shared decoration type                                                      */
/* -------------------------------------------------------------------------- */

export type Tone = 'neutral' | 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'cyan' | 'pink';

export interface Decorated {
  label: string;
  color: string;
  tone: Tone;
  /** Optional one-line description (used in legends / tooltips). */
  description?: string;
}

const TONE_COLORS: Record<Tone, string> = {
  neutral: '#94A3B8',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  green: '#10B981',
  orange: '#F59E0B',
  red: '#EF4444',
  cyan: '#06B6D4',
  pink: '#EC4899',
};

export function toneColor(tone: Tone): string {
  return TONE_COLORS[tone];
}

function titleize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Role gating (pure — safe in client + server)                                */
/* -------------------------------------------------------------------------- */

const ROLE_RANK: Record<string, number> = {
  viewer: 0,
  contributor: 1,
  researcher: 2,
  reviewer: 3,
  editor: 3,
  curator: 4,
  admin: 5,
  owner: 6,
};

function rank(role?: string | null): number {
  if (!role) return -1;
  return ROLE_RANK[role.toLowerCase()] ?? -1;
}

/** Researcher or above — can rebuild temporal intelligence. */
export function canResearch(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}

/* -------------------------------------------------------------------------- */
/* Change type → color/label/description                                       */
/* -------------------------------------------------------------------------- */

const CHANGE_DECOR: Record<NarrativeChangeType, Decorated> = {
  growth: {
    label: 'Growth',
    color: TONE_COLORS.green,
    tone: 'green',
    description: 'Signal volume and reach expanded between snapshots.',
  },
  decline: {
    label: 'Decline',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'Signal volume and reach contracted between snapshots.',
  },
  mutation: {
    label: 'Mutation',
    color: TONE_COLORS.purple,
    tone: 'purple',
    description: 'The narrative shifted shape (composition/amplification) without a clear up/down.',
  },
  split: {
    label: 'Split',
    color: TONE_COLORS.cyan,
    tone: 'cyan',
    description: 'Breadth fragmented — the narrative spread across more communities.',
  },
  merge: {
    label: 'Merge',
    color: TONE_COLORS.blue,
    tone: 'blue',
    description: 'Breadth converged — separate strands consolidated into one.',
  },
};

export function changeTypeDecor(type?: NarrativeChangeType | string | null): Decorated {
  if (!type) {
    return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
  const known = CHANGE_DECOR[type as NarrativeChangeType];
  if (known) return known;
  return { label: titleize(String(type)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/* -------------------------------------------------------------------------- */
/* Genealogy relationship → color/label/description                            */
/* -------------------------------------------------------------------------- */

const RELATIONSHIP_DECOR: Record<NarrativeGenealogyRelationship, Decorated> = {
  derived_from: {
    label: 'Derived from',
    color: TONE_COLORS.blue,
    tone: 'blue',
    description: 'The child grew out of the parent narrative.',
  },
  split_from: {
    label: 'Split from',
    color: TONE_COLORS.cyan,
    tone: 'cyan',
    description: 'The child broke off from a broader parent narrative.',
  },
  merged_from: {
    label: 'Merged from',
    color: TONE_COLORS.purple,
    tone: 'purple',
    description: 'The child consolidated multiple parent narratives.',
  },
  contradicts: {
    label: 'Contradicts',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'The two narratives assert opposing claims.',
  },
  amplifies: {
    label: 'Amplifies',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'The parent reinforces / boosts the child narrative.',
  },
};

export function relationshipDecor(
  rel?: NarrativeGenealogyRelationship | string | null,
): Decorated {
  if (!rel) {
    return { label: 'Related', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
  const known = RELATIONSHIP_DECOR[rel as NarrativeGenealogyRelationship];
  if (known) return known;
  return { label: titleize(String(rel)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/** All relationships, for a legend. */
export function allRelationshipDecor(): Array<{
  relationship: NarrativeGenealogyRelationship;
  decor: Decorated;
}> {
  return (Object.keys(RELATIONSHIP_DECOR) as NarrativeGenealogyRelationship[]).map((relationship) => ({
    relationship,
    decor: RELATIONSHIP_DECOR[relationship],
  }));
}

/* -------------------------------------------------------------------------- */
/* Forecast state → color/label/description (PROBABILISTIC, never certain)     */
/* -------------------------------------------------------------------------- */

const FORECAST_DECOR: Record<NarrativeForecastState, Decorated> = {
  emerging: {
    label: 'Emerging',
    color: TONE_COLORS.cyan,
    tone: 'cyan',
    description: 'Young and accelerating — likely to grow if the trend holds.',
  },
  rising: {
    label: 'Rising',
    color: TONE_COLORS.green,
    tone: 'green',
    description: 'Sustained upward momentum across recent snapshots.',
  },
  stable: {
    label: 'Stable',
    color: TONE_COLORS.blue,
    tone: 'blue',
    description: 'Holding steady — little net change recently.',
  },
  declining: {
    label: 'Declining',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'Losing volume / reach over recent snapshots.',
  },
  dead: {
    label: 'Dead',
    color: TONE_COLORS.neutral,
    tone: 'neutral',
    description: 'Stale — no meaningful recent activity.',
  },
};

/** Display order for the forecast columns (most active → least). */
export const FORECAST_STATE_ORDER: NarrativeForecastState[] = [
  'emerging',
  'rising',
  'stable',
  'declining',
  'dead',
];

export function forecastStateDecor(
  state?: NarrativeForecastState | string | null,
): Decorated {
  if (!state) {
    return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
  const known = FORECAST_DECOR[state as NarrativeForecastState];
  if (known) return known;
  return { label: titleize(String(state)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/* -------------------------------------------------------------------------- */
/* Numeric formatters                                                          */
/* -------------------------------------------------------------------------- */

/** Format a percent-change number as a signed string, e.g. +200% / -45%. */
export function formatGrowthPct(pct?: number | null): string {
  if (pct == null || Number.isNaN(pct)) return '—';
  const rounded = Math.round(pct);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

/** Tone for a growth percentage (positive green, negative orange, ~0 neutral). */
export function growthTone(pct?: number | null): Tone {
  if (pct == null || Number.isNaN(pct)) return 'neutral';
  if (pct > 5) return 'green';
  if (pct < -5) return 'orange';
  return 'neutral';
}

/** Format a signed delta number, e.g. +12 / -3. */
export function formatDelta(delta?: number | null): string {
  if (delta == null || Number.isNaN(delta)) return '—';
  const rounded = Math.round(delta * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

/** Format a 0..1 probability/confidence as a percentage string, e.g. 72%. */
export function formatProbability(p?: number | null): string {
  if (p == null || Number.isNaN(p)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
}

/** Format an ISO timestamp as a short date (UTC, deterministic). */
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/* -------------------------------------------------------------------------- */
/* jsonb readers — typed helpers (no `any`)                                    */
/* -------------------------------------------------------------------------- */

/**
 * Read the array of reasoning strings out of an evolution/forecast jsonb payload.
 * Accepts `{ reasoning: string[] }`, a bare `string[]`, or a single string.
 */
export function readReasoning(payload?: Record<string, unknown> | null): string[] {
  if (!payload) return [];
  const direct = (payload as { reasoning?: unknown }).reasoning;
  const value = direct ?? payload;
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') return [value];
  return [];
}

/** Read a numeric field from a jsonb metrics payload. */
export function readNumber(
  payload: Record<string, unknown> | undefined | null,
  key: string,
): number | undefined {
  if (!payload) return undefined;
  const v = payload[key];
  return typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
}

/**
 * Read a forecast probability distribution out of a jsonb payload into a typed
 * record over the 5 forecast states. Missing/invalid entries default to 0.
 */
export function readDistribution(
  payload?: Record<string, unknown> | null,
): Record<NarrativeForecastState, number> {
  const out: Record<NarrativeForecastState, number> = {
    emerging: 0,
    rising: 0,
    stable: 0,
    declining: 0,
    dead: 0,
  };
  if (!payload) return out;
  for (const state of FORECAST_STATE_ORDER) {
    const v = payload[state];
    if (typeof v === 'number' && !Number.isNaN(v)) out[state] = v;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Derived selectors                                                           */
/* -------------------------------------------------------------------------- */

export interface InfluencerRank {
  narrativeId: string;
  name: string;
  /** Sum of out-influence across all outgoing edges. */
  outInfluence: number;
  /** Count of distinct targets influenced. */
  targets: number;
}

/** Rank narratives by total out-influence (sum of outgoing influence scores). */
export function rankInfluencers(view: InfluenceView): InfluencerRank[] {
  const names = new Map(view.narratives.map((n) => [n.id, n.name]));
  const agg = new Map<string, { out: number; targets: Set<string> }>();
  for (const e of view.edges) {
    const src = e.source_narrative_id;
    if (!src) continue;
    const entry = agg.get(src) ?? { out: 0, targets: new Set<string>() };
    entry.out += e.influence_score ?? 0;
    if (e.target_narrative_id) entry.targets.add(e.target_narrative_id);
    agg.set(src, entry);
  }
  return [...agg.entries()]
    .map(([narrativeId, v]) => ({
      narrativeId,
      name: names.get(narrativeId) ?? narrativeId,
      outInfluence: v.out,
      targets: v.targets.size,
    }))
    .sort((a, b) => b.outInfluence - a.outInfluence);
}

/** Edge stroke width for an influence score (0..100 → 1.5..6px). */
export function influenceStrokeWidth(score?: number): number {
  const s = Math.max(0, Math.min(100, score ?? 0));
  return 1.5 + (s / 100) * 4.5;
}

/* -------------------------------------------------------------------------- */
/* DEMO mappers — engine (camelCase) → shared-types records (snake_case)       */
/* Always labeled "Demo" by callers; pure offline fixtures.                    */
/* -------------------------------------------------------------------------- */

function snapshotToRecord(s: NarrativeSnapshot): HsinNarrativeSnapshotRecord {
  return {
    id: s.id,
    narrative_id: s.narrativeId,
    captured_at: s.capturedAt,
    signal_count: s.signalCount,
    source_count: s.sourceCount,
    community_count: s.communityCount,
    amplification_score: s.amplificationScore,
    reliability_score: s.reliabilityScore,
    support_ratio: s.supportRatio,
    contradiction_ratio: s.contradictionRatio,
    metadata: s.metadata,
    created_at: s.capturedAt,
  };
}

function evolutionToRecord(e: EvolutionRecord, i: number): HsinNarrativeEvolutionRecord {
  return {
    id: e.id ?? `demo-evo-${e.narrativeId}-${i}`,
    narrative_id: e.narrativeId,
    parent_snapshot_id: e.parentSnapshotId,
    child_snapshot_id: e.childSnapshotId,
    change_type: e.changeType,
    growth_pct: e.growthPct,
    confidence: e.confidence,
    metrics_json: {
      amplificationDelta: e.amplificationDelta,
      communityDelta: e.communityDelta,
      sourceDelta: e.sourceDelta,
      reliabilityDelta: e.reliabilityDelta,
      contradictionDelta: e.contradictionDelta,
    },
    reasoning_json: { reasoning: e.reasoning },
    created_at: e.createdAt,
  };
}

function genealogyToRecord(g: GenealogyEdge, i: number): HsinNarrativeGenealogyRecord {
  return {
    id: g.id ?? `demo-gen-${i}`,
    parent_narrative_id: g.parentNarrativeId,
    child_narrative_id: g.childNarrativeId,
    relationship: g.relationship,
    confidence: g.confidence,
    shared_entities: g.sharedEntities,
    shared_sources: g.sharedSources,
    similarity: g.similarity,
    rationale: g.rationale,
    created_at: g.createdAt,
  };
}

function influenceToRecord(e: InfluenceEdge, i: number): HsinNarrativeInfluenceRecord {
  return {
    id: e.id ?? `demo-inf-${i}`,
    source_narrative_id: e.sourceNarrativeId,
    target_narrative_id: e.targetNarrativeId,
    influence_score: e.influenceScore,
    shared_entities: e.sharedEntities,
    shared_sources: e.sharedSources,
    shared_communities: e.sharedCommunities,
    rationale: e.rationale,
    created_at: e.createdAt,
  };
}

function forecastToRecord(f: NarrativeForecast): HsinNarrativeForecastRecord {
  return {
    id: f.id ?? `demo-fc-${f.narrativeId}`,
    narrative_id: f.narrativeId,
    forecast_type: f.forecastType as ForecastState,
    probability: f.probability,
    reasoning: { reasoning: f.reasoning },
    distribution_json: f.distribution ? { ...f.distribution } : undefined,
    generated_at: f.generatedAt,
    created_at: f.generatedAt,
  };
}

const DEMO_NOW = '2026-02-01T00:00:00.000Z';

/** Demo narratives (records) derived from the engine fixtures. */
export function demoNarrativeRecords(): HsinNarrativeRecord[] {
  return DEMO_NARRATIVES.map((n) => ({
    id: n.id,
    name: n.name,
    category: n.category,
    description: undefined,
    risk_level: undefined,
    created_at: n.firstSeenAt ?? DEMO_NOW,
    updated_at: n.lastSeenAt ?? DEMO_NOW,
  }));
}

/** Run the offline temporal engine once and return all demo records. */
async function demoBundle() {
  const out = await temporalDemo({ now: DEMO_NOW });
  return {
    narratives: demoNarrativeRecords(),
    snapshots: out.snapshots.map(snapshotToRecord),
    evolution: out.evolution.map(evolutionToRecord),
    genealogy: out.genealogy.map(genealogyToRecord),
    influence: out.influence.map(influenceToRecord),
    forecasts: out.forecasts.map(forecastToRecord),
  };
}

export async function demoEvolutionView(): Promise<EvolutionView> {
  const b = await demoBundle();
  return { narratives: b.narratives, snapshots: b.snapshots, evolution: b.evolution };
}

export async function demoGenealogyView(): Promise<GenealogyView> {
  const b = await demoBundle();
  return { narratives: b.narratives, edges: b.genealogy };
}

export async function demoInfluenceView(): Promise<InfluenceView> {
  const b = await demoBundle();
  return { narratives: b.narratives, edges: b.influence };
}

export async function demoForecastView(): Promise<ForecastView> {
  const b = await demoBundle();
  return { narratives: b.narratives, forecasts: b.forecasts };
}

/** Demo highlights derived from the engine fixtures (best-of each category). */
export async function demoTemporalHighlights(): Promise<TemporalHighlights> {
  const b = await demoBundle();
  const names = new Map(b.narratives.map((n) => [n.id, n.name]));
  const name = (id?: string) => (id ? names.get(id) ?? id : '');

  let fastest: { narrativeId: string; name: string; growthPct: number } | undefined;
  let amp: { narrativeId: string; name: string; amplificationDelta: number } | undefined;
  let comm: { narrativeId: string; name: string; communityDelta: number } | undefined;
  for (const e of b.evolution) {
    const nid = e.narrative_id ?? '';
    if (e.growth_pct != null && (!fastest || e.growth_pct > fastest.growthPct)) {
      fastest = { narrativeId: nid, name: name(nid), growthPct: e.growth_pct };
    }
    const ampDelta = readNumber(e.metrics_json, 'amplificationDelta');
    if (ampDelta != null && (!amp || ampDelta > amp.amplificationDelta)) {
      amp = { narrativeId: nid, name: name(nid), amplificationDelta: ampDelta };
    }
    const commDelta = readNumber(e.metrics_json, 'communityDelta');
    if (commDelta != null && (!comm || commDelta > comm.communityDelta)) {
      comm = { narrativeId: nid, name: name(nid), communityDelta: commDelta };
    }
  }

  const influencers = rankInfluencers({ narratives: b.narratives, edges: b.influence });
  const top = influencers[0];

  const emerging = b.forecasts
    .filter((f) => f.forecast_type === 'emerging')
    .sort((a, c) => (c.probability ?? 0) - (a.probability ?? 0))[0];

  return {
    fastestGrowing: fastest,
    largestCommunityExpansion: comm,
    largestAmplificationSpike: amp,
    mostInfluential: top
      ? { narrativeId: top.narrativeId, name: top.name, influenceScore: top.outInfluence }
      : undefined,
    newestEmerging: emerging
      ? {
          narrativeId: emerging.narrative_id ?? '',
          name: name(emerging.narrative_id),
          probability: emerging.probability ?? 0,
        }
      : undefined,
  };
}

/** Demo narrative-history bundle for a single narrative (defaults to ai-jobs). */
export async function demoNarrativeHistory(narrativeId?: string): Promise<NarrativeHistory> {
  const b = await demoBundle();
  const id = narrativeId ?? 'ai-jobs';
  return {
    narrativeId: id,
    snapshots: b.snapshots.filter((s) => s.narrative_id === id),
    evolution: b.evolution.filter((e) => e.narrative_id === id),
    genealogy: b.genealogy.filter(
      (g) => g.parent_narrative_id === id || g.child_narrative_id === id,
    ),
    influence: b.influence.filter(
      (e) => e.source_narrative_id === id || e.target_narrative_id === id,
    ),
    forecast: b.forecasts.find((f) => f.narrative_id === id),
  };
}
