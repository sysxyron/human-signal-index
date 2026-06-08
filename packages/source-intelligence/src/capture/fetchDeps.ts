// =============================================================================
// @hsi/source-intelligence — injectable capture dependencies.
//
// Network access is GATED and INJECTED. Pure code never touches global fetch at
// import time. Tests and offline runs pass `fetchImpl: undefined` (or a fixture
// fetch) so nothing hits the network. Live capture is opt-in by passing a real
// fetch (or by leaving it undefined to use a guarded global fetch wrapper).
// =============================================================================

/** Minimal fetch surface we depend on (subset of the global Fetch API). */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface CaptureDeps {
  /**
   * Fetch implementation. When omitted, providers use a guarded wrapper around
   * the global `fetch` IF AND ONLY IF `allowNetwork` is true. Otherwise capture
   * fails gracefully ({ ok:false }) — the engine stays fully offline.
   */
  fetchImpl?: FetchLike;
  /** Must be explicitly true to permit live network capture. Default false. */
  allowNetwork?: boolean;
  /** Per-request timeout in ms (default 15000). */
  timeoutMs?: number;
  /** User-agent advertised on live requests. */
  userAgent?: string;
}

const DEFAULT_UA = 'HSI-SignalIntelligence/0.1 (+public-only; respects robots.txt)';

/**
 * Resolve a usable fetch from deps, or null when network is not permitted.
 * Wraps the call with an AbortController timeout. NEVER references global fetch
 * unless network is explicitly allowed.
 */
export function resolveFetch(deps: CaptureDeps | undefined): FetchLike | null {
  const timeoutMs = deps?.timeoutMs ?? 15000;
  const ua = deps?.userAgent ?? DEFAULT_UA;

  if (deps?.fetchImpl) {
    return wrapWithTimeout(deps.fetchImpl, timeoutMs, ua);
  }
  if (deps?.allowNetwork) {
    const g = (globalThis as unknown as { fetch?: FetchLike }).fetch;
    if (g) return wrapWithTimeout(g, timeoutMs, ua);
  }
  return null;
}

function wrapWithTimeout(impl: FetchLike, timeoutMs: number, ua: string): FetchLike {
  return async (url, init) => {
    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timer = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;
    try {
      return await impl(url, {
        headers: { 'user-agent': ua, ...(init?.headers ?? {}) },
        signal: controller?.signal,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
