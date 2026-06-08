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
  ProviderHealthRecord,
  EvidenceReviewQueueItem,
  EvidenceIntelligence,
  ClaimEvidenceGraph,
  ClaimEvidenceGraphNode,
  ClaimEvidenceGraphEdge,
  ClaimReliabilitySummary,
} from '@hsi/shared-types';
import type { Claim } from '@hsi/research-agents';
import {
  evidenceWeightedConsensus,
  computeClaimReliabilities,
  type ComputeClaimReliabilityInput,
} from '@hsi/research-agents';
import {
  createEvidenceEngine,
  gatherEvidence,
  DEFAULT_NOW,
  ProviderHealthTracker,
  type EvidenceEngine,
  type EvidenceEngineConfig,
  type EvidenceResult,
  type ClaimEvidence,
  type EvidenceCoverage,
  type ProviderHealth,
} from '@hsi/evidence-engine';
import { createSupabaseCacheStore } from './evidence-cache-store';

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
  const ttlRaw = process.env.EVIDENCE_CACHE_TTL;
  const ttlParsed = ttlRaw ? Number(ttlRaw) : NaN;
  const cacheTtlSeconds = Number.isFinite(ttlParsed) ? ttlParsed : 86400;
  return {
    mode,
    minRelevance,
    semanticScholarApiKey: process.env.SEMANTIC_SCHOLAR_API_KEY || undefined,
    pubmedEmail: process.env.PUBMED_EMAIL || undefined,
    crossrefMailto: process.env.CROSSREF_MAILTO || undefined,
    openaiApiKey: process.env.OPENAI_API_KEY || undefined,
    cacheTtlSeconds,
  };
}

/**
 * Build the configured engine, wired with a Supabase-backed retrieval cache and
 * a fresh provider-health tracker so the caller can persist the health snapshot
 * after the run. Deterministic timestamp via DEFAULT_NOW unless overridden.
 */
function buildEngine(
  client: SupabaseClient,
  now: string,
): { engine: EvidenceEngine; healthTracker: ProviderHealthTracker } {
  const healthTracker = new ProviderHealthTracker();
  const engine = createEvidenceEngine(evidenceConfig(), {
    now,
    cacheStore: createSupabaseCacheStore(client, now),
    healthTracker,
  });
  return { engine, healthTracker };
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
    // Also retain the claim's tier + confidence for the reliability model.
    const claims: Claim[] = [];
    const claimToOutputId = new Map<string, string>();
    const claimById = new Map<string, Claim>();
    for (const row of outputRows ?? []) {
      const domain = row.domain as string;
      if (domain === 'consensus') continue;
      const output = (row.output ?? {}) as { claims?: Claim[] };
      const rowClaims = Array.isArray(output.claims) ? output.claims : [];
      for (const c of rowClaims) {
        claims.push(c);
        if (!claimById.has(c.id)) claimById.set(c.id, c);
        if (!claimToOutputId.has(c.id)) {
          claimToOutputId.set(c.id, row.id as string);
        }
      }
    }

    // 3. Build the engine (cache-backed + health-tracked) + gather evidence
    //    (deterministic in fixture mode; live mode degrades gracefully).
    const now = DEFAULT_NOW;
    const { engine, healthTracker } = buildEngine(client, now);
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

    // 7. Evidence-WEIGHTED consensus (Phase 5). Read the run's research
    //    confidence (prefer the consensus report's overallConfidence; fall back
    //    to research_runs.overall_confidence), then weight it by the evidence
    //    statistics and compute a per-claim reliability (tier-capped).
    const researchConfidence = await loadResearchConfidence(client, runId);
    const weighted = evidenceWeightedConsensus(researchConfidence, {
      totalClaims: coverage.totalClaims,
      supported: coverage.supported,
      contradicted: coverage.contradicted,
      background: coverage.background,
      unsupported: coverage.unsupported,
      coverageScore: coverage.coverageScore,
    });

    // Per-claim reliability: map each gathered ClaimEvidence.coverage + the
    // claim's own tier/confidence into the reliability model.
    const reliabilityInputs: ComputeClaimReliabilityInput[] = [];
    for (const match of matches as ClaimEvidence[]) {
      const claim = claimById.get(match.claimId);
      if (!claim) continue;
      const evidenceConfidence =
        match.results.length > 0 ? match.results[0].confidence : 0;
      const supportingSources = match.results.filter(
        (r) => r.supportType === 'supports',
      ).length;
      reliabilityInputs.push({
        claimId: match.claimId,
        tier: claim.tier,
        claimConfidence: claim.confidence,
        coverage: match.coverage,
        evidenceConfidence,
        supportingSources,
      });
    }
    const reliabilities = computeClaimReliabilities(reliabilityInputs);
    const claimReliabilities: ClaimReliabilitySummary[] = reliabilities.map(
      (r) => ({
        claimId: r.claimId,
        tier: r.tier,
        finalConfidence: r.finalConfidence,
        reliabilityScore: r.reliabilityScore,
        coverage: r.coverage,
        rationale: r.rationale,
      }),
    );

    // 8. Store coverage (extended with the Phase 5 block) + status + the
    //    weighted-confidence columns on the run (owner/curator RLS authorizes).
    const summary: EvidenceCoverageSummary = {
      ...coverageToSummary(coverage),
      evidenceWeightedConfidence: weighted.evidenceWeightedConfidence,
      researchConfidence: weighted.researchConfidence,
      supportRatio: weighted.supportRatio,
      contradictionRatio: weighted.contradictionRatio,
      unsupportedRatio: weighted.unsupportedRatio,
      explanation: weighted.explanation,
      claimReliabilities,
    };
    const { error: updError } = await client
      .from('research_runs')
      .update({
        evidence_coverage: summary as unknown as JsonRecord,
        evidence_status: coverage.mode, // 'fixture' | 'live' | 'mixed'
        evidence_weighted_confidence: weighted.evidenceWeightedConfidence,
        support_ratio: weighted.supportRatio,
        contradiction_ratio: weighted.contradictionRatio,
        unsupported_ratio: weighted.unsupportedRatio,
      })
      .eq('id', runId);
    if (updError) return fail(updError);

    // 9. Persist the provider-health snapshot (best-effort; never blocks the run).
    await persistProviderHealth(healthTracker.snapshot());

    return { ok: true, data: summary };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Read a run's research (pre-evidence) overall confidence (0..100). Prefers the
 * consensus report's overallConfidence; falls back to research_runs.
 * overall_confidence; defaults to 0 when neither is present. Never throws.
 */
async function loadResearchConfidence(
  client: SupabaseClient,
  runId: string,
): Promise<number> {
  try {
    const { data: reportRow } = await client
      .from('research_consensus_reports')
      .select('overall_confidence, report')
      .eq('run_id', runId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reportRow) {
      const fromReport = (reportRow.report ?? {}) as { overallConfidence?: number };
      if (typeof fromReport.overallConfidence === 'number') {
        return fromReport.overallConfidence;
      }
      if (typeof reportRow.overall_confidence === 'number') {
        return reportRow.overall_confidence;
      }
    }
    const { data: runRow } = await client
      .from('research_runs')
      .select('overall_confidence')
      .eq('id', runId)
      .maybeSingle();
    if (runRow && typeof runRow.overall_confidence === 'number') {
      return runRow.overall_confidence;
    }
  } catch {
    /* fall through to default */
  }
  return 0;
}

// =============================================================================
// PROVIDER HEALTH (Phase 5)
// =============================================================================

/** ProviderHealth (engine) -> provider_health upsert row. */
function healthToRow(h: ProviderHealth): JsonRecord {
  return {
    provider: h.name,
    enabled: h.enabled,
    available: h.available,
    last_success: h.lastSuccess ?? null,
    last_failure: h.lastFailure ?? null,
    latency_ms: h.latencyMs ?? null,
    error_count: h.errorCount,
    success_count: h.successCount,
    status: h.status,
  };
}

/**
 * Upsert a provider-health snapshot into provider_health (one row per provider,
 * unique on `provider`). Best-effort: a non-curator caller is rejected by RLS
 * and we swallow the error so a run never fails because health couldn't persist.
 */
export async function persistProviderHealth(
  snapshot: ProviderHealth[],
): Promise<DbResult<ProviderHealthRecord[]>> {
  try {
    if (snapshot.length === 0) return { ok: true, data: [] };
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    const { data, error } = await client
      .from('provider_health')
      .upsert(snapshot.map(healthToRow), { onConflict: 'provider' })
      .select('*');
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as ProviderHealthRecord[] };
  } catch (e) {
    return fail(e);
  }
}

/** Read the persisted provider-health table, ordered by provider name. */
export async function getProviderHealth(): Promise<
  DbResult<ProviderHealthRecord[]>
> {
  try {
    const client = db();
    const { data, error } = await client
      .from('provider_health')
      .select('*')
      .order('provider', { ascending: true });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as ProviderHealthRecord[] };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// EVIDENCE REVIEW QUEUE (Phase 5)
// =============================================================================

/** Best support type rank (highest wins) for effective-status display. */
const REVIEW_STATUS_DEFAULT: EvidenceReviewQueueItem['status'] = 'pending';

function normalizeReviewStatus(
  s: string | undefined,
): EvidenceReviewQueueItem['status'] {
  if (s === 'validated' || s === 'rejected' || s === 'needs_more') return s;
  return REVIEW_STATUS_DEFAULT;
}

/**
 * Build the reviewer queue: every evidence source the caller can see, joined to
 * its latest review verdict + the support/contradiction counts across the links
 * that reference it. Sources are prioritized: UNREVIEWED first, then those with
 * any CONTRADICTION, then the rest — so reviewers triage the riskiest citations.
 *
 * RLS-aware: evidence_sources are world-readable, but claim_evidence_links are
 * scoped to the caller's visible runs, so the counts reflect only what they may
 * see. Never throws.
 */
export async function listEvidenceReviewQueue(
  opts?: { limit?: number },
): Promise<DbResult<EvidenceReviewQueueItem[]>> {
  try {
    const client = db();
    const limit = Math.max(1, Math.min(opts?.limit ?? 200, 500));

    const { data: srcRows, error: srcError } = await client
      .from('evidence_sources')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (srcError) return fail(srcError);
    const sources = (srcRows ?? []) as EvidenceSourceRecord[];
    if (sources.length === 0) return { ok: true, data: [] };

    const sourceIds = sources.map((s) => s.id);

    // Latest review per source.
    const { data: reviewRows, error: reviewError } = await client
      .from('evidence_reviews')
      .select('*')
      .in('evidence_source_id', sourceIds)
      .order('created_at', { ascending: false });
    if (reviewError) return fail(reviewError);
    const latestReview = new Map<string, EvidenceReviewRecord>();
    for (const r of (reviewRows ?? []) as EvidenceReviewRecord[]) {
      if (!latestReview.has(r.evidence_source_id)) {
        latestReview.set(r.evidence_source_id, r);
      }
    }

    // Links referencing these sources (RLS-scoped to visible runs).
    const { data: linkRows, error: linkError } = await client
      .from('claim_evidence_links')
      .select('evidence_source_id, research_run_id, support_type')
      .in('evidence_source_id', sourceIds);
    if (linkError) return fail(linkError);

    const runIds = new Map<string, Set<string>>();
    const supportCounts = new Map<string, number>();
    const contradictionCounts = new Map<string, number>();
    for (const l of (linkRows ?? []) as Array<{
      evidence_source_id: string;
      research_run_id: string;
      support_type?: string;
    }>) {
      const sid = l.evidence_source_id;
      if (!runIds.has(sid)) runIds.set(sid, new Set());
      runIds.get(sid)!.add(l.research_run_id);
      if (l.support_type === 'supports') {
        supportCounts.set(sid, (supportCounts.get(sid) ?? 0) + 1);
      } else if (l.support_type === 'contradicts') {
        contradictionCounts.set(sid, (contradictionCounts.get(sid) ?? 0) + 1);
      }
    }

    const items: EvidenceReviewQueueItem[] = sources.map((source) => {
      const review = latestReview.get(source.id);
      return {
        source,
        latestReview: review,
        status: normalizeReviewStatus(
          review?.status as string | undefined,
        ),
        linkedRunIds: Array.from(runIds.get(source.id) ?? []),
        supportCount: supportCounts.get(source.id) ?? 0,
        contradictionCount: contradictionCounts.get(source.id) ?? 0,
      };
    });

    // Prioritize: unreviewed first, then any contradictions, then the rest.
    items.sort((a, b) => {
      const aUnreviewed = a.latestReview ? 0 : 1;
      const bUnreviewed = b.latestReview ? 0 : 1;
      if (aUnreviewed !== bUnreviewed) return bUnreviewed - aUnreviewed;
      if (a.contradictionCount !== b.contradictionCount) {
        return b.contradictionCount - a.contradictionCount;
      }
      return 0;
    });

    return { ok: true, data: items };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// EVIDENCE INTELLIGENCE (Phase 5) — cross-run aggregate for the dashboard.
// =============================================================================

/**
 * Aggregate evidence intelligence across the runs the caller can see (RLS scoped):
 * average ratios + coverage, support/contradiction/background/unsupported totals
 * from claim_evidence_links, provider health, a coverage timeline (one point per
 * run with stored coverage), and a source-type breakdown. Never throws.
 */
export async function getEvidenceIntelligence(): Promise<
  DbResult<EvidenceIntelligence>
> {
  try {
    const client = db();

    const { data: runRows, error: runError } = await client
      .from('research_runs')
      .select(
        'id, title, created_at, evidence_coverage, evidence_weighted_confidence, support_ratio, contradiction_ratio, unsupported_ratio',
      )
      .order('created_at', { ascending: true });
    if (runError) return fail(runError);
    const runs = (runRows ?? []) as Array<{
      id: string;
      title?: string;
      created_at: string;
      evidence_coverage?: unknown;
      evidence_weighted_confidence?: number;
      support_ratio?: number;
      contradiction_ratio?: number;
      unsupported_ratio?: number;
    }>;

    // Coverage timeline + ratio averages from runs that actually have coverage.
    const coverageTimeline: EvidenceIntelligence['coverageTimeline'] = [];
    let sumCoverage = 0;
    let sumSupport = 0;
    let sumContradiction = 0;
    let sumUnsupported = 0;
    let withCoverage = 0;
    for (const r of runs) {
      const cov = toJsonRecord(r.evidence_coverage) as unknown as
        | EvidenceCoverageSummary
        | null;
      if (!cov || typeof cov.totalClaims !== 'number') continue;
      withCoverage += 1;
      sumCoverage += cov.coverageScore ?? 0;
      sumSupport += r.support_ratio ?? cov.supportRatio ?? 0;
      sumContradiction += r.contradiction_ratio ?? cov.contradictionRatio ?? 0;
      sumUnsupported += r.unsupported_ratio ?? cov.unsupportedRatio ?? 0;
      coverageTimeline.push({
        runId: r.id,
        label: r.title ?? r.id.slice(0, 8),
        date: r.created_at,
        coverageScore: cov.coverageScore ?? 0,
        evidenceWeightedConfidence:
          r.evidence_weighted_confidence ?? cov.evidenceWeightedConfidence,
      });
    }
    const div = withCoverage || 1;

    // Support-type totals across all visible links.
    const { data: linkRows, error: linkError } = await client
      .from('claim_evidence_links')
      .select('support_type');
    if (linkError) return fail(linkError);
    let totalSupported = 0;
    let totalContradicted = 0;
    let totalBackground = 0;
    let totalUnsupported = 0;
    for (const l of (linkRows ?? []) as Array<{ support_type?: string }>) {
      if (l.support_type === 'supports') totalSupported += 1;
      else if (l.support_type === 'contradicts') totalContradicted += 1;
      else if (l.support_type === 'background') totalBackground += 1;
      else totalUnsupported += 1;
    }

    // Source-type breakdown from evidence_sources.publication_type.
    const { data: srcRows, error: srcError } = await client
      .from('evidence_sources')
      .select('publication_type');
    if (srcError) return fail(srcError);
    const sourceTypeBreakdown: Record<string, number> = {};
    for (const s of (srcRows ?? []) as Array<{ publication_type?: string }>) {
      const key = s.publication_type ?? 'unknown';
      sourceTypeBreakdown[key] = (sourceTypeBreakdown[key] ?? 0) + 1;
    }

    const health = await getProviderHealth();
    const providerHealth = health.ok ? health.data : [];

    return {
      ok: true,
      data: {
        totalRuns: withCoverage,
        avgCoverageScore: Math.round((sumCoverage / div) * 10) / 10,
        avgSupportRatio: Math.round((sumSupport / div) * 100) / 100,
        avgContradictionRatio: Math.round((sumContradiction / div) * 100) / 100,
        avgUnsupportedRatio: Math.round((sumUnsupported / div) * 100) / 100,
        totalSupported,
        totalContradicted,
        totalBackground,
        totalUnsupported,
        providerHealth,
        coverageTimeline,
        sourceTypeBreakdown,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// CLAIM<->EVIDENCE GRAPH (Phase 5)
// =============================================================================

/**
 * Build the claim<->evidence graph for one run: a node per distinct claim and a
 * node per linked source, with an edge per claim_evidence_link carrying its
 * support_type + confidence. RLS-aware (only links/sources the caller can see).
 * Never throws.
 */
export async function getClaimEvidenceGraph(
  runId: string,
): Promise<DbResult<ClaimEvidenceGraph>> {
  try {
    const client = db();

    const { data: linkRows, error: linkError } = await client
      .from('claim_evidence_links')
      .select('id, claim_id, evidence_source_id, support_type, confidence')
      .eq('research_run_id', runId);
    if (linkError) return fail(linkError);
    const links = (linkRows ?? []) as Array<{
      id: string;
      claim_id?: string;
      evidence_source_id: string;
      support_type?: string;
      confidence?: number;
    }>;

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

    // To label claim nodes with their tier, load the run's agent claims.
    const claimTier = new Map<string, string>();
    const claimText = new Map<string, string>();
    const { data: outputRows } = await client
      .from('research_agent_outputs')
      .select('domain, output')
      .eq('run_id', runId);
    for (const row of outputRows ?? []) {
      if ((row.domain as string) === 'consensus') continue;
      const output = (row.output ?? {}) as { claims?: Claim[] };
      for (const c of Array.isArray(output.claims) ? output.claims : []) {
        if (!claimTier.has(c.id)) claimTier.set(c.id, c.tier);
        if (!claimText.has(c.id)) claimText.set(c.id, c.text);
      }
    }

    const nodes: ClaimEvidenceGraphNode[] = [];
    const seenNode = new Set<string>();
    const addNode = (n: ClaimEvidenceGraphNode): void => {
      if (seenNode.has(n.id)) return;
      seenNode.add(n.id);
      nodes.push(n);
    };

    const sourceById = new Map(sources.map((s) => [s.id, s]));
    const edges: ClaimEvidenceGraphEdge[] = [];

    for (const l of links) {
      const claimNodeId = `claim:${l.claim_id ?? l.id}`;
      addNode({
        id: claimNodeId,
        kind: 'claim',
        label: claimText.get(l.claim_id ?? '') ?? (l.claim_id ?? 'claim'),
        tier: l.claim_id ? claimTier.get(l.claim_id) : undefined,
      });
      const sourceNodeId = `source:${l.evidence_source_id}`;
      const src = sourceById.get(l.evidence_source_id);
      addNode({
        id: sourceNodeId,
        kind: 'source',
        label: src?.title ?? l.evidence_source_id,
        supportType: l.support_type,
        meta: src
          ? { sourceName: src.source_name, url: src.url, year: src.year }
          : undefined,
      });
      const st = l.support_type;
      const supportType: ClaimEvidenceGraphEdge['supportType'] =
        st === 'supports' || st === 'contradicts' || st === 'background'
          ? st
          : 'unclear';
      edges.push({
        id: l.id,
        source: claimNodeId,
        target: sourceNodeId,
        supportType,
        confidence: l.confidence,
      });
    }

    return { ok: true, data: { nodes, edges } };
  } catch (e) {
    return fail(e);
  }
}
