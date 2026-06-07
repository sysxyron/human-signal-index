// =============================================================================
// WorldForge Phase 4 — Evidence & Citation data-access layer (DAL).
//
// SERVER-ONLY — never import this from a 'use client' module. It uses
// next/headers (via lib/supabase/server.ts) AND reads process.env for the
// engine config, so it must stay on the server.
//
// OWNERSHIP MODEL (mirrors lib/worldforge/research-persistence.ts):
//   * READS go through the cookie-backed SSR server client (createClient). RLS
//     (migration 0008) decides visibility: evidence_sources are world-readable;
//     claim_evidence_links are visible to the run owner + curators + (when the
//     run is public) anyone. No service-role for normal reads.
//   * WRITES first resolve the authenticated user via auth.getUser(). With NO
//     user we return { ok:false, code:'AUTH_REQUIRED' }. With a user we stamp
//     created_by = user.id and write through the SAME authed client so the RLS
//     owner/auth-insert policies authorize them. NO service-role write path.
//
// DESIGN: every function returns a DbResult<T> and NEVER throws. The engine is
// PURE and reads no env; THIS module resolves config from process.env (server)
// and passes it in. Empty env degrades gracefully (NOT_CONFIGURED), so an
// `next build` with no Supabase/keys still passes.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type {
  EvidenceSourceRecord,
  ClaimEvidenceLinkRecord,
  EvidenceReviewRecord,
  EvidenceCoverageSummary,
  RunEvidenceBundle,
  EvidenceSupportType,
} from '@hsi/shared-types';
import type { Claim } from '@hsi/research-agents';
import {
  createEvidenceEngine,
  gatherEvidence,
  DEFAULT_NOW,
  type EvidenceEngine,
  type EvidenceEngineConfig,
  type EvidenceResult,
  type ClaimEvidence,
  type EvidenceCoverage,
} from '@hsi/evidence-engine';

// -----------------------------------------------------------------------------
// Result type — identical shape to research-persistence.ts. Re-declared here so
// this module is self-contained, and re-exported for the server actions / UI.
// -----------------------------------------------------------------------------
export type DbResultCode = 'AUTH_REQUIRED' | 'NOT_CONFIGURED' | 'DB_ERROR';

export type DbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED =
  'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';

const AUTH_REQUIRED = 'Sign in to continue.';

function fail(error: unknown): { ok: false; error: string; code: DbResultCode } {
  if (error instanceof Error) {
    if (
      /required|not configured|SUPABASE_/i.test(error.message) &&
      /key|url/i.test(error.message)
    ) {
      return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
    }
    return { ok: false, error: error.message, code: 'DB_ERROR' };
  }
  return { ok: false, error: String(error), code: 'DB_ERROR' };
}

function authRequired(): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: AUTH_REQUIRED, code: 'AUTH_REQUIRED' };
}

// -----------------------------------------------------------------------------
// Client + identity helpers.
// -----------------------------------------------------------------------------

/** Per-request, cookie-backed, RLS-enforced client for reads AND writes. */
function db(): SupabaseClient {
  return createClient();
}

/** Resolve the authenticated user via the cookie session, or null. */
async function currentUser(client: SupabaseClient): Promise<User | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  return user ?? null;
}

// -----------------------------------------------------------------------------
// Engine config resolution (SERVER ONLY — process.env is fine here). The pure
// '@hsi/evidence-engine' never reads env; the host app resolves it and passes in.
// -----------------------------------------------------------------------------

function evidenceConfig(): Partial<EvidenceEngineConfig> {
  const mode = process.env.EVIDENCE_MODE === 'live' ? 'live' : 'fixture';
  const minRelevanceRaw = process.env.EVIDENCE_MIN_RELEVANCE;
  const parsed = minRelevanceRaw ? Number(minRelevanceRaw) : NaN;
  const minRelevance = Number.isFinite(parsed) ? parsed : 0.65;
  return {
    mode,
    minRelevance,
    semanticScholarApiKey: process.env.SEMANTIC_SCHOLAR_API_KEY || undefined,
    pubmedEmail: process.env.PUBMED_EMAIL || undefined,
    crossrefMailto: process.env.CROSSREF_MAILTO || undefined,
  };
}

/** Build the configured engine. Deterministic timestamp via DEFAULT_NOW unless overridden. */
function buildEngine(now: string): EvidenceEngine {
  return createEvidenceEngine(evidenceConfig(), { now });
}

// -----------------------------------------------------------------------------
// Typed JSON helpers — keep `any` out of signatures.
// -----------------------------------------------------------------------------
type JsonRecord = Record<string, unknown>;

function toJsonRecord(value: unknown): JsonRecord | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') return value as JsonRecord;
  return { value };
}

/** Map an engine EvidenceCoverage into the serializable EvidenceCoverageSummary. */
function coverageToSummary(c: EvidenceCoverage): EvidenceCoverageSummary {
  return {
    totalClaims: c.totalClaims,
    supported: c.supported,
    contradicted: c.contradicted,
    background: c.background,
    unsupported: c.unsupported,
    coverageScore: c.coverageScore,
    bySource: c.bySource,
    mode: c.mode,
  };
}

/** Stable de-dupe key for an EvidenceResult (doi > arxiv > engine id). */
function sourceKey(r: EvidenceResult): string {
  if (r.doi) return `doi:${r.doi}`;
  if (r.arxivId) return `arxiv:${r.arxivId}`;
  return `id:${r.id}`;
}

/** Map a persisted source row to the same key space so we can join engine<->db. */
function recordKey(row: EvidenceSourceRecord): string {
  if (row.doi) return `doi:${row.doi}`;
  if (row.arxiv_id) return `arxiv:${row.arxiv_id}`;
  // Fixture / key-less rows are stored with their engine id in metadata.engineId.
  const engineId =
    row.metadata && typeof row.metadata.engineId === 'string'
      ? (row.metadata.engineId as string)
      : undefined;
  return engineId ? `id:${engineId}` : `db:${row.id}`;
}

/** EvidenceResult -> evidence_sources insert/upsert row. */
function sourceToRow(r: EvidenceResult): JsonRecord {
  const metadata: JsonRecord = {
    engineId: r.id,
    relevanceScore: r.relevanceScore,
    supportType: r.supportType,
    confidence: r.confidence,
  };
  if (r.raw !== undefined) metadata.raw = r.raw;
  return {
    source_type: r.publicationType,
    title: r.title,
    authors: r.authors ?? [],
    year: r.year ?? null,
    abstract: r.abstract ?? null,
    url: r.url ?? null,
    doi: r.doi ?? null,
    arxiv_id: r.arxivId ?? null,
    pubmed_id: r.pubmedId ?? null,
    semantic_scholar_id: r.semanticScholarId ?? null,
    source_name: r.sourceName,
    publication_type: r.publicationType,
    reliability_score: r.reliabilityScore,
    is_fixture: r.isFixture ?? false,
    metadata,
  };
}

// =============================================================================
// PERSIST EVIDENCE SOURCES — upsert into the shared citation library.
// =============================================================================

/**
 * Upsert each EvidenceResult into evidence_sources and return the persisted
 * records (with db ids). Dedupes the input by doi/arxiv/id first. Sources with a
 * DOI or arXiv id upsert on that unique key; key-less sources are inserted (the
 * engine id lives in metadata.engineId so callers can re-join them).
 */
export async function persistEvidenceSources(
  sources: EvidenceResult[],
): Promise<DbResult<EvidenceSourceRecord[]>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    // 1. Dedupe the input by stable key (first occurrence wins).
    const seen = new Set<string>();
    const unique: EvidenceResult[] = [];
    for (const r of sources) {
      const k = sourceKey(r);
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(r);
    }
    if (unique.length === 0) return { ok: true, data: [] };

    const persisted: EvidenceSourceRecord[] = [];

    // 2. Sources with a DOI upsert on doi; with an arXiv id upsert on arxiv_id;
    //    otherwise plain insert. We split so the right onConflict target applies.
    const withDoi = unique.filter((r) => r.doi);
    const withArxivOnly = unique.filter((r) => !r.doi && r.arxivId);
    const keyless = unique.filter((r) => !r.doi && !r.arxivId);

    if (withDoi.length > 0) {
      const { data, error } = await client
        .from('evidence_sources')
        .upsert(withDoi.map(sourceToRow), { onConflict: 'doi' })
        .select('*');
      if (error) return fail(error);
      persisted.push(...((data ?? []) as EvidenceSourceRecord[]));
    }
    if (withArxivOnly.length > 0) {
      const { data, error } = await client
        .from('evidence_sources')
        .upsert(withArxivOnly.map(sourceToRow), { onConflict: 'arxiv_id' })
        .select('*');
      if (error) return fail(error);
      persisted.push(...((data ?? []) as EvidenceSourceRecord[]));
    }
    if (keyless.length > 0) {
      const { data, error } = await client
        .from('evidence_sources')
        .insert(keyless.map(sourceToRow))
        .select('*');
      if (error) return fail(error);
      persisted.push(...((data ?? []) as EvidenceSourceRecord[]));
    }

    return { ok: true, data: persisted };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// LINK EVIDENCE TO CLAIM
// =============================================================================

export interface LinkEvidenceInput {
  researchRunId: string;
  agentOutputId?: string;
  claimId: string;
  evidenceSourceId: string;
  supportType: EvidenceSupportType;
  relevanceScore: number;
  confidence: number;
  rationale?: string;
}

export async function linkEvidenceToClaim(
  input: LinkEvidenceInput,
): Promise<DbResult<ClaimEvidenceLinkRecord>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    const { data, error } = await client
      .from('claim_evidence_links')
      .insert({
        research_run_id: input.researchRunId,
        agent_output_id: input.agentOutputId ?? null,
        claim_id: input.claimId,
        evidence_source_id: input.evidenceSourceId,
        support_type: input.supportType,
        relevance_score: input.relevanceScore,
        confidence: input.confidence,
        rationale: input.rationale ?? null,
        created_by: user.id,
      })
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as ClaimEvidenceLinkRecord };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// READ
// =============================================================================

/**
 * Fetch a run's claim_evidence_links + their evidence_sources, plus the run's
 * aggregate coverage (prefers research_runs.evidence_coverage; else computes a
 * minimal summary from the links so the UI always has something to render).
 */
export async function getEvidenceForRun(
  runId: string,
): Promise<DbResult<RunEvidenceBundle>> {
  try {
    const client = db();

    const { data: linkRows, error: linkError } = await client
      .from('claim_evidence_links')
      .select('*')
      .eq('research_run_id', runId)
      .order('created_at', { ascending: true });
    if (linkError) return fail(linkError);
    const links = (linkRows ?? []) as ClaimEvidenceLinkRecord[];

    // Gather the distinct source ids referenced by the links.
    const sourceIds = Array.from(
      new Set(links.map((l) => l.evidence_source_id).filter(Boolean)),
    );
    let sources: EvidenceSourceRecord[] = [];
    if (sourceIds.length > 0) {
      const { data: srcRows, error: srcError } = await client
        .from('evidence_sources')
        .select('*')
        .in('id', sourceIds);
      if (srcError) return fail(srcError);
      sources = (srcRows ?? []) as EvidenceSourceRecord[];
    }

    // Prefer the persisted coverage; else compute a minimal summary from links.
    const { data: runRow, error: runError } = await client
      .from('research_runs')
      .select('evidence_coverage, evidence_status')
      .eq('id', runId)
      .single();
    if (runError) return fail(runError);

    const coverage =
      (toJsonRecord(runRow?.evidence_coverage) as unknown as
        | EvidenceCoverageSummary
        | null) ?? computeCoverageFromLinks(links, sources);

    return { ok: true, data: { sources, links, coverage } };
  } catch (e) {
    return fail(e);
  }
}

/** All links + sources for one claim within a run. */
export async function getEvidenceForClaim(
  runId: string,
  claimId: string,
): Promise<
  DbResult<{ links: ClaimEvidenceLinkRecord[]; sources: EvidenceSourceRecord[] }>
> {
  try {
    const client = db();

    const { data: linkRows, error: linkError } = await client
      .from('claim_evidence_links')
      .select('*')
      .eq('research_run_id', runId)
      .eq('claim_id', claimId)
      .order('created_at', { ascending: true });
    if (linkError) return fail(linkError);
    const links = (linkRows ?? []) as ClaimEvidenceLinkRecord[];

    const sourceIds = Array.from(
      new Set(links.map((l) => l.evidence_source_id).filter(Boolean)),
    );
    let sources: EvidenceSourceRecord[] = [];
    if (sourceIds.length > 0) {
      const { data: srcRows, error: srcError } = await client
        .from('evidence_sources')
        .select('*')
        .in('id', sourceIds);
      if (srcError) return fail(srcError);
      sources = (srcRows ?? []) as EvidenceSourceRecord[];
    }

    return { ok: true, data: { links, sources } };
  } catch (e) {
    return fail(e);
  }
}

/** The aggregate coverage for a run (persisted, else computed from links). */
export async function getEvidenceCoverageForRun(
  runId: string,
): Promise<DbResult<EvidenceCoverageSummary>> {
  const bundle = await getEvidenceForRun(runId);
  if (!bundle.ok) return bundle;
  return { ok: true, data: bundle.data.coverage };
}

/**
 * Compute a minimal coverage summary from persisted links when a run has no
 * stored evidence_coverage jsonb. Counts each DISTINCT claim once by its best
 * support, mirroring the engine's per-claim verdict.
 */
function computeCoverageFromLinks(
  links: ClaimEvidenceLinkRecord[],
  sources: EvidenceSourceRecord[],
): EvidenceCoverageSummary {
  const byClaim = new Map<string, EvidenceSupportType>();
  // Rank: supports > contradicts > background > unclear (best wins per claim).
  const rank: Record<string, number> = {
    supports: 3,
    contradicts: 2,
    background: 1,
    unclear: 0,
  };
  for (const l of links) {
    const claim = l.claim_id ?? l.id;
    const st = (l.support_type as EvidenceSupportType) ?? 'unclear';
    const prev = byClaim.get(claim);
    if (!prev || (rank[st] ?? 0) > (rank[prev] ?? 0)) byClaim.set(claim, st);
  }
  let supported = 0;
  let contradicted = 0;
  let background = 0;
  for (const st of byClaim.values()) {
    if (st === 'supports') supported++;
    else if (st === 'contradicts') contradicted++;
    else if (st === 'background') background++;
  }
  const totalClaims = byClaim.size;
  const unsupported = Math.max(
    0,
    totalClaims - supported - contradicted - background,
  );
  const coverageScore =
    totalClaims === 0
      ? 0
      : Math.round(((supported + contradicted) / totalClaims) * 100);

  const bySource: Record<string, number> = {};
  const idToName = new Map(sources.map((s) => [s.id, s.source_name ?? 'unknown']));
  for (const l of links) {
    const name = idToName.get(l.evidence_source_id) ?? 'unknown';
    bySource[name] = (bySource[name] ?? 0) + 1;
  }

  // Mode is inferred from the source fixtures flag.
  const anyFixture = sources.some((s) => s.is_fixture);
  const anyLive = sources.some((s) => !s.is_fixture);
  const mode: EvidenceCoverageSummary['mode'] =
    anyFixture && anyLive ? 'mixed' : anyLive ? 'live' : 'fixture';

  return {
    totalClaims,
    supported,
    contradicted,
    background,
    unsupported,
    coverageScore,
    bySource,
    mode,
  };
}

// =============================================================================
// runEvidenceForRun — THE INTEGRATION.
// Load a run's agent outputs, flatten their claims, gather evidence, persist the
// sources + claim links, store the coverage on the run, and return it. Idempotent
// (deletes the run's existing links first so re-runs do not duplicate).
// =============================================================================

export async function runEvidenceForRun(
  runId: string,
): Promise<DbResult<EvidenceCoverageSummary>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    // 1. Load the run (RLS scopes to own + public) — must be visible.
    const { data: runRow, error: runError } = await client
      .from('research_runs')
      .select('id')
      .eq('id', runId)
      .single();
    if (runError) return fail(runError);
    if (!runRow) {
      return { ok: false, error: 'Run not found or not visible.', code: 'DB_ERROR' };
    }

    // 2. Load its agent outputs and flatten the claims. Skip the synthetic
    //    'consensus' row (a ConsensusReport, not an AgentOutput — no `claims`).
    const { data: outputRows, error: outputsError } = await client
      .from('research_agent_outputs')
      .select('id, domain, output')
      .eq('run_id', runId);
    if (outputsError) return fail(outputsError);

    // Map each claim id -> the agent_output row it came from, to stamp links.
    const claims: Claim[] = [];
    const claimToOutputId = new Map<string, string>();
    for (const row of outputRows ?? []) {
      const domain = row.domain as string;
      if (domain === 'consensus') continue;
      const output = (row.output ?? {}) as { claims?: Claim[] };
      const rowClaims = Array.isArray(output.claims) ? output.claims : [];
      for (const c of rowClaims) {
        claims.push(c);
        if (!claimToOutputId.has(c.id)) {
          claimToOutputId.set(c.id, row.id as string);
        }
      }
    }

    // 3. Build the engine + gather evidence (deterministic in fixture mode).
    const now = DEFAULT_NOW;
    const engine = buildEngine(now);
    const { matches, sources, coverage } = await gatherEvidence(
      claims,
      engine,
      now,
    );

    // 4. Persist the de-duped sources, building an engine-key -> db-id map.
    const persistResult = await persistEvidenceSources(sources);
    if (!persistResult.ok) return persistResult;
    const keyToDbId = new Map<string, string>();
    for (const rec of persistResult.data) {
      keyToDbId.set(recordKey(rec), rec.id);
    }

    // 5. Idempotency: clear this run's existing links before re-linking.
    const { error: delError } = await client
      .from('claim_evidence_links')
      .delete()
      .eq('research_run_id', runId);
    if (delError) return fail(delError);

    // 6. Link each matched result to its claim. HONESTY: persist the REAL
    //    supportType (incl 'contradicts'); for an unsupported claim there are no
    //    results, so we create NO link — we never invent support.
    const linkRows: JsonRecord[] = [];
    for (const match of matches as ClaimEvidence[]) {
      for (const r of match.results) {
        const dbId = keyToDbId.get(sourceKey(r));
        if (!dbId) continue; // source failed to persist; skip rather than guess.
        linkRows.push({
          research_run_id: runId,
          agent_output_id: claimToOutputId.get(match.claimId) ?? null,
          claim_id: match.claimId,
          evidence_source_id: dbId,
          support_type: r.supportType,
          relevance_score: r.relevanceScore,
          confidence: r.confidence,
          rationale: null,
          created_by: user.id,
        });
      }
    }
    if (linkRows.length > 0) {
      const { error: linkError } = await client
        .from('claim_evidence_links')
        .insert(linkRows);
      if (linkError) return fail(linkError);
    }

    // 7. Store coverage + status on the run (owner/curator RLS authorizes update).
    const summary = coverageToSummary(coverage);
    const { error: updError } = await client
      .from('research_runs')
      .update({
        evidence_coverage: summary as unknown as JsonRecord,
        evidence_status: coverage.mode, // 'fixture' | 'live' | 'mixed'
      })
      .eq('id', runId);
    if (updError) return fail(updError);

    return { ok: true, data: summary };
  } catch (e) {
    return fail(e);
  }
}
