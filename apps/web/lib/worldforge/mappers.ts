// =============================================================================
// WorldForge — JSON <-> engine mappers.
// SERVER + CLIENT safe (pure, no Supabase). The engine WorldState / WorldEvaluation
// objects are already plain JSON; these helpers deep-clone them into the
// `Record<string, unknown>` jsonb shape the DB stores, and re-hydrate them back
// into typed engine objects with a runtime guard (falling back to a safe Earth
// state if a stored payload is malformed).
// =============================================================================

import {
  createEarthState,
  type WorldState,
  type WorldEvaluation,
  type ImpactChain,
} from '@hsi/simulation-engine';
import type { CounterfactualResult } from '@hsi/counterfactuals';
import type { TimelineEvent } from '@hsi/timeline-engine';

/** Deep-clone any JSON-serializable value into a fresh plain object. */
function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // structuredClone can throw on non-cloneable values; fall through to JSON.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A WorldState is JSON already; clone it into the jsonb record shape. */
export function worldStateToJson(state: WorldState): Record<string, unknown> {
  return deepClone(state) as unknown as Record<string, unknown>;
}

/** A WorldEvaluation is JSON already; clone it into the jsonb record shape. */
export function evaluationToJson(
  evaluation: WorldEvaluation,
): Record<string, unknown> {
  return deepClone(evaluation) as unknown as Record<string, unknown>;
}

/** An ImpactChain (or any cascade payload) cloned into the jsonb record shape. */
export function impactChainToJson(chain: ImpactChain): Record<string, unknown> {
  return deepClone(chain) as unknown as Record<string, unknown>;
}

/** A CounterfactualResult cloned into a compact jsonb record (drops newState). */
export function counterfactualToJson(
  result: CounterfactualResult,
): Record<string, unknown> {
  return {
    explanation: result.explanation,
    confidence: result.confidence,
    affectedNodes: deepClone(result.affectedNodes),
    impactChain: deepClone(result.impactChain),
  };
}

/** TimelineEvent[] cloned into the jsonb array shape. */
export function timelineEventsToJson(
  events: TimelineEvent[],
): Record<string, unknown>[] {
  return deepClone(events) as unknown as Record<string, unknown>[];
}

/**
 * Runtime guard: is this JSON shaped like a WorldState? We check the small set of
 * required top-level keys the engine relies on. We deliberately keep this loose
 * (presence + type) rather than validating every nested field.
 */
function looksLikeWorldState(json: unknown): json is WorldState {
  if (!json || typeof json !== 'object') return false;
  const o = json as Record<string, unknown>;
  return (
    typeof o.universeType === 'string' &&
    typeof o.star === 'object' &&
    o.star !== null &&
    Array.isArray(o.planets) &&
    typeof o.chemistry === 'object' &&
    o.chemistry !== null &&
    typeof o.biology === 'object' &&
    o.biology !== null &&
    typeof o.intelligence === 'object' &&
    o.intelligence !== null &&
    typeof o.civilization === 'object' &&
    o.civilization !== null &&
    typeof o.risks === 'object' &&
    o.risks !== null
  );
}

/**
 * Re-hydrate a stored jsonb payload into a typed WorldState. If the stored shape
 * is invalid/empty (e.g. a fresh `'{}'::jsonb` default), fall back to a fresh
 * Earth state so callers never crash on a malformed row.
 */
export function jsonToWorldState(
  json: Record<string, unknown> | null | undefined,
): WorldState {
  if (looksLikeWorldState(json)) {
    return deepClone(json) as WorldState;
  }
  return createEarthState();
}
