// =============================================================================
// apps/worker/jobs — captureWorkerJob (WorldForge/HSI Phase 8 → 9)
//
// Captures a batch of sources via the PURE @hsi/source-intelligence intake
// pipeline (runIntakePipeline: capture → change → classify → watchlists →
// alerts), DE-DUPLICATES each capture against the DedupeStore (idempotent —
// hsin_capture_dedupes when live, in-memory offline), then emits a signal DRAFT
// + explainable alerts via an INJECTED persister (default: log only).
//
// CAPTURE MODE:
//   * fixture (OFFLINE DEFAULT, unchanged): inject the FixtureCaptureProvider —
//     deterministic, NO network. The default loader returns DEMO_SOURCES.
//   * live (SIGNAL_CAPTURE_MODE='live'): capture via the Phase-9 PROVIDER layer
//     (`captureViaProvider(sourceType, {url,...}, deps, creds)`) — the real
//     rss/website/youtube/podcast/forum adapters, PUBLIC-ONLY, gated by
//     timeout/max-bytes/user-agent. A ProviderRunLog is recorded for EVERY live
//     capture (persisted to hsin_provider_runs via the service-role client when
//     configured, else logged). The captured item is then fed through the SAME
//     intake pipeline (via an injected adapter provider) so classify/watchlist/
//     alert behaviour is identical to fixture mode.
//
// DEGRADED RESULTS (live): a website 'blocked' (Cloudflare/Turnstile/hCaptcha)
// is treated as a NON-FATAL degraded result — we log it + flag source health,
// and NEVER capture the challenge HTML. A 'provider_not_configured' is a CLEAN
// SKIP (no keys / no public endpoint), not a failure.
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
  captureViaProvider,
  makeProviderRunLog,
  runIntakePipeline,
  type AlertDraft,
  type CaptureProvider,
  type CaptureResult,
  type CapturedItem,
  type IntakePipelineResult,
  type ProviderCredentials,
  type ProviderDeps,
  type ProviderResult,
  type ProviderRouteInput,
  type ProviderRunLog,
  type SignalDraft,
  type SourceInput,
} from '@hsi/source-intelligence';
import { dedupeKey, type DedupeStore } from '@hsi/scheduler';
import { logger } from '../src/logger';
import { readPhase8Config, type Phase8WorkerConfig } from '../lib/config';
import {
  createWorkerDedupeStore,
  recordProviderRun,
  type RecordProviderRun,
} from '../lib/queue-store';
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
  /** Phase 9: set when a live capture was served an anti-bot challenge. */
  blocked?: boolean;
  /** Phase 9: set when no live provider was configured for this source. */
  skipped?: boolean;
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

/** Build the ProviderRouteInput for a source (public ids/urls only). */
function routeInputFor(source: CaptureableSource): ProviderRouteInput {
  const url = source.rssUrl ?? source.homepageUrl;
  return {
    url,
    feedUrl: source.rssUrl,
  };
}

/** Take the first CapturedItem from a provider payload (item or item[]). */
function firstItem(data: CapturedItem | CapturedItem[]): CapturedItem | undefined {
  return Array.isArray(data) ? data[0] : data;
}

/**
 * A live CaptureProvider adapter that bridges the Phase-9 PROVIDER layer
 * (`captureViaProvider`) into the Phase-7/8 intake pipeline. It performs the
 * outbound fetch, records the ProviderRunLog, and surfaces blocked/declined as
 * a CaptureResult the pipeline understands ({ ok:false }). Never throws.
 */
class LiveProviderAdapter implements CaptureProvider {
  readonly name = 'phase9-provider';

  /** Captured once; surfaced to the worker for run-log + health bookkeeping. */
  lastRunLog?: ProviderRunLog;
  lastReason?: string;

  constructor(
    readonly sourceType: string,
    private readonly source: CaptureableSource,
    private readonly deps: ProviderDeps,
    private readonly creds: ProviderCredentials,
    private readonly recordRun: RecordProviderRun,
  ) {}

  enabled(): boolean {
    return true;
  }

  async capture(input: { url?: string; rawText?: string; now: string }): Promise<CaptureResult> {
    const now = input.now;
    const route = routeInputFor(this.source);
    let result: ProviderResult<CapturedItem | CapturedItem[]>;
    try {
      result = await captureViaProvider(this.sourceType, route, this.deps, this.creds);
    } catch (e) {
      // captureViaProvider never throws, but defend in depth.
      result = {
        ok: false,
        reason: 'fetch_error',
        message: e instanceof Error ? e.message : String(e),
      };
    }

    // EVERY provider attempt emits a run log (observability).
    const runLog = makeProviderRunLog({
      provider: this.sourceType,
      sourceId: this.source.id,
      startedAt: now,
      finishedAt: now,
      result,
    });
    this.lastRunLog = runLog;
    await this.recordRun(runLog).catch((e) =>
      logger.warn('job.captureWorker.providerRunPersistFailed', {
        sourceId: this.source.id,
        error: e instanceof Error ? e.message : String(e),
      }),
    );

    if (!result.ok) {
      this.lastReason = result.reason;
      return {
        ok: false,
        provider: this.name,
        error: `${result.reason}: ${result.message}`,
      };
    }

    const item = firstItem(result.data);
    if (!item) {
      this.lastReason = 'parse_error';
      return { ok: false, provider: this.name, error: 'provider returned no items' };
    }

    return {
      ok: true,
      provider: this.name,
      isFixture: false,
      doc: {
        sourceId: this.source.id,
        url: item.url,
        title: item.title,
        metaDescription: item.summary,
        bodyText: item.bodyText ?? item.summary ?? item.title,
        canonicalUrl: item.canonicalUrl,
        capturedAt: now,
        contentHash: item.contentHash,
      },
    };
  }
}

/** Build the shared ProviderDeps from config (offline by default: no fetchImpl). */
function providerDepsFromConfig(cfg: Phase8WorkerConfig, now: string): ProviderDeps {
  const deps: ProviderDeps = {
    now,
    timeoutMs: cfg.providerTimeoutMs,
    maxBytes: cfg.providerMaxBytes,
    userAgent: cfg.captureUserAgent,
  };
  // Live capture requires a real fetch. In a Node/edge runtime a global `fetch`
  // exists; injecting it here gates the network ON only in live mode. Offline /
  // fixture mode never reaches this path, so imports stay network-free.
  if (typeof fetch !== 'undefined') {
    deps.fetchImpl = fetch;
  }
  return deps;
}

export function makeCaptureWorkerJob(
  load: LoadCaptureSources = defaultLoad,
  persist: PersistCaptureWorker = defaultPersist,
  dedupeFactory: () => DedupeStore = createWorkerDedupeStore,
  recordRun: RecordProviderRun = recordProviderRun,
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

      const creds: ProviderCredentials = {
        youtubeApiKey: cfg.youtubeApiKey,
        podcastApiKey: cfg.podcastIndexApiKey,
        podcastApiSecret: cfg.podcastIndexApiSecret,
      };

      const declaredInputs = {
        sourceCount: sources.length,
        mode: live ? 'live' : 'fixture',
        userAgent: cfg.captureUserAgent,
        timeoutMs: cfg.providerTimeoutMs,
        maxBytes: cfg.providerMaxBytes,
        youtubeConfigured: Boolean(creds.youtubeApiKey),
        podcastConfigured: Boolean(creds.podcastApiKey && creds.podcastApiSecret),
        runAt: now,
      };
      logger.info('job.captureWorker.start', { declaredInputs });

      const dedupe = dedupeFactory();
      const deps = live ? providerDepsFromConfig(cfg, now) : undefined;
      let captured = 0;
      let duplicates = 0;
      let alerts = 0;
      let failed = 0;
      let blocked = 0;
      let skipped = 0;

      for (const source of sources) {
        try {
          // Offline → fixture provider. Live → the Phase-9 provider adapter.
          let adapter: LiveProviderAdapter | undefined;
          let options;
          if (live && deps) {
            adapter = new LiveProviderAdapter(
              String(source.sourceType),
              source,
              deps,
              creds,
              recordRun,
            );
            options = { extraProviders: [adapter] };
          } else {
            options = { extraProviders: [new FixtureCaptureProvider(source.sourceType)] };
          }
          const result = await runIntakePipeline(source, options, now);

          if (!result.capture.ok || !result.signalDraft) {
            // Classify the failure: blocked (degraded) vs not-configured (skip)
            // vs a genuine capture failure.
            const reason = adapter?.lastReason;
            const isBlocked = reason === 'blocked';
            const isSkip = reason === 'provider_not_configured';

            const record: CaptureRecord = {
              sourceId: source.id,
              ok: false,
              duplicate: false,
              signalCaptured: false,
              alertCount: 0,
              isFixture: Boolean(result.capture.isFixture),
              blocked: isBlocked || undefined,
              skipped: isSkip || undefined,
              error: result.capture.error ?? 'no signal produced',
            };
            await persist(source, result, record).catch(() => {});

            if (isBlocked) {
              blocked += 1;
              // Non-fatal degraded result: log + flag source health, never the HTML.
              logger.warn('job.captureWorker.blocked', {
                sourceId: source.id,
                sourceType: source.sourceType,
                note: 'anti-bot challenge — degraded, source-health flagged, never captured',
              });
            } else if (isSkip) {
              skipped += 1;
              logger.info('job.captureWorker.skipped', {
                sourceId: source.id,
                sourceType: source.sourceType,
                note: 'provider_not_configured — clean skip (no key / no public endpoint)',
              });
            } else {
              failed += 1;
              logger.warn('job.captureWorker.captureFailed', {
                sourceId: source.id,
                error: record.error,
              });
            }
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
        blocked,
        skipped,
      });

      return {
        job: 'captureWorker',
        ok: true,
        declaredInputs,
        summary: { captured, duplicates, alerts, failed, blocked, skipped },
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
