// =============================================================================
// HSIN Phase 8 — END-TO-END capture + triage orchestration (SERVER-ONLY).
//
// runScheduledCapture(sourceId) is the full Phase-8 pipeline that the scheduler /
// worker drives (and that an operator can run on demand via the action). It:
//   1. loads the hsin_source (RLS-scoped);
//   2. runs the PURE '@hsi/source-intelligence' intake pipeline (fixture default,
//      live only when allowed);
//   3. DEDUPES via hsin_capture_dedupes (the scheduler DedupeStore) — a duplicate
//      capture is recorded but NOT re-persisted as a new signal;
//   4. persists the signal (reusing the Phase-7 signals DAL: hsin_signals +
//      immutable version + provenance event), classifies it semantically and
//      stores category/confidence, and contributes to the narrative/entity graph;
//   5. detects narrative drift (Phase 7);
//   6. evaluates TRIAGE rules (evaluateTriage) and AUTO-ROUTES each emitted
//      action — create_alert / submit_review / assign_sla /
//      request_research_review / draft_research — writing an audit_logs row for
//      every automated action.
//
// HONESTY (binding): nothing is auto-published. Captured signals enter status
// 'new'. Triage actions are DRAFTS/requests for human review. A research draft is
// ONLY created when SIGNAL_AUTO_CREATE_RESEARCH_DRAFTS === 'true', and even then
// the run is created at draft + linked back to the signal — never published.
//
// NEVER throws — every path returns a DbResult / structured outcome.
// =============================================================================

import {
  buildNarrativeGraph,
  captureViaProvider,
  classifySignalSemantic,
  computeSlaDeadlines,
  DEFAULT_SLA_POLICIES,
  DEFAULT_TRIAGE_RULES,
  detectNarrativeDrift,
  evaluateTriage,
  extractEntities,
  FixtureCaptureProvider,
  makeProviderRunLog,
  runIntakePipeline,
  type IntakePipelineOptions,
  type ProviderDeps,
  type ProviderResult,
  type ProviderRouteInput,
  type SlaPolicy,
  type SlaSeverity,
  type SourceInput,
  type TriageContext,
  type TriageOutcome,
  type TriageRule,
} from '@hsi/source-intelligence';
import { dedupeKey } from '@hsi/scheduler';
import type { HsinSourceRecord } from '@hsi/shared-types';
import { createResearchRun } from '@/lib/worldforge/research-persistence';
import { getIntelligenceConfig } from '@/lib/signals/config';
import {
  persistAlerts,
  persistDrift,
  persistSignalFromDraft,
  signalsDbClient,
  touchSourceChecked,
  updateSourceHealth,
  type DbResult,
} from '@/lib/signals/persistence';
import {
  createSupabaseDedupeStore,
} from './queue-store';
import {
  consumeRateLimit,
  providerCredentials,
  recordProviderRunLog,
} from './providers';

// -----------------------------------------------------------------------------
// Outcome of one end-to-end scheduled capture.
// -----------------------------------------------------------------------------
export interface ScheduledCaptureOutcome {
  signalId?: string;
  deduped: boolean;
  alerts: number;
  triage?: TriageOutcome;
  reviewQueued: boolean;
  researchDraftId?: string;
  mode: 'fixture' | 'live';
}

/** Map a persisted hsin_source row to the engine's SourceInput shape. */
function toSourceInput(row: HsinSourceRecord): SourceInput & { id: string } {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sourceType: row.source_type,
    platform: row.platform,
    homepageUrl: row.homepage_url,
    rssUrl: row.rss_url,
    riskLevel:
      typeof row.risk_level === 'number' ? row.risk_level / 5 : undefined,
  };
}

/** Read the auto-research-draft flag from env (default false). */
function autoCreateResearchDrafts(): boolean {
  const v = process.env.SIGNAL_AUTO_CREATE_RESEARCH_DRAFTS;
  return typeof v === 'string' && v.trim().toLowerCase() === 'true';
}

/** Pick the SLA policy for a severity (engine defaults). */
function slaPolicyFor(severity: SlaSeverity): SlaPolicy {
  return (
    DEFAULT_SLA_POLICIES.find((p) => p.severity === severity) ??
    DEFAULT_SLA_POLICIES[DEFAULT_SLA_POLICIES.length - 1]
  );
}

type JsonRecord = Record<string, unknown>;

/** Engine AlertType union (DRAFT alerts). Triage may emit any of these. */
type AlertType =
  | 'new_signal'
  | 'source_changed'
  | 'narrative_shift'
  | 'watchlist_match'
  | 'high_risk_signal'
  | 'review_escalation'
  | 'research_created'
  | 'publication_created';

/** Coerce a triage-emitted alertType param to a valid engine AlertType. */
function asAlertType(t: string | undefined): AlertType {
  const allowed: AlertType[] = [
    'new_signal',
    'source_changed',
    'narrative_shift',
    'watchlist_match',
    'high_risk_signal',
    'review_escalation',
    'research_created',
    'publication_created',
  ];
  return t && (allowed as string[]).includes(t)
    ? (t as AlertType)
    : 'high_risk_signal';
}

/** Coerce a severity string to the engine AlertSeverity union. */
function asSeverity(s: string | undefined): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  return s === 'LOW' || s === 'MEDIUM' || s === 'HIGH' || s === 'CRITICAL'
    ? s
    : 'MEDIUM';
}

/** Write a best-effort audit_logs row for an automated pipeline action. */
async function audit(
  client: ReturnType<typeof signalsDbClient>,
  userId: string | null,
  action: string,
  metadata: JsonRecord,
): Promise<void> {
  try {
    await client
      .from('audit_logs')
      .insert({ user_id: userId, action, metadata });
  } catch {
    // best-effort — audit failure never blocks the pipeline.
  }
}

// -----------------------------------------------------------------------------
// Phase-9 live provider probe — outcome of attempting a real provider adapter
// capture for observability + rate-limit accounting + health on 'blocked'.
// -----------------------------------------------------------------------------
interface ProviderProbeOutcome {
  /** True when the source had a usable provider input (a probe was attempted). */
  attempted: boolean;
  /** The provider failure reason, when the probe failed. */
  reason?: string;
  /** True when the website provider declined with 'blocked' (anti-bot/challenge). */
  blocked: boolean;
}

/** Map a source's stored fields to the provider router input. */
function toProviderRouteInput(source: HsinSourceRecord): ProviderRouteInput {
  const url = source.rss_url ?? source.homepage_url ?? undefined;
  return { url, feedUrl: source.rss_url ?? undefined };
}

/**
 * Attempt a REAL provider-adapter capture (Phase 9) for observability. Records a
 * hsin_provider_runs row for the attempt and consumes the provider's rate-limit
 * budget. The intake pipeline still produces the persisted signal draft; this
 * probe exists to log provider outcomes, account for rate limits, and surface a
 * 'blocked' website so the caller can degrade (not fail) source health. NEVER
 * throws — any error degrades to attempted:false.
 */
async function probeProviderCapture(
  client: ReturnType<typeof signalsDbClient>,
  source: HsinSourceRecord,
  now: string,
): Promise<ProviderProbeOutcome> {
  try {
    const sourceType = String(source.source_type);
    const route = toProviderRouteInput(source);
    const needsUrl = sourceType === 'rss' || sourceType === 'website';
    if (needsUrl && !route.url) return { attempted: false, blocked: false };

    const startedAt = now;
    const deps: ProviderDeps = {
      now,
      fetchImpl: (globalThis as { fetch?: typeof fetch }).fetch,
    };
    const result: ProviderResult<unknown> = await captureViaProvider(
      sourceType,
      route,
      deps,
      providerCredentials(),
    );
    const finishedAt = new Date().toISOString();

    // Record the provider run (best-effort) + consume the rate-limit budget.
    const runLog = makeProviderRunLog({
      provider: sourceType,
      sourceId: source.id,
      startedAt,
      finishedAt,
      result,
    });
    await recordProviderRunLog(client, runLog);
    await consumeRateLimit(sourceType, now);

    if (result.ok) return { attempted: true, blocked: false };
    return {
      attempted: true,
      reason: result.reason,
      blocked: sourceType === 'website' && result.reason === 'blocked',
    };
  } catch {
    return { attempted: false, blocked: false };
  }
}

/**
 * Run the full scheduled-capture + triage pipeline for one source. Reuses the
 * Phase-7 signals DAL for persistence, the scheduler DedupeStore for idempotency,
 * and the source-intelligence semantic/graph/triage/SLA engines for enrichment
 * and auto-routing.
 *
 * Phase 9: when SIGNAL_CAPTURE_MODE=live, a real provider adapter capture is
 * probed (captureViaProvider) for each capture — recording a hsin_provider_runs
 * row, consuming the provider rate limit, and degrading (not failing) source
 * health when a website is 'blocked'. Fixtures remain the offline default.
 *
 * NEVER throws.
 */
export async function runScheduledCapture(
  sourceId: string,
  now: string = new Date().toISOString(),
): Promise<DbResult<ScheduledCaptureOutcome>> {
  try {
    const client = signalsDbClient();
    const config = getIntelligenceConfig();
    const dedupeStore = createSupabaseDedupeStore(client);

    // Resolve the acting user (for audit attribution). Anonymous → null.
    const {
      data: { user },
    } = await client.auth.getUser();
    const userId = user?.id ?? null;

    // 1. Load the source (RLS-scoped).
    const { data: sourceRow, error: srcErr } = await client
      .from('hsin_sources')
      .select('*')
      .eq('id', sourceId)
      .maybeSingle();
    if (srcErr) return { ok: false, error: srcErr.message, code: 'DB_ERROR' };
    if (!sourceRow) {
      return {
        ok: false,
        error: 'Source not found or not visible.',
        code: 'DB_ERROR',
      };
    }
    const source = sourceRow as HsinSourceRecord;
    const sourceInput = toSourceInput(source);

    // Load the prior capture for change/drift comparison.
    let priorBodyText: string | undefined;
    {
      const { data: latestSignal } = await client
        .from('hsin_signals')
        .select('raw_content')
        .eq('source_id', sourceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      priorBodyText =
        (latestSignal?.raw_content as string | undefined) ?? undefined;
    }

    // 2. Decide capture mode + run the PURE intake engine (never throws).
    const hasUrl = Boolean(source.homepage_url || source.rss_url);
    const live = config.liveCaptureAllowed && hasUrl;
    const mode: 'fixture' | 'live' = live ? 'live' : 'fixture';

    // 2a. Phase-9: in live mode, probe a real provider adapter for observability +
    //     rate-limit accounting. A 'blocked' website degrades health (not fail).
    let providerBlocked = false;
    if (live) {
      const probe = await probeProviderCapture(client, source, now);
      providerBlocked = probe.blocked;
      if (providerBlocked) {
        await updateSourceHealth(client, sourceId, {
          status: 'degraded',
          lastFailure: now,
          failureCount: 1,
        });
        await audit(client, userId, 'hsin_provider_blocked', {
          source_id: sourceId,
          provider: String(source.source_type),
          reason: probe.reason ?? 'blocked',
        });
      }
    }

    const options: IntakePipelineOptions = {
      prior: priorBodyText
        ? { bodyText: priorBodyText, capturedAt: now, contentHash: '' }
        : null,
    };
    if (!live) {
      options.extraProviders = [
        new FixtureCaptureProvider(String(source.source_type)),
      ];
    }
    const result = await runIntakePipeline(sourceInput, options, now);

    if (!result.capture.ok || !result.signalDraft) {
      // A 'blocked' website is a DEGRADED (transient/anti-bot) state, not a hard
      // error — keep the source degraded rather than error so it isn't disabled.
      await updateSourceHealth(client, sourceId, {
        status: providerBlocked ? 'degraded' : 'error',
        lastFailure: now,
        failureCount: 1,
      });
      await touchSourceChecked(client, sourceId, false, now);
      return {
        ok: true,
        data: { deduped: false, alerts: 0, reviewQueued: false, mode },
      };
    }
    const draft = result.signalDraft;

    // 3. Dedupe via hsin_capture_dedupes (scheduler DedupeStore). A duplicate is
    //    recorded (last_seen_at touched) but NOT re-persisted.
    const contentHash = draft.contentHash ?? '';
    const url = source.homepage_url ?? source.rss_url ?? undefined;
    const key = dedupeKey(sourceId, contentHash, url);
    const existingDedupe = contentHash ? await dedupeStore.seen(key) : null;

    if (existingDedupe) {
      await dedupeStore.remember(key, now, existingDedupe.signalId);
      await touchSourceChecked(client, sourceId, false, now);
      await audit(client, userId, 'hsin_capture_deduped', {
        source_id: sourceId,
        content_hash: contentHash,
        first_seen_at: existingDedupe.firstSeenAt,
      });
      return {
        ok: true,
        data: {
          signalId: existingDedupe.signalId,
          deduped: true,
          alerts: 0,
          reviewQueued: false,
          mode,
        },
      };
    }

    // 4. Persist the signal (reuse the Phase-7 DAL — signal + version + event).
    const persisted = await persistSignalFromDraft(
      client,
      draft,
      sourceId,
      userId ?? undefined,
    );
    const signalId = persisted?.signalId;
    const deduped = persisted?.deduped ?? false;

    // Remember the dedupe key now that we have a signal id.
    if (contentHash) {
      await dedupeStore.remember(key, now, signalId);
    }

    // 4b. Semantic classification → store category/confidence on the signal +
    //     a provenance event (best-effort; honesty: stays at status 'new').
    let semanticCategory: string | undefined;
    let semanticConfidence: number | undefined;
    if (signalId) {
      try {
        const semantic = await classifySignalSemantic(
          {
            title: draft.title,
            bodyText: draft.rawContent,
            sourceType: String(source.source_type),
          },
          { now },
        );
        semanticCategory = semantic.category;
        semanticConfidence = semantic.confidence;
        await client
          .from('hsin_signals')
          .update({
            signal_category: semantic.category,
            confidence: semantic.confidence,
          })
          .eq('id', signalId)
          .then(() => undefined, () => undefined);
        await client
          .from('hsin_signal_events')
          .insert({
            signal_id: signalId,
            event_type: 'classified',
            event_payload: {
              category: semantic.category,
              confidence: semantic.confidence,
              rationale: semantic.rationale,
            },
          })
          .then(() => undefined, () => undefined);
      } catch {
        // semantic enrichment is best-effort.
      }
    }

    // 4c. Narrative-graph contribution: build a small graph for this signal,
    //     persist entities + a signal<->entity link. (A full multi-signal graph
    //     is built by buildNarrativeGraphAction; here we extract this signal's
    //     entities so the graph stays current per-capture.)
    if (signalId) {
      try {
        const entities = extractEntities(
          `${draft.title}\n${draft.rawContent ?? ''}`,
        );
        for (const e of entities.slice(0, 25)) {
          const { data: existing } = await client
            .from('hsin_entities')
            .select('id')
            .eq('name', e.name)
            .eq('entity_type', e.entityType)
            .maybeSingle();
          let entityId = existing?.id as string | undefined;
          if (!entityId) {
            const { data: inserted } = await client
              .from('hsin_entities')
              .insert({
                name: e.name,
                entity_type: e.entityType,
                description: e.evidenceText ?? null,
              })
              .select('id')
              .single();
            entityId = inserted?.id as string | undefined;
          }
          if (entityId) {
            await client
              .from('hsin_signal_entities')
              .insert({
                signal_id: signalId,
                entity_id: entityId,
                confidence: e.confidence,
                evidence_text: e.evidenceText ?? null,
              })
              .then(() => undefined, () => undefined);
          }
        }
      } catch {
        // graph contribution is best-effort.
      }
    }

    // 4d. Persist the engine's own draft alerts (explainable).
    let alerts = 0;
    if (result.alerts.length > 0) {
      alerts += await persistAlerts(client, result.alerts, {
        signalId,
        sourceId,
      });
    }

    // 5. Narrative drift (Phase 7) vs the prior capture body.
    let driftSeverity = 0;
    if (priorBodyText && result.capture.doc?.bodyText) {
      const detected = detectNarrativeDrift(
        priorBodyText,
        result.capture.doc.bodyText,
        now,
      );
      if (detected) {
        driftSeverity = detected.driftScore;
        await persistDrift(client, detected, sourceId, signalId);
      }
    }

    // Source recent-failure count (for the triage source_failures fact).
    let sourceFailureCount = 0;
    {
      const { data: healthRows } = await client
        .from('hsin_source_health')
        .select('status')
        .eq('source_id', sourceId)
        .order('created_at', { ascending: false })
        .limit(5);
      for (const h of (healthRows ?? []) as Array<{ status?: string }>) {
        if (h.status === 'error') sourceFailureCount += 1;
        else break; // count only the consecutive recent failures
      }
    }

    // 6. Evaluate TRIAGE and AUTO-ROUTE each emitted action.
    const triageCtx: TriageContext = {
      riskLevel:
        typeof source.risk_level === 'number'
          ? source.risk_level / 5
          : undefined,
      driftSeverity,
      watchlistMatches: result.matches.map((m) => m.watchlistName),
      sourceFailureCount,
      category: semanticCategory ?? draft.signalCategory,
      confidence: semanticConfidence ?? draft.confidence,
      signalId,
      sourceId,
    };
    const rules: TriageRule[] = DEFAULT_TRIAGE_RULES;
    const triage = evaluateTriage(triageCtx, rules);

    let reviewQueued = false;
    let researchDraftId: string | undefined;

    for (const action of triage.actions) {
      const params = (action.params ?? {}) as JsonRecord;
      switch (action.type) {
        case 'create_alert': {
          const severity = asSeverity(params.severity as string | undefined);
          const alertType = asAlertType(params.alertType as string | undefined);
          await persistAlerts(
            client,
            [
              {
                signalId,
                sourceId,
                alertType,
                severity,
                title: `Triage: ${alertType}`,
                explanation: action.rationale,
                createdAt: now,
              },
            ],
            { signalId, sourceId },
          );
          alerts += 1;
          await audit(client, userId, 'hsin_triage_create_alert', {
            signal_id: signalId,
            source_id: sourceId,
            alert_type: alertType,
            rationale: action.rationale,
          });
          break;
        }

        case 'submit_review': {
          if (signalId) {
            const priority =
              (params.priority as string | undefined) ?? 'medium';
            await client
              .from('review_queues')
              .insert({
                entity_type: 'signal',
                entity_id: signalId,
                status: 'under_review',
                priority:
                  priority === 'low' ||
                  priority === 'medium' ||
                  priority === 'high' ||
                  priority === 'urgent'
                    ? priority
                    : 'medium',
                created_by: userId,
              })
              .then(() => undefined, () => undefined);
            reviewQueued = true;
            await audit(client, userId, 'hsin_triage_submit_review', {
              signal_id: signalId,
              priority,
              rationale: action.rationale,
            });
          }
          break;
        }

        case 'assign_sla': {
          if (signalId) {
            const sev = (params.severity as SlaSeverity | undefined) ?? 'MEDIUM';
            const policy = slaPolicyFor(sev);
            const deadlines = computeSlaDeadlines(policy, now);
            await client
              .from('hsin_signal_events')
              .insert({
                signal_id: signalId,
                event_type: 'sla_assigned',
                event_payload: {
                  severity: sev,
                  policy: policy.name,
                  review_deadline: deadlines.reviewDeadline,
                  escalation_deadline: deadlines.escalationDeadline,
                  rationale: action.rationale,
                },
              })
              .then(() => undefined, () => undefined);
            await audit(client, userId, 'hsin_triage_assign_sla', {
              signal_id: signalId,
              severity: sev,
              review_deadline: deadlines.reviewDeadline,
              escalation_deadline: deadlines.escalationDeadline,
            });
          }
          break;
        }

        case 'request_research_review':
        case 'draft_research': {
          // Auto research-draft creation is GATED behind the env flag and NEVER
          // publishes. request_research_review always at least queues a review.
          if (signalId && autoCreateResearchDrafts() && !researchDraftId) {
            const concept = [
              draft.title,
              draft.summary ?? draft.rawContent ?? '',
              semanticCategory ? `Category: ${semanticCategory}.` : '',
            ]
              .filter(Boolean)
              .join(' ')
              .slice(0, 2000);
            const runResult = await createResearchRun(
              concept,
              `Signal: ${draft.title}`.slice(0, 80),
            );
            if (runResult.ok) {
              researchDraftId = runResult.data.runId;
              await client
                .from('research_runs')
                .update({ origin_signal_id: signalId })
                .eq('id', researchDraftId)
                .then(() => undefined, () => undefined);
              await client
                .from('hsin_signal_events')
                .insert({
                  signal_id: signalId,
                  event_type: 'research_created',
                  event_payload: {
                    run_id: researchDraftId,
                    auto: true,
                    rationale: action.rationale,
                  },
                })
                .then(() => undefined, () => undefined);
              await audit(client, userId, 'hsin_triage_draft_research', {
                signal_id: signalId,
                run_id: researchDraftId,
                rationale: action.rationale,
              });
            }
          } else if (signalId) {
            // No auto-draft: surface a research-review request in the queue.
            await client
              .from('review_queues')
              .insert({
                entity_type: 'signal',
                entity_id: signalId,
                status: 'needs_evidence',
                priority: 'high',
                created_by: userId,
              })
              .then(() => undefined, () => undefined);
            reviewQueued = true;
            await audit(client, userId, 'hsin_triage_request_research_review', {
              signal_id: signalId,
              rationale: action.rationale,
            });
          }
          break;
        }

        case 'degrade_source_health': {
          await updateSourceHealth(client, sourceId, {
            status: 'degraded',
            lastFailure: now,
            failureCount: sourceFailureCount,
          });
          await audit(client, userId, 'hsin_triage_degrade_source_health', {
            source_id: sourceId,
            rationale: action.rationale,
          });
          break;
        }

        default:
          break;
      }
    }

    // Health + provenance: success observation + touch source.
    await updateSourceHealth(client, sourceId, {
      status: 'ok',
      lastSuccess: now,
      failureCount: 0,
    });
    const changed = Boolean(result.change && result.change.changed);
    await touchSourceChecked(client, sourceId, changed, now);

    return {
      ok: true,
      data: {
        signalId,
        deduped,
        alerts,
        triage,
        reviewQueued,
        researchDraftId,
        mode,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: 'DB_ERROR',
    };
  }
}

/**
 * Re-evaluate triage for an already-persisted signal and auto-route the actions,
 * WITHOUT re-capturing. Used by applyTriageToSignal(action). Loads the signal +
 * its source, builds a TriageContext from stored facts, evaluates the rules, and
 * routes alerts / reviews / SLAs (research drafts gated by the env flag). NEVER
 * throws. Returns the structured outcome (a subset of ScheduledCaptureOutcome).
 */
export async function processSignalTriage(
  signalId: string,
  now: string = new Date().toISOString(),
): Promise<
  DbResult<{
    triage: TriageOutcome;
    alerts: number;
    reviewQueued: boolean;
    researchDraftId?: string;
  }>
> {
  try {
    const client = signalsDbClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    const userId = user?.id ?? null;

    // Load the signal.
    const { data: signalRow, error } = await client
      .from('hsin_signals')
      .select(
        'id, source_id, title, summary, raw_content, signal_category, confidence',
      )
      .eq('id', signalId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message, code: 'DB_ERROR' };
    if (!signalRow) {
      return {
        ok: false,
        error: 'Signal not found or not visible.',
        code: 'DB_ERROR',
      };
    }

    const sourceId = (signalRow.source_id as string | undefined) ?? undefined;

    // Source risk + recent failures + latest drift for the triage facts.
    let riskLevel: number | undefined;
    let sourceFailureCount = 0;
    if (sourceId) {
      const { data: src } = await client
        .from('hsin_sources')
        .select('risk_level')
        .eq('id', sourceId)
        .maybeSingle();
      const rl = src?.risk_level as number | undefined;
      riskLevel = typeof rl === 'number' ? rl / 5 : undefined;

      const { data: healthRows } = await client
        .from('hsin_source_health')
        .select('status')
        .eq('source_id', sourceId)
        .order('created_at', { ascending: false })
        .limit(5);
      for (const h of (healthRows ?? []) as Array<{ status?: string }>) {
        if (h.status === 'error') sourceFailureCount += 1;
        else break;
      }
    }

    let driftSeverity = 0;
    {
      const { data: driftRow } = await client
        .from('hsin_narrative_drift')
        .select('drift_score')
        .eq('signal_id', signalId)
        .order('detected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const ds = driftRow?.drift_score as number | undefined;
      if (typeof ds === 'number') driftSeverity = ds;
    }

    const triageCtx: TriageContext = {
      riskLevel,
      driftSeverity,
      sourceFailureCount,
      category: (signalRow.signal_category as string | undefined) ?? undefined,
      confidence: (signalRow.confidence as number | undefined) ?? undefined,
      signalId,
      sourceId,
    };
    const triage = evaluateTriage(triageCtx, DEFAULT_TRIAGE_RULES);

    let alerts = 0;
    let reviewQueued = false;
    let researchDraftId: string | undefined;
    const title = (signalRow.title as string | undefined) ?? 'Signal';

    for (const action of triage.actions) {
      const params = (action.params ?? {}) as JsonRecord;
      switch (action.type) {
        case 'create_alert': {
          const severity = asSeverity(params.severity as string | undefined);
          const alertType = asAlertType(params.alertType as string | undefined);
          await persistAlerts(
            client,
            [
              {
                signalId,
                sourceId,
                alertType,
                severity,
                title: `Triage: ${alertType}`,
                explanation: action.rationale,
                createdAt: now,
              },
            ],
            { signalId, sourceId },
          );
          alerts += 1;
          await audit(client, userId, 'hsin_triage_create_alert', {
            signal_id: signalId,
            alert_type: alertType,
            rationale: action.rationale,
          });
          break;
        }
        case 'submit_review': {
          await client
            .from('review_queues')
            .insert({
              entity_type: 'signal',
              entity_id: signalId,
              status: 'under_review',
              priority: (params.priority as string | undefined) ?? 'medium',
              created_by: userId,
            })
            .then(() => undefined, () => undefined);
          reviewQueued = true;
          await audit(client, userId, 'hsin_triage_submit_review', {
            signal_id: signalId,
            rationale: action.rationale,
          });
          break;
        }
        case 'assign_sla': {
          const sev = (params.severity as SlaSeverity | undefined) ?? 'MEDIUM';
          const policy = slaPolicyFor(sev);
          const deadlines = computeSlaDeadlines(policy, now);
          await client
            .from('hsin_signal_events')
            .insert({
              signal_id: signalId,
              event_type: 'sla_assigned',
              event_payload: {
                severity: sev,
                policy: policy.name,
                review_deadline: deadlines.reviewDeadline,
                escalation_deadline: deadlines.escalationDeadline,
                rationale: action.rationale,
              },
            })
            .then(() => undefined, () => undefined);
          await audit(client, userId, 'hsin_triage_assign_sla', {
            signal_id: signalId,
            severity: sev,
          });
          break;
        }
        case 'request_research_review':
        case 'draft_research': {
          if (autoCreateResearchDrafts() && !researchDraftId) {
            const concept = [
              title,
              (signalRow.summary as string | undefined) ??
                (signalRow.raw_content as string | undefined) ??
                '',
            ]
              .filter(Boolean)
              .join(' ')
              .slice(0, 2000);
            const runResult = await createResearchRun(
              concept,
              `Signal: ${title}`.slice(0, 80),
            );
            if (runResult.ok) {
              researchDraftId = runResult.data.runId;
              await client
                .from('research_runs')
                .update({ origin_signal_id: signalId })
                .eq('id', researchDraftId)
                .then(() => undefined, () => undefined);
              await audit(client, userId, 'hsin_triage_draft_research', {
                signal_id: signalId,
                run_id: researchDraftId,
              });
            }
          } else {
            await client
              .from('review_queues')
              .insert({
                entity_type: 'signal',
                entity_id: signalId,
                status: 'needs_evidence',
                priority: 'high',
                created_by: userId,
              })
              .then(() => undefined, () => undefined);
            reviewQueued = true;
            await audit(client, userId, 'hsin_triage_request_research_review', {
              signal_id: signalId,
            });
          }
          break;
        }
        case 'degrade_source_health': {
          if (sourceId) {
            await updateSourceHealth(client, sourceId, {
              status: 'degraded',
              lastFailure: now,
              failureCount: sourceFailureCount,
            });
          }
          break;
        }
        default:
          break;
      }
    }

    return { ok: true, data: { triage, alerts, reviewQueued, researchDraftId } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: 'DB_ERROR',
    };
  }
}
