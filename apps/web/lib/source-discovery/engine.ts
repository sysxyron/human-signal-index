// =============================================================================
// HSI Phase 70.3 — Source import / discovery / signal-scout engine (SERVER-ONLY).
//
// importBatch: parse+validate+classify+dedupe CSV → stage candidates (review queue).
// approve/reject: human decisions; approval writes a PAUSED source (no activation).
// runSourceDiscovery: suggests candidates from domains already referenced in REAL
//   evidence (never fabricates URLs).
// runSignalScout: suggests signal candidates from REAL recent signals + watchlist/
//   narrative matches (never publishes).
// All emit Phase 62 notifications to admins. NEVER auto-activates / auto-publishes.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { insertNotificationDal, getPreferencesDal } from '@/lib/notifications/persistence';
import { shouldDeliver, type NotificationSeverity } from '@/lib/notifications/types';
import { parseCsv, toObjects, validateRow } from './csv';
import { classifySource } from './classify';
import { detectDuplicate, domainOf } from './duplicates';
import { matchSignals } from './matching';
import { blocksApproval, requiresConfirmation } from './types';
import * as dal from './persistence';

async function adminIds(writer: SupabaseClient): Promise<string[]> {
  const ids = new Set<string>();
  try {
    const { data } = await writer.from('user_roles').select('user_id, roles(name)').limit(5000);
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const rel = row.roles;
      const names: string[] = Array.isArray(rel) ? rel.map((r) => String((r as { name?: unknown }).name ?? '').toLowerCase()) : rel && typeof rel === 'object' ? [String((rel as { name?: unknown }).name ?? '').toLowerCase()] : [];
      if (names.includes('admin') && typeof row.user_id === 'string') ids.add(row.user_id);
    }
  } catch { /* ignore */ }
  return Array.from(ids);
}
async function emitToAdmins(writer: SupabaseClient, actorId: string | null, severity: NotificationSeverity, title: string, body: string, metadata: Record<string, unknown>): Promise<void> {
  const recipients = (await adminIds(writer)).length ? await adminIds(writer) : (actorId ? [actorId] : []);
  for (const r of recipients) {
    try {
      const prefs = await getPreferencesDal(writer, r);
      if (!shouldDeliver(prefs, 'SYSTEM_ALERT', severity)) continue;
      await insertNotificationDal(writer, { userId: r, type: 'SYSTEM_ALERT', severity, title, body, link: '/dashboard/source-discovery', entityType: 'source_candidate', metadata }, actorId ?? r);
    } catch { /* best-effort */ }
  }
}

export interface ImportSummary { batchId: string | null; total: number; valid: number; invalid: number; duplicates: number; candidates: number }

/** Import a CSV: parse → validate → classify → dedupe → stage candidates. */
export async function importBatch(db: SupabaseClient, actorId: string, input: { filename: string; csvText: string }): Promise<dal.DbResult<ImportSummary>> {
  try {
    const objects = toObjects(parseCsv(input.csvText));
    if (objects.length === 0) return { ok: false, error: 'No data rows found in the CSV.', code: 'DB_ERROR' };
    const batchId = await dal.insertBatch(db, input.filename, objects.length, actorId);
    if (!batchId) return { ok: false, error: 'Could not create import batch.', code: 'DB_ERROR' };

    const existing = await dal.listExistingSources(db);
    const importRows: { rowNumber: number; raw: Record<string, string>; valid: boolean; errors: string[] }[] = [];
    let valid = 0, invalid = 0, duplicates = 0, candidates = 0;

    for (let i = 0; i < objects.length; i++) {
      const raw = objects[i];
      const v = validateRow(raw);
      importRows.push({ rowNumber: i + 1, raw, valid: v.valid, errors: v.errors });
      if (!v.valid || !v.normalized) { invalid += 1; continue; }
      valid += 1;
      const classification = classifySource(v.normalized);
      const duplicate = detectDuplicate(v.normalized, existing);
      if (duplicate.duplicateStatus !== 'none') duplicates += 1;
      const id = await dal.insertCandidate(db, { candidate: v.normalized, classification, duplicate, origin: 'csv_import', batchId, actorId });
      if (id) candidates += 1;
    }

    await dal.insertImportRows(db, batchId, importRows);
    await dal.finishBatch(db, batchId, { valid, invalid, duplicate: duplicates });
    await emitToAdmins(db, actorId, 'NOTICE', 'Source import completed', `${valid} valid, ${invalid} invalid, ${duplicates} duplicate(s) from ${objects.length} rows.`, { event: 'SOURCE_IMPORT_COMPLETED', batchId, valid, invalid, duplicates });
    if (duplicates > 0) await emitToAdmins(db, actorId, 'NOTICE', 'Source duplicates detected', `${duplicates} candidate(s) flagged as potential duplicates.`, { event: 'SOURCE_DUPLICATE_DETECTED', batchId, duplicates });
    if (candidates > duplicates) await emitToAdmins(db, actorId, 'NOTICE', 'Source candidates ready for review', `${candidates - duplicates} candidate(s) awaiting review.`, { event: 'SOURCE_CANDIDATE_READY', batchId });

    return { ok: true, data: { batchId, total: objects.length, valid, invalid, duplicates, candidates } };
  } catch (e) { return dal.fail(e); }
}

/** Approve a candidate → create a PAUSED source. Exact duplicates are blocked;
 *  domain/feed/related duplicates need explicit reviewer confirmation. */
export async function approveCandidate(writer: SupabaseClient, actorId: string, id: string, opts: { confirmDuplicate?: boolean } = {}): Promise<dal.DbResult<{ sourceId: string }>> {
  const full = await dal.getCandidateFullDal(writer, id);
  if (!full) return { ok: false, error: 'Candidate not found.', code: 'DB_ERROR' };
  const dup = String(full.duplicate_status ?? 'none') as Parameters<typeof blocksApproval>[0];
  if (blocksApproval(dup)) return { ok: false, error: 'Exact duplicate — approval blocked. Archive instead.', code: 'FORBIDDEN' };
  if (requiresConfirmation(dup) && !opts.confirmDuplicate) return { ok: false, error: `Potential ${dup.replace('_', ' ')} — reviewer confirmation required to proceed.`, code: 'FORBIDDEN' };

  const created = await dal.createSourceFromCandidate(writer, full, actorId);
  if (!created.ok) return created;
  await dal.setCandidateStatus(writer, id, 'approved', created.data.sourceId);
  await dal.insertCandidateReview(writer, id, 'approved', opts.confirmDuplicate ? 'Approved with duplicate confirmation.' : 'Approved.', actorId);
  return { ok: true, data: { sourceId: created.data.sourceId } };
}

export async function rejectCandidate(db: SupabaseClient, actorId: string, id: string, reason: string): Promise<dal.DbResult<{ id: string }>> {
  await dal.setCandidateStatus(db, id, 'rejected');
  await dal.insertCandidateReview(db, id, 'rejected', reason || 'Rejected.', actorId);
  return { ok: true, data: { id } };
}

export async function requestChangesCandidate(db: SupabaseClient, actorId: string, id: string, reason: string): Promise<dal.DbResult<{ id: string }>> {
  await dal.setCandidateStatus(db, id, 'needs_changes');
  await dal.insertCandidateReview(db, id, 'needs_changes', reason || 'Needs changes.', actorId);
  return { ok: true, data: { id } };
}

export interface DiscoverySummary { findings: number; candidates: number }

/** Suggest source candidates from domains already referenced in real evidence. */
export async function runSourceDiscovery(writer: SupabaseClient, actorId: string | null, trigger: string): Promise<DiscoverySummary> {
  const runId = await dal.insertDiscoveryRun(writer, 'SOURCE_DISCOVERY_AGENT', trigger, actorId);
  if (!runId) return { findings: 0, candidates: 0 };
  const existing = await dal.listExistingSources(writer);
  const existingDomains = new Set(existing.map((e) => domainOf(e.homepageUrl) || domainOf(e.rssUrl)).filter(Boolean));
  const seen = new Map<string, { url: string; count: number }>();
  try {
    const { data } = await writer.from('hsin_evidence_claims').select('source_ref').not('source_ref', 'is', null).limit(5000);
    for (const r of (data ?? []) as Array<{ source_ref: string | null }>) {
      const url = (r.source_ref ?? '').trim();
      if (!/^https?:\/\//i.test(url)) continue;
      const d = domainOf(url);
      if (!d || existingDomains.has(d)) continue;
      const e = seen.get(d) ?? { url, count: 0 };
      e.count += 1;
      seen.set(d, e);
    }
  } catch { /* ignore */ }

  const ranked = Array.from(seen.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, 25);
  let candidates = 0;
  for (const [d, { url, count }] of ranked) {
    await dal.insertFinding(writer, runId, 'referenced_domain', `${d} referenced ${count}× in evidence`, { domain: d, count, url });
    const candidate = { sourceName: d, sourceType: null, category: null, primaryUrl: url, feedOrApiUrl: null, platform: null, captureIntervalMinutes: null, baselineRisk: null, contentSelector: null, priority: null, ingestionMode: null, tags: [], description: `Auto-discovered: referenced ${count}× in existing evidence.`, corroborationRule: null, notes: null };
    const classification = classifySource(candidate);
    const duplicate = detectDuplicate(candidate, existing);
    const id = await dal.insertCandidate(writer, { candidate, classification, duplicate, origin: 'discovery_agent', discoveryRunId: runId, actorId });
    if (id) candidates += 1;
  }
  await dal.finishDiscoveryRun(writer, runId, ranked.length, candidates);
  await emitToAdmins(writer, actorId, 'NOTICE', 'Source discovery completed', `${candidates} candidate source(s) suggested from referenced domains.`, { event: 'SOURCE_DISCOVERY_COMPLETED', runId, candidates });
  return { findings: ranked.length, candidates };
}

export interface ScoutSummary { candidates: number }

/** Suggest signal candidates from real recent signals + narrative/watchlist matches. */
export async function runSignalScout(writer: SupabaseClient, actorId: string | null): Promise<ScoutSummary> {
  const narratives = await dal.listNarrativesLite(writer);
  const watchlists = await dal.listWatchlistsLite(writer);
  let candidates = 0;
  try {
    const { data } = await writer.from('hsin_signals').select('id, title, summary, source_id, signal_category, created_at').order('created_at', { ascending: false }).limit(200);
    for (const s of (data ?? []) as Array<{ id: string; title: string | null; summary: string | null; source_id: string | null; signal_category: string | null }>) {
      const text = `${s.title ?? ''} ${s.summary ?? ''}`;
      const m = matchSignals(text, narratives, watchlists);
      const narr = m.narratives[0];
      const watch = m.watchlists[0];
      if (!narr && !watch) continue; // only surface signals with a real match
      const confidence = Math.min(1, ((narr?.score ?? 0) + (watch?.score ?? 0)) / 6 + 0.4);
      const id = await dal.insertSignalCandidate(writer, {
        title: s.title ?? 'Untitled signal', summary: s.summary ?? undefined, sourceId: s.source_id ?? undefined,
        category: s.signal_category ?? undefined, narrativeId: narr?.id ?? null, watchlistId: watch?.id ?? null,
        confidence: Math.round(confidence * 100) / 100,
        reason: [narr ? `narrative: ${narr.reason}` : null, watch ? `watchlist: ${watch.reason}` : null].filter(Boolean).join('; '),
      });
      if (id) candidates += 1;
      if (candidates >= 50) break;
    }
  } catch { /* ignore */ }
  await emitToAdmins(writer, actorId, 'NOTICE', 'Signal scout completed', `${candidates} signal candidate(s) suggested for review.`, { event: 'SIGNAL_CANDIDATE_READY', candidates });
  return { candidates };
}
