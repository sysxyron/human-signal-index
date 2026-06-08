// =============================================================================
// HSIN Phase 9 — HSI <-> WorldForge fusion bridge. SERVER-ONLY.
//
// The cross-subsystem bridge that turns a captured PUBLIC signal (+ its
// narratives/entities) into a WorldForge research run — strictly as a DRAFT for
// human approval. Nothing here auto-creates a run or auto-publishes:
//
//   * draftWorldforgeFromSignal(signalId) — PURE assembly: load the signal + its
//     linked narrative(s)/entities, synthesize a research PROMPT DRAFT (a title +
//     a promptDraft string framing the real-world narrative as a WorldForge
//     research question + an explainable rationale[]), and INSERT a
//     hsin_worldforge_links row at status 'draft'. Returns the WorldforgeFusionDraft.
//
//   * approveWorldforgeFusion({ linkId?|signalId?, title, promptDraft })
//     (researcher+) — runs createResearchRun(promptDraft, title) (the existing
//     WorldForge DAL), stamps research_runs.origin_signal_id, and advances/creates
//     the hsin_worldforge_links row to status 'created' with research_run_id. A
//     human supplies the final title/promptDraft. NEVER auto-publishes. Audited.
//
//   * listWorldforgeLinks() — the links list (RLS scoped).
//
// AUTHZ (migration 0013 RLS, shape D): the link is owned by created_by; owner full
// CRUD; researcher+ READ; reviewer+ READ/UPDATE; admin all. Drafting requires a
// signed-in user (the draft is owned). Approval is gated researcher+ (also the
// minimum for createResearchRun). SERVER-ONLY (uses next/headers transitively).
//
// DESIGN: every function returns DbResult<T> and NEVER throws.
// =============================================================================

import type {
  HsinWorldforgeLinkRecord,
  WorldforgeFusionDraft,
} from '@hsi/shared-types';
import { createResearchRun } from '@/lib/worldforge/research-persistence';
import {
  fail,
  type DbResult,
  type JsonRecord,
  operationsDbClient as db,
  requireOperationsRole as requireRole,
} from './persistence';

// -----------------------------------------------------------------------------
// Minimal row projections (keep `any` out of signatures).
// -----------------------------------------------------------------------------
interface SignalRow {
  id: string;
  title: string;
  summary?: string | null;
  raw_content?: string | null;
  signal_category?: string | null;
}
interface NarrativeRow {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
}
interface EntityRow {
  name: string;
  entity_type?: string | null;
}

const AUTH_REQUIRED = 'Sign in to continue.';

// =============================================================================
// DRAFT — assemble a WorldForge fusion draft from a signal (+ insert a link row).
// =============================================================================

/**
 * Synthesize a WorldForge research prompt DRAFT from a captured signal and persist
 * a hsin_worldforge_links row at status 'draft'. PURE assembly — never runs the
 * research engine and never creates a run. Requires a signed-in user (the draft is
 * owned via created_by). NEVER throws.
 */
export async function draftWorldforgeFromSignal(
  signalId: string,
): Promise<DbResult<WorldforgeFusionDraft>> {
  try {
    const client = db();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      return { ok: false, error: AUTH_REQUIRED, code: 'AUTH_REQUIRED' };
    }

    // 1. Load the signal (RLS-scoped).
    const { data: signalRow, error: serr } = await client
      .from('hsin_signals')
      .select('id, title, summary, raw_content, signal_category')
      .eq('id', signalId)
      .maybeSingle();
    if (serr) return fail(serr);
    if (!signalRow) {
      return {
        ok: false,
        error: 'Signal not found or not visible.',
        code: 'DB_ERROR',
      };
    }
    const signal = signalRow as SignalRow;

    // 2. Linked narrative(s) — pick the highest-confidence as the primary frame.
    let primaryNarrative: NarrativeRow | undefined;
    const narrativeNames: string[] = [];
    {
      const { data: links } = await client
        .from('hsin_signal_narratives')
        .select('narrative_id, confidence')
        .eq('signal_id', signalId)
        .order('confidence', { ascending: false })
        .limit(10);
      const narrativeIds = ((links ?? []) as Array<{ narrative_id: string }>).map(
        (l) => l.narrative_id,
      );
      if (narrativeIds.length > 0) {
        const { data: narrativeRows } = await client
          .from('hsin_narratives')
          .select('id, name, description, category')
          .in('id', narrativeIds)
          .limit(10);
        const byId = new Map(
          ((narrativeRows ?? []) as NarrativeRow[]).map((n) => [n.id, n]),
        );
        // Preserve the confidence order from links.
        for (const id of narrativeIds) {
          const n = byId.get(id);
          if (n) {
            narrativeNames.push(n.name);
            if (!primaryNarrative) primaryNarrative = n;
          }
        }
      }
    }

    // 3. Linked entities (context for the rationale).
    const entityNames: string[] = [];
    {
      const { data: seRows } = await client
        .from('hsin_signal_entities')
        .select('entity_id')
        .eq('signal_id', signalId)
        .limit(25);
      const entityIds = ((seRows ?? []) as Array<{ entity_id: string }>).map(
        (r) => r.entity_id,
      );
      if (entityIds.length > 0) {
        const { data: entityRows } = await client
          .from('hsin_entities')
          .select('name, entity_type')
          .in('id', entityIds)
          .limit(25);
        for (const e of (entityRows ?? []) as EntityRow[]) entityNames.push(e.name);
      }
    }

    // 4. Synthesize the draft (title + promptDraft + rationale[]).
    const frame = primaryNarrative?.name ?? signal.title;
    const title = `WorldForge: ${frame}`.slice(0, 80);

    const summary = signal.summary ?? signal.raw_content ?? '';
    const promptParts: string[] = [
      `Model the real-world narrative "${frame}" as a WorldForge research question.`,
      summary ? `Observed signal: ${signal.title}. ${summary}`.trim() : `Observed signal: ${signal.title}.`,
    ];
    if (primaryNarrative?.description) {
      promptParts.push(`Narrative framing: ${primaryNarrative.description}`);
    }
    if (narrativeNames.length > 0) {
      promptParts.push(`Related narratives: ${narrativeNames.join(', ')}.`);
    }
    if (entityNames.length > 0) {
      promptParts.push(`Key entities: ${entityNames.join(', ')}.`);
    }
    promptParts.push(
      'Research how this narrative could plausibly evolve, what forces drive or counter it, ' +
        'and what world-states it implies — as a DRAFT for human review.',
    );
    const promptDraft = promptParts.join(' ').slice(0, 4000);

    const rationale: string[] = [
      `Derived from captured signal "${signal.title}".`,
      primaryNarrative
        ? `Primary narrative frame: "${primaryNarrative.name}"${
            primaryNarrative.category ? ` (category ${primaryNarrative.category})` : ''
          }.`
        : 'No narrative linked yet — framed directly from the signal.',
      signal.signal_category
        ? `Signal category: ${signal.signal_category}.`
        : 'Signal not yet categorized.',
      entityNames.length > 0
        ? `${entityNames.length} entity(ies) provide context.`
        : 'No entities linked yet.',
      'This is a DRAFT research prompt — a human must approve it before any run is created.',
    ];

    const draft: WorldforgeFusionDraft = {
      signalId,
      narrativeId: primaryNarrative?.id,
      title,
      promptDraft,
      rationale,
    };

    // 5. Persist the link row at status 'draft' (owned by created_by).
    await client
      .from('hsin_worldforge_links')
      .insert({
        signal_id: signalId,
        narrative_id: primaryNarrative?.id ?? null,
        prompt_draft: promptDraft,
        status: 'draft',
        created_by: user.id,
      })
      .then(() => undefined, () => undefined);

    return { ok: true, data: draft };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// APPROVE — create the research run (DRAFT) + advance the link to 'created'.
// =============================================================================

export interface ApproveWorldforgeFusionInput {
  linkId?: string;
  signalId?: string;
  title: string;
  promptDraft: string;
}

/**
 * Approve a fusion draft (researcher+): run createResearchRun(promptDraft, title)
 * — the existing WorldForge DAL, which creates the run at its normal (draft/
 * complete) status and NEVER publishes — stamp research_runs.origin_signal_id,
 * then advance an existing hsin_worldforge_links row (by linkId, else by the most
 * recent draft for signalId) to status 'created' with research_run_id, or insert a
 * new 'created' link when none exists. Audited. NEVER throws.
 */
export async function approveWorldforgeFusion(
  input: ApproveWorldforgeFusionInput,
): Promise<DbResult<{ runId: string; linkId: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    if (!input.title?.trim() || !input.promptDraft?.trim()) {
      return {
        ok: false,
        error: 'A title and prompt draft are required to approve a fusion.',
        code: 'DB_ERROR',
      };
    }

    // 1. Create the research run (DRAFT — createResearchRun never publishes).
    const runResult = await createResearchRun(
      input.promptDraft,
      input.title.slice(0, 80),
    );
    if (!runResult.ok) {
      // Surface the underlying error/code (AUTH_REQUIRED / NOT_CONFIGURED / DB_ERROR).
      return {
        ok: false,
        error: runResult.error,
        code: runResult.code ?? 'DB_ERROR',
      };
    }
    const runId = runResult.data.runId;

    // 2. Resolve the originating signal (from the link when only linkId is given).
    let signalId = input.signalId;
    let existingLinkId = input.linkId;
    if (!signalId && input.linkId) {
      const { data: linkRow } = await client
        .from('hsin_worldforge_links')
        .select('signal_id')
        .eq('id', input.linkId)
        .maybeSingle();
      signalId = (linkRow?.signal_id as string | undefined) ?? undefined;
    }

    // 3. Stamp origin_signal_id on the run (best-effort).
    if (signalId) {
      await client
        .from('research_runs')
        .update({ origin_signal_id: signalId })
        .eq('id', runId)
        .then(() => undefined, () => undefined);
    }

    // 4. Advance an existing link, else the latest draft for the signal, else insert.
    if (!existingLinkId && signalId) {
      const { data: latest } = await client
        .from('hsin_worldforge_links')
        .select('id')
        .eq('signal_id', signalId)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      existingLinkId = (latest?.id as string | undefined) ?? undefined;
    }

    let linkId: string;
    const linkPatch: JsonRecord = {
      status: 'created',
      research_run_id: runId,
      prompt_draft: input.promptDraft.slice(0, 4000),
    };
    if (existingLinkId) {
      const { data, error } = await client
        .from('hsin_worldforge_links')
        .update(linkPatch)
        .eq('id', existingLinkId)
        .select('id')
        .single();
      if (error) return fail(error);
      linkId = data.id as string;
    } else {
      const { data, error } = await client
        .from('hsin_worldforge_links')
        .insert({
          signal_id: signalId ?? null,
          research_run_id: runId,
          prompt_draft: input.promptDraft.slice(0, 4000),
          status: 'created',
          created_by: gate.user.id,
        })
        .select('id')
        .single();
      if (error) return fail(error);
      linkId = data.id as string;
    }

    // 5. Audit (best-effort).
    await client
      .from('audit_logs')
      .insert({
        user_id: gate.user.id,
        action: 'hsin_worldforge_fusion_approved',
        metadata: {
          run_id: runId,
          link_id: linkId,
          signal_id: signalId ?? null,
          title: input.title,
        },
      })
      .then(() => undefined, () => undefined);

    return { ok: true, data: { runId, linkId } };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// LIST — worldforge links (RLS scoped).
// =============================================================================

/** List WorldForge fusion links (newest first). RLS scopes visibility. NEVER throws. */
export async function listWorldforgeLinks(): Promise<
  DbResult<HsinWorldforgeLinkRecord[]>
> {
  try {
    const { data, error } = await db()
      .from('hsin_worldforge_links')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as HsinWorldforgeLinkRecord[] };
  } catch (e) {
    return fail(e);
  }
}
