// =============================================================================
// apps/worker/jobs — driftWorkerJob (WorldForge/HSI Phase 8)
//
// The Phase-8 queue-driven drift detector. Over recent signal snapshots (an
// ORDERED before/after timeline per narrative/source), it runs the PURE
// detectNarrativeDrift / trackNarrative (@hsi/source-intelligence) and emits
// drift events, each carrying an explanation + confidence + driftScore.
//
// This COMPLEMENTS the Phase-7 driftDetectorJob (pairwise before/after); here we
// accept timelines (>=2 snapshots) and walk consecutive pairs. Snapshots are
// loaded via an INJECTED loader (default no-op → empty offline run); events are
// persisted via an INJECTED persister (default: log only).
//
// PURE + deterministic (callers inject `now`/snapshot timestamps). NEVER throws.
// SCHEDULING: cron '0 */6 * * *' via an external scheduler; in live production
// drift is typically driven by the queue (drift jobs) instead.
// =============================================================================

import {
  detectNarrativeDrift,
  trackNarrative,
  type NarrativeDriftEvent,
} from '@hsi/source-intelligence';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/** An ordered timeline of narrative snapshots for one source/narrative. */
export interface NarrativeTimeline {
  sourceId: string;
  narrativeId?: string;
  /** Ordered oldest → newest; each snapshot's `at` becomes the detectedAt. */
  snapshots: { text: string; at: string }[];
}

/** A persisted drift result (drift row + narrative_shift alert). */
export interface DriftEventRecord {
  sourceId: string;
  narrativeId?: string;
  event: NarrativeDriftEvent;
}

/** Loads narrative timelines to test for drift (default: none — safe no-op). */
export type LoadNarrativeTimelines = (
  ctx: JobContext,
) => Promise<NarrativeTimeline[]>;

/** Persists a detected drift event + its alert (default no-op). */
export type PersistDriftEvent = (record: DriftEventRecord) => Promise<void>;

const defaultLoad: LoadNarrativeTimelines = async () => [];
const defaultPersist: PersistDriftEvent = async () => {};

export function makeDriftWorkerJob(
  load: LoadNarrativeTimelines = defaultLoad,
  persist: PersistDriftEvent = defaultPersist,
): Job {
  return {
    name: 'driftWorker',
    description:
      'Detects narrative drift across ordered recent signal snapshots (timelines).',
    schedule: '0 */6 * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;

      let timelines: NarrativeTimeline[] = [];
      try {
        timelines = await load(ctx);
      } catch (e) {
        logger.warn('job.driftWorker.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
        timelines = [];
      }

      const declaredInputs = {
        timelineCount: timelines.length,
        snapshotCount: timelines.reduce((n, t) => n + t.snapshots.length, 0),
        runAt: now,
      };
      logger.info('job.driftWorker.start', { declaredInputs });

      let driftsFound = 0;
      let noDrift = 0;
      let failed = 0;

      for (const timeline of timelines) {
        try {
          const snaps = timeline.snapshots ?? [];
          if (snaps.length < 2) {
            noDrift += 1;
            continue;
          }
          // Walk consecutive pairs across the timeline.
          const events = trackNarrative(snaps);
          if (events.length === 0) {
            // Confirm with a single head/tail comparison for clarity in logs.
            const single = detectNarrativeDrift(
              snaps[0].text,
              snaps[snaps.length - 1].text,
              now,
            );
            if (!single) {
              noDrift += 1;
              continue;
            }
            events.push(single);
          }

          for (const event of events) {
            await persist({
              sourceId: timeline.sourceId,
              narrativeId: timeline.narrativeId,
              event,
            }).catch((e) =>
              logger.warn('job.driftWorker.persistFailed', {
                sourceId: timeline.sourceId,
                error: e instanceof Error ? e.message : String(e),
              }),
            );
            driftsFound += 1;
            logger.info('job.driftWorker.drift', {
              sourceId: timeline.sourceId,
              narrativeId: timeline.narrativeId,
              driftScore: event.driftScore,
              confidence: event.confidence,
            });
          }
        } catch (e) {
          failed += 1;
          logger.warn('job.driftWorker.timelineFailed', {
            sourceId: timeline.sourceId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      logger.info('job.driftWorker.done', { driftsFound, noDrift, failed });

      return {
        job: 'driftWorker',
        ok: true,
        declaredInputs,
        summary: { driftsFound, noDrift, failed },
      };
    },
  };
}

export const driftWorkerJob = makeDriftWorkerJob();
