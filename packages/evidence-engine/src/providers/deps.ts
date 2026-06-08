// =============================================================================
// providers/deps.ts — shared, injectable dependencies for network providers.
//
// Every live provider takes an optional ProviderDeps so HTTP behaviour (fetch
// impl, timeout/retry, clock, jitter seed) and provider-health recording can be
// injected for testability. All fields are optional with safe defaults.
// =============================================================================

import type { ProviderHealthTracker } from '../providerHealth';
import type { FetchImpl, MillisClock } from './http';

/** Injectable dependencies shared by the network providers. */
export interface ProviderDeps {
  /** Injected fetch (defaults to global fetch). */
  fetchImpl?: FetchImpl;
  /** Millisecond clock for latency measurement (default 0-clock). */
  clock?: MillisClock;
  /** Deterministic jitter seed (replaces Math.random in backoff). */
  jitterSeed?: number;
  /** Per-request timeout (ms). */
  timeoutMs?: number;
  /** Retries after the first attempt. */
  retries?: number;
  /** Base backoff (ms). */
  backoffMs?: number;
  /** Injectable sleep (tests can skip real delays). */
  sleep?: (ms: number) => Promise<void>;
  /** Health tracker the provider records success/failure into. */
  healthTracker?: ProviderHealthTracker;
}

/** Build the per-call HttpOptions for a provider from its deps + name + now. */
export function httpOptionsFor(
  deps: ProviderDeps | undefined,
  providerName: string,
  now: string,
  headers?: Record<string, string>,
): import('./http').HttpOptions {
  return {
    fetchImpl: deps?.fetchImpl,
    clock: deps?.clock,
    jitterSeed: deps?.jitterSeed,
    timeoutMs: deps?.timeoutMs,
    retries: deps?.retries,
    backoffMs: deps?.backoffMs,
    sleep: deps?.sleep,
    healthTracker: deps?.healthTracker,
    providerName,
    now,
    headers,
  };
}
