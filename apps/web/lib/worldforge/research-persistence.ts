// =============================================================================
// WorldForge Phase 3 — Research data-access layer (DAL).
//
// SERVER-ONLY — never import this from a 'use client' module. It uses
// next/headers (via lib/supabase/server.ts), so it must stay on the server.
//
// OWNERSHIP MODEL (Phase 2.75, mirrored from lib/worldforge/persistence.ts):
//   * READS go through the cookie-backed SSR server client (createClient). RLS
//     (migration 0007) decides visibility: anonymous callers see only public
//     runs; authenticated callers see their own runs + public runs. No
//     service-role for normal reads.
//   * WRITES first resolve the authenticated user via the SAME server client's
//     auth.getUser(). With NO user we return { ok:false, code:'AUTH_REQUIRED' }.
//     With a user we stamp research_runs.created_by = user.id and perform every
//     write through the SAME authed client, so the RLS owner policies authorize
//     them (run by created_by = auth.uid(); child rows via the parent run's
//     created_by). There is NO service-role write path for user-facing actions.
//
// DESIGN: every function returns a DbResult<T> and NEVER throws. In this sandbox
// the Supabase env vars are empty; the server client tolerates that and real
// queries fail at call time, so we wrap every query in try/catch and surface the
// error as a string (+ a machine-readable `code`). The UI renders the error /
// falls back to the labeled in-browser demo (chronidDemoBundle), so a missing
// env degrades gracefully instead of white-screening.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type {
  ResearchRunRecord,
  ResearchAgentOutputRecord,
  ResearchConsensusReportRecord,
  ResearchCitationRecord,
  ResearchDisputeRecord,
  ResearchRunBundle,
  WorldForgeUniverseType,
} from '@hsi/shared-types';
import {
  runResearch,
  blueprintToWorldState,
  chronidResearchDemo,
  type ResearchRunResult,
  type AgentOutput,
  type ConsensusReport,
  type Dispute,
  type SimulationBlueprint,
} from '@hsi/research-agents';
import { worldStateToJson } from '@/lib/worldforge/mappers';

// -----------------------------------------------------------------------------
// Result type — identical shape to lib/worldforge/persistence.ts. Re-declared
// here (rather than imported) so this module is self-contained, and re-exported
// for the server actions / UI to import.
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
// Client + identity helpers. Both are only ever called INSIDE a try/catch in the
// functions below, so a missing env surfaces as a DbResult error.
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
// Small typed JSON helpers — cast engine objects into the jsonb record shape
// without leaking `any` into signatures.
// -----------------------------------------------------------------------------
type JsonRecord = Record<string, unknown>;

function toJson(value: unknown): JsonRecord {
  return (value ?? {}) as JsonRecord;
}

// =============================================================================
// CREATE — run the research engine and persist the full run + children.
// =============================================================================

export async function createResearchRun(
  conceptText: string,
  title?: string,
): Promise<DbResult<{ runId: string }>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    // Run the (pure, deterministic) research engine. agentOutputs holds the 9
    // domain agents + the skeptic; the consensus synthesis lives on .consensus.
    const result: ResearchRunResult = runResearch(conceptText);

    // 1. Insert the parent run (created_by = auth.uid() satisfies the owner RLS).
    const { data: runRow, error: runError } = await client
      .from('research_runs')
      .insert({
        created_by: user.id,
        title: title ?? conceptText.slice(0, 80),
        concept_text: conceptText,
        concept_signals: toJson(result.concept.extracted),
        status: 'complete',
        overall_confidence: result.consensus.overallConfidence,
        agreement_score: result.consensus.agreementScore,
        blueprint: toJson(result.blueprint),
        is_public: false,
      })
      .select('id')
      .single();
    if (runError) return fail(runError);
    const runId = runRow.id as string;

    // 2. Bulk insert agent outputs. Persist the consensus agent as a row too so
    //    the UI can render it alongside the domain agents (domain 'consensus').
    const outputRows: Array<{
      run_id: string;
      domain: string;
      title: string;
      output: JsonRecord;
      confidence_score: number;
      uncertainty_score: number;
    }> = result.agentOutputs.map((o: AgentOutput) => ({
      run_id: runId,
      domain: o.domain,
      title: o.title,
      output: toJson(o),
      confidence_score: o.confidenceScore,
      uncertainty_score: o.uncertaintyScore,
    }));
    // The consensus agent's synthesis as a pseudo agent output (no per-agent
    // confidence/uncertainty fields — reuse the consensus-level metrics).
    outputRows.push({
      run_id: runId,
      domain: 'consensus',
      title: 'Consensus synthesis',
      output: toJson(result.consensus),
      confidence_score: result.consensus.overallConfidence,
      uncertainty_score: 100 - result.consensus.overallConfidence,
    });
    const { error: outputsError } = await client
      .from('research_agent_outputs')
      .insert(outputRows);
    if (outputsError) return fail(outputsError);

    // 3. Insert the consensus report (one row).
    const consensus: ConsensusReport = result.consensus;
    const { error: consensusError } = await client
      .from('research_consensus_reports')
      .insert({
        run_id: runId,
        report: toJson(consensus),
        overall_confidence: consensus.overallConfidence,
        agreement_score: consensus.agreementScore,
        classification_breakdown: toJson(consensus.classificationBreakdown),
      });
    if (consensusError) return fail(consensusError);

    // 4. Insert disputes (skeptic challenges) — best-effort, skip when none.
    if (result.disputes.length > 0) {
      const disputeRows = result.disputes.map((d: Dispute) => ({
        run_id: runId,
        raised_by: d.raisedBy,
        target_domain: d.targetDomain,
        target_claim_id: d.targetClaimId ?? null,
        severity: d.severity,
        challenge: d.challenge,
        resolution: d.resolution ?? null,
        status: d.status,
      }));
      const { error: disputesError } = await client
        .from('research_disputes')
        .insert(disputeRows);
      if (disputesError) return fail(disputesError);
    }

    // 5. Flatten every agent's citations, tagging each with its agent_domain.
    const citationRows = result.agentOutputs.flatMap((o: AgentOutput) =>
      o.citations.map((c) => ({
        run_id: runId,
        agent_domain: o.domain,
        label: c.label,
        kind: c.kind,
        note: c.note ?? null,
      })),
    );
    if (citationRows.length > 0) {
      const { error: citationsError } = await client
        .from('research_citations')
        .insert(citationRows);
      if (citationsError) return fail(citationsError);
    }

    return { ok: true, data: { runId } };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// READ
// =============================================================================

/** List runs visible to the caller (own + public per RLS), newest first. */
export async function listResearchRuns(): Promise<DbResult<ResearchRunRecord[]>> {
  try {
    const { data, error } = await db()
      .from('research_runs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as ResearchRunRecord[] };
  } catch (e) {
    return fail(e);
  }
}

/** Load one run + all its children. RLS scopes visibility to own + public. */
export async function getResearchRun(
  id: string,
): Promise<DbResult<ResearchRunBundle>> {
  try {
    const client = db();

    const { data: runRow, error: runError } = await client
      .from('research_runs')
      .select('*')
      .eq('id', id)
      .single();
    if (runError) return fail(runError);
    const run = runRow as ResearchRunRecord;

    const { data: outputs, error: outputsError } = await client
      .from('research_agent_outputs')
      .select('*')
      .eq('run_id', id)
      .order('created_at', { ascending: true });
    if (outputsError) return fail(outputsError);

    const { data: consensusRows, error: consensusError } = await client
      .from('research_consensus_reports')
      .select('*')
      .eq('run_id', id)
      .order('created_at', { ascending: true })
      .limit(1);
    if (consensusError) return fail(consensusError);

    const { data: disputes, error: disputesError } = await client
      .from('research_disputes')
      .select('*')
      .eq('run_id', id)
      .order('created_at', { ascending: true });
    if (disputesError) return fail(disputesError);

    const { data: citations, error: citationsError } = await client
      .from('research_citations')
      .select('*')
      .eq('run_id', id)
      .order('created_at', { ascending: true });
    if (citationsError) return fail(citationsError);

    const bundle: ResearchRunBundle = {
      run,
      outputs: (outputs ?? []) as ResearchAgentOutputRecord[],
      consensus:
        ((consensusRows ?? [])[0] as ResearchConsensusReportRecord | undefined) ??
        null,
      disputes: (disputes ?? []) as ResearchDisputeRecord[],
      citations: (citations ?? []) as ResearchCitationRecord[],
    };
    return { ok: true, data: bundle };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// GENERATE WORLD — turn a run's blueprint into a persisted WorldForge world.
// =============================================================================

export async function generateWorldFromBlueprint(
  runId: string,
): Promise<DbResult<{ worldId: string }>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    // 1. Load the run (RLS scopes to own + public). We need its blueprint.
    const { data: runRow, error: runError } = await client
      .from('research_runs')
      .select('id, blueprint')
      .eq('id', runId)
      .single();
    if (runError) return fail(runError);

    const blueprint = (runRow.blueprint ?? {}) as unknown as SimulationBlueprint;
    if (!blueprint || !blueprint.worldName) {
      return {
        ok: false,
        error: 'Run has no blueprint to generate a world from.',
        code: 'DB_ERROR',
      };
    }

    // 2. Rebuild a real WorldState from the stored blueprint.
    const state = blueprintToWorldState(blueprint);

    // 3. Insert the world (created_by = auth.uid() satisfies worlds owner RLS).
    const { data: worldRow, error: worldError } = await client
      .from('worlds')
      .insert({
        name: blueprint.worldName,
        universe_type: blueprint.universeType as WorldForgeUniverseType,
        base_state: worldStateToJson(state),
        is_public: false,
        tags: ['from-research'],
        created_by: user.id,
      })
      .select('id')
      .single();
    if (worldError) return fail(worldError);
    const worldId = worldRow.id as string;

    // 4. Link the run to the world it produced (owner RLS authorizes the update).
    const { error: linkError } = await client
      .from('research_runs')
      .update({ world_id: worldId })
      .eq('id', runId);
    if (linkError) return fail(linkError);

    return { ok: true, data: { worldId } };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// DEMO — a labeled, NON-PERSISTED bundle for the Chronid showcase.
// Shaped exactly like ResearchRunBundle (synthetic ids, is_public true, clearly
// a demo: run id 'demo-chronid'). The UI can render it without any DB access.
// =============================================================================

export function chronidDemoBundle(): ResearchRunBundle {
  const result: ResearchRunResult = chronidResearchDemo();
  const now = new Date().toISOString();
  const runId = 'demo-chronid';

  const run: ResearchRunRecord = {
    id: runId,
    title: 'Chronid (demo)',
    concept_text: result.concept.text,
    concept_signals: toJson(result.concept.extracted),
    status: 'complete',
    overall_confidence: result.consensus.overallConfidence,
    agreement_score: result.consensus.agreementScore,
    blueprint: toJson(result.blueprint),
    is_public: true,
    created_at: now,
    updated_at: now,
  };

  const outputs: ResearchAgentOutputRecord[] = result.agentOutputs.map(
    (o: AgentOutput, i: number) => ({
      id: `demo-output-${i}`,
      run_id: runId,
      domain: o.domain,
      title: o.title,
      output: toJson(o),
      confidence_score: o.confidenceScore,
      uncertainty_score: o.uncertaintyScore,
      created_at: now,
    }),
  );
  outputs.push({
    id: 'demo-output-consensus',
    run_id: runId,
    domain: 'consensus',
    title: 'Consensus synthesis',
    output: toJson(result.consensus),
    confidence_score: result.consensus.overallConfidence,
    uncertainty_score: 100 - result.consensus.overallConfidence,
    created_at: now,
  });

  const consensus: ResearchConsensusReportRecord = {
    id: 'demo-consensus',
    run_id: runId,
    report: toJson(result.consensus),
    overall_confidence: result.consensus.overallConfidence,
    agreement_score: result.consensus.agreementScore,
    classification_breakdown: toJson(result.consensus.classificationBreakdown),
    created_at: now,
  };

  const disputes: ResearchDisputeRecord[] = result.disputes.map(
    (d: Dispute, i: number) => ({
      id: `demo-dispute-${i}`,
      run_id: runId,
      raised_by: d.raisedBy,
      target_domain: d.targetDomain,
      target_claim_id: d.targetClaimId,
      severity: d.severity,
      challenge: d.challenge,
      resolution: d.resolution,
      status: d.status,
      created_at: now,
    }),
  );

  const citations: ResearchCitationRecord[] = result.agentOutputs.flatMap(
    (o: AgentOutput) =>
      o.citations.map((c) => ({
        id: `demo-citation-${c.id}`,
        run_id: runId,
        agent_domain: o.domain,
        label: c.label,
        kind: c.kind,
        note: c.note,
        created_at: now,
      })),
  );

  return { run, outputs, consensus, disputes, citations };
}
