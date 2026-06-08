// =============================================================================
// apps/worker/jobs — evidenceRefreshJob (WorldForge Phase 5)
//
// A daily batch re-check of evidence. For a batch of research runs (loaded via an
// INJECTED loader; default no-op so the job runs out-of-the-box without a DB) it
// re-runs the '@hsi/evidence-engine' gatherEvidence to refresh each run's
// citations / metadata / contradiction status, then reports counts. It NEVER
// throws and never fails the worker even if every provider is down — providers
// already degrade to [] internally, and any per-run error is caught and counted.
//
// DAILY SCHEDULING: this job declares a daily cron (`0 4 * * *`). The worker has
// no internal scheduler; an EXTERNAL scheduler invokes it — e.g. a Vercel Cron
// (vercel.json: { "crons": [{ "path": "/api/cron/evidence-refresh", "schedule":
// "0 4 * * *" }] }) or any system cron — hitting a route guarded by CRON_SECRET
// (Authorization: Bearer $CRON_SECRET) that calls evidenceRefreshJob.run(ctx).
// Keys (EVIDENCE_MODE/OPENAI_API_KEY/...) come from the host env; with empty env
// the engine runs in deterministic fixture mode.
// =============================================================================

import {
  createEvidenceEngine,
  gatherEvidence,
  DEFAULT_NOW,
  ProviderHealthTracker,
  type EvidenceEngineConfig,
  type ProviderHealth,
} from '@hsi/evidence-engine';
import type { Claim } from '@hsi/research-agents';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/** One research run queued for an evidence refresh. */
export interface RefreshableRun {
  runId: string;
  /** The run's claims (flattened from its agent outputs). */
  claims: Claim[];
}

/** The recomputed evidence summary for a single run. */
export interface RunRefreshResult {
  runId: string;
  totalClaims: number;
  supported: number;
  contradicted: number;
  background: number;
  unsupported: number;
  coverageScore: number;
  mode: 'fixture' | 'live' | 'mixed';
  error?: string;
}

/** Loads the batch of runs to refresh (default: none — safe no-op). */
export type LoadRefreshableRuns = (
  ctx: JobContext,
  batchSize: number,
) => Promise<RefreshableRun[]>;

/** Persists a recomputed run summary (default: no-op). */
export type PersistRefreshResult = (result: RunRefreshResult) => Promise<void>;

/** Persists the provider-health snapshot after the batch (default: no-op). */
export type PersistHealthSnapshot = (
  snapshot: ProviderHealth[],
) => Promise<void>;

const defaultLoad: LoadRefreshableRuns = async () => [];
const defaultPersist: PersistRefreshResult = async () => {};
const defaultPersistHealth: PersistHealthSnapshot = async () => {};

/** Default batch size when the context/config does not override it. */
export const DEFAULT_REFRESH_BATCH_SIZE = 25;

/**
 * Resolve the engine config from the worker process env. The pure engine never
 * reads env; the worker resolves it here. Empty env → deterministic fixture mode.
 */
function refreshEngineConfig(): Partial<EvidenceEngineConfig> {
  const mode = process.env.EVIDENCE_MODE === 'live' ? 'live' : 'fixture';
  const minRelevanceRaw = process.env.EVIDENCE_MIN_RELEVANCE;
  const minParsed = minRelevanceRaw ? Number(minRelevanceRaw) : NaN;
  const ttlRaw = process.env.EVIDENCE_CACHE_TTL;
  const ttlParsed = ttlRaw ? Number(ttlRaw) : NaN;
  return {
    mode,
    minRelevance: Number.isFinite(minParsed) ? minParsed : 0.65,
    semanticScholarApiKey: process.env.SEMANTIC_SCHOLAR_API_KEY || undefined,
    pubmedEmail: process.env.PUBMED_EMAIL || undefined,
    crossrefMailto: process.env.CROSSREF_MAILTO || undefined,
    openaiApiKey: process.env.OPENAI_API_KEY || undefined,
    cacheTtlSeconds: Number.isFinite(ttlParsed) ? ttlParsed : 86400,
  };
}

/**
 * Build the evidence-refresh job. Loaders/persisters are injected so the job is
 * testable and runs without a DB by default.
 *
 * @param load          loads the batch of runs to refresh.
 * @param persist       persists each run's recomputed summary.
 * @param persistHealth persists the provider-health snapshot after the batch.
 */
export function makeEvidenceRefreshJob(
  load: LoadRefreshableRuns = defaultLoad,
  persist: PersistRefreshResult = defaultPersist,
  persistHealth: PersistHealthSnapshot = defaultPersistHealth,
): Job {
  return {
    name: 'evidenceRefresh',
    description:
      'Daily batch re-check of research-run evidence (citations/metadata/contradictions).',
    // Daily at 04:00 UTC — consumed by an external scheduler (Vercel cron / system
    // cron) guarded by CRON_SECRET; the worker has no internal scheduler.
    schedule: '0 4 * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const batchSize =
        (ctx.config as { EVIDENCE_REFRESH_BATCH_SIZE?: number })
          .EVIDENCE_REFRESH_BATCH_SIZE ?? DEFAULT_REFRESH_BATCH_SIZE;
      const now = ctx.runAt || DEFAULT_NOW;

      // ICM: declare the inputs this run operated on.
      let runs: RefreshableRun[] = [];
      try {
        runs = await load(ctx, batchSize);
      } catch (e) {
        // Loader failure must not crash the worker — log + treat as empty batch.
        logger.warn('job.evidenceRefresh.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
        runs = [];
      }

      const mode = process.env.EVIDENCE_MODE === 'live' ? 'live' : 'fixture';
      const declaredInputs = {
        runCount: runs.length,
        batchSize,
        mode,
        runAt: now,
      };
      logger.info('job.evidenceRefresh.start', { declaredInputs });

      const healthTracker = new ProviderHealthTracker();
      const engine = createEvidenceEngine(refreshEngineConfig(), {
        now,
        healthTracker,
      });

      let refreshed = 0;
      let failed = 0;
      let contradictions = 0;
      let unsupported = 0;

      for (const run of runs) {
        try {
          const { coverage } = await gatherEvidence(run.claims, engine, now);
          const result: RunRefreshResult = {
            runId: run.runId,
            totalClaims: coverage.totalClaims,
            supported: coverage.supported,
            contradicted: coverage.contradicted,
            background: coverage.background,
            unsupported: coverage.unsupported,
            coverageScore: coverage.coverageScore,
            mode: coverage.mode,
          };
          contradictions += coverage.contradicted;
          unsupported += coverage.unsupported;
          await persist(result);
          refreshed += 1;
          logger.info('job.evidenceRefresh.run', {
            runId: run.runId,
            coverageScore: coverage.coverageScore,
            contradicted: coverage.contradicted,
            unsupported: coverage.unsupported,
            mode: coverage.mode,
          });
        } catch (e) {
          // A single run failing (provider down, bad data) must not fail the job.
          failed += 1;
          const message = e instanceof Error ? e.message : String(e);
          await persist({
            runId: run.runId,
            totalClaims: run.claims.length,
            supported: 0,
            contradicted: 0,
            background: 0,
            unsupported: run.claims.length,
            coverageScore: 0,
            mode,
            error: message,
          }).catch(() => {});
          logger.warn('job.evidenceRefresh.runFailed', {
            runId: run.runId,
            error: message,
          });
        }
      }

      const snapshot = healthTracker.snapshot();
      await persistHealth(snapshot).catch(() => {});

      logger.info('job.evidenceRefresh.done', {
        refreshed,
        failed,
        contradictions,
        unsupported,
      });

      return {
        job: 'evidenceRefresh',
        ok: true,
        declaredInputs,
        summary: {
          refreshed,
          failed,
          contradictions,
          unsupported,
          providers: snapshot.map((h) => ({ name: h.name, status: h.status })),
        },
      };
    },
  };
}

export const evidenceRefreshJob = makeEvidenceRefreshJob();
