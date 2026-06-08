// =============================================================================
// apps/worker/jobs — sourceMonitorJob (HSIN Phase 7)
//
// For monitored hsin_sources (website / document / forum / platform), runs the
// PURE '@hsi/source-intelligence' intake pipeline (capture → change → classify →
// watchlists → alerts) and persists the result. Loaders/persisters are INJECTED
// (default no-ops) so the job runs DB-free offline and is testable. Fixture mode
// by default (offline, deterministic); live only when configured + a URL exists.
//
// PROVENANCE: each captured signal carries its draft snapshot; the persister is
// expected to write the capture job + version + events. HONESTY: signals enter
// as drafts ('new') — NEVER auto-published. NEVER throws.
//
// SCHEDULING: declares a daily cron ('0 6 * * *'); an EXTERNAL scheduler (Vercel
// Cron / system cron, guarded by CRON_SECRET) invokes it. Per-source cadence
// (daily vs hourly) is honored via the source's `cadence` hint when provided.
// =============================================================================

import {
  FixtureCaptureProvider,
  runIntakePipeline,
  type IntakePipelineResult,
  type SourceInput,
} from '@hsi/source-intelligence';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/** Minimal monitored-source shape this job needs (mirrors hsin_sources). */
export interface MonitorableSource {
  id: string;
  name: string;
  sourceType: string;
  homepageUrl?: string;
  rssUrl?: string;
  description?: string;
  platform?: string;
  riskLevel?: number;
  /** Polling cadence hint; 'hourly' sources are due more often. */
  cadence?: 'hourly' | 'daily';
  lastCheckedAt?: string;
}

/** The persisted outcome of one source intake (handed to the persister). */
export interface SourceIntakeRecord {
  sourceId: string;
  ok: boolean;
  changed: boolean;
  signalCaptured: boolean;
  alertCount: number;
  isFixture: boolean;
  error?: string;
}

/** Loads monitored sources to check (default: none — safe no-op). */
export type LoadMonitorableSources = (
  ctx: JobContext,
) => Promise<MonitorableSource[]>;

/** Persists one source's intake result (capture job + signal + alerts). Default no-op. */
export type PersistSourceIntake = (
  source: MonitorableSource,
  result: IntakePipelineResult,
  record: SourceIntakeRecord,
) => Promise<void>;

const defaultLoad: LoadMonitorableSources = async () => [];
const defaultPersist: PersistSourceIntake = async () => {};

/** True when live capture is permitted by the worker env. */
function liveCaptureAllowed(): boolean {
  return process.env.SIGNAL_CAPTURE_MODE === 'live';
}

/** Whether a source is due this run given its cadence + last-checked time. */
function isDue(source: MonitorableSource, runAt: string): boolean {
  if (!source.lastCheckedAt) return true;
  const ageMs = Date.parse(runAt) - Date.parse(source.lastCheckedAt);
  const window = source.cadence === 'hourly' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return ageMs >= window;
}

function toSourceInput(s: MonitorableSource): SourceInput & { id: string } {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    sourceType: s.sourceType,
    platform: s.platform,
    homepageUrl: s.homepageUrl,
    rssUrl: s.rssUrl,
    riskLevel: s.riskLevel,
  };
}

export function makeSourceMonitorJob(
  load: LoadMonitorableSources = defaultLoad,
  persist: PersistSourceIntake = defaultPersist,
): Job {
  return {
    name: 'sourceMonitor',
    description:
      'Captures monitored HSIN sources, detects change, classifies + alerts (drafts only).',
    schedule: '0 6 * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;
      const live = liveCaptureAllowed();

      let sources: MonitorableSource[] = [];
      try {
        sources = await load(ctx);
      } catch (e) {
        logger.warn('job.sourceMonitor.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
        sources = [];
      }

      // Non-RSS sources are monitored here (RSS handled by rssMonitorJob).
      const due = sources.filter(
        (s) => s.sourceType !== 'rss' && s.sourceType !== 'podcast' && isDue(s, now),
      );

      const declaredInputs = {
        sourceCount: sources.length,
        dueCount: due.length,
        mode: live ? 'live' : 'fixture',
        runAt: now,
      };
      logger.info('job.sourceMonitor.start', { declaredInputs });

      let captured = 0;
      let changed = 0;
      let alerts = 0;
      let failed = 0;

      for (const source of due) {
        try {
          const options = live
            ? {}
            : { extraProviders: [new FixtureCaptureProvider(source.sourceType)] };
          const result = await runIntakePipeline(toSourceInput(source), options, now);

          const record: SourceIntakeRecord = {
            sourceId: source.id,
            ok: result.capture.ok,
            changed: Boolean(result.change?.changed),
            signalCaptured: Boolean(result.signalDraft),
            alertCount: result.alerts.length,
            isFixture: Boolean(result.capture.isFixture),
            error: result.capture.ok ? undefined : result.capture.error,
          };

          await persist(source, result, record).catch((e) =>
            logger.warn('job.sourceMonitor.persistFailed', {
              sourceId: source.id,
              error: e instanceof Error ? e.message : String(e),
            }),
          );

          if (result.signalDraft) captured += 1;
          if (record.changed) changed += 1;
          alerts += result.alerts.length;
          if (!result.capture.ok) failed += 1;

          logger.info('job.sourceMonitor.source', {
            sourceId: source.id,
            ok: result.capture.ok,
            changeType: result.change?.changeType,
            alerts: result.alerts.length,
            isFixture: record.isFixture,
          });
        } catch (e) {
          // A single source failing must not fail the job.
          failed += 1;
          logger.warn('job.sourceMonitor.sourceFailed', {
            sourceId: source.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      logger.info('job.sourceMonitor.done', { captured, changed, alerts, failed });

      return {
        job: 'sourceMonitor',
        ok: true,
        declaredInputs,
        summary: { captured, changed, alerts, failed },
      };
    },
  };
}

export const sourceMonitorJob = makeSourceMonitorJob();
