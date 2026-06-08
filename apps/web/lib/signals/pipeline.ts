// =============================================================================
// HSIN Phase 7 — capture pipeline (SERVER-ONLY).
//
// runSourceIntake(sourceId) loads a monitored hsin_source, runs the PURE
// '@hsi/source-intelligence' intake pipeline (capture → change → classify →
// watchlists → alerts), and persists the result (capture job + signal/version +
// alerts + narrative drift + source health + last_checked/last_changed) through
// the same cookie-backed, RLS-enforced client.
//
// MODES:
//   * fixture (default / empty env): the engine runs OFFLINE using the
//     FixtureCaptureProvider — no network. Deterministic.
//   * live: only when getIntelligenceConfig().liveCaptureAllowed AND the source
//     has a usable URL. Even then, the engine's public-only capture policy gates
//     every capture.
//
// HONESTY (binding): every persisted signal enters at status 'new'. Nothing is
// auto-published or auto-actioned. Alerts are explainable DRAFTS. NEVER throws.
// =============================================================================

import {
  FixtureCaptureProvider,
  runIntakePipeline,
  type CapturedDoc,
  type ChangeResult,
  type IntakePipelineOptions,
  type NarrativeDriftEvent,
  type SourceInput,
} from '@hsi/source-intelligence';
import type { HsinSourceRecord } from '@hsi/shared-types';
import { getIntelligenceConfig } from './config';
import {
  persistAlerts,
  persistDrift,
  persistSignalFromDraft,
  recordCaptureJob,
  signalsDbClient,
  touchSourceChecked,
  updateSourceHealth,
  type DbResult,
} from './persistence';

/** Outcome of one source intake run. */
export interface IntakeOutcome {
  signalId?: string;
  change: ChangeResult | null;
  alertsPersisted: number;
  drift?: NarrativeDriftEvent;
  mode: 'fixture' | 'live';
  deduped?: boolean;
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

/**
 * Run the intake pipeline for one source and persist everything. Loads the prior
 * capture from the source's most recent signal version (for change/drift), runs
 * the engine, then persists provenance + signal + alerts + drift + health.
 */
export async function runSourceIntake(
  sourceId: string,
  now: string = new Date().toISOString(),
): Promise<DbResult<IntakeOutcome>> {
  try {
    const client = signalsDbClient();
    const config = getIntelligenceConfig();

    // Load the source (RLS-scoped read).
    const { data: sourceRow, error: srcErr } = await client
      .from('hsin_sources')
      .select('*')
      .eq('id', sourceId)
      .maybeSingle();
    if (srcErr) return { ok: false, error: srcErr.message, code: 'DB_ERROR' };
    if (!sourceRow) {
      return { ok: false, error: 'Source not found or not visible.', code: 'DB_ERROR' };
    }
    const source = sourceRow as HsinSourceRecord;
    const sourceInput = toSourceInput(source);

    // Open a capture job (provenance) — running.
    const startedAt = now;
    const jobId = await recordCaptureJob(client, sourceId, {
      status: 'running',
      startedAt,
    });

    // Load the prior capture (latest signal version snapshot) for this source so
    // change-detection + drift have a "before" to compare against.
    let prior: CapturedDoc | string | null = null;
    let priorBodyText: string | undefined;
    {
      const { data: latestSignal } = await client
        .from('hsin_signals')
        .select('id, content_hash, raw_content')
        .eq('source_id', sourceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestSignal) {
        priorBodyText =
          (latestSignal.raw_content as string | undefined) ?? undefined;
        if (priorBodyText) {
          prior = {
            bodyText: priorBodyText,
            capturedAt: now,
            contentHash:
              (latestSignal.content_hash as string | undefined) ?? '',
          };
        }
      }
    }

    // Decide capture mode. Fixture mode (default) injects the offline provider
    // matching the source type; live mode only when allowed AND a URL exists.
    const hasUrl = Boolean(source.homepage_url || source.rss_url);
    const live = config.liveCaptureAllowed && hasUrl;
    const mode: 'fixture' | 'live' = live ? 'live' : 'fixture';

    const options: IntakePipelineOptions = {
      prior,
    };
    if (!live) {
      // Offline: serve fixtures keyed by URL (works for the demo sources / docs).
      options.extraProviders = [
        new FixtureCaptureProvider(String(source.source_type)),
      ];
    }

    // Run the PURE engine (never throws — failures surface in result.capture).
    const result = await runIntakePipeline(sourceInput, options, now);

    if (!result.capture.ok || !result.signalDraft) {
      // Capture failed — record the failed job + a failure health observation.
      if (jobId) {
        await recordCaptureJob(client, sourceId, {
          status: 'failed',
          startedAt,
          finishedAt: now,
          errorMessage: result.capture.error ?? 'capture failed',
        });
      }
      await updateSourceHealth(client, sourceId, {
        status: 'error',
        lastFailure: now,
        failureCount: 1,
      });
      await touchSourceChecked(client, sourceId, false, now);
      return {
        ok: true,
        data: {
          change: result.change,
          alertsPersisted: 0,
          mode,
        },
      };
    }

    // Persist the signal (dedupe by content hash → new version on re-observe).
    const persisted = await persistSignalFromDraft(
      client,
      result.signalDraft,
      sourceId,
    );
    const signalId = persisted?.signalId;
    const deduped = persisted?.deduped ?? false;

    // Persist alerts (linked to the new/updated signal + source).
    let alertsPersisted = 0;
    if (result.alerts.length > 0) {
      alertsPersisted = await persistAlerts(client, result.alerts, {
        signalId,
        sourceId,
      });
    }

    // Narrative drift: compare prior body text to the new capture body.
    let drift: NarrativeDriftEvent | undefined;
    if (priorBodyText && result.capture.doc?.bodyText) {
      const { detectNarrativeDrift } = await import('@hsi/source-intelligence');
      const detected = detectNarrativeDrift(
        priorBodyText,
        result.capture.doc.bodyText,
        now,
      );
      if (detected) {
        drift = detected;
        await persistDrift(client, detected, sourceId, signalId);
        // A narrative shift is materially important — raise a HIGH alert.
        await persistAlerts(
          client,
          [
            {
              signalId,
              sourceId,
              alertType: 'narrative_shift',
              severity: 'HIGH',
              title: 'Narrative shift detected',
              explanation: `${detected.explanation} Confidence ${detected.confidence}. Draft only — pending human review.`,
              createdAt: now,
            },
          ],
          { signalId, sourceId },
        );
        alertsPersisted += 1;
      }
    }

    // Health + provenance: success observation + close the job + touch source.
    await updateSourceHealth(client, sourceId, {
      status: 'ok',
      lastSuccess: now,
      failureCount: 0,
    });
    if (jobId) {
      await recordCaptureJob(client, sourceId, {
        status: 'success',
        startedAt,
        finishedAt: now,
      });
    }
    const changed = Boolean(result.change && result.change.changed);
    await touchSourceChecked(client, sourceId, changed, now);

    return {
      ok: true,
      data: {
        signalId,
        change: result.change,
        alertsPersisted,
        drift,
        mode,
        deduped,
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
