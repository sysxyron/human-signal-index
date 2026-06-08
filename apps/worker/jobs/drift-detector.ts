// =============================================================================
// apps/worker/jobs — driftDetectorJob (HSIN Phase 7)
//
// Detects NARRATIVE DRIFT by comparing the latest vs the prior snapshot of a
// source/signal narrative (detectNarrativeDrift). Loads candidate snapshot pairs
// (INJECTED loader; default no-op), runs the PURE detector, and persists each
// detected drift event + a 'narrative_shift' alert via an INJECTED persister
// (default no-op).
//
// PURE + deterministic (callers inject `now`). NEVER throws.
// SCHEDULING: every 6 hours ('0 */6 * * *') via an external scheduler.
// =============================================================================

import {
  detectNarrativeDrift,
  type NarrativeDriftEvent,
} from '@hsi/source-intelligence';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/**
 * A before/after narrative snapshot pair to test for drift. `sourceId` is
 * required (the drift is attributed to a source); `signalId` optionally links the
 * latest signal that carries the "after" text.
 */
export interface DriftCandidate {
  sourceId: string;
  signalId?: string;
  beforeText: string;
  afterText: string;
}

/** A persisted drift result (handed to the persister: drift row + alert). */
export interface DriftRecord {
  sourceId: string;
  signalId?: string;
  event: NarrativeDriftEvent;
}

/** Loads candidate snapshot pairs to test (default: none). */
export type LoadDriftCandidates = (ctx: JobContext) => Promise<DriftCandidate[]>;

/** Persists a detected drift event + its narrative_shift alert (default no-op). */
export type PersistDrift = (record: DriftRecord) => Promise<void>;

const defaultLoad: LoadDriftCandidates = async () => [];
const defaultPersist: PersistDrift = async () => {};

export function makeDriftDetectorJob(
  load: LoadDriftCandidates = defaultLoad,
  persist: PersistDrift = defaultPersist,
): Job {
  return {
    name: 'driftDetector',
    description:
      'Detects narrative drift between consecutive source/signal snapshots.',
    schedule: '0 */6 * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;

      let candidates: DriftCandidate[] = [];
      try {
        candidates = await load(ctx);
      } catch (e) {
        logger.warn('job.driftDetector.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
        candidates = [];
      }

      const declaredInputs = { candidateCount: candidates.length, runAt: now };
      logger.info('job.driftDetector.start', { declaredInputs });

      let driftsFound = 0;
      let noDrift = 0;
      let failed = 0;

      for (const candidate of candidates) {
        try {
          const event = detectNarrativeDrift(
            candidate.beforeText,
            candidate.afterText,
            now,
          );
          if (!event) {
            noDrift += 1;
            continue;
          }
          await persist({
            sourceId: candidate.sourceId,
            signalId: candidate.signalId,
            event,
          }).catch((e) =>
            logger.warn('job.driftDetector.persistFailed', {
              sourceId: candidate.sourceId,
              error: e instanceof Error ? e.message : String(e),
            }),
          );
          driftsFound += 1;
          logger.info('job.driftDetector.drift', {
            sourceId: candidate.sourceId,
            signalId: candidate.signalId,
            driftScore: event.driftScore,
            confidence: event.confidence,
          });
        } catch (e) {
          failed += 1;
          logger.warn('job.driftDetector.candidateFailed', {
            sourceId: candidate.sourceId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      logger.info('job.driftDetector.done', { driftsFound, noDrift, failed });

      return {
        job: 'driftDetector',
        ok: true,
        declaredInputs,
        summary: { driftsFound, noDrift, failed },
      };
    },
  };
}

export const driftDetectorJob = makeDriftDetectorJob();
