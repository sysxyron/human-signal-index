// =============================================================================
// HSI Phase 40B — source-capture orchestrator (SERVER-ONLY).
//
// THE pipeline that was missing: it turns a created `hsin_sources` row into
// actual signals + telemetry. For each DUE, monitored, active source it:
//   1. routes by source type via @hsi/source-collectors,
//   2. runs the public-only capture (fetch injected),
//   3. stores a snapshot,
//   4. records a diff vs the previous snapshot,
//   5. creates signals (feed: per new entry; watchlist: only on change),
//   6. always writes a source_capture_events row (so nothing is silent),
//   7. updates source health + last_checked/last_changed.
//
// DESIGN: the orchestrator depends on an injected `CapturePersistence` port, not
// on Supabase directly — so the branching logic (baseline vs diff vs signal,
// feed dedupe, health) is unit-testable with an in-memory fake, and the real
// adapter (createSupabaseCapturePersistence) is a thin wiring layer over the
// Phase-40 DAL. PURE-ish: time + fetch are injected; no Date.now()/network here.
//
// Deep submodule imports of @hsi/source-collectors (not the barrel) keep this off
// the client bundle path; per-item hashing uses node:crypto (server-only). This
// module NEVER imports @hsi/source-connectors (web bundle policy).
// =============================================================================

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { captureForType } from '@hsi/source-collectors/src/capture';
import {
  connectorForSourceType,
  signalTypeForSource,
} from '@hsi/source-collectors/src/routing';
import { deriveHealth } from '@hsi/source-collectors/src/health';
import { diffSnapshots } from '@hsi/source-collectors/src/watchlist';
import {
  isSourceType,
  type CollectorSourceType,
  type CollectorCapture,
} from '@hsi/source-collectors/src/types';
import type { HsinCaptureEventStatus } from '@hsi/shared-types';

import {
  createCaptureEvent,
  createSourceDiff,
  createSourceSnapshot,
  createSignalFromCapture,
  existingSignalHashes,
  latestSnapshotForDiff,
  updateSourceHealth,
  touchSourceChecked,
  type CreateCaptureEventInput,
  type CreateDiffInput,
  type CreateSignalInput,
  type CreateSnapshotInput,
} from './source-capture-persistence';

/** Injected fetch (structurally compatible with @hsi/source-connectors FetchText). */
export type FetchText = (url: string) => Promise<string>;

/** Default polling interval when a source declares no captureIntervalMinutes. */
export const DEFAULT_CAPTURE_INTERVAL_MIN = 60;
const DEFAULT_MAX_ITEMS = 50;

// -----------------------------------------------------------------------------
// Ports + value types.
// -----------------------------------------------------------------------------

/** Minimal source shape the orchestrator needs (mirrors hsin_sources). */
export interface DueSource {
  id: string;
  name: string;
  source_type: string;
  status: string;
  monitoring_enabled?: boolean;
  config?: Record<string, unknown> | null;
  rss_url?: string | null;
  homepage_url?: string | null;
  last_checked_at?: string | null;
}

export interface CaptureHealthPatch {
  status?: string;
  lastSuccess?: string;
  lastFailure?: string;
  failureCount?: number;
}

/** Persistence port — the real adapter wires this to Supabase; tests fake it. */
export interface CapturePersistence {
  loadDueSources(now: string): Promise<DueSource[]>;
  latestSnapshot(sourceId: string): Promise<{ contentHash: string; length: number } | null>;
  createSnapshot(input: CreateSnapshotInput): Promise<{ id: string } | null>;
  createDiff(input: CreateDiffInput): Promise<{ id: string } | null>;
  existingSignalHashes(sourceId: string, hashes: string[]): Promise<Set<string>>;
  createSignal(input: CreateSignalInput): Promise<{ id: string } | null>;
  createCaptureEvent(input: CreateCaptureEventInput): Promise<{ id: string } | null>;
  updateHealth(sourceId: string, health: CaptureHealthPatch): Promise<void>;
  touchChecked(sourceId: string, changed: boolean, now: string): Promise<void>;
}

/** The outcome of capturing a single source. */
export interface SourceCaptureOutcome {
  sourceId: string;
  name: string;
  status: HsinCaptureEventStatus;
  ok: boolean;
  signalsCreated: number;
  snapshotsCreated: number;
  diffsCreated: number;
  reason: string;
}

/** The aggregate summary returned to the cron caller. */
export interface CaptureBatchSummary {
  sourcesChecked: number;
  sourcesSkipped: number;
  capturesSucceeded: number;
  capturesFailed: number;
  signalsCreated: number;
  snapshotsCreated: number;
  diffsCreated: number;
  results: SourceCaptureOutcome[];
}

export interface RunCaptureOptions {
  fetchText: FetchText;
  now: string;
  maxItems?: number;
  /** When false, ignore the per-source interval and capture every active source. */
  dueOnly?: boolean;
}

// -----------------------------------------------------------------------------
// Pure helpers.
// -----------------------------------------------------------------------------

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function excerpt(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  const t = text.trim();
  if (!t) return undefined;
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** Resolve the URL the collector should fetch for a source. */
export function resolveCaptureUrl(source: DueSource): string {
  const cfg = (source.config ?? {}) as Record<string, unknown>;
  const fromCfg = typeof cfg.captureUrl === 'string' ? cfg.captureUrl : '';
  return (fromCfg || source.rss_url || source.homepage_url || '').trim();
}

/** Is this source due for capture given its interval + last_checked_at? PURE. */
export function isSourceDue(source: DueSource, now: string): boolean {
  const cfg = (source.config ?? {}) as Record<string, unknown>;
  const declared = Number(cfg.captureIntervalMinutes);
  const intervalMin = Number.isFinite(declared) && declared > 0 ? declared : DEFAULT_CAPTURE_INTERVAL_MIN;
  if (!source.last_checked_at) return true;
  const age = Date.parse(now) - Date.parse(source.last_checked_at);
  if (Number.isNaN(age)) return true;
  return age >= intervalMin * 60_000;
}

function explainOutcome(args: {
  isBaseline: boolean;
  isFeed: boolean;
  contentChanged: boolean;
  signalsCreated: number;
}): string {
  if (args.signalsCreated > 0) {
    return `${args.signalsCreated} signal${args.signalsCreated === 1 ? '' : 's'} created.`;
  }
  if (args.isBaseline) {
    return args.isFeed
      ? 'Baseline capture — feed returned no entries.'
      : 'Baseline snapshot stored — first capture, no diff yet.';
  }
  if (!args.contentChanged) return 'No content change since the last capture.';
  return 'Content changed; captured (no new signal).';
}

function emptyOutcome(source: DueSource): SourceCaptureOutcome {
  return {
    sourceId: source.id,
    name: source.name,
    status: 'healthy',
    ok: false,
    signalsCreated: 0,
    snapshotsCreated: 0,
    diffsCreated: 0,
    reason: '',
  };
}

// -----------------------------------------------------------------------------
// Capture one source.
// -----------------------------------------------------------------------------

/**
 * Capture a single source end-to-end and persist snapshot/diff/event/signals +
 * health. ALWAYS writes a capture event (success or failure) — never silent.
 */
export async function captureOneSource(
  persistence: CapturePersistence,
  source: DueSource,
  opts: { fetchText: FetchText; now: string; maxItems?: number },
): Promise<SourceCaptureOutcome> {
  const now = opts.now;
  const out = emptyOutcome(source);
  const sourceType = String(source.source_type);

  // 1. Unknown source type → unsupported event (visible, not silent).
  if (!isSourceType(sourceType)) {
    const reason = `Unknown source type "${sourceType}" — no automated capture.`;
    await persistence.createCaptureEvent({ sourceId: source.id, sourceType, status: 'unsupported', reason, capturedAt: now });
    return { ...out, status: 'unsupported', reason };
  }
  const st = sourceType as CollectorSourceType;
  const connector = connectorForSourceType(st);

  // 2. Foundation-only type (document/manual/email/api/webhook) → unsupported.
  if (!connector) {
    const h = deriveHealth({ sourceType: st });
    await persistence.createCaptureEvent({ sourceId: source.id, sourceType, connector: null, status: h.state, reason: h.reason, capturedAt: now });
    return { ...out, status: h.state, reason: h.reason };
  }

  // 3. Missing capture URL → needs_configuration.
  const captureUrl = resolveCaptureUrl(source);
  if (!captureUrl) {
    const h = deriveHealth({ sourceType: st, configured: false });
    await persistence.createCaptureEvent({ sourceId: source.id, sourceType, connector, status: h.state, reason: h.reason, capturedAt: now });
    await persistence.updateHealth(source.id, { status: h.state });
    return { ...out, status: h.state, reason: h.reason };
  }

  // 4. Capture (public-only policy enforced inside the collector).
  let capture: CollectorCapture;
  try {
    capture = await captureForType(st, captureUrl, {
      capturedAt: now,
      fetchText: opts.fetchText,
      maxItems: opts.maxItems ?? DEFAULT_MAX_ITEMS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const blocked = /blocked|403|forbidden|robots|public pages only|refus|policy/i.test(message);
    const h = deriveHealth({ sourceType: st, configured: true, fetchOk: false, blocked });
    await persistence.createCaptureEvent({ sourceId: source.id, sourceType, connector, status: h.state, reason: h.reason, error: message, capturedAt: now });
    await persistence.updateHealth(source.id, { status: h.state, lastFailure: now, failureCount: 1 });
    await persistence.touchChecked(source.id, false, now);
    return { ...out, status: h.state, reason: h.reason };
  }

  // 5. Snapshot (capture the PRIOR snapshot first, then store the new one).
  const prev = await persistence.latestSnapshot(source.id);
  const isBaseline = prev == null;
  const snap = await persistence.createSnapshot({
    sourceId: source.id,
    url: capture.url,
    contentText: capture.content,
    contentHash: capture.hashDigest,
    capturedAt: now,
  });
  const snapshotsCreated = snap ? 1 : 0;

  // 6. Diff vs the previous snapshot (none on the baseline → per watchlist spec).
  const diff = diffSnapshots(prev, {
    url: capture.url,
    text: capture.content,
    contentHash: capture.hashDigest,
    capturedAt: now,
  });
  const isFeed = connector === 'rss';

  // 7. Signals.
  let signalsCreated = 0;
  let producedSignalId: string | null = null;
  if (isFeed) {
    // Feed: one signal per NEW entry, deduped by content hash within the source.
    const items = capture.items.filter((i) => i.title || i.content);
    const withHash = items.map((i) => ({ item: i, hash: sha256Hex(`${i.title}\n${i.content}`) }));
    const seen = await persistence.existingSignalHashes(source.id, withHash.map((w) => w.hash));
    for (const { item, hash } of withHash) {
      if (seen.has(hash)) continue;
      seen.add(hash); // guard against duplicate entries within one feed
      const res = await persistence.createSignal({
        sourceId: source.id,
        title: (item.title || `${st} update`).slice(0, 280),
        summary: excerpt(item.content || item.title, 600),
        rawContent: item.content || undefined,
        contentHash: hash,
        signalType: signalTypeForSource(st),
        capturedAt: now,
      });
      if (res) signalsCreated += 1;
    }
  } else if (!isBaseline && diff.changed) {
    // Watchlist/page: a signal ONLY when the page actually changed (not baseline).
    const first = capture.items[0];
    const res = await persistence.createSignal({
      sourceId: source.id,
      title: (first?.title || `${source.name} — page changed`).slice(0, 280),
      summary: excerpt(capture.content, 600),
      rawContent: capture.content || undefined,
      contentHash: capture.hashDigest,
      signalType: signalTypeForSource(st),
      capturedAt: now,
    });
    if (res) {
      signalsCreated = 1;
      producedSignalId = res.id;
    }
  }

  // 8. Diff row (after signal so we can link it). Baseline has no diff.
  let diffsCreated = 0;
  if (!isBaseline) {
    const d = await persistence.createDiff({
      sourceId: source.id,
      snapshotId: snap?.id ?? null,
      changed: diff.changed,
      previousHash: diff.previousHash,
      newHash: diff.newHash,
      addedChars: diff.addedChars,
      removedChars: diff.removedChars,
      signalId: producedSignalId,
    });
    diffsCreated = d ? 1 : 0;
  }

  // 9. Capture event + health + touch.
  const contentChanged = isBaseline ? false : diff.changed;
  const reason = explainOutcome({ isBaseline, isFeed, contentChanged, signalsCreated });
  const health = deriveHealth({
    sourceType: st,
    configured: true,
    fetchOk: true,
    contentChanged: isBaseline ? undefined : diff.changed,
  });
  await persistence.createCaptureEvent({
    sourceId: source.id,
    sourceType,
    connector,
    status: health.state,
    reason,
    itemsCaptured: capture.items.length,
    contentChanged,
    capturedAt: now,
  });
  await persistence.updateHealth(source.id, { status: health.state, lastSuccess: now, failureCount: 0 });
  await persistence.touchChecked(source.id, contentChanged, now);

  return {
    sourceId: source.id,
    name: source.name,
    status: health.state,
    ok: true,
    signalsCreated,
    snapshotsCreated,
    diffsCreated,
    reason,
  };
}

// -----------------------------------------------------------------------------
// Batch runner.
// -----------------------------------------------------------------------------

/** Capture all DUE sources and return an aggregate summary. NEVER throws. */
export async function runSourceCaptureBatch(
  persistence: CapturePersistence,
  opts: RunCaptureOptions,
): Promise<CaptureBatchSummary> {
  const dueOnly = opts.dueOnly !== false;
  const all = await persistence.loadDueSources(opts.now);
  const due = dueOnly ? all.filter((s) => isSourceDue(s, opts.now)) : all;

  const results: SourceCaptureOutcome[] = [];
  for (const source of due) {
    try {
      results.push(await captureOneSource(persistence, source, { fetchText: opts.fetchText, now: opts.now, maxItems: opts.maxItems }));
    } catch (err) {
      // captureOneSource is defensive, but never let one source abort the batch.
      results.push({
        sourceId: source.id,
        name: source.name,
        status: 'failing',
        ok: false,
        signalsCreated: 0,
        snapshotsCreated: 0,
        diffsCreated: 0,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    sourcesChecked: results.length,
    sourcesSkipped: all.length - due.length,
    capturesSucceeded: results.filter((r) => r.ok).length,
    capturesFailed: results.filter((r) => !r.ok).length,
    signalsCreated: results.reduce((n, r) => n + r.signalsCreated, 0),
    snapshotsCreated: results.reduce((n, r) => n + r.snapshotsCreated, 0),
    diffsCreated: results.reduce((n, r) => n + r.diffsCreated, 0),
    results,
  };
}

// -----------------------------------------------------------------------------
// Supabase adapter (the real persistence wiring) + default server fetch.
// -----------------------------------------------------------------------------

/** Build the production CapturePersistence over a Supabase client (service-role in cron). */
export function createSupabaseCapturePersistence(client: SupabaseClient): CapturePersistence {
  return {
    async loadDueSources() {
      const { data, error } = await client
        .from('hsin_sources')
        .select('id, name, source_type, status, monitoring_enabled, config, rss_url, homepage_url, last_checked_at')
        .eq('monitoring_enabled', true)
        .eq('status', 'active');
      if (error || !data) return [];
      return data as DueSource[];
    },
    latestSnapshot: (sourceId) => latestSnapshotForDiff(client, sourceId),
    createSnapshot: (input) => createSourceSnapshot(client, input),
    createDiff: (input) => createSourceDiff(client, input),
    existingSignalHashes: (sourceId, hashes) => existingSignalHashes(client, sourceId, hashes),
    createSignal: (input) => createSignalFromCapture(client, input),
    createCaptureEvent: (input) => createCaptureEvent(client, input),
    updateHealth: (sourceId, health) => updateSourceHealth(client, sourceId, health),
    touchChecked: (sourceId, changed, now) => touchSourceChecked(client, sourceId, changed, now),
  };
}

/**
 * Default server-side fetch for capture: public-only, bounded by a timeout and a
 * max byte cap, with a clear HSI user-agent. Used by the cron route. Throws on
 * non-2xx / oversize so the orchestrator records a failing capture event.
 */
export function createServerFetchText(options?: {
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
}): FetchText {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const maxBytes = options?.maxBytes ?? 5_000_000;
  const userAgent = options?.userAgent ?? 'HSI-PublicCapture/1.0 (+public-only)';
  return async (url: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': userAgent, accept: 'application/rss+xml, application/atom+xml, text/html, */*' },
        redirect: 'follow',
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`fetch failed ${res.status} for ${url}`);
      const text = await res.text();
      if (text.length > maxBytes) {
        throw new Error(`response too large (${text.length} bytes) for ${url}`);
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  };
}
