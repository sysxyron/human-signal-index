// =============================================================================
// apps/worker/jobs — classifyJob
// Runs the explainable rhetoric classifier + 1-5 risk model over captured
// public content. Loading/persisting injected. Logs declared inputs.
// =============================================================================

import { analyzeText } from '@hsi/classifiers';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

export interface ClassifiableItem {
  signalId: string;
  hashDigest: string;
  content: string;
}

export type LoadUnclassified = (ctx: JobContext) => Promise<ClassifiableItem[]>;
export type PersistClassification = (
  signalId: string,
  result: ReturnType<typeof analyzeText>,
) => Promise<void>;

const defaultLoad: LoadUnclassified = async () => [];
const defaultPersist: PersistClassification = async () => {};

export function makeClassifyJob(
  load: LoadUnclassified = defaultLoad,
  persist: PersistClassification = defaultPersist,
): Job {
  return {
    name: 'classify',
    description: 'Runs explainable rhetoric classification + 1-5 risk scoring.',
    schedule: '*/15 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const items = await load(ctx);
      const declaredInputs = { itemCount: items.length, runAt: ctx.runAt };
      logger.info('job.classify.start', { declaredInputs });

      let processed = 0;
      let urgent = 0;
      for (const item of items) {
        const result = analyzeText(item.content);
        if (result.risk.level >= 4) urgent += 1;
        await persist(item.signalId, result);
        processed += 1;
        logger.info('job.classify.item', {
          signalId: item.signalId,
          hashDigest: item.hashDigest,
          topCategory: result.rhetoric.classifications[0]?.slug ?? null,
          riskLevel: result.risk.level,
        });
      }

      logger.info('job.classify.done', { processed, urgent });
      return { job: 'classify', ok: true, declaredInputs, summary: { processed, urgent } };
    },
  };
}

export const classifyJob = makeClassifyJob();
