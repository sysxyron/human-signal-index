// =============================================================================
// HSI Phase 11 — client-safe view helpers for the Causal Intelligence &
// Narrative Replay UI (causal dashboard / replay scrubber / milestones /
// operations highlights / WorldForge timeline).
//
// "Why did the narrative move, and what happened when?" PURE + CLIENT-SAFE: no
// server-only imports (no next/headers, no Supabase server client, no actions).
// These map the Phase-11 domain unions → color/label/icon, format strengths /
// 0..1 confidences, safely read typed values out of jsonb payloads, and build
// clearly-LABELED demo view-models from the @hsi/causal-intelligence
// `causalDemo()` fixtures so every Phase-11 page renders fully offline when an
// action returns NOT_CONFIGURED.
//
// NEVER FABRICATE — explanations / factors / metrics are rendered only from the
// provided data; these helpers decorate, never invent.
// =============================================================================

import type {
  CausalEventType,
  CausalExplanation,
  CausalHighlights,
  CausalView,
  HsinCausalChainRecord,
  HsinCausalEventRecord,
  HsinNarrativeMilestoneRecord,
  HsinNarrativeRecord,
  HsinReplayFrameRecord,
  MilestonesView,
  MilestoneType,
  ReplayView,
  WorldforgeTimeline,
} from '@hsi/shared-types';
import {
  causalDemo,
  type CausalChain,
  type CausalEvent,
  type CausalNarrativeResult,
  type NarrativeMilestone,
  type ReplayFrame,
} from '@hsi/causal-intelligence';
import {
  Activity,
  Database,
  Network,
  Zap,
  ShieldCheck,
  ShieldAlert,
  LineChart,
  ArrowRightLeft,
  Sparkles,
  TrendingUp,
  Flame,
  Crown,
  Skull,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* Shared decoration types                                                     */
/* -------------------------------------------------------------------------- */

export type Tone =
  | 'neutral'
  | 'blue'
  | 'purple'
  | 'green'
  | 'orange'
  | 'red'
  | 'cyan'
  | 'pink';

export interface Decorated {
  label: string;
  color: string;
  tone: Tone;
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

/** Researcher or above — can rebuild causal intelligence. */
export function canResearch(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}

/* -------------------------------------------------------------------------- */
/* Causal event type → color/label/icon/description                            */
/* -------------------------------------------------------------------------- */

interface EventDecor extends Decorated {
  icon: LucideIcon;
}

const EVENT_DECOR: Record<CausalEventType, EventDecor> = {
  signal_surge: {
    label: 'Signal surge',
    color: TONE_COLORS.blue,
    tone: 'blue',
    icon: Activity,
    description: 'A sharp rise in signal volume for the narrative.',
  },
  source_expansion: {
    label: 'Source expansion',
    color: TONE_COLORS.cyan,
    tone: 'cyan',
    icon: Database,
    description: 'New sources began carrying the narrative.',
  },
  community_growth: {
    label: 'Community growth',
    color: TONE_COLORS.green,
    tone: 'green',
    icon: Network,
    description: 'The narrative spread into additional communities.',
  },
  amplification_spike: {
    label: 'Amplification spike',
    color: TONE_COLORS.orange,
    tone: 'orange',
    icon: Zap,
    description: 'A jump in amplification / reach.',
  },
  contradiction_drop: {
    label: 'Contradiction drop',
    color: TONE_COLORS.green,
    tone: 'green',
    icon: ShieldCheck,
    description: 'Contradicting signal share fell (claims firmed up).',
  },
  contradiction_rise: {
    label: 'Contradiction rise',
    color: TONE_COLORS.red,
    tone: 'red',
    icon: ShieldAlert,
    description: 'Contradicting signal share rose (claims came under fire).',
  },
  forecast_shift: {
    label: 'Forecast shift',
    color: TONE_COLORS.purple,
    tone: 'purple',
    icon: LineChart,
    description: 'The probabilistic trajectory forecast changed state.',
  },
  influence_transfer: {
    label: 'Influence transfer',
    color: TONE_COLORS.pink,
    tone: 'pink',
    icon: ArrowRightLeft,
    description: 'Influence flowed in from / out to a related narrative.',
  },
};

export function eventDecor(type?: CausalEventType | string | null): EventDecor {
  if (!type) {
    return {
      label: 'Event',
      color: TONE_COLORS.neutral,
      tone: 'neutral',
      icon: Sparkles,
    };
  }
  const known = EVENT_DECOR[type as CausalEventType];
  if (known) return known;
  return {
    label: titleize(String(type)),
    color: TONE_COLORS.neutral,
    tone: 'neutral',
    icon: Sparkles,
  };
}

/** All event decorations, for a legend. */
export function allEventDecor(): Array<{ type: CausalEventType; decor: EventDecor }> {
  return (Object.keys(EVENT_DECOR) as CausalEventType[]).map((type) => ({
    type,
    decor: EVENT_DECOR[type],
  }));
}

/** The growth-driving event types (vs decline-driving). */
export const GROWTH_EVENT_TYPES: CausalEventType[] = [
  'signal_surge',
  'source_expansion',
  'community_growth',
  'amplification_spike',
  'contradiction_drop',
];

export const DECLINE_EVENT_TYPES: CausalEventType[] = ['contradiction_rise'];

/* -------------------------------------------------------------------------- */
/* Milestone type → color/label/icon/description                               */
/* -------------------------------------------------------------------------- */

interface MilestoneDecor extends Decorated {
  icon: LucideIcon;
}

const MILESTONE_DECOR: Record<MilestoneType, MilestoneDecor> = {
  birth: {
    label: 'Birth',
    color: TONE_COLORS.cyan,
    tone: 'cyan',
    icon: Sparkles,
    description: 'The narrative first appeared.',
  },
  growth: {
    label: 'Growth',
    color: TONE_COLORS.green,
    tone: 'green',
    icon: TrendingUp,
    description: 'Sustained expansion in volume / reach.',
  },
  viral: {
    label: 'Viral',
    color: TONE_COLORS.orange,
    tone: 'orange',
    icon: Flame,
    description: 'Explosive growth across sources and communities.',
  },
  peak: {
    label: 'Peak',
    color: TONE_COLORS.purple,
    tone: 'purple',
    icon: Crown,
    description: 'The high-water mark before levelling off.',
  },
  decline: {
    label: 'Decline',
    color: TONE_COLORS.orange,
    tone: 'orange',
    icon: TrendingUp,
    description: 'Volume / reach contracted from the peak.',
  },
  death: {
    label: 'Death',
    color: TONE_COLORS.neutral,
    tone: 'neutral',
    icon: Skull,
    description: 'No meaningful recent activity — the narrative went dormant.',
  },
  resurgence: {
    label: 'Resurgence',
    color: TONE_COLORS.pink,
    tone: 'pink',
    icon: RotateCcw,
    description: 'A renewed rise after a dip.',
  },
};

export function milestoneDecor(
  type?: MilestoneType | string | null,
): MilestoneDecor {
  if (!type) {
    return {
      label: 'Milestone',
      color: TONE_COLORS.neutral,
      tone: 'neutral',
      icon: Sparkles,
    };
  }
  const known = MILESTONE_DECOR[type as MilestoneType];
  if (known) return known;
  return {
    label: titleize(String(type)),
    color: TONE_COLORS.neutral,
    tone: 'neutral',
    icon: Sparkles,
  };
}

/* -------------------------------------------------------------------------- */
/* Numeric formatters                                                          */
/* -------------------------------------------------------------------------- */

/** Format a 0..100 strength as a rounded integer string. */
export function formatStrength(strength?: number | null): string {
  if (strength == null || Number.isNaN(strength)) return '—';
  return String(Math.round(Math.max(0, Math.min(100, strength))));
}

/** Tone for a strength value (high orange/red is "intense", low is neutral). */
export function strengthTone(strength?: number | null): Tone {
  if (strength == null || Number.isNaN(strength)) return 'neutral';
  if (strength >= 70) return 'orange';
  if (strength >= 40) return 'blue';
  return 'neutral';
}

/** Format a 0..1 confidence/probability as a percentage string, e.g. 72%. */
export function formatConfidence(p?: number | null): string {
  if (p == null || Number.isNaN(p)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
}

/** Honest confidence band label (never hidden). */
export function confidenceBand(p?: number | null): Decorated {
  if (p == null || Number.isNaN(p)) {
    return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
  if (p >= 0.75) return { label: 'High', color: TONE_COLORS.green, tone: 'green' };
  if (p >= 0.5) return { label: 'Moderate', color: TONE_COLORS.blue, tone: 'blue' };
  if (p >= 0.25)
    return { label: 'Tentative', color: TONE_COLORS.orange, tone: 'orange' };
  return { label: 'Low', color: TONE_COLORS.red, tone: 'red' };
}

/** Format a signed percentage, e.g. +700% / -45%. */
export function formatGrowthPct(pct?: number | null): string {
  if (pct == null || Number.isNaN(pct)) return '—';
  const rounded = Math.round(pct);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
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

/** Read a numeric field from a jsonb metrics payload. */
export function readNumber(
  payload: Record<string, unknown> | undefined | null,
  key: string,
): number | undefined {
  if (!payload) return undefined;
  const v = payload[key];
  return typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
}

/** Read a string field from a jsonb metrics payload. */
export function readString(
  payload: Record<string, unknown> | undefined | null,
  key: string,
): string | undefined {
  if (!payload) return undefined;
  const v = payload[key];
  return typeof v === 'string' ? v : undefined;
}

/** Read a string array field from a jsonb payload. */
export function readStringArray(
  payload: Record<string, unknown> | undefined | null,
  key: string,
): string[] {
  if (!payload) return [];
  const v = payload[key];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

/* -------------------------------------------------------------------------- */
/* Typed replay-frame projection (frame_data jsonb → strongly typed view)      */
/* -------------------------------------------------------------------------- */

export interface ReplayFrameMetrics {
  frameTimestamp: string;
  signals: number;
  sources: number;
  communities: number;
  amplification: number;
  reliability: number;
  influenceIn: number;
  influenceOut: number;
  forecast?: string;
  changeType?: string;
  events: string[];
}

/**
 * Project a persisted replay-frame record's open-ended `frame_data` jsonb into a
 * strongly typed metrics view, defaulting absent numbers to 0. Pure / no `any`.
 */
export function readFrameMetrics(
  frame: HsinReplayFrameRecord,
): ReplayFrameMetrics {
  const d = frame.frame_data ?? {};
  return {
    frameTimestamp: frame.frame_timestamp,
    signals: readNumber(d, 'signals') ?? 0,
    sources: readNumber(d, 'sources') ?? 0,
    communities: readNumber(d, 'communities') ?? 0,
    amplification: readNumber(d, 'amplification') ?? 0,
    reliability: readNumber(d, 'reliability') ?? 0,
    influenceIn: readNumber(d, 'influenceIn') ?? 0,
    influenceOut: readNumber(d, 'influenceOut') ?? 0,
    forecast: readString(d, 'forecast'),
    changeType: readString(d, 'changeType'),
    events: readStringArray(d, 'events'),
  };
}

/* -------------------------------------------------------------------------- */
/* Derived selectors                                                           */
/* -------------------------------------------------------------------------- */

/** Rank events by strength × confidence (most influential first). */
export function rankEvents(
  events: HsinCausalEventRecord[],
): HsinCausalEventRecord[] {
  return [...events].sort((a, b) => eventScore(b) - eventScore(a));
}

/** A combined event score: strength (0..100) scaled by confidence (0..1). */
export function eventScore(e: HsinCausalEventRecord): number {
  return (e.event_strength ?? 0) * (e.confidence ?? 0);
}

/** Events of growth-driving types, ranked. */
export function growthCauses(
  events: HsinCausalEventRecord[],
): HsinCausalEventRecord[] {
  return rankEvents(
    events.filter((e) => GROWTH_EVENT_TYPES.includes(e.event_type)),
  );
}

/** Events of decline-driving types, ranked. */
export function declineCauses(
  events: HsinCausalEventRecord[],
): HsinCausalEventRecord[] {
  return rankEvents(
    events.filter((e) => DECLINE_EVENT_TYPES.includes(e.event_type)),
  );
}

/** Events ordered by time (ascending) — for a major-events timeline. */
export function eventsByTime(
  events: HsinCausalEventRecord[],
): HsinCausalEventRecord[] {
  return [...events].sort(
    (a, b) =>
      Date.parse(a.occurred_at ?? a.created_at) -
      Date.parse(b.occurred_at ?? b.created_at),
  );
}

/** Rank chains by confidence × member count. */
export function rankChains(
  chains: CausalView['chains'],
): CausalView['chains'] {
  return [...chains].sort(
    (a, b) =>
      (b.confidence ?? 0) * b.events.length -
      (a.confidence ?? 0) * a.events.length,
  );
}

/* -------------------------------------------------------------------------- */
/* DEMO mappers — engine (camelCase) → shared-types records (snake_case)       */
/* Always labeled "Demo" by callers; pure offline fixtures.                    */
/* -------------------------------------------------------------------------- */

/** Fixed demo "now" matching the causal fixtures. */
const DEMO_NOW = '2026-03-01T00:00:00.000Z';

/** Friendly display names for the demo narratives. */
const DEMO_NARRATIVE_NAMES: Record<string, string> = {
  'ai-jobs': 'AI & jobs',
  'crypto-crash': 'Crypto crash',
  'meme-stock': 'Meme stock revival',
};

function demoNarrativeName(id: string): string {
  return DEMO_NARRATIVE_NAMES[id] ?? titleize(id);
}

function eventToRecord(e: CausalEvent): HsinCausalEventRecord {
  return {
    id: e.id ?? `demo-evt-${e.narrativeId}-${e.eventType}-${e.occurredAt}`,
    narrative_id: e.narrativeId,
    event_type: e.eventType,
    event_strength: e.eventStrength,
    confidence: e.confidence,
    explanation: e.explanation,
    metrics_json: { ...e.metrics },
    occurred_at: e.occurredAt,
    created_at: e.createdAt,
  };
}

function chainToRecord(
  c: CausalChain,
  i: number,
): HsinCausalChainRecord & { events: HsinCausalEventRecord[] } {
  return {
    id: c.id ?? `demo-chain-${c.narrativeId}-${i}`,
    narrative_id: c.narrativeId,
    chain_name: c.chainName,
    confidence: c.confidence,
    summary: c.summary,
    created_at: c.createdAt,
    updated_at: c.createdAt,
    events: c.events.map(eventToRecord),
  };
}

function milestoneToRecord(m: NarrativeMilestone): HsinNarrativeMilestoneRecord {
  return {
    id: m.id ?? `demo-ms-${m.narrativeId}-${m.milestoneType}-${m.occurredAt}`,
    narrative_id: m.narrativeId,
    milestone_type: m.milestoneType,
    confidence: m.confidence,
    description: m.description,
    metrics_json: { ...m.metrics },
    occurred_at: m.occurredAt,
    created_at: m.createdAt,
  };
}

function frameToRecord(f: ReplayFrame, i: number): HsinReplayFrameRecord {
  return {
    id: `demo-frame-${f.narrativeId}-${i}`,
    narrative_id: f.narrativeId,
    frame_timestamp: f.frameTimestamp,
    frame_data: {
      signals: f.signals,
      sources: f.sources,
      communities: f.communities,
      amplification: f.amplification,
      reliability: f.reliability,
      influenceIn: f.influenceIn,
      influenceOut: f.influenceOut,
      forecast: f.forecast,
      changeType: f.changeType,
      events: f.events,
      ...f.data,
    },
    created_at: f.frameTimestamp,
  };
}

function explanationToRecord(
  r: CausalNarrativeResult,
): CausalExplanation {
  const e = r.explanation;
  return {
    narrativeId: e.narrativeId,
    headline: e.headline,
    text: e.text,
    factors: e.factors.map((f) => ({
      label: f.label,
      detail: f.detail,
      metric: f.metric,
    })),
    confidence: e.confidence,
    generatedAt: e.generatedAt,
  };
}

function demoNarrativeRecord(id: string): HsinNarrativeRecord {
  return {
    id,
    name: demoNarrativeName(id),
    category: id.startsWith('ai-') ? 'economy' : 'finance',
    created_at: DEMO_NOW,
    updated_at: DEMO_NOW,
  };
}

/** Run the offline causal engine once. */
function demoBundle() {
  const out = causalDemo(DEMO_NOW);
  const narratives = out.narratives.map((n) => demoNarrativeRecord(n.narrativeId));
  return { out, narratives };
}

/** Demo CausalView from the @hsi/causal-intelligence fixtures. Labeled by callers. */
export function demoCausalView(): CausalView {
  const { out, narratives } = demoBundle();
  const events: HsinCausalEventRecord[] = [];
  const chains: (HsinCausalChainRecord & { events: HsinCausalEventRecord[] })[] =
    [];
  out.narratives.forEach((n) => {
    n.events.forEach((e) => events.push(eventToRecord(e)));
    n.chains.forEach((c, i) => chains.push(chainToRecord(c, i)));
  });
  return { narratives, events, chains };
}

/** Demo CausalExplanation for one narrative (defaults to ai-jobs). */
export function demoCausalExplanation(
  narrativeId?: string,
): CausalExplanation | null {
  const { out } = demoBundle();
  const id = narrativeId ?? 'ai-jobs';
  const found = out.narratives.find((n) => n.narrativeId === id);
  if (!found) return null;
  return explanationToRecord(found);
}

/** Demo ReplayView for one narrative (defaults to ai-jobs). */
export function demoReplayView(narrativeId?: string): ReplayView {
  const { out } = demoBundle();
  const id = narrativeId ?? 'ai-jobs';
  const found = out.narratives.find((n) => n.narrativeId === id);
  if (!found) {
    return { narrative: null, frames: [], milestones: [] };
  }
  return {
    narrative: demoNarrativeRecord(id),
    frames: found.replay.map(frameToRecord),
    milestones: found.milestones.map(milestoneToRecord),
  };
}

/** Demo MilestonesView across all demo narratives. */
export function demoMilestonesView(): MilestonesView {
  const { out, narratives } = demoBundle();
  const milestones: HsinNarrativeMilestoneRecord[] = [];
  out.narratives.forEach((n) =>
    n.milestones.forEach((m) => milestones.push(milestoneToRecord(m))),
  );
  return { narratives, milestones };
}

/** Demo causal highlights — best-of each category from the fixtures. */
export function demoCausalHighlights(): CausalHighlights {
  const view = demoCausalView();
  const names = new Map(view.narratives.map((n) => [n.id, n.name]));
  const name = (id: string) => names.get(id) ?? id;

  const ranked = rankEvents(view.events);
  const most = ranked[0];

  const byType = (t: CausalEventType) =>
    rankEvents(view.events.filter((e) => e.event_type === t))[0];

  const amp = byType('amplification_spike');
  const comm = byType('community_growth');

  // Fastest growth: largest signal-surge growthPct metric on a signal_surge event.
  let fastest: { narrativeId: string; name: string; growthPct: number } | undefined;
  for (const e of view.events.filter((x) => x.event_type === 'signal_surge')) {
    const pct = readNumber(e.metrics_json, 'deltaPct');
    if (pct != null && (!fastest || pct > fastest.growthPct)) {
      fastest = { narrativeId: e.narrative_id, name: name(e.narrative_id), growthPct: pct };
    }
  }

  const forecastEvt = byType('forecast_shift');
  const influence = byType('influence_transfer');

  return {
    mostSignificantEvent: most
      ? {
          narrativeId: most.narrative_id,
          name: name(most.narrative_id),
          eventType: most.event_type,
          eventStrength: most.event_strength ?? 0,
        }
      : undefined,
    fastestGrowth: fastest,
    largestForecastShift: forecastEvt
      ? {
          narrativeId: forecastEvt.narrative_id,
          name: name(forecastEvt.narrative_id),
          detail: forecastEvt.explanation ?? 'Forecast trajectory shifted.',
        }
      : undefined,
    largestAmplificationSpike: amp
      ? {
          narrativeId: amp.narrative_id,
          name: name(amp.narrative_id),
          eventStrength: amp.event_strength ?? 0,
        }
      : undefined,
    mostImportantCommunityExpansion: comm
      ? {
          narrativeId: comm.narrative_id,
          name: name(comm.narrative_id),
          eventStrength: comm.event_strength ?? 0,
        }
      : undefined,
    mostInfluentialSource: influence
      ? {
          name: name(influence.narrative_id),
          detail: influence.explanation ?? 'Influence transferred between narratives.',
        }
      : undefined,
  };
}

/** Demo WorldForge timeline for one narrative (defaults to ai-jobs). */
export function demoWorldforgeTimeline(narrativeId?: string): WorldforgeTimeline {
  const { out } = demoBundle();
  const id = narrativeId ?? 'ai-jobs';
  const found = out.narratives.find((n) => n.narrativeId === id);
  if (!found) {
    return { narrativeId: id, epochs: [], turningPoints: [], counterfactualSeeds: [] };
  }

  const ms = [...found.milestones].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );

  const epochs = ms.map((m, i) => ({
    label: milestoneDecor(m.milestoneType).label,
    startAt: m.occurredAt,
    endAt: ms[i + 1]?.occurredAt,
    summary: m.description,
  }));

  const turningPoints = ms.map((m) => ({
    at: m.occurredAt,
    milestoneType: m.milestoneType,
    description: m.description,
  }));

  // Counterfactual seeds grounded in the actual detected events.
  const amp = found.events.find((e) => e.eventType === 'amplification_spike');
  const surge = found.events.find((e) => e.eventType === 'signal_surge');
  const expansion = found.events.find((e) => e.eventType === 'source_expansion');
  const counterfactualSeeds: WorldforgeTimeline['counterfactualSeeds'] = [];
  if (amp) {
    counterfactualSeeds.push({
      prompt: 'What if the amplification spike never occurred?',
      basis: amp.explanation,
    });
  }
  if (surge) {
    counterfactualSeeds.push({
      prompt: 'What if the early signal surge had been half as large?',
      basis: surge.explanation,
    });
  }
  if (expansion) {
    counterfactualSeeds.push({
      prompt: 'What if the narrative had stayed confined to its original sources?',
      basis: expansion.explanation,
    });
  }

  return { narrativeId: id, epochs, turningPoints, counterfactualSeeds };
}

/** The demo narratives, for narrative pickers. */
export function demoNarratives(): HsinNarrativeRecord[] {
  return demoBundle().narratives;
}

/**
 * Demo narrative-causal bundle for one narrative (events + chains + milestones +
 * explanation), matching the NarrativeCausalBundle the signal-detail / WorldForge
 * bridge consumes. Defaults to ai-jobs. Labeled by callers.
 */
export interface DemoNarrativeCausalBundle {
  events: HsinCausalEventRecord[];
  chains: (HsinCausalChainRecord & { events: HsinCausalEventRecord[] })[];
  milestones: HsinNarrativeMilestoneRecord[];
  explanation?: CausalExplanation;
}

export function demoNarrativeCausalBundle(
  narrativeId?: string,
): DemoNarrativeCausalBundle {
  const { out } = demoBundle();
  const id = narrativeId ?? 'ai-jobs';
  const found = out.narratives.find((n) => n.narrativeId === id);
  if (!found) {
    return { events: [], chains: [], milestones: [] };
  }
  return {
    events: found.events.map(eventToRecord),
    chains: found.chains.map((c, i) => chainToRecord(c, i)),
    milestones: found.milestones.map(milestoneToRecord),
    explanation: explanationToRecord(found),
  };
}
