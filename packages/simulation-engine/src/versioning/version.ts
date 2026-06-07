// =============================================================================
// @hsi/simulation-engine — world versioning + diff
// Immutable snapshots with incrementing version numbers, and a deep diff over a
// flattened view of the state. Powers an "Earth vs Earth (3x Gravity)" viewer.
// =============================================================================

import { cloneState, sigFigs, type WorldState } from '@hsi/world-models';

/** An immutable snapshot of a world. */
export interface WorldVersion {
  version: number;
  label: string;
  /** ISO timestamp PASSED IN by the caller. */
  timestamp: string;
  state: WorldState;
}

/** Create an immutable version snapshot (deep-cloned, frozen). */
export function createVersion(
  state: WorldState,
  label: string,
  timestamp: string,
  version: number,
): WorldVersion {
  const snapshot = cloneState(state);
  return Object.freeze({ version, label, timestamp, state: Object.freeze(snapshot) });
}

/** Flatten a nested object into { 'a.b.c': value } leaf paths. */
export function flatten(obj: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (obj === null || typeof obj !== 'object') {
    if (prefix) out[prefix] = obj;
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => Object.assign(out, flatten(item, `${prefix}[${i}]`)));
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** A single changed leaf in a world diff. */
export interface WorldChange {
  path: string;
  before: unknown;
  after: unknown;
}

/** Structured diff between two worlds. */
export interface WorldDiff {
  added: { path: string; value: unknown }[];
  removed: { path: string; value: unknown }[];
  changed: WorldChange[];
}

/** Round numeric leaves so tiny float noise doesn't register as a change. */
function norm(v: unknown): unknown {
  return typeof v === 'number' ? sigFigs(v, 6) : v;
}

/** Deep diff over flattened state leaves. Ignores meta noise by default? No — full diff. */
export function diffWorlds(a: WorldState, b: WorldState): WorldDiff {
  const fa = flatten(a);
  const fb = flatten(b);
  const added: { path: string; value: unknown }[] = [];
  const removed: { path: string; value: unknown }[] = [];
  const changed: WorldChange[] = [];

  for (const key of Object.keys(fb)) {
    if (!(key in fa)) added.push({ path: key, value: fb[key] });
  }
  for (const key of Object.keys(fa)) {
    if (!(key in fb)) {
      removed.push({ path: key, value: fa[key] });
      continue;
    }
    const before = norm(fa[key]);
    const after = norm(fb[key]);
    if (before !== after) changed.push({ path: key, before, after });
  }
  return { added, removed, changed };
}
