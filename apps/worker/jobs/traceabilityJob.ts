// =============================================================================
// apps/worker/jobs — traceabilityJob
// Builds a TraceabilityReport for AI-generated content against its declared
// source passages, and flags anything below the publish threshold. NEVER
// publishes — it only computes and records the gating decision for human review.
// =============================================================================

import {
  compareGeneratedAgainstSources,
  splitIntoPassages,
  type SourcePassage,
  type TraceabilityReport,
} from '@hsi/traceability';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

export interface TraceableItem {
  generatedContentId: string;
  generatedText: string;
  /** Declared source passages (text + optional url/evidence id). */
  sources: SourcePassage[];
}

export type LoadTraceable = (ctx: JobContext) => Promise<TraceableItem[]>;
export type PersistTraceReport = (
  generatedContentId: string,
  report: TraceabilityReport,
) => Promise<void>;

const defaultLoad: LoadTraceable = async () => [];
const defaultPersist: PersistTraceReport = async () => {};

export function makeTraceabilityJob(
  load: LoadTraceable = defaultLoad,
  persist: PersistTraceReport = defaultPersist,
): Job {
  return {
    name: 'traceability',
    description: 'Computes provenance trace reports and gates publishability.',
    schedule: '*/15 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const items = await load(ctx);
      const declaredInputs = { itemCount: items.length, runAt: ctx.runAt, threshold: ctx.config.TRACEABILITY_MIN_CONFIDENCE };
      logger.info('job.traceability.start', { declaredInputs });

      let processed = 0;
      let blocked = 0;
      for (const item of items) {
        const generated = splitIntoPassages(item.generatedText).map((text, i) => ({ id: `gen-${i}`, text }));
        const report = compareGeneratedAgainstSources(generated, item.sources, ctx.runAt, {
          thresholds: { minPublishConfidence: ctx.config.TRACEABILITY_MIN_CONFIDENCE },
        });
        if (!report.publishable) blocked += 1;
        await persist(item.generatedContentId, report);
        processed += 1;
        logger.info('job.traceability.item', {
          generatedContentId: item.generatedContentId,
          traceabilityScore: Number(report.traceabilityScore.toFixed(3)),
          flagged: report.flaggedClaims.length,
          publishable: report.publishable,
        });
      }

      logger.info('job.traceability.done', { processed, blocked });
      return { job: 'traceability', ok: true, declaredInputs, summary: { processed, blockedFromPublish: blocked } };
    },
  };
}

export const traceabilityJob = makeTraceabilityJob();
