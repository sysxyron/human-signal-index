// =============================================================================
// WorldForge Phase 6 — Public Report Builder (SERVER-ONLY).
//
// Pure assembly of a PublicReportDraft from existing persisted data. The builder
// reads (via the cookie-backed, RLS-enforced server client) a research run's
// consensus report, evidence coverage, claims, and reviewer notes, and freezes
// them into the public-facing snapshot that publishEntity() stores as a
// publication_versions row.
//
// SERVER-ONLY — never import from a 'use client' module (uses next/headers via
// lib/supabase/server.ts). Never throws: every path returns a DbResult<T>. Empty
// Supabase env degrades to NOT_CONFIGURED so `next build` passes.
//
// OWNERSHIP: this is a READ-ONLY assembler. It does not write. The caller
// (persistence.publishEntity / republishEntity) is the one that has already
// gated on the curator+ role; the builder simply reads what RLS lets it see.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type {
  ReviewEntityType,
  PublicReportDraft,
  EvidenceCoverageSummary,
  ClaimReliabilitySummary,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Result type — canonical DbResult EXTENDED with 'FORBIDDEN' (Phase 6). Declared
// identically to lib/governance/persistence.ts so the two modules interoperate.
// Re-exported for callers that only import the builder.
// -----------------------------------------------------------------------------
export type DbResultCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_CONFIGURED'
  | 'DB_ERROR';

export type DbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED =
  'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';

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

function db(): SupabaseClient {
  return createClient();
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

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** A minimal Claim shape as persisted inside research_agent_outputs.output.claims. */
interface PersistedClaim {
  id: string;
  text?: string;
  tier?: string;
  confidence?: number;
}

/** A top key-claim entry for the public report. */
interface KeyClaim {
  claimId: string;
  text: string;
  tier?: string;
  confidence?: number;
  reliabilityScore?: number;
  coverage?: string;
}

/** A contradiction entry surfaced in the public report. */
interface ContradictionEntry {
  claimId: string;
  text?: string;
  tier?: string;
}

const REPORT_VERSION = 1;
const MAX_KEY_CLAIMS = 12;

// =============================================================================
// buildPublicReport — assemble a PublicReportDraft for an entity.
// Currently the rich builder handles `research_run`; other entity kinds get a
// minimal, honest draft (no invented data) rather than failing.
// =============================================================================

export async function buildPublicReport(
  entityType: ReviewEntityType,
  entityId: string,
  generatedAt: string = new Date().toISOString(),
): Promise<DbResult<PublicReportDraft>> {
  try {
    if (entityType === 'research_run') {
      return await buildResearchRunReport(entityId, generatedAt);
    }
    // Other entity kinds are not yet richly assembled; return a minimal, honest
    // draft so publication still works without inventing content.
    const draft: PublicReportDraft = {
      entityType,
      entityId,
      executiveSummary: `Published ${entityType} ${entityId}.`,
      keyClaims: [],
      evidenceSummary: {},
      supportRatio: 0,
      contradictions: [],
      consensus: {},
      reviewerNotes: [],
      metadata: {
        entityType,
        entityId,
        generatedAt,
        version: REPORT_VERSION,
      },
    };
    return { ok: true, data: draft };
  } catch (e) {
    return fail(e);
  }
}

async function buildResearchRunReport(
  runId: string,
  generatedAt: string,
): Promise<DbResult<PublicReportDraft>> {
  const client = db();

  // 1. The run row (RLS scopes to own + public; curator sees more).
  const { data: runRow, error: runError } = await client
    .from('research_runs')
    .select(
      'id, title, concept_text, overall_confidence, agreement_score, evidence_coverage, governed_confidence, review_status',
    )
    .eq('id', runId)
    .maybeSingle();
  if (runError) return fail(runError);
  if (!runRow) {
    return { ok: false, error: 'Run not found or not visible.', code: 'DB_ERROR' };
  }

  // 2. The latest consensus report for the run (the synthesized narrative).
  const { data: reportRow, error: reportError } = await client
    .from('research_consensus_reports')
    .select('report, overall_confidence, agreement_score')
    .eq('run_id', runId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reportError) return fail(reportError);

  const consensusReport = (toJsonRecord(reportRow?.report) ?? {}) as JsonRecord;
  const consensusSummary =
    asString(consensusReport.summary) ??
    asString(runRow.title) ??
    asString(runRow.concept_text) ??
    'No consensus summary available.';

  // 3. Evidence coverage (Phase 4/5 jsonb) — counts, ratios, per-claim reliability.
  const coverage =
    (toJsonRecord(runRow.evidence_coverage) as unknown as
      | EvidenceCoverageSummary
      | null) ?? null;

  // 4. Claims from the run's agent outputs (skip the synthetic consensus row).
  const { data: outputRows, error: outputsError } = await client
    .from('research_agent_outputs')
    .select('domain, output')
    .eq('run_id', runId);
  if (outputsError) return fail(outputsError);

  const claimById = new Map<string, PersistedClaim>();
  for (const row of outputRows ?? []) {
    if ((row.domain as string) === 'consensus') continue;
    const output = (toJsonRecord(row.output) ?? {}) as { claims?: PersistedClaim[] };
    for (const c of Array.isArray(output.claims) ? output.claims : []) {
      if (c && typeof c.id === 'string' && !claimById.has(c.id)) {
        claimById.set(c.id, c);
      }
    }
  }

  // 5. Per-claim reliability (from coverage.claimReliabilities) keyed by claimId.
  const reliabilityById = new Map<string, ClaimReliabilitySummary>();
  for (const r of coverage?.claimReliabilities ?? []) {
    reliabilityById.set(r.claimId, r);
  }

  // 6. Key claims: rank by reliabilityScore (when present) then claim confidence.
  const keyClaims: KeyClaim[] = Array.from(claimById.values())
    .map((c) => {
      const rel = reliabilityById.get(c.id);
      return {
        claimId: c.id,
        text: c.text ?? c.id,
        tier: c.tier,
        confidence: asNumber(c.confidence),
        reliabilityScore: rel?.reliabilityScore,
        coverage: rel?.coverage,
      } satisfies KeyClaim;
    })
    .sort((a, b) => {
      const ar = a.reliabilityScore ?? (a.confidence ?? 0) * 100;
      const br = b.reliabilityScore ?? (b.confidence ?? 0) * 100;
      return br - ar;
    })
    .slice(0, MAX_KEY_CLAIMS);

  // 7. Contradictions: claims whose evidence coverage verdict is 'contradicted'.
  const contradictions: ContradictionEntry[] = [];
  for (const rel of coverage?.claimReliabilities ?? []) {
    if (rel.coverage === 'contradicted') {
      const c = claimById.get(rel.claimId);
      contradictions.push({
        claimId: rel.claimId,
        text: c?.text,
        tier: c?.tier ?? rel.tier,
      });
    }
  }

  // 8. Reviewer notes: notes from review_decisions on the run's review_queue(s).
  const reviewerNotes = await loadReviewerNotes(client, 'research_run', runId);

  // 9. Confidence figures: governed (Phase 6) > evidence-weighted (Phase 5) >
  //    consensus overall. Honest passthrough — no invented numbers.
  const governedConfidence = asNumber(runRow.governed_confidence);
  const evidenceConfidence =
    coverage?.evidenceWeightedConfidence ?? coverage?.coverageScore;
  const overallConfidence =
    asNumber(reportRow?.overall_confidence) ??
    asNumber(runRow.overall_confidence) ??
    coverage?.researchConfidence;
  const agreementScore =
    asNumber(reportRow?.agreement_score) ?? asNumber(runRow.agreement_score);
  const supportRatio = coverage?.supportRatio ?? 0;

  // 10. Executive summary: consensus narrative + the headline confidence figures.
  const confidenceLine =
    governedConfidence !== undefined
      ? ` Governed confidence: ${governedConfidence}/100.`
      : overallConfidence !== undefined
        ? ` Consensus confidence: ${overallConfidence}/100.`
        : '';
  const executiveSummary = `${consensusSummary}${confidenceLine}`;

  const evidenceSummary: JsonRecord = coverage
    ? {
        totalClaims: coverage.totalClaims,
        supported: coverage.supported,
        contradicted: coverage.contradicted,
        background: coverage.background,
        unsupported: coverage.unsupported,
        coverageScore: coverage.coverageScore,
        mode: coverage.mode,
        evidenceWeightedConfidence: coverage.evidenceWeightedConfidence,
      }
    : { totalClaims: 0, supported: 0, contradicted: 0, note: 'No evidence gathered.' };

  const draft: PublicReportDraft = {
    entityType: 'research_run',
    entityId: runId,
    executiveSummary,
    keyClaims,
    evidenceSummary,
    supportRatio,
    contradictions,
    consensus: {
      summary: consensusSummary,
      overallConfidence,
      agreementScore,
      governedConfidence,
      evidenceConfidence,
      reviewStatus: asString(runRow.review_status),
    },
    reviewerNotes,
    metadata: {
      entityType: 'research_run',
      entityId: runId,
      title: asString(runRow.title),
      generatedAt,
      version: REPORT_VERSION,
    },
  };

  return { ok: true, data: draft };
}

/**
 * Collect reviewer decision notes for an entity by walking its review_queue(s)
 * → review_decisions. Best-effort: returns [] on any error so a report is never
 * blocked by missing/forbidden review rows.
 */
async function loadReviewerNotes(
  client: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<string[]> {
  try {
    const { data: queueRows } = await client
      .from('review_queues')
      .select('id')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId);
    const queueIds = (queueRows ?? []).map((q) => q.id as string);
    if (queueIds.length === 0) return [];

    const { data: decisionRows } = await client
      .from('review_decisions')
      .select('decision, notes, created_at')
      .in('review_queue_id', queueIds)
      .order('created_at', { ascending: true });

    const notes: string[] = [];
    for (const d of decisionRows ?? []) {
      const note = asString(d.notes);
      if (note && note.trim().length > 0) {
        notes.push(`[${d.decision as string}] ${note.trim()}`);
      }
    }
    return notes;
  } catch {
    return [];
  }
}
