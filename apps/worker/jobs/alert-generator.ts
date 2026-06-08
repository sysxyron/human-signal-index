// =============================================================================
// apps/worker/jobs — alertGeneratorJob (HSIN Phase 7)
//
// Scans recent hsin_signals against the DEFAULT_WATCHLISTS (plus any INJECTED
// custom watchlists), runs the PURE matchWatchlists + generateAlerts, and
// persists the resulting explainable AlertDrafts via an INJECTED persister
// (default no-op). Signals + watchlists are INJECTED (default no-op loader) so
// the job runs DB-free offline; it falls back to DEMO_SIGNALS for a deterministic
// offline smoke run.
//
// HONESTY: every alert carries an `explanation` and is a DRAFT for human review —
// a watchlist match is a topic flag, NOT an accusation. NEVER throws.
// SCHEDULING: every 10 minutes ('*/10 * * * *') via an external scheduler.
// =============================================================================

import {
  DEFAULT_WATCHLISTS,
  DEMO_SIGNALS,
  generateAlerts,
  matchWatchlists,
  type AlertDraft,
  type SignalDraft,
  type WatchlistDef,
} from '@hsi/source-intelligence';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/** A recent signal to scan (carries its persisted id for alert linkage). */
export interface ScannableSignal extends SignalDraft {
  id?: string;
}

/** Loads recent signals to scan (default: the offline DEMO_SIGNALS). */
export type LoadRecentSignals = (
  ctx: JobContext,
) => Promise<ScannableSignal[]>;

/** Loads custom watchlists to add to DEFAULT_WATCHLISTS (default: none). */
export type LoadWatchlists = (ctx: JobContext) => Promise<WatchlistDef[]>;

/** Persists the generated alert drafts (default no-op). */
export type PersistAlerts = (
  signal: ScannableSignal,
  alerts: AlertDraft[],
) => Promise<void>;

const defaultLoad: LoadRecentSignals = async () => DEMO_SIGNALS as ScannableSignal[];
const defaultLoadWatchlists: LoadWatchlists = async () => [];
const defaultPersist: PersistAlerts = async () => {};

export function makeAlertGeneratorJob(
  load: LoadRecentSignals = defaultLoad,
  loadWatchlists: LoadWatchlists = defaultLoadWatchlists,
  persist: PersistAlerts = defaultPersist,
): Job {
  return {
    name: 'alertGenerator',
    description:
      'Scans recent signals against watchlists and persists explainable alert drafts.',
    schedule: '*/10 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;

      let signals: ScannableSignal[] = [];
      let custom: WatchlistDef[] = [];
      try {
        signals = await load(ctx);
      } catch (e) {
        logger.warn('job.alertGenerator.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
        signals = [];
      }
      try {
        custom = await loadWatchlists(ctx);
      } catch (e) {
        logger.warn('job.alertGenerator.loadWatchlistsFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
        custom = [];
      }

      const watchlists: WatchlistDef[] = [...DEFAULT_WATCHLISTS, ...custom];

      const declaredInputs = {
        signalCount: signals.length,
        watchlistCount: watchlists.length,
        runAt: now,
      };
      logger.info('job.alertGenerator.start', { declaredInputs });

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
            watchlistMatches: matches,
            signalId: signal.id,
            sourceId: signal.sourceId,
            now,
          });
          if (matches.length > 0) matchedSignals += 1;
          if (alerts.length > 0) {
            await persist(signal, alerts).catch((e) =>
              logger.warn('job.alertGenerator.persistFailed', {
                signalId: signal.id,
                error: e instanceof Error ? e.message : String(e),
              }),
            );
            alertsGenerated += alerts.length;
            for (const a of alerts) byType[a.alertType] = (byType[a.alertType] ?? 0) + 1;
          }
        } catch (e) {
          failed += 1;
          logger.warn('job.alertGenerator.signalFailed', {
            signalId: signal.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      logger.info('job.alertGenerator.done', {
        alertsGenerated,
        matchedSignals,
        failed,
        byType,
      });

      return {
        job: 'alertGenerator',
        ok: true,
        declaredInputs,
        summary: { alertsGenerated, matchedSignals, failed, byType },
      };
    },
  };
}

export const alertGeneratorJob = makeAlertGeneratorJob();
