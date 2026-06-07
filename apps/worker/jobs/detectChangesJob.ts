// =============================================================================
// apps/worker/jobs — detectChangesJob
// Compares the latest capture hash for each source against the previously
// recorded hash and records source_changes when they differ (e.g. new
// recruitment link, website copy change). Loading/persisting injected.
// =============================================================================

import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

export interface CaptureHashPair {
  sourceId: string;
  url: string;
  previousHash?: string;
  currentHash: string;
}

export interface DetectedChange {
  sourceId: string;
  changeType: 'new_source' | 'content_changed' | 'unchanged';
  previousHash?: string;
  currentHash: string;
}

export type LoadCaptureHashes = (ctx: JobContext) => Promise<CaptureHashPair[]>;
export type PersistSourceChange = (change: DetectedChange) => Promise<void>;

const defaultLoad: LoadCaptureHashes = async () => [];
const defaultPersist: PersistSourceChange = async () => {};

export function detectChange(pair: CaptureHashPair): DetectedChange {
  if (!pair.previousHash) {
    return { sourceId: pair.sourceId, changeType: 'new_source', currentHash: pair.currentHash };
  }
  return {
    sourceId: pair.sourceId,
    changeType: pair.previousHash === pair.currentHash ? 'unchanged' : 'content_changed',
    previousHash: pair.previousHash,
    currentHash: pair.currentHash,
  };
}

export function makeDetectChangesJob(
  load: LoadCaptureHashes = defaultLoad,
  persist: PersistSourceChange = defaultPersist,
): Job {
  return {
    name: 'detectChanges',
    description: 'Detects source content changes by comparing capture hash digests.',
    schedule: '0 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const pairs = await load(ctx);
      const declaredInputs = { sourceCount: pairs.length, runAt: ctx.runAt };
      logger.info('job.detectChanges.start', { declaredInputs });

      let changed = 0;
      for (const pair of pairs) {
        const change = detectChange(pair);
        if (change.changeType !== 'unchanged') {
          changed += 1;
          await persist(change);
          logger.info('job.detectChanges.change', {
            sourceId: change.sourceId,
            changeType: change.changeType,
            previousHash: change.previousHash,
            currentHash: change.currentHash,
          });
        }
      }

      logger.info('job.detectChanges.done', { changed });
      return { job: 'detectChanges', ok: true, declaredInputs, summary: { changed } };
    },
  };
}

export const detectChangesJob = makeDetectChangesJob();
