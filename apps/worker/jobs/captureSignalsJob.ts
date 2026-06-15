// =============================================================================
// apps/worker/jobs — captureSignalsJob
// Runs the appropriate PUBLIC-ONLY connector for each due source and produces
// normalized CapturedSource evidence (with hash + capture timestamp). Persisting
// is injected (DB owned by another agent). Logs declared inputs.
// =============================================================================

import { getConnector, type CapturedSource, type ConnectorKind } from '@hsi/source-connectors';
import { connectorForSourceType, isSourceType } from '@hsi/source-collectors';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

export interface CaptureTarget {
  sourceId: string;
  url: string;
  /** Explicit connector, OR derive it from `sourceType` (Phase 40 routing). */
  connector?: ConnectorKind;
  /** Phase 40 — the source type; routed to a connector when `connector` is absent. */
  sourceType?: string;
}

/** Resolve the capture connector for a target (explicit wins; else by source type). */
export function resolveTargetConnector(target: CaptureTarget): ConnectorKind | null {
  if (target.connector) return target.connector;
  if (target.sourceType && isSourceType(target.sourceType)) return connectorForSourceType(target.sourceType);
  return null;
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
          const kind = resolveTargetConnector(t);
          if (!kind) {
            skipped += 1;
            logger.warn('job.captureSignals.unsupported', { sourceId: t.sourceId, url: t.url, sourceType: t.sourceType });
            continue;
          }
          const connector = getConnector(kind);
          const capture = await connector.capture(t.url, ctx.runAt);
          if (!capture) {
            skipped += 1;
            logger.warn('job.captureSignals.skip', { sourceId: t.sourceId, url: t.url, connector: kind });
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
