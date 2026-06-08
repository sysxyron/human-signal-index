// =============================================================================
// apps/worker/jobs — captureWorkerJob (WorldForge/HSI Phase 8)
//
// Captures a batch of sources via the PURE @hsi/source-intelligence intake
// pipeline (runIntakePipeline: capture → change → classify → watchlists →
// alerts), DE-DUPLICATES each capture against the DedupeStore (idempotent —
// hsin_capture_dedupes when live, in-memory offline), then emits a signal DRAFT
// + explainable alerts via an INJECTED persister (default: log only).
//
// Sources are loaded via an INJECTED loader; the DEFAULT loader returns the
// offline DEMO_SOURCES so an offline run produces deterministic drafts using the
// FixtureCaptureProvider (NO network). Live capture is used only when
// SIGNAL_CAPTURE_MODE==='live'.
//
// PROVENANCE: each draft carries its contentHash + capturedAt; the dedupe key is
// (sourceId, contentHash, canonicalUrl). HONESTY: drafts are 'new' — NEVER
// auto-published; alerts are explainable. NEVER throws (per-source try/catch;
// pipeline errors surface in `capture`).
//
// SCHEDULING: cron '0 */2 * * *' (every 2h) via an external scheduler; in live
// production capture is typically driven by the queue (capture jobs) instead.
// =============================================================================

import {
  DEMO_SOURCES,
  FixtureCaptureProvider,
  runIntakePipeline,
  type AlertDraft,
  type IntakePipelineResult,
  type SignalDraft,
  type SourceInput,
} from '@hsi/source-intelligence';
import { dedupeKey, type DedupeStore } from '@hsi/scheduler';
import { logger } from '../src/logger';
import { readPhase8Config } from '../lib/config';
import { createWorkerDedupeStore } from '../lib/queue-store';
import type { Job, JobContext, JobResult } from './types';

/** A source to capture (carries its id for provenance/dedup scoping). */
export type CaptureableSource = SourceInput & { id: string };

/** The persisted outcome of one capture (handed to the persister). */
export interface CaptureRecord {
  sourceId: string;
  ok: boolean;
  duplicate: boolean;
  signalCaptured: boolean;
  alertCount: number;
  isFixture: boolean;
  error?: string;
}

/** Loads sources to capture (default: offline DEMO_SOURCES). */
export type LoadCaptureSources = (ctx: JobContext) => Promise<CaptureableSource[]>;

/** Persists a captured signal draft + its alerts (default: log only). */
export type PersistCaptureWorker = (
  source: CaptureableSource,
  result: IntakePipelineResult,
  record: CaptureRecord,
) => Promise<void>;

const defaultLoad: LoadCaptureSources = async () =>
  DEMO_SOURCES as CaptureableSource[];
const defaultPersist: PersistCaptureWorker = async () => {};

export function makeCaptureWorkerJob(
  load: LoadCaptureSources = defaultLoad,
  persist: PersistCaptureWorker = defaultPersist,
  dedupeFactory: () => DedupeStore = createWorkerDedupeStore,
): Job {
  return {
    name: 'captureWorker',
    description:
      'Captures a batch of PUBLIC sources, de-dupes, emits signal drafts + explainable alerts.',
    schedule: '0 */2 * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;
      const cfg = readPhase8Config();
      const live = cfg.captureMode === 'live';

      let sources: CaptureableSource[] = [];
      try {
        sources = await load(ctx);
      } catch (e) {
        logger.warn('job.captureWorker.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
        sources = [];
      }

      const declaredInputs = {
        sourceCount: sources.length,
        mode: live ? 'live' : 'fixture',
        userAgent: cfg.captureUserAgent,
        timeoutMs: cfg.captureTimeoutMs,
        maxBytes: cfg.captureMaxBytes,
        runAt: now,
      };
      logger.info('job.captureWorker.start', { declaredInputs });

      const dedupe = dedupeFactory();
      let captured = 0;
      let duplicates = 0;
      let alerts = 0;
      let failed = 0;

      for (const source of sources) {
        try {
          // Offline → inject the fixture provider for this source type.
          const options = live
            ? {}
            : { extraProviders: [new FixtureCaptureProvider(source.sourceType)] };
          const result = await runIntakePipeline(source, options, now);

          if (!result.capture.ok || !result.signalDraft) {
            failed += 1;
            const record: CaptureRecord = {
              sourceId: source.id,
              ok: false,
              duplicate: false,
              signalCaptured: false,
              alertCount: 0,
              isFixture: Boolean(result.capture.isFixture),
              error: result.capture.error ?? 'no signal produced',
            };
            await persist(source, result, record).catch(() => {});
            logger.warn('job.captureWorker.captureFailed', {
              sourceId: source.id,
              error: record.error,
            });
            continue;
          }

          const draft: SignalDraft = result.signalDraft;
          const canonicalUrl = result.capture.doc?.canonicalUrl;

          // De-dupe against the store BEFORE persisting (idempotent capture).
          const key = dedupeKey(source.id, draft.contentHash, canonicalUrl);
          const existing = await safeSeen(dedupe, key);
          const isDuplicate = existing !== null;
          await safeRemember(dedupe, key, now);

          const alertDrafts: AlertDraft[] = result.alerts;
          const record: CaptureRecord = {
            sourceId: source.id,
            ok: true,
            duplicate: isDuplicate,
            signalCaptured: !isDuplicate,
            alertCount: isDuplicate ? 0 : alertDrafts.length,
            isFixture: Boolean(result.capture.isFixture),
          };

          if (isDuplicate) {
            duplicates += 1;
            logger.info('job.captureWorker.duplicate', {
              sourceId: source.id,
              contentHash: draft.contentHash,
              firstSeenAt: existing?.firstSeenAt,
            });
          } else {
            captured += 1;
            alerts += alertDrafts.length;
            await persist(source, result, record).catch((e) =>
              logger.warn('job.captureWorker.persistFailed', {
                sourceId: source.id,
                error: e instanceof Error ? e.message : String(e),
              }),
            );
            logger.info('job.captureWorker.captured', {
              sourceId: source.id,
              category: draft.signalCategory,
              confidence: draft.confidence,
              alerts: alertDrafts.length,
              isFixture: record.isFixture,
            });
          }
        } catch (e) {
          failed += 1;
          logger.warn('job.captureWorker.sourceFailed', {
            sourceId: source.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      logger.info('job.captureWorker.done', {
        captured,
        duplicates,
        alerts,
        failed,
      });

      return {
        job: 'captureWorker',
        ok: true,
        declaredInputs,
        summary: { captured, duplicates, alerts, failed },
      };
    },
  };
}

async function safeSeen(store: DedupeStore, key: string) {
  try {
    return await store.seen(key);
  } catch {
    return null;
  }
}

async function safeRemember(store: DedupeStore, key: string, now: string) {
  try {
    await store.remember(key, now);
  } catch {
    /* dedupe bookkeeping is best-effort */
  }
}

export const captureWorkerJob = makeCaptureWorkerJob();
