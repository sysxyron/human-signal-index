// =============================================================================
// apps/worker/jobs — classificationWorkerJob (WorldForge/HSI Phase 8)
//
// Classifies UNCLASSIFIED signals semantically via the PURE
// classifySignalSemantic (@hsi/source-intelligence Phase 8). It ALWAYS runs the
// deterministic lexical classifier and, WHEN an `embed` fn is injected, enriches
// with embedding-based ranking — degrading gracefully to lexical if embeddings
// are unavailable (never throws). Output: category + confidence + rationale,
// persisted via an INJECTED persister (default: log only).
//
// Signals are loaded via an INJECTED loader (default no-op → empty offline run).
// PRESERVE UNCERTAINTY: ambiguous signals stay 'other' at low confidence — the
// engine never forces a category. NEVER throws.
//
// SCHEDULING: cron '*/15 * * * *' via an external scheduler; in live production
// classification is typically driven by the queue (classify jobs) instead.
// =============================================================================

import {
  classifySignalSemantic,
  type SemanticClassification,
  type SemanticDeps,
} from '@hsi/source-intelligence';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/** A signal awaiting classification. */
export interface SemanticClassifiableSignal {
  id: string;
  title: string;
  bodyText?: string;
  sourceType?: string;
  extraCategories?: string[];
}

/** The persisted classification for one signal. */
export interface ClassificationRecord {
  signalId: string;
  category: string;
  confidence: number;
  rationale: string;
  matchedTerms: string[];
}

/** Loads unclassified signals (default: none — safe no-op). */
export type LoadSemanticSignals = (
  ctx: JobContext,
) => Promise<SemanticClassifiableSignal[]>;

/** Persists one signal's classification (default no-op). */
export type PersistSemanticClassification = (
  record: ClassificationRecord,
) => Promise<void>;

const defaultLoad: LoadSemanticSignals = async () => [];
const defaultPersist: PersistSemanticClassification = async () => {};

export function makeClassificationWorkerJob(
  load: LoadSemanticSignals = defaultLoad,
  persist: PersistSemanticClassification = defaultPersist,
  /** Optional embedder for semantic enrichment; omit → deterministic lexical. */
  deps: SemanticDeps = {},
): Job {
  return {
    name: 'classificationWorker',
    description:
      'Classifies unclassified signals semantically (lexical + optional embeddings).',
    schedule: '*/15 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;

      let signals: SemanticClassifiableSignal[] = [];
      try {
        signals = await load(ctx);
      } catch (e) {
        logger.warn('job.classificationWorker.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
        signals = [];
      }

      const declaredInputs = {
        signalCount: signals.length,
        semanticEnabled: Boolean(deps.embed),
        runAt: now,
      };
      logger.info('job.classificationWorker.start', { declaredInputs });

      let classified = 0;
      let uncertain = 0;
      let failed = 0;
      const byCategory: Record<string, number> = {};

      for (const signal of signals) {
        try {
          const result: SemanticClassification = await classifySignalSemantic(
            {
              title: signal.title,
              bodyText: signal.bodyText,
              sourceType: signal.sourceType,
              extraCategories: signal.extraCategories,
            },
            { ...deps, now },
          );

          const record: ClassificationRecord = {
            signalId: signal.id,
            category: result.category,
            confidence: result.confidence,
            rationale: result.rationale,
            matchedTerms: result.matchedTerms,
          };
          await persist(record).catch((e) =>
            logger.warn('job.classificationWorker.persistFailed', {
              signalId: signal.id,
              error: e instanceof Error ? e.message : String(e),
            }),
          );

          classified += 1;
          if (result.category === 'other') uncertain += 1;
          byCategory[result.category] = (byCategory[result.category] ?? 0) + 1;

          logger.info('job.classificationWorker.classified', {
            signalId: signal.id,
            category: result.category,
            confidence: result.confidence,
          });
        } catch (e) {
          failed += 1;
          logger.warn('job.classificationWorker.signalFailed', {
            signalId: signal.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      logger.info('job.classificationWorker.done', {
        classified,
        uncertain,
        failed,
        byCategory,
      });

      return {
        job: 'classificationWorker',
        ok: true,
        declaredInputs,
        summary: { classified, uncertain, failed, byCategory },
      };
    },
  };
}

export const classificationWorkerJob = makeClassificationWorkerJob();
