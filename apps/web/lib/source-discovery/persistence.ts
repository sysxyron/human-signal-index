// =============================================================================
// HSI Phase 70.3 — Source discovery/import DAL (SERVER-ONLY). Reviewer+ read,
// admin/service-role write. Approval writes a PAUSED source to hsin_sources
// (monitoring disabled — no auto-activation). Never throws; degrades to empty.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CandidateInput, Classification, DuplicateResult, ExistingSource, CandidateStatus } from './types';
import { getSourceIdentityKey } from './duplicates';

export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };
export function fail(e: unknown): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed.', code: 'DB_ERROR' };
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmt(iso?: string | null): string { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; }

// ---- existing-source snapshot (for dedup/matching) -------------------------

export async function listExistingSources(c: SupabaseClient): Promise<ExistingSource[]> {
  try {
    const { data } = await c.from('hsin_sources').select('id, name, homepage_url, rss_url, source_type').limit(3000);
    return ((data ?? []) as Array<{ id: string; name: string | null; homepage_url: string | null; rss_url: string | null; source_type: string | null }>).map((r) => ({ id: r.id, name: r.name ?? 'Source', homepageUrl: r.homepage_url, rssUrl: r.rss_url, sourceType: r.source_type }));
  } catch { return []; }
}

export interface NarrativeLite { id: string; name: string }
export async function listNarrativesLite(c: SupabaseClient): Promise<NarrativeLite[]> {
  try { const { data } = await c.from('narratives').select('id, name').neq('status', 'archived').limit(1000); return ((data ?? []) as Array<{ id: string; name: string | null }>).map((r) => ({ id: r.id, name: r.name ?? 'Narrative' })); } catch { return []; }
}
export interface WatchlistLite { id: string; name: string; terms: string[] }
export async function listWatchlistsLite(c: SupabaseClient): Promise<WatchlistLite[]> {
  try { const { data } = await c.from('hsin_watchlists').select('id, name, terms').limit(1000); return ((data ?? []) as Array<{ id: string; name: string | null; terms: string[] | null }>).map((r) => ({ id: r.id, name: r.name ?? 'Watchlist', terms: r.terms ?? [] })); } catch { return []; }
}

// ---- import batches + rows --------------------------------------------------

export async function insertBatch(db: SupabaseClient, filename: string, rowCount: number, actorId: string): Promise<string | null> {
  try { const { data, error } = await db.from('source_import_batches').insert({ filename, row_count: rowCount, status: 'uploaded', uploaded_by: actorId }).select('id').single(); if (error || !data) return null; return (data as { id: string }).id; } catch { return null; }
}
export async function finishBatch(db: SupabaseClient, id: string, counts: { valid: number; invalid: number; duplicate: number }): Promise<void> {
  try { await db.from('source_import_batches').update({ valid_count: counts.valid, invalid_count: counts.invalid, duplicate_count: counts.duplicate, status: 'imported' }).eq('id', id); } catch { /* best-effort */ }
}
export async function insertImportRows(db: SupabaseClient, batchId: string, rows: { rowNumber: number; raw: Record<string, string>; valid: boolean; errors: string[] }[]): Promise<void> {
  if (rows.length === 0) return;
  try { for (let i = 0; i < rows.length; i += 500) await db.from('source_import_rows').insert(rows.slice(i, i + 500).map((r) => ({ batch_id: batchId, row_number: r.rowNumber, raw: r.raw, valid: r.valid, errors: r.errors }))).then(() => undefined, () => undefined); } catch { /* best-effort */ }
}

export interface BatchRow { id: string; filename: string | null; rowCount: number; validCount: number; invalidCount: number; duplicateCount: number; status: string; createdAt: string; createdLabel: string }
export async function listBatchesDal(db: SupabaseClient, limit = 20): Promise<BatchRow[]> {
  try {
    const { data } = await db.from('source_import_batches').select('id, filename, row_count, valid_count, invalid_count, duplicate_count, status, created_at').order('created_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, filename: (r.filename as string) ?? null, rowCount: (r.row_count as number) ?? 0, validCount: (r.valid_count as number) ?? 0, invalidCount: (r.invalid_count as number) ?? 0, duplicateCount: (r.duplicate_count as number) ?? 0, status: r.status as string, createdAt: r.created_at as string, createdLabel: fmt(r.created_at as string) }));
  } catch { return []; }
}

// ---- candidates -------------------------------------------------------------

export interface CandidateRecord {
  id: string; sourceName: string; sourceType: string | null; category: string | null; primaryUrl: string | null; feedOrApiUrl: string | null;
  classificationCategory: string | null; classificationType: string | null; classificationConfidence: number | null; classificationReason: string | null;
  duplicateStatus: string; existingSourceId: string | null; existingSourceName: string | null; duplicateReason: string | null;
  identityKey: string | null; identityStrategy: string | null; canonicalUrl: string | null;
  status: string; origin: string; tags: string[]; createdAt: string;
}

export async function insertCandidate(db: SupabaseClient, input: {
  candidate: CandidateInput; classification: Classification; duplicate: DuplicateResult; origin: string; batchId?: string | null; discoveryRunId?: string | null; actorId: string | null;
}): Promise<string | null> {
  try {
    const c = input.candidate;
    const blocked = input.duplicate.duplicateStatus === 'exact_duplicate' || input.duplicate.duplicateStatus === 'platform_identity_duplicate';
    const status: CandidateStatus = blocked ? 'duplicate' : 'pending_review';
    const identity = getSourceIdentityKey({ sourceType: input.classification.sourceType, primaryUrl: c.primaryUrl, feedOrApiUrl: c.feedOrApiUrl });
    const { data, error } = await db.from('source_candidates').insert({
      batch_id: input.batchId ?? null, discovery_run_id: input.discoveryRunId ?? null, origin: input.origin,
      source_name: c.sourceName, source_type: input.classification.sourceType, category: c.category, primary_url: c.primaryUrl, feed_or_api_url: c.feedOrApiUrl,
      canonical_url: identity.canonicalUrl, identity_key: identity.identityKey, identity_strategy: identity.identityStrategy,
      platform: c.platform, capture_interval_minutes: c.captureIntervalMinutes, baseline_risk: c.baselineRisk, content_selector: c.contentSelector,
      priority: c.priority, ingestion_mode: c.ingestionMode, tags: c.tags, description: c.description, corroboration_rule: c.corroborationRule, notes: c.notes,
      classification_category: input.classification.category, classification_type: input.classification.sourceType, classification_confidence: input.classification.confidence, classification_reason: input.classification.reason,
      duplicate_status: input.duplicate.duplicateStatus, existing_source_id: input.duplicate.existingSourceId, existing_source_name: input.duplicate.existingSourceName, duplicate_reason: input.duplicate.duplicateReason,
      status, created_by: input.actorId,
    }).select('id').single();
    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch { return null; }
}

function mapCandidate(r: Record<string, unknown>): CandidateRecord {
  return {
    id: r.id as string, sourceName: r.source_name as string, sourceType: (r.source_type as string) ?? null, category: (r.category as string) ?? null,
    primaryUrl: (r.primary_url as string) ?? null, feedOrApiUrl: (r.feed_or_api_url as string) ?? null,
    classificationCategory: (r.classification_category as string) ?? null, classificationType: (r.classification_type as string) ?? null,
    classificationConfidence: (r.classification_confidence as number) ?? null, classificationReason: (r.classification_reason as string) ?? null,
    duplicateStatus: (r.duplicate_status as string) ?? 'none', existingSourceId: (r.existing_source_id as string) ?? null, existingSourceName: (r.existing_source_name as string) ?? null, duplicateReason: (r.duplicate_reason as string) ?? null,
    identityKey: (r.identity_key as string) ?? null, identityStrategy: (r.identity_strategy as string) ?? null, canonicalUrl: (r.canonical_url as string) ?? null,
    status: r.status as string, origin: (r.origin as string) ?? 'csv_import', tags: (r.tags as string[]) ?? [], createdAt: r.created_at as string,
  };
}
const CAND_COLS = 'id, source_name, source_type, category, primary_url, feed_or_api_url, classification_category, classification_type, classification_confidence, classification_reason, duplicate_status, existing_source_id, existing_source_name, duplicate_reason, identity_key, identity_strategy, canonical_url, status, origin, tags, created_at';

export async function listCandidatesDal(db: SupabaseClient, status: CandidateStatus | null, limit = 100): Promise<CandidateRecord[]> {
  try { let q = db.from('source_candidates').select(CAND_COLS); if (status) q = q.eq('status', status); const { data } = await q.order('created_at', { ascending: false }).limit(limit); return ((data ?? []) as Array<Record<string, unknown>>).map(mapCandidate); } catch { return []; }
}
export async function getCandidateDal(db: SupabaseClient, id: string): Promise<CandidateRecord | null> {
  try { const { data } = await db.from('source_candidates').select(CAND_COLS).eq('id', id).maybeSingle(); return data ? mapCandidate(data as Record<string, unknown>) : null; } catch { return null; }
}
export async function getCandidateFullDal(db: SupabaseClient, id: string): Promise<Record<string, unknown> | null> {
  try { const { data } = await db.from('source_candidates').select('*').eq('id', id).maybeSingle(); return (data as Record<string, unknown>) ?? null; } catch { return null; }
}
export async function setCandidateStatus(db: SupabaseClient, id: string, status: CandidateStatus, sourceId?: string | null): Promise<void> {
  try { const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }; if (sourceId !== undefined) patch.source_id = sourceId; await db.from('source_candidates').update(patch).eq('id', id); } catch { /* best-effort */ }
}
export async function insertCandidateReview(db: SupabaseClient, candidateId: string, decision: string, reason: string | null, reviewerId: string): Promise<void> {
  try { await db.from('source_candidate_reviews').insert({ candidate_id: candidateId, decision, reason, reviewer_id: reviewerId }); } catch { /* best-effort */ }
}

/** Approve → write a PAUSED source (monitoring disabled; activation is manual). */
export async function createSourceFromCandidate(writer: SupabaseClient, full: Record<string, unknown>, actorId: string): Promise<DbResult<{ sourceId: string }>> {
  try {
    const { data, error } = await writer.from('hsin_sources').insert({
      name: full.source_name as string, description: (full.description as string) ?? null,
      source_type: (full.source_type as string) ?? (full.classification_type as string) ?? 'website',
      platform: (full.platform as string) ?? null, homepage_url: (full.primary_url as string) ?? null, rss_url: (full.feed_or_api_url as string) ?? null,
      status: 'paused', risk_level: Math.min(5, Math.max(1, (full.baseline_risk as number) ?? 1)), monitoring_enabled: false, created_by: actorId,
    }).select('id').single();
    if (error || !data) return fail(error ?? new Error('insert failed'));
    return { ok: true, data: { sourceId: (data as { id: string }).id } };
  } catch (e) { return fail(e); }
}

// ---- discovery runs / findings ---------------------------------------------

export async function insertDiscoveryRun(writer: SupabaseClient, agentKey: string, trigger: string, actorId: string | null): Promise<string | null> {
  try { const { data, error } = await writer.from('source_discovery_runs').insert({ agent_key: agentKey, trigger, status: 'running', actor_id: actorId }).select('id').single(); if (error || !data) return null; return (data as { id: string }).id; } catch { return null; }
}
export async function finishDiscoveryRun(writer: SupabaseClient, id: string, input: { findings: number; candidates: number; reason: string | null; considered: number; skipped: number; diagnostics: Record<string, unknown> }): Promise<void> {
  try { await writer.from('source_discovery_runs').update({ status: 'succeeded', findings_count: input.findings, candidates_created: input.candidates, reason: input.reason, sources_considered: input.considered, sources_skipped: input.skipped, diagnostics: input.diagnostics, finished_at: new Date().toISOString() }).eq('id', id); } catch { /* best-effort */ }
}
export async function insertFinding(writer: SupabaseClient, runId: string, kind: string, detail: string, evidence: Record<string, unknown>): Promise<void> {
  try { await writer.from('source_discovery_findings').insert({ run_id: runId, kind, detail, evidence }); } catch { /* best-effort */ }
}
export interface RunRow { id: string; agentKey: string; status: string; findingsCount: number; candidatesCreated: number; reason: string | null; considered: number; skipped: number; startedAt: string; startedLabel: string }
export async function listRunsDal(db: SupabaseClient, limit = 20): Promise<RunRow[]> {
  try { const { data } = await db.from('source_discovery_runs').select('id, agent_key, status, findings_count, candidates_created, reason, sources_considered, sources_skipped, started_at').order('started_at', { ascending: false }).limit(limit); return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, agentKey: r.agent_key as string, status: r.status as string, findingsCount: (r.findings_count as number) ?? 0, candidatesCreated: (r.candidates_created as number) ?? 0, reason: (r.reason as string) ?? null, considered: (r.sources_considered as number) ?? 0, skipped: (r.sources_skipped as number) ?? 0, startedAt: r.started_at as string, startedLabel: fmt(r.started_at as string) })); } catch { return []; }
}

// ---- reprocess support (Phase 70.3.1) --------------------------------------

export interface ImportRowRecord { rowNumber: number; raw: Record<string, string>; valid: boolean; errors: string[] }
export async function getImportRowsDal(db: SupabaseClient, batchId: string): Promise<ImportRowRecord[]> {
  try { const { data } = await db.from('source_import_rows').select('row_number, raw, valid, errors').eq('batch_id', batchId).order('row_number', { ascending: true }).limit(5000); return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ rowNumber: r.row_number as number, raw: (r.raw as Record<string, string>) ?? {}, valid: (r.valid as boolean) ?? false, errors: (r.errors as string[]) ?? [] })); } catch { return []; }
}
export interface InvalidRowRecord { batchId: string; rowNumber: number; sourceName: string; primaryUrl: string; feedUrl: string; errors: string[] }
export async function listInvalidRowsDal(db: SupabaseClient, limit = 50): Promise<InvalidRowRecord[]> {
  try {
    const { data } = await db.from('source_import_rows').select('batch_id, row_number, raw, errors').eq('valid', false).order('row_number', { ascending: true }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => { const raw = (r.raw as Record<string, string>) ?? {}; return { batchId: r.batch_id as string, rowNumber: r.row_number as number, sourceName: raw.source_name ?? '', primaryUrl: raw.primary_url ?? '', feedUrl: raw.feed_or_api_url ?? '', errors: (r.errors as string[]) ?? [] }; });
  } catch { return []; }
}
/** Delete only un-reviewed candidates for a batch (preserves approved/rejected). */
export async function deleteReprocessableCandidates(db: SupabaseClient, batchId: string): Promise<void> {
  try { await db.from('source_candidates').delete().eq('batch_id', batchId).in('status', ['pending_review', 'duplicate', 'needs_changes']); } catch { /* best-effort */ }
}
export async function replaceImportRows(db: SupabaseClient, batchId: string, rows: { rowNumber: number; raw: Record<string, string>; valid: boolean; errors: string[] }[]): Promise<void> {
  try { await db.from('source_import_rows').delete().eq('batch_id', batchId); } catch { /* best-effort */ }
  await insertImportRows(db, batchId, rows);
}

// ---- discovery seeds --------------------------------------------------------

export interface SeedRow { id: string; category: string; seedTerm: string; enabled: boolean }
export async function listSeedsDal(db: SupabaseClient): Promise<SeedRow[]> {
  try { const { data } = await db.from('source_discovery_seeds').select('id, category, seed_term, enabled').order('category', { ascending: true }).limit(500); return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, category: r.category as string, seedTerm: r.seed_term as string, enabled: (r.enabled as boolean) ?? true })); } catch { return []; }
}
export async function insertSeedDal(writer: SupabaseClient, category: string, seedTerm: string, actorId: string): Promise<DbResult<{ id: string }>> {
  try { const { data, error } = await writer.from('source_discovery_seeds').upsert({ category, seed_term: seedTerm, created_by: actorId }, { onConflict: 'category,seed_term' }).select('id').single(); if (error || !data) return fail(error ?? new Error('insert failed')); return { ok: true, data: { id: (data as { id: string }).id } }; } catch (e) { return fail(e); }
}
export async function toggleSeedDal(writer: SupabaseClient, id: string, enabled: boolean): Promise<void> {
  try { await writer.from('source_discovery_seeds').update({ enabled }).eq('id', id); } catch { /* best-effort */ }
}

// ---- registry statistics (Phase 71 readiness; real counts) -----------------

export interface RegistryStatistics {
  totalSources: number; activeSources: number; pausedSources: number;
  candidatesPending: number; duplicatesFound: number; invalidRows: number;
  byType: { type: string; count: number }[]; byCategory: { category: string; count: number }[]; byPlatform: { platform: string; count: number }[];
  withFeed: number; missingFeed: number; geoReady: number; missingGeo: number;
}

export async function getRegistryStatisticsDal(c: SupabaseClient): Promise<RegistryStatistics> {
  const empty: RegistryStatistics = { totalSources: 0, activeSources: 0, pausedSources: 0, candidatesPending: 0, duplicatesFound: 0, invalidRows: 0, byType: [], byCategory: [], byPlatform: [], withFeed: 0, missingFeed: 0, geoReady: 0, missingGeo: 0 };
  try {
    const { data: sources } = await c.from('hsin_sources').select('source_type, platform, status, rss_url').limit(5000);
    const srcs = (sources ?? []) as Array<{ source_type: string | null; platform: string | null; status: string | null; rss_url: string | null }>;
    empty.totalSources = srcs.length;
    empty.activeSources = srcs.filter((s) => s.status === 'active').length;
    empty.pausedSources = srcs.filter((s) => s.status === 'paused').length;
    empty.withFeed = srcs.filter((s) => !!s.rss_url).length;
    empty.missingFeed = srcs.length - empty.withFeed;
    const typeMap = new Map<string, number>(); const platMap = new Map<string, number>();
    for (const s of srcs) { const t = s.source_type ?? 'unknown'; typeMap.set(t, (typeMap.get(t) ?? 0) + 1); if (s.platform) platMap.set(s.platform, (platMap.get(s.platform) ?? 0) + 1); }
    empty.byType = Array.from(typeMap.entries()).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
    empty.byPlatform = Array.from(platMap.entries()).map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count);

    const { data: cands } = await c.from('source_candidates').select('status, classification_category, latitude, longitude').limit(5000);
    const cs = (cands ?? []) as Array<{ status: string; classification_category: string | null; latitude: number | null; longitude: number | null }>;
    empty.candidatesPending = cs.filter((x) => x.status === 'pending_review').length;
    empty.duplicatesFound = cs.filter((x) => x.status === 'duplicate').length;
    empty.geoReady = cs.filter((x) => x.latitude != null && x.longitude != null).length;
    empty.missingGeo = cs.length - empty.geoReady;
    const catMap = new Map<string, number>();
    for (const x of cs) { const k = x.classification_category ?? 'unclassified'; catMap.set(k, (catMap.get(k) ?? 0) + 1); }
    empty.byCategory = Array.from(catMap.entries()).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);

    const { data: batches } = await c.from('source_import_batches').select('invalid_count').limit(1000);
    empty.invalidRows = ((batches ?? []) as Array<{ invalid_count: number | null }>).reduce((sum, b) => sum + (b.invalid_count ?? 0), 0);
  } catch { /* degrade */ }
  return empty;
}

// ---- signal candidates ------------------------------------------------------

export async function insertSignalCandidate(writer: SupabaseClient, input: { title: string; summary?: string; sourceUrl?: string; sourceId?: string | null; sourceCandidateId?: string | null; category?: string; narrativeId?: string | null; watchlistId?: string | null; confidence: number; reason: string; evidenceUrl?: string }): Promise<string | null> {
  try {
    const { data, error } = await writer.from('signal_candidates').insert({
      title: input.title, summary: input.summary ?? null, source_url: input.sourceUrl ?? null, source_id: input.sourceId ?? null, source_candidate_id: input.sourceCandidateId ?? null,
      category: input.category ?? null, possible_narrative_match: input.narrativeId ?? null, possible_watchlist_match: input.watchlistId ?? null,
      confidence: input.confidence, reason: input.reason, evidence_url: input.evidenceUrl ?? null,
    }).select('id').single();
    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch { return null; }
}

export interface SignalCandidateRow { id: string; title: string; sourceUrl: string | null; category: string | null; confidence: number | null; reason: string | null; status: string; createdAt: string; createdLabel: string }
export async function listSignalCandidatesDal(db: SupabaseClient, status: string | null, limit = 100): Promise<SignalCandidateRow[]> {
  try { let q = db.from('signal_candidates').select('id, title, source_url, category, confidence, reason, status, created_at'); if (status) q = q.eq('status', status); const { data } = await q.order('created_at', { ascending: false }).limit(limit); return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, title: r.title as string, sourceUrl: (r.source_url as string) ?? null, category: (r.category as string) ?? null, confidence: (r.confidence as number) ?? null, reason: (r.reason as string) ?? null, status: r.status as string, createdAt: r.created_at as string, createdLabel: fmt(r.created_at as string) })); } catch { return []; }
}
export async function setSignalCandidateStatus(db: SupabaseClient, id: string, status: string, reviewerId: string): Promise<void> {
  try { await db.from('signal_candidates').update({ status, reviewed_by: reviewerId }).eq('id', id); } catch { /* best-effort */ }
}
