// =============================================================================
// apps/worker/lib/config.ts — Phase 8 worker environment reader.
//
// A single, typed reader for the Phase-8 scheduler/queue/capture environment.
// The pure engines (@hsi/scheduler, @hsi/source-intelligence) NEVER read env;
// the worker resolves it here and injects everything (clock, batch sizes,
// policy, capture mode). Empty/unset env yields SAFE, OFFLINE defaults:
//   * SCHEDULER_ENABLED / QUEUE_WORKER_ENABLED default to false (jobs skip),
//   * SIGNAL_CAPTURE_MODE defaults to 'fixture' (no network),
//   * batch/attempts/backoff fall back to documented constants.
//
// Nothing here throws — a malformed number degrades to its default.
// =============================================================================

import type { RetryPolicy } from '@hsi/scheduler';

/** Resolved Phase-8 worker configuration (offline-safe defaults). */
export interface Phase8WorkerConfig {
  /** Master switch for the scheduler-runner job. Default false. */
  schedulerEnabled: boolean;
  /** Master switch for the queue-drainer job. Default false. */
  queueWorkerEnabled: boolean;
  /** Capture mode: 'fixture' (offline, deterministic) or 'live' (network). */
  captureMode: 'fixture' | 'live';
  /** How many jobs the queue worker claims per drain. Default 10. */
  queueBatchSize: number;
  /** Max attempts per job before terminal failure. Default 3. */
  jobMaxAttempts: number;
  /** Base backoff (seconds) for the first retry. Default 60. */
  backoffBaseSeconds: number;
  /**
   * Whether triage may emit `draft_research` actions. Default FALSE — triage
   * only ever requests review/alerts, NEVER drafts research automatically and
   * NEVER auto-publishes.
   */
  autoCreateResearchDrafts: boolean;
  /** Outbound capture user-agent (live mode only). */
  captureUserAgent: string;
  /** Per-request capture timeout in ms (live mode only). */
  captureTimeoutMs: number;
  /** Max bytes to read from a single capture (live mode only). */
  captureMaxBytes: number;
  /** Whether a service-role Supabase client is configurable from env. */
  hasServiceRole: boolean;

  // --- Phase 9 (real provider adapters + scaled queue) ----------------------
  /**
   * Per-request timeout (ms) for the Phase-9 PROVIDER layer (rss/website/
   * youtube/podcast/forum). Distinct from the Phase-8 `captureTimeoutMs` so the
   * provider layer can be tuned independently. Default 12000.
   */
  providerTimeoutMs: number;
  /** Max response bytes the provider layer will read per request. Default 2_000_000. */
  providerMaxBytes: number;
  /**
   * Visibility-timeout lease (seconds) for the scaled queue's atomic claim
   * (`claim_hsin_jobs` / `claimBatch`). A claimed job is reclaimable once its
   * lease expires (worker crash recovery). Default 300 (5 min).
   */
  jobVisibilityTimeoutSeconds: number;
  /**
   * Whether terminal (retry-exhausted) jobs are dead-lettered into
   * hsin_dead_letter_jobs. Default TRUE. When false the queue store skips the
   * dead-letter insert (the job still goes terminal `failed`).
   */
  deadLetterEnabled: boolean;
  /**
   * Whether the local (network-free) embedder is used for semantic work.
   * Default TRUE — keeps embeddings fully offline unless a host opts out.
   */
  localEmbeddings: boolean;
  /** Provider credentials (live mode only; blank/undefined offline). */
  youtubeApiKey?: string;
  podcastIndexApiKey?: string;
  podcastIndexApiSecret?: string;
}

/** Documented offline-safe defaults (mirror .env.example). */
export const PHASE8_DEFAULTS = {
  queueBatchSize: 10,
  jobMaxAttempts: 3,
  backoffBaseSeconds: 60,
  captureUserAgent: 'HumanSignalIndexBot/0.1',
  captureTimeoutMs: 12000,
  captureMaxBytes: 2_000_000,
} as const;

/** Documented offline-safe Phase-9 defaults (mirror .env.example). */
export const PHASE9_DEFAULTS = {
  providerTimeoutMs: 12000,
  providerMaxBytes: 2_000_000,
  jobVisibilityTimeoutSeconds: 300,
  deadLetterEnabled: true,
  localEmbeddings: true,
} as const;

/** boolEnv that honours an explicit default when the var is unset. */
function boolEnvWithDefault(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true';
}

function boolEnv(value: string | undefined): boolean {
  return value === 'true';
}

function intEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Resolve the Phase-8 worker config from a process env (defaults to
 * `process.env`). Pure given its argument; never throws.
 */
export function readPhase8Config(
  env: NodeJS.ProcessEnv = process.env,
): Phase8WorkerConfig {
  const captureMode = env.SIGNAL_CAPTURE_MODE === 'live' ? 'live' : 'fixture';
  const hasServiceRole = Boolean(
    (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL) &&
      env.SUPABASE_SERVICE_ROLE_KEY,
  );
  return {
    schedulerEnabled: boolEnv(env.SCHEDULER_ENABLED),
    queueWorkerEnabled: boolEnv(env.QUEUE_WORKER_ENABLED),
    captureMode,
    queueBatchSize: intEnv(env.SIGNAL_QUEUE_BATCH_SIZE, PHASE8_DEFAULTS.queueBatchSize),
    jobMaxAttempts: intEnv(env.SIGNAL_JOB_MAX_ATTEMPTS, PHASE8_DEFAULTS.jobMaxAttempts),
    backoffBaseSeconds: intEnv(
      env.SIGNAL_BACKOFF_BASE_SECONDS,
      PHASE8_DEFAULTS.backoffBaseSeconds,
    ),
    autoCreateResearchDrafts: boolEnv(env.SIGNAL_AUTO_CREATE_RESEARCH_DRAFTS),
    captureUserAgent: env.SIGNAL_CAPTURE_USER_AGENT || PHASE8_DEFAULTS.captureUserAgent,
    captureTimeoutMs: intEnv(env.SIGNAL_CAPTURE_TIMEOUT_MS, PHASE8_DEFAULTS.captureTimeoutMs),
    captureMaxBytes: intEnv(env.SIGNAL_CAPTURE_MAX_BYTES, PHASE8_DEFAULTS.captureMaxBytes),
    hasServiceRole,
    // Phase 9.
    providerTimeoutMs: intEnv(
      env.HSIN_PROVIDER_TIMEOUT_MS,
      PHASE9_DEFAULTS.providerTimeoutMs,
    ),
    providerMaxBytes: intEnv(
      env.HSIN_PROVIDER_MAX_BYTES,
      PHASE9_DEFAULTS.providerMaxBytes,
    ),
    jobVisibilityTimeoutSeconds: intEnv(
      env.HSIN_JOB_VISIBILITY_TIMEOUT_SECONDS,
      PHASE9_DEFAULTS.jobVisibilityTimeoutSeconds,
    ),
    deadLetterEnabled: boolEnvWithDefault(
      env.HSIN_DEAD_LETTER_ENABLED,
      PHASE9_DEFAULTS.deadLetterEnabled,
    ),
    localEmbeddings: boolEnvWithDefault(
      env.HSIN_LOCAL_EMBEDDINGS,
      PHASE9_DEFAULTS.localEmbeddings,
    ),
    youtubeApiKey: env.YOUTUBE_API_KEY || undefined,
    podcastIndexApiKey: env.PODCAST_INDEX_API_KEY || undefined,
    podcastIndexApiSecret: env.PODCAST_INDEX_API_SECRET || undefined,
  };
}

/**
 * Build a {@link RetryPolicy} from the resolved config. Mirrors
 * DEFAULT_RETRY_POLICY's shape but honours the env-driven attempts/backoff.
 */
export function retryPolicyFromConfig(cfg: Phase8WorkerConfig): RetryPolicy {
  return {
    maxAttempts: cfg.jobMaxAttempts,
    baseSeconds: cfg.backoffBaseSeconds,
    factor: 2,
    jitterRatio: 0.1,
    maxBackoffSeconds: 3600,
  };
}
