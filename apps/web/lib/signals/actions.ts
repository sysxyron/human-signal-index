'use server';

// =============================================================================
// HSIN Phase 7 — server actions ('use server').
//
// ALL Phase-7 server actions live here. They are THIN wrappers over the DAL
// (lib/signals/persistence.ts) + the capture pipeline (lib/signals/pipeline.ts),
// returning DbResult and revalidating the relevant dashboard routes. They NEVER
// throw (the DAL/pipeline already return DbResult).
//
// THE KEY FEATURE — SIGNAL → RESEARCH: createResearchFromSignalAction wires a
// captured signal into the Phase 3-6 research/evidence/governance pipeline. It
// derives a concept from the signal, calls createResearchRun (which runs the
// research engine + auto evidence + consensus), links the run back to the signal
// via research_runs.origin_signal_id, records a 'research_created' event + alert,
// and moves the signal to 'reviewing'. This completes the end-to-end loop:
//   Source → Signal → Evidence → Research → Consensus → Governance → Publication.
//
// SERVER-ONLY: this module imports next/headers (transitively) and must never be
// imported by a client component — it is reachable only via these actions.
// =============================================================================

import { revalidatePath } from 'next/cache';
import type { HsinSignalDecision } from '@hsi/shared-types';
import { createClient } from '@/lib/supabase/server';
import { createResearchRun } from '@/lib/worldforge/research-persistence';
import {
  acknowledgeAlert,
  addSourceToWatchlist,
  addWatchlistSource,
  createSource,
  createWatchlist,
  disableSource,
  escalateAlert,
  getIntelligenceOverview,
  getSignal,
  getSource,
  listAlerts,
  listSignals,
  listSources,
  listWatchlists,
  reviewSignal,
  submitManualSignal,
  updateSource,
  type AlertFilters,
  type CreateSourceInput,
  type CreateWatchlistInput,
  type DbResult,
  type ManualSignalInput,
  type SignalFilters,
  type SourceFilters,
  type UpdateSourcePatch,
} from './persistence';
import { runSourceIntake, type IntakeOutcome } from './pipeline';
import { recordContribution } from '@/lib/contributor/recorder';
import { getCurrentOrganizationId } from '@/lib/org/operations';

// -----------------------------------------------------------------------------
// Dashboard routes revalidated after mutations (best-effort; safe if absent).
// -----------------------------------------------------------------------------
const SOURCES_ROUTE = '/signals/sources';
const SIGNALS_ROUTE = '/signals';
const WATCHLISTS_ROUTE = '/signals/watchlists';
const ALERTS_ROUTE = '/signals/alerts';
const OVERVIEW_ROUTE = '/signals/overview';

function revalidate(...paths: string[]): void {
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      // revalidatePath throws outside a request scope — ignore (best-effort).
    }
  }
}

// =============================================================================
// SOURCES
// =============================================================================

export async function listSourcesAction(filters?: SourceFilters) {
  return listSources(filters);
}

export async function getSourceAction(id: string) {
  return getSource(id);
}

export async function createSourceAction(input: CreateSourceInput) {
  const result = await createSource(input);
  if (result.ok) revalidate(SOURCES_ROUTE, OVERVIEW_ROUTE);
  return result;
}

export async function updateSourceAction(id: string, patch: UpdateSourcePatch) {
  const result = await updateSource(id, patch);
  if (result.ok) revalidate(SOURCES_ROUTE, `${SOURCES_ROUTE}/${id}`);
  return result;
}

export async function disableSourceAction(id: string) {
  const result = await disableSource(id);
  if (result.ok) revalidate(SOURCES_ROUTE, `${SOURCES_ROUTE}/${id}`, OVERVIEW_ROUTE);
  return result;
}

export async function addSourceToWatchlistAction(
  sourceId: string,
  watchlistId: string,
) {
  const result = await addSourceToWatchlist(sourceId, watchlistId);
  if (result.ok) revalidate(SOURCES_ROUTE, WATCHLISTS_ROUTE);
  return result;
}

/** Run a single capture against a source (researcher+) and persist the result. */
export async function runSourceCaptureAction(
  sourceId: string,
): Promise<DbResult<IntakeOutcome>> {
  const result = await runSourceIntake(sourceId);
  if (result.ok) {
    revalidate(
      SOURCES_ROUTE,
      `${SOURCES_ROUTE}/${sourceId}`,
      SIGNALS_ROUTE,
      ALERTS_ROUTE,
      OVERVIEW_ROUTE,
    );
  }
  return result;
}

// =============================================================================
// SIGNALS
// =============================================================================

export async function listSignalsAction(filters?: SignalFilters) {
  return listSignals(filters);
}

export async function getSignalAction(id: string) {
  return getSignal(id);
}

export async function submitManualSignalAction(input: ManualSignalInput) {
  const result = await submitManualSignal(input);
  if (result.ok) {
    revalidate(SIGNALS_ROUTE, OVERVIEW_ROUTE);
    // Phase 36 — stamp the caller's current organization (tenant scoping).
    try {
      const orgId = await getCurrentOrganizationId();
      if (orgId) await createClient().from('hsin_signals').update({ organization_id: orgId }).eq('id', result.data.id);
    } catch { /* best-effort; RLS keeps null = global */ }
    // Phase 26 — additive, best-effort contributor award (idempotent + audited).
    if (result.data.created_by) {
      await recordContribution({ event: 'SIGNAL_SUBMITTED', actorId: result.data.created_by, refKind: 'signal', refId: result.data.id, reason: 'Signal submitted.' });
    }
  }
  return result;
}

export async function reviewSignalAction(
  signalId: string,
  decision: HsinSignalDecision,
  notes?: string,
) {
  const result = await reviewSignal(signalId, decision, notes);
  if (result.ok) {
    revalidate(SIGNALS_ROUTE, `${SIGNALS_ROUTE}/${signalId}`, ALERTS_ROUTE, OVERVIEW_ROUTE);
  }
  return result;
}

/**
 * SIGNAL → RESEARCH (the key feature). researcher+.
 *
 * 1. load the signal (RLS-scoped);
 * 2. derive a concept string from title + summary (+ category);
 * 3. createResearchRun(concept, title) — runs the research engine + auto
 *    evidence + consensus (Phase 3-5);
 * 4. UPDATE research_runs SET origin_signal_id = signalId for the new run;
 * 5. record a 'research_created' signal event + a 'research_created' alert and
 *    move the signal to status 'reviewing';
 * 6. return { runId }.
 *
 * This is the single auditable place the Source→Signal→…→Research handoff
 * happens. NEVER throws (returns DbResult).
 */
export async function createResearchFromSignalAction(
  signalId: string,
): Promise<DbResult<{ runId: string }>> {
  try {
    const client = createClient();

    // Authn/role: research creation requires researcher+. createResearchRun also
    // checks auth, but we gate here to return a clean FORBIDDEN/AUTH_REQUIRED.
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { ok: false, error: 'Sign in to continue.', code: 'AUTH_REQUIRED' };

    // 1. Load the signal.
    const { data: signalRow, error: sigErr } = await client
      .from('hsin_signals')
      .select('id, title, summary, signal_category, raw_content')
      .eq('id', signalId)
      .maybeSingle();
    if (sigErr) return { ok: false, error: sigErr.message, code: 'DB_ERROR' };
    if (!signalRow) {
      return { ok: false, error: 'Signal not found or not visible.', code: 'DB_ERROR' };
    }

    const title = (signalRow.title as string) ?? 'Captured signal';
    const summary = (signalRow.summary as string | undefined) ?? '';
    const category = (signalRow.signal_category as string | undefined) ?? '';

    // 2. Derive a concept string. Keep it factual + bounded; the research engine
    //    parses it deterministically.
    const conceptParts = [
      title,
      summary,
      category ? `Category: ${category}.` : '',
    ].filter(Boolean);
    const concept = conceptParts.join(' ').slice(0, 2000);

    // 3. Run research (engine + auto evidence + consensus). This stamps
    //    created_by = auth.uid() and returns the new run id.
    const runResult = await createResearchRun(concept, `Signal: ${title}`.slice(0, 80));
    if (!runResult.ok) {
      // Surface the underlying DbResult (AUTH_REQUIRED / NOT_CONFIGURED / DB_ERROR).
      return runResult;
    }
    const { runId } = runResult.data;

    // 4. Link the run back to the originating signal.
    const { error: linkErr } = await client
      .from('research_runs')
      .update({ origin_signal_id: signalId })
      .eq('id', runId);
    if (linkErr) return { ok: false, error: linkErr.message, code: 'DB_ERROR' };

    // 5. Move the signal to 'reviewing' + record provenance + a research_created
    //    alert (best-effort — the run already exists and is linked).
    await client
      .from('hsin_signals')
      .update({ status: 'reviewing' })
      .eq('id', signalId)
      .then(() => undefined, () => undefined);
    await client
      .from('hsin_signal_events')
      .insert({
        signal_id: signalId,
        event_type: 'research_created',
        event_payload: { run_id: runId, by: user.id },
      })
      .then(() => undefined, () => undefined);
    await client
      .from('hsin_signal_alerts')
      .insert({
        signal_id: signalId,
        alert_type: 'research_created',
        severity: 'MEDIUM',
        title: 'Research run created from signal',
        explanation:
          `A research run (${runId}) was created from this signal and linked via ` +
          `origin_signal_id. It ran the multi-agent research engine with automatic ` +
          `evidence gathering and consensus — pending human review before publication.`,
        status: 'open',
      })
      .then(() => undefined, () => undefined);

    revalidate(
      SIGNALS_ROUTE,
      `${SIGNALS_ROUTE}/${signalId}`,
      ALERTS_ROUTE,
      OVERVIEW_ROUTE,
      '/research',
      `/research/${runId}`,
    );

    return { ok: true, data: { runId } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: 'DB_ERROR',
    };
  }
}

// =============================================================================
// WATCHLISTS
// =============================================================================

export async function listWatchlistsAction() {
  return listWatchlists();
}

export async function createWatchlistAction(input: CreateWatchlistInput) {
  const result = await createWatchlist(input);
  if (result.ok) revalidate(WATCHLISTS_ROUTE);
  return result;
}

export async function addWatchlistSourceAction(
  watchlistId: string,
  sourceId: string,
) {
  const result = await addWatchlistSource(watchlistId, sourceId);
  if (result.ok) revalidate(WATCHLISTS_ROUTE, SOURCES_ROUTE);
  return result;
}

// =============================================================================
// ALERTS
// =============================================================================

export async function listAlertsAction(filters?: AlertFilters) {
  return listAlerts(filters);
}

export async function acknowledgeAlertAction(id: string) {
  const result = await acknowledgeAlert(id);
  if (result.ok) revalidate(ALERTS_ROUTE, OVERVIEW_ROUTE);
  return result;
}

export async function escalateAlertAction(id: string) {
  const result = await escalateAlert(id);
  if (result.ok) revalidate(ALERTS_ROUTE, OVERVIEW_ROUTE);
  return result;
}

// =============================================================================
// INTELLIGENCE OVERVIEW
// =============================================================================

export async function getIntelligenceOverviewAction() {
  return getIntelligenceOverview();
}

// =============================================================================
// RE-EXPORTS for the UI — DbResult + Phase-7 view-model / record types.
// (Type re-exports are erased at compile time; safe in a 'use server' module.)
// =============================================================================
export type { DbResult, DbResultCode } from './persistence';
export type {
  SourceFilters,
  SignalFilters,
  AlertFilters,
  CreateSourceInput,
  UpdateSourcePatch,
  CreateWatchlistInput,
  ManualSignalInput,
  SourceDetail,
  SignalDetail,
  AlertWithContext,
} from './persistence';
export type { IntakeOutcome } from './pipeline';
export type {
  HsinSourceRecord,
  HsinSignalRecord,
  HsinSignalAlertRecord,
  HsinWatchlistRecord,
  HsinSourceHealthRecord,
  HsinCaptureJobRecord,
  HsinNarrativeDriftRecord,
  HsinSignalDecision,
  HsinAlertType,
  HsinAlertSeverity,
  HsinAlertStatus,
  HsinSourceType,
  HsinSignalType,
  HsinSignalCategory,
  HsinSignalStatus,
  SourceWithStats,
  SignalWithContext,
  IntelligenceOverview,
} from '@hsi/shared-types';
