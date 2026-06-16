// =============================================================================
// HSI Phase 40B — Source-collection DAL (SERVER-ONLY).
//
// Real persistence helpers for the Phase-40 advanced source-collection tables
// (added in migration 0044) that, before this phase, had NO writer:
//   * source_snapshots       — point-in-time page/feed snapshots (hash + text)
//   * source_diffs           — snapshot-to-snapshot change records
//   * source_capture_events  — per-attempt telemetry + health state + reason
//
// Every function takes a SupabaseClient so the caller controls the auth context.
// In production the cron route passes a SERVICE-ROLE client (RLS-bypassing,
// server-only) because capture runs without a user session; the migration's RLS
// (auth read / researcher insert / admin all) would otherwise reject the writes.
// NEVER pass a browser/anon client here from client code — these are server-only.
//
// These functions are intentionally thin (one table op each) and NEVER throw —
// they return a value or null so the orchestrator can record a clean failure
// instead of crashing a capture batch. All writes are audited via the
// source_capture_events row the orchestrator always emits.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HsinCaptureEventStatus,
  HsinSourceCaptureEventRecord,
  HsinSourceSnapshotRecord,
} from '@hsi/shared-types';

// NOTE: defined locally (not re-exported from ./persistence) so this DAL stays
// free of next/headers + the '@/' alias chain — keeping it unit-testable under
// `tsx --test` and avoiding a circular import with persistence.ts.

export interface SourceHealthPatch {
  status?: string;
  responseTime?: number;
  lastSuccess?: string;
  lastFailure?: string;
  failureCount?: number;
}

/** Insert a point-in-time source-health observation (hsin_source_health). Best-effort. */
export async function updateSourceHealth(
  client: SupabaseClient,
  sourceId: string,
  health: SourceHealthPatch,
): Promise<void> {
  try {
    await client.from('hsin_source_health').insert({
      source_id: sourceId,
      status: health.status ?? null,
      response_time: health.responseTime ?? null,
      last_success: health.lastSuccess ?? null,
      last_failure: health.lastFailure ?? null,
      failure_count: health.failureCount ?? 0,
    });
  } catch {
    // best-effort
  }
}

/** Touch a source's last_checked_at (+ last_changed_at when changed). Best-effort. */
export async function touchSourceChecked(
  client: SupabaseClient,
  sourceId: string,
  changed: boolean,
  now: string,
): Promise<void> {
  try {
    const update: Record<string, unknown> = { last_checked_at: now };
    if (changed) update.last_changed_at = now;
    await client.from('hsin_sources').update(update).eq('id', sourceId);
  } catch {
    // best-effort
  }
}

export interface CreateSnapshotInput {
  sourceId: string;
  url: string;
  contentText: string;
  contentHash: string;
  capturedAt: string;
}

/** Insert a source_snapshots row. Returns the new id (and content length), or null. */
export async function createSourceSnapshot(
  client: SupabaseClient,
  input: CreateSnapshotInput,
): Promise<{ id: string } | null> {
  try {
    const { data, error } = await client
      .from('source_snapshots')
      .insert({
        source_id: input.sourceId,
        url: input.url,
        content_text: input.contentText,
        content_hash: input.contentHash,
        captured_at: input.capturedAt,
      })
      .select('id')
      .single();
    if (error || !data) return null;
    return { id: data.id as string };
  } catch {
    return null;
  }
}

export interface CreateDiffInput {
  sourceId: string;
  snapshotId?: string | null;
  changed: boolean;
  previousHash?: string | null;
  newHash: string;
  addedChars: number;
  removedChars: number;
  signalId?: string | null;
}

/** Insert a source_diffs row. Best-effort; returns the id or null. */
export async function createSourceDiff(
  client: SupabaseClient,
  input: CreateDiffInput,
): Promise<{ id: string } | null> {
  try {
    const { data, error } = await client
      .from('source_diffs')
      .insert({
        source_id: input.sourceId,
        snapshot_id: input.snapshotId ?? null,
        changed: input.changed,
        previous_hash: input.previousHash ?? null,
        new_hash: input.newHash,
        added_chars: input.addedChars,
        removed_chars: input.removedChars,
        signal_id: input.signalId ?? null,
      })
      .select('id')
      .single();
    if (error || !data) return null;
    return { id: data.id as string };
  } catch {
    return null;
  }
}

export interface CreateCaptureEventInput {
  sourceId: string;
  sourceType: string;
  connector?: string | null;
  status: HsinCaptureEventStatus;
  reason?: string | null;
  itemsCaptured?: number;
  contentChanged?: boolean;
  error?: string | null;
  capturedAt: string;
}

/**
 * Insert a source_capture_events row — the per-attempt telemetry that explains
 * EVERY outcome (success, baseline, no-change, unsupported, misconfigured,
 * blocked, failed). This is what guarantees "no silent zero-signal state".
 * Best-effort; returns the id or null.
 */
export async function createCaptureEvent(
  client: SupabaseClient,
  input: CreateCaptureEventInput,
): Promise<{ id: string } | null> {
  try {
    const { data, error } = await client
      .from('source_capture_events')
      .insert({
        source_id: input.sourceId,
        source_type: input.sourceType,
        connector: input.connector ?? null,
        status: input.status,
        reason: input.reason ?? null,
        items_captured: input.itemsCaptured ?? 0,
        content_changed: input.contentChanged ?? false,
        error: input.error ?? null,
        captured_at: input.capturedAt,
      })
      .select('id')
      .single();
    if (error || !data) return null;
    return { id: data.id as string };
  } catch {
    return null;
  }
}

/** List the most recent capture events for a source (newest first). */
export async function listCaptureEvents(
  client: SupabaseClient,
  sourceId: string,
  limit = 20,
): Promise<HsinSourceCaptureEventRecord[]> {
  try {
    const { data } = await client
      .from('source_capture_events')
      .select('*')
      .eq('source_id', sourceId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as HsinSourceCaptureEventRecord[];
  } catch {
    return [];
  }
}

/** List the most recent snapshots for a source (newest first). */
export async function listSourceSnapshots(
  client: SupabaseClient,
  sourceId: string,
  limit = 20,
): Promise<HsinSourceSnapshotRecord[]> {
  try {
    const { data } = await client
      .from('source_snapshots')
      .select('*')
      .eq('source_id', sourceId)
      .order('captured_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as HsinSourceSnapshotRecord[];
  } catch {
    return [];
  }
}

/**
 * The most recent snapshot's hash + text length for change detection. Returns
 * null when the source has never been snapshotted (→ the next capture is the
 * baseline). Selects only what diffing needs.
 */
export async function latestSnapshotForDiff(
  client: SupabaseClient,
  sourceId: string,
): Promise<{ contentHash: string; length: number } | null> {
  try {
    const { data } = await client
      .from('source_snapshots')
      .select('content_hash, content_text')
      .eq('source_id', sourceId)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      contentHash: (data.content_hash as string) ?? '',
      length: ((data.content_text as string | null) ?? '').length,
    };
  } catch {
    return null;
  }
}

/**
 * Of the given content hashes, which already exist as signals for this source.
 * Used to dedupe feed entries so only NEW entries become signals.
 */
export async function existingSignalHashes(
  client: SupabaseClient,
  sourceId: string,
  hashes: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (hashes.length === 0) return out;
  try {
    const { data } = await client
      .from('hsin_signals')
      .select('content_hash')
      .eq('source_id', sourceId)
      .in('content_hash', hashes);
    for (const r of (data ?? []) as Array<{ content_hash?: string }>) {
      if (r.content_hash) out.add(r.content_hash);
    }
  } catch {
    // best-effort — on error we treat nothing as seen (may re-create; deduped by
    // hash next time). The capture event still records the outcome.
  }
  return out;
}

export interface CreateSignalInput {
  sourceId: string;
  title: string;
  summary?: string;
  rawContent?: string;
  contentHash: string;
  signalType: string;
  capturedAt: string;
}

/**
 * Insert a captured signal at status 'new' (NEVER auto-published) plus its
 * immutable version 1 and a 'captured' provenance event. Returns the signal id
 * or null. Mirrors persistSignalFromDraft's honesty/provenance conventions.
 */
export async function createSignalFromCapture(
  client: SupabaseClient,
  input: CreateSignalInput,
): Promise<{ id: string } | null> {
  try {
    const { data, error } = await client
      .from('hsin_signals')
      .insert({
        source_id: input.sourceId,
        title: input.title,
        summary: input.summary ?? null,
        raw_content: input.rawContent ?? null,
        content_hash: input.contentHash,
        signal_type: input.signalType,
        status: 'new',
        captured_at: input.capturedAt,
        created_by: null,
      })
      .select('id')
      .single();
    if (error || !data) return null;
    const signalId = data.id as string;

    await client
      .from('hsin_signal_versions')
      .insert({
        signal_id: signalId,
        version_number: 1,
        snapshot_json: {
          title: input.title,
          summary: input.summary ?? null,
          raw_content: input.rawContent ?? null,
          content_hash: input.contentHash,
          signal_type: input.signalType,
          captured_at: input.capturedAt,
        },
      })
      .then(() => undefined, () => undefined);

    await client
      .from('hsin_signal_events')
      .insert({
        signal_id: signalId,
        event_type: 'captured',
        event_payload: {
          content_hash: input.contentHash,
          source_id: input.sourceId,
          via: 'phase40b_source_capture',
        },
      })
      .then(() => undefined, () => undefined);

    return { id: signalId };
  } catch {
    return null;
  }
}

/** Count snapshots + diffs for a set of sources (for the registry telemetry). */
export async function countSnapshotsAndDiffs(
  client: SupabaseClient,
  sourceIds: string[],
): Promise<{ snapshots: Map<string, number>; diffs: Map<string, number> }> {
  const snapshots = new Map<string, number>();
  const diffs = new Map<string, number>();
  if (sourceIds.length === 0) return { snapshots, diffs };
  try {
    const { data: snapRows } = await client
      .from('source_snapshots')
      .select('source_id')
      .in('source_id', sourceIds);
    for (const r of (snapRows ?? []) as Array<{ source_id?: string }>) {
      if (r.source_id) snapshots.set(r.source_id, (snapshots.get(r.source_id) ?? 0) + 1);
    }
  } catch { /* best-effort */ }
  try {
    const { data: diffRows } = await client
      .from('source_diffs')
      .select('source_id')
      .in('source_id', sourceIds);
    for (const r of (diffRows ?? []) as Array<{ source_id?: string }>) {
      if (r.source_id) diffs.set(r.source_id, (diffs.get(r.source_id) ?? 0) + 1);
    }
  } catch { /* best-effort */ }
  return { snapshots, diffs };
}

/** Latest capture event per source (one query, newest-first, first-seen wins). */
export async function latestCaptureEventBySource(
  client: SupabaseClient,
  sourceIds: string[],
): Promise<Map<string, HsinSourceCaptureEventRecord>> {
  const out = new Map<string, HsinSourceCaptureEventRecord>();
  if (sourceIds.length === 0) return out;
  try {
    const { data } = await client
      .from('source_capture_events')
      .select('*')
      .in('source_id', sourceIds)
      .order('created_at', { ascending: false });
    for (const e of (data ?? []) as HsinSourceCaptureEventRecord[]) {
      if (!out.has(e.source_id)) out.set(e.source_id, e);
    }
  } catch { /* best-effort */ }
  return out;
}
