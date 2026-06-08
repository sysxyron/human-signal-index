// =============================================================================
// apps/worker/jobs — alertWorkerJob (WorldForge/HSI Phase 8)
//
// The Phase-8 queue-driven alert generator. For each recent signal it runs the
// PURE matchWatchlists + generateAlerts (@hsi/source-intelligence), optionally
// folding in a detected drift event, and emits explainable AlertDrafts. EVERY
// alert carries an `explanation` (binding principle) and is a DRAFT for the
// review pipeline — NEVER auto-published or auto-actioned.
//
// This COMPLEMENTS the Phase-7 alertGeneratorJob by accepting drift context per
// signal (narrative_shift alerts). Inputs (signals, watchlists, drift) are
// INJECTED via a loader (default no-op → empty offline run); alerts are
// persisted via an INJECTED persister (default: log only). NEVER throws.
//
// SCHEDULING: cron '*/10 * * * *' via an external scheduler; in live production
// alerts are typically driven by the queue (alert jobs) instead.
// =============================================================================

import {
  DEFAULT_WATCHLISTS,
  generateAlerts,
  matchWatchlists,
  type AlertDraft,
  type NarrativeDriftEvent,
  type SignalDraft,
  type WatchlistDef,
} from '@hsi/source-intelligence';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/** A recent signal to evaluate for alerts (carries optional drift context). */
export interface AlertableSignal extends SignalDraft {
  id?: string;
  /** Optional drift detected for this signal's narrative (→ narrative_shift). */
  drift?: NarrativeDriftEvent;
}

/** The inputs for one alert pass (signals + custom watchlists). */
export interface AlertWorkerInputs {
  signals: AlertableSignal[];
  /** Extra watchlists ANDed with DEFAULT_WATCHLISTS (default: none). */
  watchlists?: WatchlistDef[];
}

/** Loads recent signals + watchlists (default: empty — safe no-op). */
export type LoadAlertInputs = (ctx: JobContext) => Promise<AlertWorkerInputs>;

/** Persists generated alert drafts for one signal (default no-op). */
export type PersistGeneratedAlerts = (
  signal: AlertableSignal,
  alerts: AlertDraft[],
) => Promise<void>;

const defaultLoad: LoadAlertInputs = async () => ({ signals: [] });
const defaultPersist: PersistGeneratedAlerts = async () => {};

export function makeAlertWorkerJob(
  load: LoadAlertInputs = defaultLoad,
  persist: PersistGeneratedAlerts = defaultPersist,
): Job {
  return {
    name: 'alertWorker',
    description:
      'Generates explainable alert drafts from recent signals, drift + watchlist matches.',
    schedule: '*/10 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;

      let inputs: AlertWorkerInputs = { signals: [] };
      try {
        inputs = await load(ctx);
      } catch (e) {
        logger.warn('job.alertWorker.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
        inputs = { signals: [] };
      }

      const watchlists: WatchlistDef[] = [
        ...DEFAULT_WATCHLISTS,
        ...(inputs.watchlists ?? []),
      ];
      const signals = inputs.signals ?? [];

      const declaredInputs = {
        signalCount: signals.length,
        watchlistCount: watchlists.length,
        runAt: now,
      };
      logger.info('job.alertWorker.start', { declaredInputs });

      let alertsGenerated = 0;
      let matchedSignals = 0;
      let failed = 0;
      const byType: Record<string, number> = {};

      for (const signal of signals) {
        try {
          const matches = matchWatchlists(
            {
              title: signal.title,
              summary: signal.summary,
              rawContent: signal.rawContent,
              category: signal.signalCategory,
            },
            watchlists,
          );
          const alerts = generateAlerts({
            signal,
            drift: signal.drift,
            watchlistMatches: matches,
            signalId: signal.id,
            sourceId: signal.sourceId,
            now,
          });

          if (matches.length > 0) matchedSignals += 1;
          if (alerts.length > 0) {
            await persist(signal, alerts).catch((e) =>
              logger.warn('job.alertWorker.persistFailed', {
                signalId: signal.id,
                error: e instanceof Error ? e.message : String(e),
              }),
            );
            alertsGenerated += alerts.length;
            for (const a of alerts) byType[a.alertType] = (byType[a.alertType] ?? 0) + 1;
            // Every alert is explainable — log the explanation for traceability.
            for (const a of alerts) {
              logger.info('job.alertWorker.alert', {
                signalId: signal.id,
                alertType: a.alertType,
                severity: a.severity,
                explanation: a.explanation,
              });
            }
          }
        } catch (e) {
          failed += 1;
          logger.warn('job.alertWorker.signalFailed', {
            signalId: signal.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      logger.info('job.alertWorker.done', {
        alertsGenerated,
        matchedSignals,
        failed,
        byType,
      });

      return {
        job: 'alertWorker',
        ok: true,
        declaredInputs,
        summary: { alertsGenerated, matchedSignals, failed, byType },
      };
    },
  };
}

export const alertWorkerJob = makeAlertWorkerJob();
