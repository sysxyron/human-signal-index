// =============================================================================
// @hsi/source-intelligence — hardened fetch wrapper for the PROVIDER layer.
//
// A single, defensive HTTP primitive used by every network-capable provider:
//   * enforces assertPublicCapturePolicy BEFORE any request (PUBLIC pages only)
//     → reason 'policy_violation' on login/auth/paywall URLs,
//   * AbortController timeout (default 12000ms) → reason 'timeout',
//   * a max-bytes cap (default 2_000_000) read by streaming/slicing the body so
//     a hostile/huge response can never exhaust memory,
//   * a custom User-Agent (default 'HumanSignalIndexBot/0.1'),
//   * NEVER throws — every failure becomes a typed ProviderResult.
//
// Network is INJECTED (deps.fetchImpl). With no fetchImpl the wrapper returns
// 'fetch_error' (offline) — it never reaches for a global fetch implicitly, so
// pure imports stay network-free.
// =============================================================================

import { CapturePolicyError, assertPublicCapturePolicy } from '../policy';
import type { ProviderDeps, ProviderResult } from './types';

export const DEFAULT_TIMEOUT_MS = 12000;
export const DEFAULT_MAX_BYTES = 2_000_000;
export const DEFAULT_USER_AGENT = 'HumanSignalIndexBot/0.1';

/** A successful HTTP read: decoded text + the byte count we actually read. */
export interface HttpText {
  status: number;
  text: string;
  bytes: number;
  truncated: boolean;
}

/**
 * Fetch a PUBLIC url and return its body text (capped at maxBytes). NEVER
 * throws — returns a typed ProviderResult. Enforces the public-only policy
 * first so a private/auth URL is rejected before the network is touched.
 */
export async function fetchPublicText(
  url: string,
  deps: ProviderDeps,
): Promise<ProviderResult<HttpText>> {
  // (1) Policy guard — PUBLIC pages only. Reason 'policy_violation'.
  try {
    assertPublicCapturePolicy(url);
  } catch (e) {
    const message = e instanceof CapturePolicyError ? e.message : String(e);
    return { ok: false, reason: 'policy_violation', message };
  }

  // (2) Network must be explicitly injected — otherwise we stay offline.
  const fetchImpl = deps.fetchImpl;
  if (!fetchImpl) {
    return {
      ok: false,
      reason: 'fetch_error',
      message: 'network not enabled (inject deps.fetchImpl to allow capture)',
    };
  }

  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;
  const userAgent = deps.userAgent ?? DEFAULT_USER_AGENT;

  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  let timedOut = false;
  const timer = controller
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : undefined;

  try {
    const res = await fetchImpl(url, {
      headers: { 'user-agent': userAgent },
      signal: controller?.signal,
    });
    if (!res.ok) {
      return { ok: false, reason: 'fetch_error', message: `http ${res.status}` };
    }
    const read = await readCapped(res, maxBytes);
    return {
      ok: true,
      method: 'http',
      data: { status: res.status, text: read.text, bytes: read.bytes, truncated: read.truncated },
    };
  } catch (e) {
    if (timedOut || (e instanceof Error && e.name === 'AbortError')) {
      return { ok: false, reason: 'timeout', message: `request timed out after ${timeoutMs}ms` };
    }
    return { ok: false, reason: 'fetch_error', message: e instanceof Error ? e.message : String(e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Read a Response body up to `maxBytes`. Streams when a ReadableStream body is
 * present (so we can stop early); otherwise falls back to text() + a byte-aware
 * slice. Decodes as UTF-8. Pure given its inputs aside from the I/O it performs.
 */
async function readCapped(
  res: { body?: unknown; text: () => Promise<string> },
  maxBytes: number,
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  const body = res.body as
    | {
        getReader?: () => {
          read: () => Promise<{ done: boolean; value?: Uint8Array }>;
          cancel?: () => Promise<void>;
        };
      }
    | undefined;
  const reader = body?.getReader?.();
  if (reader) {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
        if (total >= maxBytes) {
          truncated = true;
          try {
            await reader.cancel?.();
          } catch {
            // best-effort cancel
          }
          break;
        }
      }
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    const sliced = truncated ? merged.subarray(0, maxBytes) : merged;
    const text = new TextDecoder('utf-8').decode(sliced);
    return { text, bytes: sliced.byteLength, truncated };
  }

  // No streaming body (e.g. a fixture fetch) — read text then byte-cap it.
  const full = await res.text();
  const encoded = new TextEncoder().encode(full);
  if (encoded.byteLength <= maxBytes) {
    return { text: full, bytes: encoded.byteLength, truncated: false };
  }
  const text = new TextDecoder('utf-8').decode(encoded.subarray(0, maxBytes));
  return { text, bytes: maxBytes, truncated: true };
}
