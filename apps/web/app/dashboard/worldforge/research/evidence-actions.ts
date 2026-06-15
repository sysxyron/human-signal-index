'use server';

// =============================================================================
// WorldForge Phase 4 — Evidence & Citation server actions.
// Thin, serializable wrappers around the SERVER-ONLY evidence data-access layer
// (lib/worldforge/evidence-persistence.ts) so client components can trigger
// evidence gathering, read a run's evidence, and (for curators) review sources.
// Every action accepts/returns only plain JSON. Actions NEVER throw: they pass
// the DAL's DbResult straight through. Mutations revalidate the affected route(s).
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient, getUser } from '@/lib/supabase/server';
import { recordContribution } from '@/lib/contributor/recorder';
import {
  runEvidenceForRun,
  getEvidenceForRun,
  getProviderHealth,
  listEvidenceReviewQueue,
  getEvidenceIntelligence,
  getClaimEvidenceGraph,
  type DbResult,
} from '@/lib/worldforge/evidence-persistence';
import type {
  EvidenceCoverageSummary,
  RunEvidenceBundle,
  EvidenceReviewRecord,
  EvidenceReviewStatus,
  ProviderHealthRecord,
  EvidenceReviewQueueItem,
  EvidenceIntelligence,
  ClaimEvidenceGraph,
} from '@hsi/shared-types';

const WF_BASE = '/dashboard/worldforge';
const RESEARCH_BASE = `${WF_BASE}/research`;

// Re-export the result + record/summary/bundle types so the UI can import from here.
export type { DbResult } from '@/lib/worldforge/evidence-persistence';
export type {
  EvidenceSourceRecord,
  ClaimEvidenceLinkRecord,
  EvidenceReviewRecord,
  EvidenceCoverageSummary,
  RunEvidenceBundle,
  EvidenceSupportType,
  EvidencePublicationType,
  EvidenceReliabilityTier,
  EvidenceReviewStatus,
  RunEvidenceStatus,
  // Phase 5 — Evidence Hardening.
  ProviderHealthRecord,
  ProviderHealthStatus,
  EvidenceCacheRecord,
  ClaimReliabilitySummary,
  EvidenceReviewQueueItem,
  EvidenceIntelligence,
  ClaimEvidenceGraph,
  ClaimEvidenceGraphNode,
  ClaimEvidenceGraphEdge,
} from '@hsi/shared-types';

/**
 * Gather + persist evidence for a run: flatten its claims, search the configured
 * engine, persist sources + claim links, store coverage on the run, return it.
 * Revalidates the run detail + its /evidence and /provenance sub-routes.
 */
export async function runEvidenceForRunAction(
  runId: string,
): Promise<DbResult<EvidenceCoverageSummary>> {
  const res = await runEvidenceForRun(runId);
  if (res.ok) {
    revalidatePath(`${RESEARCH_BASE}/${runId}`);
    revalidatePath(`${RESEARCH_BASE}/${runId}/evidence`);
    revalidatePath(`${RESEARCH_BASE}/${runId}/provenance`);
    // Phase 26 — additive, best-effort evidence contribution award. Only when the
    // run actually produced evidence (idempotent per run via the recorder key).
    if (Object.keys(res.data.bySource ?? {}).length > 0) {
      const user = await getUser();
      if (user) await recordContribution({ event: 'EVIDENCE_SUBMITTED', actorId: user.id, refKind: 'research_run', refId: runId, reason: 'Evidence gathered for run.' });
    }
  }
  return res;
}

/** Load a run's full evidence bundle (sources + claim links + coverage). */
export async function getEvidenceForRunAction(
  runId: string,
): Promise<DbResult<RunEvidenceBundle>> {
  return getEvidenceForRun(runId);
}

/**
 * Record a human review verdict on an evidence source (reviewer/admin only).
 * Inserts an evidence_reviews row with reviewed_by = the signed-in user. The
 * curator RLS policy on evidence_reviews authorizes the write; non-curators are
 * rejected by RLS and surface as a DB_ERROR.
 */
export async function reviewEvidenceAction(
  evidenceSourceId: string,
  status: EvidenceReviewStatus,
  notes?: string,
): Promise<DbResult<EvidenceReviewRecord>> {
  try {
    const client = createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      return { ok: false, error: 'Sign in to continue.', code: 'AUTH_REQUIRED' };
    }

    const { data, error } = await client
      .from('evidence_reviews')
      .insert({
        evidence_source_id: evidenceSourceId,
        reviewed_by: user.id,
        status,
        notes: notes ?? null,
      })
      .select('*')
      .single();
    if (error) {
      return { ok: false, error: error.message, code: 'DB_ERROR' };
    }
    revalidatePath(RESEARCH_BASE);
    return { ok: true, data: data as EvidenceReviewRecord };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message, code: 'DB_ERROR' };
  }
}

// =============================================================================
// Phase 5 — Evidence Hardening read actions.
// =============================================================================

/** Read the persisted provider-health table (HEALTHY/DEGRADED/OFFLINE per provider). */
export async function getProviderHealthAction(): Promise<
  DbResult<ProviderHealthRecord[]>
> {
  return getProviderHealth();
}

/** Load the reviewer queue (sources + latest verdict + support/contradiction counts). */
export async function listEvidenceReviewQueueAction(): Promise<
  DbResult<EvidenceReviewQueueItem[]>
> {
  return listEvidenceReviewQueue();
}

/** Cross-run evidence intelligence aggregate for the dashboard. */
export async function getEvidenceIntelligenceAction(): Promise<
  DbResult<EvidenceIntelligence>
> {
  return getEvidenceIntelligence();
}

/** Build the claim<->evidence graph (nodes + edges) for one run. */
export async function getClaimEvidenceGraphAction(
  runId: string,
): Promise<DbResult<ClaimEvidenceGraph>> {
  return getClaimEvidenceGraph(runId);
}
