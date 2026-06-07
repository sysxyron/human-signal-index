// =============================================================================
// apps/worker/jobs — captureSignalsJob
// Runs the appropriate PUBLIC-ONLY connector for each due source and produces
// normalized CapturedSource evidence (with hash + capture timestamp). Persisting
// is injected (DB owned by another agent). Logs declared inputs.
// =============================================================================

import { getConnector, type CapturedSource, type ConnectorKind } from '@hsi/source-connectors';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

export interface CaptureTarget {
  sourceId: string;
  url: string;
  connector: ConnectorKind;
}

export type LoadCaptureTargets = (ctx: JobContext) => Promise<CaptureTarget[]>;
export type PersistCapture = (sourceId: string, capture: CapturedSource) => Promise<void>;

const defaultLoadTargets: LoadCaptureTargets = async () => [];
const defaultPersist: PersistCapture = async () => {};

export function makeCaptureSignalsJob(
  loadTargets: LoadCaptureTargets = defaultLoadTargets,
  persist: PersistCapture = defaultPersist,
): Job {
  return {
    name: 'captureSignals',
    description: 'Runs public-only connectors over due sources to capture evidence.',
    schedule: '*/30 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const targets = await loadTargets(ctx);
      const declaredInputs = { targetCount: targets.length, runAt: ctx.runAt };
      logger.info('job.captureSignals.start', { declaredInputs });

      let captured = 0;
      let skipped = 0;
      for (const t of targets) {
        try {
          const connector = getConnector(t.connector);
          const capture = await connector.capture(t.url, ctx.runAt);
          if (!capture) {
            skipped += 1;
            logger.warn('job.captureSignals.skip', { sourceId: t.sourceId, url: t.url, connector: t.connector });
            continue;
          }
          await persist(t.sourceId, capture);
          captured += 1;
          logger.info('job.captureSignals.captured', {
            sourceId: t.sourceId,
            url: capture.url,
            hashDigest: capture.hashDigest,
            capturedAt: capture.capturedAt,
          });
        } catch (err) {
          skipped += 1;
          logger.warn('job.captureSignals.error', {
            sourceId: t.sourceId,
            url: t.url,
            error: String((err as Error)?.message ?? err),
          });
        }
      }

      logger.info('job.captureSignals.done', { captured, skipped });
      return {
        job: 'captureSignals',
        ok: true,
        declaredInputs,
        summary: { captured, skipped },
      };
    },
  };
}

export const captureSignalsJob = makeCaptureSignalsJob();
