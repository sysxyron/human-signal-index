// =============================================================================
// apps/worker/jobs — signalClassifierJob (HSIN Phase 7)
//
// (Re)classifies unclassified / stale hsin_signals using the PURE deterministic
// classifySignal. Loads a batch of signals lacking a category/type (INJECTED
// loader; default no-op), classifies each, and hands the update back to an
// INJECTED persister (default no-op) which is expected to write
// signal_category / signal_type / confidence + a 'classified' event.
//
// Deterministic + offline: no model, no network. NEVER throws.
// SCHEDULING: every 15 minutes ('*/15 * * * *') via an external scheduler.
// =============================================================================

import { classifySignal, type Classification } from '@hsi/source-intelligence';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/** Minimal signal shape this job needs (mirrors hsin_signals). */
export interface ClassifiableSignal {
  id: string;
  title: string;
  rawContent?: string;
  summary?: string;
  sourceType?: string;
}

/** The classification update persisted for a signal. */
export interface SignalClassificationUpdate {
  signalId: string;
  signalType: Classification['signalType'];
  signalCategory: string;
  confidence: number;
}

/** Loads unclassified signals (default: none). */
export type LoadUnclassifiedSignals = (
  ctx: JobContext,
  batchSize: number,
) => Promise<ClassifiableSignal[]>;

/** Persists a signal's classification (default no-op). */
export type PersistSignalClassification = (
  update: SignalClassificationUpdate,
) => Promise<void>;

const defaultLoad: LoadUnclassifiedSignals = async () => [];
const defaultPersist: PersistSignalClassification = async () => {};

export const DEFAULT_CLASSIFY_BATCH_SIZE = 50;

export function makeSignalClassifierJob(
  load: LoadUnclassifiedSignals = defaultLoad,
  persist: PersistSignalClassification = defaultPersist,
): Job {
  return {
    name: 'signalClassifier',
    description:
      'Classifies unclassified HSIN signals (deterministic lexicon classifier).',
    schedule: '*/15 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const batchSize =
        (ctx.config as { SIGNAL_CLASSIFY_BATCH_SIZE?: number })
          .SIGNAL_CLASSIFY_BATCH_SIZE ?? DEFAULT_CLASSIFY_BATCH_SIZE;

      let signals: ClassifiableSignal[] = [];
      try {
        signals = await load(ctx, batchSize);
      } catch (e) {
        logger.warn('job.signalClassifier.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
        signals = [];
      }

      const declaredInputs = {
        signalCount: signals.length,
        batchSize,
        runAt: ctx.runAt,
      };
      logger.info('job.signalClassifier.start', { declaredInputs });

      let classified = 0;
      let failed = 0;
      const byCategory: Record<string, number> = {};

      for (const signal of signals) {
        try {
          const c = classifySignal({
            title: signal.title,
            bodyText: signal.rawContent ?? signal.summary,
            sourceType: signal.sourceType,
          });
          await persist({
            signalId: signal.id,
            signalType: c.signalType,
            signalCategory: c.signalCategory,
            confidence: c.confidence,
          }).catch((e) =>
            logger.warn('job.signalClassifier.persistFailed', {
              signalId: signal.id,
              error: e instanceof Error ? e.message : String(e),
            }),
          );
          classified += 1;
          byCategory[c.signalCategory] = (byCategory[c.signalCategory] ?? 0) + 1;
        } catch (e) {
          failed += 1;
          logger.warn('job.signalClassifier.signalFailed', {
            signalId: signal.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      logger.info('job.signalClassifier.done', { classified, failed, byCategory });

      return {
        job: 'signalClassifier',
        ok: true,
        declaredInputs,
        summary: { classified, failed, byCategory },
      };
    },
  };
}

export const signalClassifierJob = makeSignalClassifierJob();
