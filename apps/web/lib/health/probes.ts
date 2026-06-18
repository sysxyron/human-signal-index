// =============================================================================
// HSI Phase 14 — Supabase dependency health PROBES. SERVER-ONLY.
//
// Each probe performs ONE short, timeout-bounded fetch against a Supabase
// endpoint and classifies the outcome via the PURE diagnostics + health-response
// shapers. The returned HealthResponse is structurally identical to the
// shared-types HealthCheckResult, so probe output drops straight into the
// Security dashboard.
//
// Auth + REST:
//   * Uses the anon `apikey` header.
//
// Storage:
//   * Uses the server-only service-role key because `/storage/v1/bucket/:id`
//     requires Authorization.
//   * Checks the required `cms_media` bucket directly.
//   * NEVER places the service-role key into response details.
//
// SAFETY:
//   * NEVER throws — network/abort errors are caught and shaped as `unhealthy`.
//   * NEVER leaks secrets — keys are only sent as request headers; response
//     details run through redactDetails via shapeHealth.
//   * Env-tolerant — empty / placeholder Supabase env yields `unconfigured`
//     so `next build` with an empty env still passes.
//
// SERVER-ONLY: imported by the /api/health route handlers and the security DAL.
// Uses only `fetch` + the pure libs, but it reads env and must not run in the
// browser. `server-only` is not installed in this workspace, so this banner
// stands in for the import.
// =============================================================================

import { diagnoseFetchOutcome } from '@/lib/auth/auth-diagnostics';
import { isCloudflareChallenge } from '@/lib/auth/auth-errors';
import {
  healthy,
  unconfigured,
  unhealthy,
  type HealthResponse,
} from '@/lib/health/health-response';
import { requireServerEnv } from '@/lib/env/validate-env';

// The import-safe placeholders from lib/supabase/env.ts. When the resolved env
// equals one of these, Supabase is effectively NOT configured.
const PLACEHOLDER_URL = 'http://127.0.0.1:54321';
const PLACEHOLDER_ANON = 'anon-placeholder-key';

const PROBE_TIMEOUT_MS = 6000;
const MAX_BODY_CHARS = 4096;

interface ResolvedEnv {
  url: string;
  anonKey: string;
}

interface ProbeFetchResult {
  status?: number;
  bodyText?: string;
  error?: unknown;
}

/**
 * Resolve the Supabase URL + anon key from process.env via the PURE validator,
 * treating blank/placeholder values as "not configured". Returns null when the
 * service cannot be probed.
 */
function resolveEnv(): ResolvedEnv | null {
  const { ok, values } = requireServerEnv(process.env, [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ]);

  if (!ok) return null;

  const url = values.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = values.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (
    url === PLACEHOLDER_URL ||
    /127\.0\.0\.1:54321/.test(url) ||
    anonKey === PLACEHOLDER_ANON ||
    /anon-placeholder/.test(anonKey)
  ) {
    return null;
  }

  return {
    url: url.replace(/\/+$/, ''),
    anonKey,
  };
}

/**
 * Resolve the Supabase URL for server-only probes.
 *
 * Storage can use either SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL for the host,
 * but it must use a server-only service-role key for bucket metadata checks.
 */
function resolveSupabaseUrlForServer(): string | null {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim();

  if (
    !url ||
    url === PLACEHOLDER_URL ||
    /127\.0\.0\.1:54321/.test(url)
  ) {
    return null;
  }

  return url.replace(/\/+$/, '');
}

/**
 * Resolve the server-only service role key.
 *
 * Do not expose this as NEXT_PUBLIC_*.
 */
function resolveServiceRoleKey(): string | null {
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ''
  ).trim();

  if (!key) return null;

  // Basic JWT shape check: header.payload.signature
  if (key.split('.').length !== 3) return null;

  return key;
}

/**
 * Perform a single timeout-bounded GET with the anon `apikey` header. NEVER
 * throws: a network/abort error is returned in `error` with no status.
 */
async function probeFetch(
  endpoint: string,
  anonKey: string,
): Promise<ProbeFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Accept: 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    let bodyText = '';

    try {
      bodyText = (await res.text()).slice(0, MAX_BODY_CHARS);
    } catch {
      bodyText = '';
    }

    return {
      status: res.status,
      bodyText,
    };
  } catch (error) {
    return { error };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Perform a single timeout-bounded GET with Supabase service-role auth.
 *
 * Used for Storage bucket metadata checks. NEVER leaks the key into details.
 */
async function probeServiceRoleFetch(
  endpoint: string,
  serviceRoleKey: string,
): Promise<ProbeFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    let bodyText = '';

    try {
      bodyText = (await res.text()).slice(0, MAX_BODY_CHARS);
    } catch {
      bodyText = '';
    }

    return {
      status: res.status,
      bodyText,
    };
  } catch (error) {
    return { error };
  } finally {
    clearTimeout(timer);
  }
}

type ProbeService = 'auth' | 'rest';

const ENDPOINT_PATH: Record<ProbeService, string> = {
  auth: '/auth/v1/settings',
  rest: '/rest/v1/',
};

/**
 * Run one service probe + classify the outcome via the pure diagnostics.
 * Details carry the HTTP status, a `cloudflareChallenge` boolean and a short
 * note — never the apikey/secrets.
 */
async function probeService(
  service: ProbeService,
  env: ResolvedEnv,
): Promise<HealthResponse> {
  const endpoint = `${env.url}${ENDPOINT_PATH[service]}`;
  const outcome = await probeFetch(endpoint, env.anonKey);

  const diagnosis = diagnoseFetchOutcome({
    status: outcome.status,
    bodyText: outcome.bodyText,
    error: outcome.error,
    service,
  });

  const cloudflareChallenge =
    isCloudflareChallenge(outcome.bodyText) ||
    isCloudflareChallenge(outcome.error);

  const details: Record<string, unknown> = {
    status: outcome.status ?? null,
    cloudflareChallenge,
    note: diagnosis.message,
    code: diagnosis.code,
  };

  if (diagnosis.hint) details.hint = diagnosis.hint;

  return diagnosis.ok
    ? healthy(service, diagnosis.message, details)
    : unhealthy(service, diagnosis.message, details);
}

/** Probe the Supabase Auth GoTrue settings endpoint. */
export async function probeAuth(): Promise<HealthResponse> {
  const env = resolveEnv();

  if (!env) {
    return unconfigured(
      'auth',
      'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).',
    );
  }

  return probeService('auth', env);
}

/** Probe the Supabase REST PostgREST root endpoint. */
export async function probeRest(): Promise<HealthResponse> {
  const env = resolveEnv();

  if (!env) {
    return unconfigured(
      'rest',
      'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).',
    );
  }

  return probeService('rest', env);
}

/** Probe the required Supabase Storage cms_media bucket endpoint. */
export async function probeStorage(): Promise<HealthResponse> {
  const supabaseUrl = resolveSupabaseUrlForServer();
  const serviceRoleKey = resolveServiceRoleKey();
  const bucketName = process.env.CMS_MEDIA_BUCKET || 'cms_media';

  if (!supabaseUrl) {
    return unconfigured(
      'storage',
      'Supabase Storage is not configured (set SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL).',
    );
  }

  if (!serviceRoleKey) {
    return unhealthy(
      'storage',
      'Supabase Storage is not configured (missing or invalid SUPABASE_SERVICE_ROLE_KEY).',
      {
        bucket: bucketName,
        code: 'storage.missing_service_role_key',
      },
    );
  }

  const endpoint = `${supabaseUrl}/storage/v1/bucket/${bucketName}`;
  const outcome = await probeServiceRoleFetch(endpoint, serviceRoleKey);

  const cloudflareChallenge =
    isCloudflareChallenge(outcome.bodyText) ||
    isCloudflareChallenge(outcome.error);

  if (outcome.error) {
    return unhealthy(
      'storage',
      'Storage probe failed before receiving a response.',
      {
        status: null,
        bucket: bucketName,
        cloudflareChallenge,
        code: 'storage.fetch_failed',
      },
    );
  }

  if (!outcome.status || outcome.status < 200 || outcome.status >= 300) {
    let note = 'storage endpoint returned an error.';
    let code = 'storage.client_error';

    if (outcome.status === 400 && outcome.bodyText?.includes('Invalid Compact JWS')) {
      note = 'Storage request used an invalid service-role JWT.';
      code = 'storage.invalid_service_role_jwt';
    } else if (outcome.status === 401 || outcome.status === 403) {
      note = 'Storage request was rejected by Supabase authorization.';
      code = 'storage.unauthorized';
    } else if (outcome.status === 404) {
      note = `${bucketName} bucket was not found.`;
      code = 'storage.bucket_missing';
    }

    return unhealthy(
      'storage',
      `storage endpoint returned ${outcome.status}.`,
      {
        status: outcome.status ?? null,
        bucket: bucketName,
        cloudflareChallenge,
        note,
        code,
      },
    );
  }

  let bucket: {
    id?: string;
    name?: string;
    public?: boolean;
    file_size_limit?: number | null;
    allowed_mime_types?: string[] | null;
  } | null = null;

  try {
    bucket = outcome.bodyText ? JSON.parse(outcome.bodyText) : null;
  } catch {
    bucket = null;
  }

  return healthy(
    'storage',
    'Supabase Storage cms_media bucket is reachable.',
    {
      status: outcome.status,
      bucket: bucket?.id || bucketName,
      public: bucket?.public ?? null,
      fileSizeLimit: bucket?.file_size_limit ?? null,
      allowedMimeTypes: bucket?.allowed_mime_types ?? null,
      cloudflareChallenge,
    },
  );
}

/**
 * Aggregate probe: Supabase is healthy when BOTH auth and rest are reachable.
 * Runs the two probes in parallel and folds them into one `supabase` envelope.
 * The worst child status wins; the aggregate carries a per-service summary in
 * details with each child's cloudflareChallenge flag preserved.
 */
export async function probeSupabase(): Promise<HealthResponse> {
  const env = resolveEnv();

  if (!env) {
    return unconfigured(
      'supabase',
      'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).',
    );
  }

  const [auth, rest] = await Promise.all([
    probeService('auth', env),
    probeService('rest', env),
  ]);

  const cloudflareChallenge =
    Boolean(auth.details?.cloudflareChallenge) ||
    Boolean(rest.details?.cloudflareChallenge);

  const details: Record<string, unknown> = {
    auth: {
      status: auth.status,
      message: auth.message,
    },
    rest: {
      status: rest.status,
      message: rest.message,
    },
    cloudflareChallenge,
  };

  if (auth.ok && rest.ok) {
    return healthy(
      'supabase',
      'Supabase auth + REST endpoints are reachable.',
      details,
    );
  }

  const downServices = [!auth.ok ? 'auth' : null, !rest.ok ? 'rest' : null]
    .filter((s): s is string => Boolean(s))
    .join(' + ');

  return unhealthy(
    'supabase',
    `Supabase dependency unhealthy (${downServices}).`,
    details,
  );
}