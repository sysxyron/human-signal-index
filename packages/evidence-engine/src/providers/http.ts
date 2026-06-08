// =============================================================================
// providers/http.ts — hardened HTTP helpers (WorldForge Phase 5).
//
// A small, dependency-free wrapper over global `fetch` that adds:
//   - request timeout via AbortController (default 8000ms)
//   - retry with exponential backoff + deterministic jitter (no Math.random)
//   - graceful failure: returns a typed { ok:false, error } instead of throwing
//   - optional provider-health recording (success/failure + latency)
//
// `fetchImpl` and `clock` are injectable for deterministic tests. The clock is
// only used to STAMP health records and to seed jitter — the helper never calls
// Date.now() itself when a clock is supplied.
// =============================================================================

import type { ProviderHealthTracker } from '../providerHealth';

/** A monotonic-ish clock returning milliseconds, for measuring latency. */
export type MillisClock = () => number;

/** The fetch signature we depend on (a subset of the DOM lib's `fetch`). */
export type FetchImpl = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** A typed result that never throws — callers branch on `ok`. */
export type HttpResult<T> =
  | { ok: true; value: T; status: number; latencyMs: number }
  | { ok: false; error: string; status?: number; latencyMs: number };

/** Tunable HTTP behaviour; every field has a safe default. */
export interface HttpOptions {
  /** Request timeout in ms (AbortController). Default 8000. */
  timeoutMs?: number;
  /** Number of retries AFTER the first attempt. Default 2. */
  retries?: number;
  /** Base backoff in ms (grows exponentially per attempt). Default 300. */
  backoffMs?: number;
  /** Request headers. */
  headers?: Record<string, string>;
  /** Deterministic jitter seed (replaces Math.random); default 1. */
  jitterSeed?: number;
  /** Injected fetch (defaults to global fetch). */
  fetchImpl?: FetchImpl;
  /** Millisecond clock for latency measurement (default a no-op 0 clock). */
  clock?: MillisClock;
  /** ISO timestamp used to stamp health records. */
  now?: string;
  /** Health tracker to record into (optional). */
  healthTracker?: ProviderHealthTracker;
  /** Provider name for health records (required if healthTracker is set). */
  providerName?: string;
  /** Async sleep, injectable for tests (default real setTimeout). */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 300;

/** A deterministic jitter in [0,1) from a seed + attempt (no Math.random). */
function deterministicJitter(seed: number, attempt: number): number {
  // A cheap LCG-style mix; stable for a given (seed, attempt).
  const x = Math.sin((seed + 1) * 7919 + (attempt + 1) * 104729) * 10000;
  return x - Math.floor(x);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveFetch(opts: HttpOptions): FetchImpl | undefined {
  if (opts.fetchImpl) return opts.fetchImpl;
  const g = (globalThis as { fetch?: FetchImpl }).fetch;
  return g ? (g.bind(globalThis) as FetchImpl) : undefined;
}

/**
 * Core fetch with timeout + retry, returning a typed result. NEVER throws.
 * The `parse` callback turns a Response into the desired value (text/json).
 */
async function fetchWith<T>(
  url: string,
  opts: HttpOptions,
  parse: (res: Response) => Promise<T>,
): Promise<HttpResult<T>> {
  const fetchImpl = resolveFetch(opts);
  const clock = opts.clock ?? (() => 0);
  const start = clock();

  const finishFailure = (error: string, status?: number): HttpResult<T> => {
    const latencyMs = clock() - start;
    if (opts.healthTracker && opts.providerName) {
      opts.healthTracker.recordFailure(opts.providerName, opts.now, error);
    }
    return { ok: false, error, status, latencyMs };
  };

  if (!fetchImpl) {
    // No fetch in this runtime AND none injected — graceful, never throws.
    return finishFailure('no-fetch-available');
  }

  const retries = opts.retries ?? DEFAULT_RETRIES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const jitterSeed = opts.jitterSeed ?? 1;
  const sleep = opts.sleep ?? defaultSleep;

  let lastError = 'unknown';
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        headers: opts.headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        lastStatus = res.status;
        lastError = `http-${res.status}`;
        // 4xx (except 429) are not worth retrying.
        if (res.status < 500 && res.status !== 429) {
          return finishFailure(lastError, res.status);
        }
      } else {
        const value = await parse(res);
        const latencyMs = clock() - start;
        if (opts.healthTracker && opts.providerName) {
          opts.healthTracker.recordSuccess(opts.providerName, latencyMs, opts.now);
        }
        return { ok: true, value, status: res.status, latencyMs };
      }
    } catch (err) {
      clearTimeout(timer);
      lastError =
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'timeout'
            : err.message
          : String(err);
    }

    // Back off before the next attempt (skip after the final attempt).
    if (attempt < retries) {
      const jitter = deterministicJitter(jitterSeed, attempt);
      const delay = Math.round(backoffMs * 2 ** attempt * (0.5 + jitter));
      await sleep(delay);
    }
  }

  return finishFailure(lastError, lastStatus);
}

/** Fetch and parse JSON; never throws. */
export function fetchJson<T = unknown>(
  url: string,
  opts: HttpOptions = {},
): Promise<HttpResult<T>> {
  return fetchWith<T>(url, opts, (res) => res.json() as Promise<T>);
}

/** Fetch and return body text; never throws. */
export function fetchText(
  url: string,
  opts: HttpOptions = {},
): Promise<HttpResult<string>> {
  return fetchWith<string>(url, opts, (res) => res.text());
}
