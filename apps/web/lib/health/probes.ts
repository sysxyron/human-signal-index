// =============================================================================
// HSI Phase 14 — Supabase dependency health PROBES. SERVER-ONLY.
//
// Each probe performs ONE short, timeout-bounded fetch against a public Supabase
// endpoint (with the anon `apikey` header) and classifies the outcome via the
// PURE diagnostics + health-response shapers. The returned HealthResponse is
// structurally identical to the shared-types HealthCheckResult, so probe output
// drops straight into the Security dashboard.
//
// SAFETY:
//   * NEVER throws — network/abort errors are caught and shaped as `unhealthy`.
//   * NEVER leaks secrets — `apikey` is only sent as a request header; the
//     response details run through redactDetails (via shapeHealth) and we never
//     place the key/anon value into details.
//   * Env-tolerant — empty / placeholder Supabase env yields `unconfigured`
//     (status 503-worthy) so `next build` with an empty env still passes.
//
// SERVER-ONLY: imported by the /api/health route handlers and the security DAL.
// Uses only `fetch` + the pure libs (no next/headers), but it reads env and must
// not run in the browser. `server-only` is not installed in this workspace, so
// this banner stands in for the import (mirrors the other server libs here).
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

/**
 * Resolve the Supabase URL + anon key from process.env via the PURE validator,
 * treating blank/placeholder values as "not configured". Returns null when the
 * service cannot be probed (so the caller emits an `unconfigured` response).
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
  return { url: url.replace(/\/+$/, ''), anonKey };
}

interface ProbeFetchResult {
  status?: number;
  bodyText?: string;
  error?: unknown;
}

/**
 * Perform a single timeout-bounded GET with the anon `apikey` header. NEVER
 * throws: a network/abort error is returned in `error` (no status).
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
      headers: { apikey: anonKey, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    let bodyText = '';
    try {
      bodyText = (await res.text()).slice(0, MAX_BODY_CHARS);
    } catch {
      bodyText = '';
    }
    return { status: res.status, bodyText };
  } catch (error) {
    return { error };
  } finally {
    clearTimeout(timer);
  }
}

type ProbeService = 'auth' | 'rest' | 'storage';

const ENDPOINT_PATH: Record<ProbeService, string> = {
  auth: '/auth/v1/settings',
  rest: '/rest/v1/',
  storage: '/storage/v1/bucket',
};

/**
 * Run one service probe + classify the outcome via the pure diagnostics.
 * Details carry the HTTP status, a `cloudflareChallenge` boolean and a short
 * note — never the apikey/secrets (redactDetails is applied by shapeHealth).
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
    isCloudflareChallenge(outcome.bodyText) || isCloudflareChallenge(outcome.error);

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

/** Probe the Supabase Auth (GoTrue) settings endpoint. */
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

/** Probe the Supabase REST (PostgREST) root endpoint. */
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

/** Probe the Supabase Storage bucket endpoint. */
export async function probeStorage(): Promise<HealthResponse> {
  const env = resolveEnv();
  if (!env) {
    return unconfigured(
      'storage',
      'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).',
    );
  }
  return probeService('storage', env);
}

/**
 * Aggregate probe: Supabase is healthy when BOTH auth and rest are reachable.
 * Runs the two probes in parallel and folds them into one `supabase` envelope.
 * The worst child status wins; the aggregate carries a per-service summary in
 * details (with each child's cloudflareChallenge flag preserved).
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
    auth: { status: auth.status, message: auth.message },
    rest: { status: rest.status, message: rest.message },
    cloudflareChallenge,
  };

  if (auth.ok && rest.ok) {
    return healthy('supabase', 'Supabase auth + REST endpoints are reachable.', details);
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
