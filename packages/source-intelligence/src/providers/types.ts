// =============================================================================
// @hsi/source-intelligence — PROVIDER namespace types (Phase 9).
//
// A dedicated, public-safe, interface-first capture provider layer. Each
// provider returns a discriminated ProviderResult<T> (never throws) and emits a
// ProviderRunLog for observability. This complements — and never replaces — the
// Phase-7 CaptureProvider surface; both obey the same binding ethics.
//
// HSI ETHICS (binding on every provider here):
//   * PUBLIC information ONLY. Never behind logins/auth/paywalls; never private
//     communities; never doxxing/harassment. assertPublicCapturePolicy gates the
//     hardened fetch wrapper before any request leaves the process.
//   * DRAFTS only — providers surface CapturedItem(s) for the review pipeline.
//   * Determinism: callers inject `now`; network is INJECTED/gated via deps and
//     is never touched at import time. Fully offline by default.
// =============================================================================

/** Machine-readable reasons a provider can decline/fail (closed union). */
export type ProviderFailureReason =
  | 'provider_not_configured'
  | 'blocked'
  | 'timeout'
  | 'fetch_error'
  | 'parse_error'
  | 'policy_violation';

/**
 * Discriminated provider outcome. On success `data` carries the payload and
 * `method` labels HOW it was produced (e.g. 'rss', 'website', 'youtube-data-v3').
 * On failure `reason` is machine-readable and `message` is human-readable.
 */
export type ProviderResult<T> =
  | { ok: true; data: T; method: string }
  | { ok: false; reason: ProviderFailureReason; message: string };

/** An observability record emitted for EVERY provider attempt. */
export interface ProviderRunLog {
  provider: string;
  sourceId?: string;
  /** ISO timestamp the attempt started (injected). */
  startedAt: string;
  /** ISO timestamp the attempt finished (injected). */
  finishedAt: string;
  ok: boolean;
  /** Failure reason when !ok. */
  reason?: ProviderFailureReason;
  /** Count of items produced (e.g. RSS items). */
  itemCount?: number;
  /** Bytes read from the network (capped by maxBytes). */
  bytes?: number;
  /** Free-form note (method label, message, etc.). */
  note?: string;
}

/**
 * Injectable dependencies shared by all providers. `fetchImpl` follows the
 * global `fetch` shape so a host can pass the real one (or a fixture). Omitting
 * it keeps the provider fully offline → 'provider_not_configured'/'fetch_error'.
 */
export interface ProviderDeps {
  /** Fetch implementation (defaults to NOTHING — providers stay offline). */
  fetchImpl?: typeof fetch;
  /** ISO timestamp injected by the caller (determinism). REQUIRED. */
  now: string;
  /** Per-request timeout in ms (default 12000). */
  timeoutMs?: number;
  /** Max response bytes to read (default 2_000_000; over-cap → parse what we have). */
  maxBytes?: number;
  /** User-Agent advertised on requests (default 'HumanSignalIndexBot/0.1'). */
  userAgent?: string;
}

/** A normalized public item captured from a source (a DRAFT for review). */
export interface CapturedItem {
  title: string;
  url?: string;
  canonicalUrl?: string;
  /** ISO (best-effort; providers pass through the source's stamp). */
  publishedAt?: string;
  summary?: string;
  /** Extracted plain-text body (tags stripped) when available. */
  bodyText?: string;
  /** Stable content hash (sha-256 hex, or labeled fnv1a fallback). */
  contentHash: string;
}
