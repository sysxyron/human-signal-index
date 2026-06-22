// =============================================================================
// HSI Phase 74.2 — Read backend model + resolver. Decides which backend a read
// scope SHOULD use, and which it can EFFECTIVELY use given real availability.
// Effective backend is always `primary` today (the only live backend); any
// other selection falls back to primary, with the reason recorded. Admin and
// system scopes are always forced to primary. Never throws.
// =============================================================================

import { getHsiRuntimeConfig } from './edge-config';
import { isBackendReadable, BACKEND_AVAILABILITY, type BackendCapability } from './backend-availability';

export const READ_BACKENDS = ['primary', 'replica', 'd1', 'cache'] as const;
export type ReadBackend = (typeof READ_BACKENDS)[number];

export const READ_SCOPES = ['public', 'dashboard', 'admin', 'system'] as const;
export type ReadScope = (typeof READ_SCOPES)[number];

export interface ReadRoutingDecision {
  scope: ReadScope;
  requestedBackend: ReadBackend;
  effectiveBackend: ReadBackend;
  fallbackReason: string | null;
}

function coerce(v: unknown): ReadBackend {
  return typeof v === 'string' && (READ_BACKENDS as readonly string[]).includes(v) ? (v as ReadBackend) : 'primary';
}

export function isBackendAvailable(backend: ReadBackend, registry: Record<ReadBackend, BackendCapability> = BACKEND_AVAILABILITY): boolean {
  return isBackendReadable(backend, registry);
}

/** PURE core decision. admin/system are forced to primary; public/dashboard use
 *  the requested backend if it is readable, else fall back to primary; invalid
 *  values fall back to primary. The reason for any fallback is recorded. */
export function decideReadBackend(scope: ReadScope, requestedRaw: unknown, availability: Record<ReadBackend, BackendCapability>): ReadRoutingDecision {
  const requested = coerce(requestedRaw);
  const primaryOk = isBackendReadable('primary', availability);

  // admin + system are always primary.
  if (scope === 'admin' || scope === 'system') {
    const reason = requested !== 'primary' ? `${scope} scope is always served by primary (requested "${requested}" ignored)` : (!primaryOk ? 'primary is reported unavailable' : null);
    return { scope, requestedBackend: requested, effectiveBackend: 'primary', fallbackReason: reason };
  }

  // public / dashboard. Detect an invalid raw value BEFORE the primary check
  // (coerce() turns invalid values into 'primary').
  if (typeof requestedRaw === 'string' && !(READ_BACKENDS as readonly string[]).includes(requestedRaw)) {
    return { scope, requestedBackend: 'primary', effectiveBackend: 'primary', fallbackReason: `invalid backend "${requestedRaw}" — using primary` };
  }
  if (requested === 'primary') {
    return { scope, requestedBackend: requested, effectiveBackend: 'primary', fallbackReason: !primaryOk ? 'primary is reported unavailable' : null };
  }
  if (!isBackendReadable(requested, availability)) {
    return { scope, requestedBackend: requested, effectiveBackend: 'primary', fallbackReason: `${requested} is unavailable — falling back to primary` };
  }
  // requested backend is genuinely readable (future state).
  return { scope, requestedBackend: requested, effectiveBackend: requested, fallbackReason: null };
}

/** Build the live availability map: the static registry, with primary marked
 *  unavailable when Edge Config reports the primary DB as down. */
export function availabilityFromHealth(primaryDbHealth: string): Record<ReadBackend, BackendCapability> {
  const down = primaryDbHealth === 'down';
  return {
    ...BACKEND_AVAILABILITY,
    primary: { ...BACKEND_AVAILABILITY.primary, available: !down, reads: !down },
  };
}

/** Resolve the routing decision for a scope from Edge Config + availability. */
export async function resolveReadBackend(scope: ReadScope): Promise<ReadRoutingDecision> {
  const cfg = await getHsiRuntimeConfig();
  const availability = availabilityFromHealth(cfg.primaryDbHealth);
  const requested = scope === 'public' ? cfg.publicReadsSource : scope === 'dashboard' ? cfg.dashboardReadsSource : 'primary';
  return decideReadBackend(scope, requested, availability);
}

export async function getEffectiveReadBackend(scope: ReadScope): Promise<ReadBackend> {
  return (await resolveReadBackend(scope)).effectiveBackend;
}
