// =============================================================================
// Auth configuration + fetch-outcome diagnostics — PURE.
//
// Deterministic classifiers for the auth/health diagnostic view: inspect the
// resolved Supabase env and the result of a health probe (status + body) and
// turn them into structured, actionable AuthDiagnosis rows. No I/O happens here
// — the caller performs the probe and hands the outcome in.
//
// PURITY: imports ONLY ./auth-errors and ../errors/format-error (both pure). No
// next/*, no Supabase client, no Date.now()/Math.random().
// =============================================================================

import { isCloudflareChallenge, translateAuthError } from './auth-errors';
import { validateStartupEnv } from '../env/validate-env';

export type DiagnosisSeverity = 'info' | 'warning' | 'error';

export interface AuthDiagnosis {
  code: string;
  ok: boolean;
  severity: DiagnosisSeverity;
  message: string;
  hint?: string;
}

// The import-safe placeholders mirrored from lib/supabase/env.ts. When the
// resolved env equals one of these, Supabase is effectively NOT configured.
const PLACEHOLDER_URL = 'http://127.0.0.1:54321';
const PLACEHOLDER_ANON = 'anon-placeholder-key';

function isBlank(v: string | undefined): boolean {
  return v === undefined || v.trim().length === 0;
}

function looksLikeUrl(v: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(v);
}

/**
 * Flag missing / placeholder Supabase config. Detects both a truly empty env and
 * the repo's import-safe fallback (127.0.0.1:54321 + anon-placeholder), treating
 * the latter as "not configured" rather than a real local stack.
 */
export function diagnoseConfig(env: { url?: string; anonKey?: string }): AuthDiagnosis[] {
  const out: AuthDiagnosis[] = [];
  const url = env.url;
  const anon = env.anonKey;

  if (isBlank(url)) {
    out.push({
      code: 'config.url.missing',
      ok: false,
      severity: 'error',
      message: 'NEXT_PUBLIC_SUPABASE_URL is not set.',
      hint: 'Set NEXT_PUBLIC_SUPABASE_URL to your Supabase project URL.',
    });
  } else if (url === PLACEHOLDER_URL || /127\.0\.0\.1:54321/.test(url as string)) {
    out.push({
      code: 'config.url.placeholder',
      ok: false,
      severity: 'error',
      message: 'NEXT_PUBLIC_SUPABASE_URL is using the placeholder (not configured).',
      hint: 'Replace the 127.0.0.1:54321 placeholder with your real Supabase URL.',
    });
  } else if (!looksLikeUrl(url as string)) {
    out.push({
      code: 'config.url.invalid',
      ok: false,
      severity: 'error',
      message: 'NEXT_PUBLIC_SUPABASE_URL is not a valid http(s) URL.',
      hint: 'Use the full https://<project>.supabase.co URL.',
    });
  } else {
    out.push({
      code: 'config.url.ok',
      ok: true,
      severity: 'info',
      message: 'NEXT_PUBLIC_SUPABASE_URL is set.',
    });
  }

  if (isBlank(anon)) {
    out.push({
      code: 'config.anon.missing',
      ok: false,
      severity: 'error',
      message: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.',
      hint: 'Set NEXT_PUBLIC_SUPABASE_ANON_KEY to your Supabase anon key.',
    });
  } else if (anon === PLACEHOLDER_ANON || /anon-placeholder/.test(anon as string)) {
    out.push({
      code: 'config.anon.placeholder',
      ok: false,
      severity: 'error',
      message: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is using the placeholder (not configured).',
      hint: 'Replace the anon-placeholder key with your real anon key.',
    });
  } else {
    out.push({
      code: 'config.anon.ok',
      ok: true,
      severity: 'info',
      message: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is set.',
    });
  }

  return out;
}

export interface FetchOutcomeInput {
  status?: number;
  bodyText?: string;
  error?: unknown;
  service: 'auth' | 'rest' | 'storage';
}

/**
 * Classify the result of a single health probe against a Supabase service.
 *   - 2xx                        → ok
 *   - Cloudflare challenge HTML  → error 'cloudflare_challenge'
 *   - 401/403 on auth settings   → OK-ish note (the settings endpoint is public)
 *   - network / no status        → endpoint blocked / unreachable
 *   - 5xx                        → service error
 * Deterministic; reuses isCloudflareChallenge / translateAuthError.
 */
export function diagnoseFetchOutcome(input: FetchOutcomeInput): AuthDiagnosis {
  const { status, bodyText, error, service } = input;
  const route = `/${service}/`;

  // Cloudflare challenge (can come back with a 200 or 403) — check the body first.
  if (isCloudflareChallenge(bodyText) || isCloudflareChallenge(error)) {
    return {
      code: `${service}.cloudflare_challenge`,
      ok: false,
      severity: 'error',
      message: `Cloudflare challenge detected on ${route} route`,
      hint: 'Add a Cloudflare WAF skip rule for /auth/.',
    };
  }

  // A thrown error / no status → unreachable or blocked endpoint.
  if (error !== undefined && error !== null && status === undefined) {
    const t = translateAuthError(error, { route });
    return {
      code: `${service}.endpoint_blocked`,
      ok: false,
      severity: 'error',
      message: `Cannot reach the ${service} endpoint (${route}).`,
      hint: t.hint ?? 'Check the Supabase URL, network, and any WAF/proxy.',
    };
  }

  if (typeof status === 'number') {
    if (status >= 200 && status < 300) {
      return {
        code: `${service}.ok`,
        ok: true,
        severity: 'info',
        message: `${service} endpoint responded ${status}.`,
      };
    }

    // 401/403 on the public auth settings endpoint is usually fine — the probe
    // reached Supabase, which is what we are testing.
    if ((status === 401 || status === 403) && service === 'auth') {
      return {
        code: `${service}.reachable_unauthenticated`,
        ok: true,
        severity: 'info',
        message: `auth endpoint reachable (${status}); the settings endpoint is public so this is OK.`,
      };
    }

    if (status === 401 || status === 403) {
      return {
        code: `${service}.unauthorized`,
        ok: false,
        severity: 'warning',
        message: `${service} endpoint returned ${status} (unauthorized).`,
        hint: 'Check the anon key and RLS / endpoint permissions.',
      };
    }

    if (status === 429) {
      return {
        code: `${service}.rate_limited`,
        ok: false,
        severity: 'warning',
        message: `${service} endpoint is rate limiting (429).`,
        hint: 'Back off and retry.',
      };
    }

    if (status >= 500) {
      return {
        code: `${service}.service_error`,
        ok: false,
        severity: 'error',
        message: `${service} endpoint returned a server error (${status}).`,
        hint: 'Check Supabase status and any proxy in front of it.',
      };
    }

    // Other 4xx.
    return {
      code: `${service}.client_error`,
      ok: false,
      severity: 'warning',
      message: `${service} endpoint returned ${status}.`,
    };
  }

  // No status and no error — indeterminate.
  return {
    code: `${service}.unknown`,
    ok: false,
    severity: 'warning',
    message: `Could not determine ${service} endpoint health (no status).`,
  };
}

export interface DiagnosesSummary {
  ok: boolean;
  worst: DiagnosisSeverity;
  messages: string[];
}

const SEVERITY_RANK: Record<DiagnosisSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
};

/**
 * Phase 14B — turn startup env validation into auth-diagnostics rows so missing
 * required env (and degraded optional env) appears in the diagnostics view.
 * Reads no I/O; the caller passes the env map. Never exposes secret values.
 */
export function diagnoseStartupEnv(env: Record<string, string | undefined>): AuthDiagnosis[] {
  const result = validateStartupEnv(env);
  const out: AuthDiagnosis[] = [];

  for (const s of result.required) {
    if (!s.present) {
      out.push({
        code: `env.required.missing.${s.key}`,
        ok: false,
        severity: 'error',
        message: `Required environment variable ${s.key} is not set.`,
        hint: `Set ${s.key} (see docs/deployment). The app may not function until configured.`,
      });
    } else if (!s.valid) {
      out.push({
        code: `env.required.invalid.${s.key}`,
        ok: false,
        severity: 'error',
        message: s.message ?? `${s.key} is set but invalid.`,
        hint: `Check the value of ${s.key}.`,
      });
    }
  }

  for (const s of result.optional) {
    if (!s.present) {
      out.push({
        code: `env.optional.missing.${s.key}`,
        ok: true, // optional → degraded, not a failure
        severity: 'info',
        message: `Optional environment variable ${s.key} is not set — related features are degraded.`,
      });
    }
  }

  if (out.length === 0) {
    out.push({
      code: 'env.ok',
      ok: true,
      severity: 'info',
      message: 'All required environment variables are configured.',
    });
  }
  return out;
}

/** Collapse a list of diagnoses into an overall ok flag + worst severity. */
export function summarizeDiagnoses(list: AuthDiagnosis[]): DiagnosesSummary {
  let worst: DiagnosisSeverity = 'info';
  let ok = true;
  const messages: string[] = [];
  for (const d of list) {
    messages.push(d.message);
    if (!d.ok) ok = false;
    if (SEVERITY_RANK[d.severity] > SEVERITY_RANK[worst]) worst = d.severity;
  }
  return { ok, worst, messages };
}
