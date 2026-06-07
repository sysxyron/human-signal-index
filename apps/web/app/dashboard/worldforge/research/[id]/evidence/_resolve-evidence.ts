// =============================================================================
// WorldForge Phase 4 — server-only evidence resolver for the [id]/evidence page.
// Mirrors ../../_resolve.ts: resolves a run id (+ optional ?demo) into a unified
// evidence view-model, special-casing the labeled Chronid demo by computing
// FIXTURE evidence in-process via @hsi/evidence-engine (no DB, no API keys), and
// otherwise loading the persisted bundle via the evidence DAL. Never throws —
// returns a tagged result. Underscore prefix keeps it out of the router.
//
// SERVER-ONLY: imports the server DAL. Do NOT import from a 'use client' module.
// =============================================================================

import { chronidResearchDemo } from '@hsi/research-agents';
import type { Claim } from '@hsi/research-agents';
import {
  createEvidenceEngine,
  gatherEvidence,
  type EvidenceResult,
  type ClaimEvidence,
  type EvidenceCoverage,
} from '@hsi/evidence-engine';
import { getEvidenceForRun } from '@/lib/worldforge/evidence-persistence';
import { DEMO_RUN_ID } from '@/lib/worldforge/research-view';
import type {
  DbResultCode,
  EvidenceCoverageSummary,
  ClaimEvidenceLinkRecord,
  EvidenceSourceRecord,
  RunEvidenceBundle,
} from '@/lib/worldforge/evidence-view';

export type ResolveEvidenceResult =
  | { kind: 'ok'; bundle: RunEvidenceBundle; isDemo: boolean }
  | { kind: 'error'; message: string; code?: DbResultCode };

function isDemoRequest(id: string, searchParams?: { demo?: string }): boolean {
  return id === DEMO_RUN_ID || searchParams?.demo === '1';
}

// -- Engine result → persisted record shapes ---------------------------------

function resultToSource(r: EvidenceResult): EvidenceSourceRecord {
  return {
    id: r.id,
    source_type: r.publicationType,
    title: r.title,
    authors: r.authors,
    year: r.year,
    abstract: r.abstract,
    url: r.url,
    doi: r.doi,
    arxiv_id: r.arxivId,
    pubmed_id: r.pubmedId,
    semantic_scholar_id: r.semanticScholarId,
    source_name: r.sourceName,
    publication_type: r.publicationType,
    reliability_score: r.reliabilityScore,
    is_fixture: r.isFixture ?? true,
    created_at: r.retrievedAt,
    updated_at: r.retrievedAt,
  };
}

function matchToLinks(
  runId: string,
  match: ClaimEvidence,
): ClaimEvidenceLinkRecord[] {
  return match.results.map((r) => ({
    id: `${match.claimId}::${r.id}`,
    research_run_id: runId,
    claim_id: match.claimId,
    evidence_source_id: r.id,
    support_type: r.supportType,
    relevance_score: r.relevanceScore,
    confidence: r.confidence,
    created_at: r.retrievedAt,
  }));
}

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

/**
 * Compute the demo evidence bundle in-process from the Chronid research claims
 * using the fixture engine — deterministic, no API keys, clearly demo. This is
 * what makes the evidence tab work locally without a database or keys.
 */
async function computeDemoBundle(runId: string): Promise<RunEvidenceBundle> {
  const run = chronidResearchDemo();
  const claims: Claim[] = run.agentOutputs.flatMap((a) => a.claims);
  const engine = createEvidenceEngine({ mode: 'fixture' });
  const { matches, sources, coverage } = await gatherEvidence(claims, engine);

  return {
    sources: sources.map(resultToSource),
    links: matches.flatMap((m) => matchToLinks(runId, m)),
    coverage: coverageToSummary(coverage),
  };
}

/**
 * Resolve a run's evidence bundle. The demo short-circuits to in-process fixture
 * evidence (no DB); everything else goes through the evidence DAL.
 */
export async function resolveEvidenceView(
  id: string,
  searchParams?: { demo?: string },
): Promise<ResolveEvidenceResult> {
  if (isDemoRequest(id, searchParams)) {
    const bundle = await computeDemoBundle(DEMO_RUN_ID);
    return { kind: 'ok', bundle, isDemo: true };
  }

  const res = await getEvidenceForRun(id);
  if (res.ok) {
    return { kind: 'ok', bundle: res.data, isDemo: false };
  }
  return { kind: 'error', message: res.error, code: res.code };
}
