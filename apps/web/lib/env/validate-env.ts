// =============================================================================
// Environment validation + secret masking — PURE.
//
// Validates the HSI Supabase / app env vars, detects the import-safe
// placeholders, flags a server-only secret accidentally exposed via a
// NEXT_PUBLIC_ name, and produces a masked view safe to log/render. No process.env
// access here — the caller passes the env map in (so it is testable + pure).
//
// PURITY: no imports of next/*, Supabase, or server-only modules. No
// Date.now()/Math.random().
// =============================================================================

export interface EnvWarning {
  key: string;
  message: string;
}

export interface ValidateEnvResult {
  ok: boolean;
  missing: string[];
  warnings: EnvWarning[];
  masked: Record<string, string>;
}

// Keys we know about. `secret: true` keys are masked aggressively and must NOT
// be exposed via a NEXT_PUBLIC_ name.
interface EnvSpec {
  key: string;
  required: boolean;
  kind: 'url' | 'key' | 'string';
  secret: boolean;
}

const REQUIRED_KEYS: EnvSpec[] = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL', required: true, kind: 'url', secret: false },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true, kind: 'key', secret: false },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', required: false, kind: 'key', secret: true },
  { key: 'NEXT_PUBLIC_APP_URL', required: false, kind: 'url', secret: false },
];

const PLACEHOLDER_URL = 'http://127.0.0.1:54321';
const PLACEHOLDER_ANON = 'anon-placeholder-key';

function isBlank(v: string | undefined): boolean {
  return v === undefined || v.trim().length === 0;
}

function looksLikeUrl(v: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(v.trim());
}

function isPlaceholder(key: string, value: string): boolean {
  if (key === 'NEXT_PUBLIC_SUPABASE_URL') {
    return value === PLACEHOLDER_URL || /127\.0\.0\.1:54321/.test(value);
  }
  if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
    return value === PLACEHOLDER_ANON || /anon-placeholder/.test(value);
  }
  return false;
}

/** Mask a secret/value: keep first/last few chars, redact the middle. */
export function maskValue(value: string, secret: boolean): string {
  if (value.length === 0) return '';
  if (!secret) {
    // Non-secret (public) values can be shown but still trim very long keys.
    if (value.length <= 48) return value;
    return `${value.slice(0, 12)}…${value.slice(-6)}`;
  }
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * Validate the known HSI env vars. Returns missing required keys, structured
 * warnings (placeholder, bad URL, exposed secret), and a masked view of every
 * present key that is safe to render or log.
 */
export function validateEnv(env: Record<string, string | undefined>): ValidateEnvResult {
  const missing: string[] = [];
  const warnings: EnvWarning[] = [];
  const masked: Record<string, string> = {};

  for (const spec of REQUIRED_KEYS) {
    const raw = env[spec.key];

    if (isBlank(raw)) {
      if (spec.required) missing.push(spec.key);
      continue;
    }

    const value = raw as string;
    masked[spec.key] = maskValue(value, spec.secret);

    if (isPlaceholder(spec.key, value)) {
      warnings.push({
        key: spec.key,
        message: `${spec.key} is using a placeholder value (not configured).`,
      });
    } else if (spec.kind === 'url' && !looksLikeUrl(value)) {
      warnings.push({
        key: spec.key,
        message: `${spec.key} is not a valid http(s) URL.`,
      });
    }
  }

  // A server-only secret must NOT be exposed under a NEXT_PUBLIC_ name (which
  // ships to the browser bundle). Flag any NEXT_PUBLIC_*SERVICE_ROLE* key.
  for (const key of Object.keys(env)) {
    const value = env[key];
    if (isBlank(value)) continue;
    if (/^NEXT_PUBLIC_/.test(key) && /(SERVICE_ROLE|SECRET|PRIVATE)/i.test(key)) {
      warnings.push({
        key,
        message: `${key} exposes a server-only secret to the browser — rename it without the NEXT_PUBLIC_ prefix.`,
      });
      if (!(key in masked)) masked[key] = maskValue(value as string, true);
    }
  }

  return { ok: missing.length === 0, missing, warnings, masked };
}

// =============================================================================
// Phase 14B — startup env validation (required vs optional).
// `validateEnv` above is kept as-is for back-compat; this adds the explicit
// required/optional model used at app startup, in /dashboard/security, and in
// auth diagnostics. NEVER returns raw secret values (only present/valid + masked).
// =============================================================================

export type EnvRequirement = 'required' | 'optional';

export interface EnvKeyStatus {
  key: string;
  requirement: EnvRequirement;
  present: boolean;
  valid: boolean;
  secret: boolean;
  message?: string;
}

export interface StartupEnvResult {
  /** True when every REQUIRED key is present AND valid. */
  ok: boolean;
  requiredMissing: string[];
  optionalMissing: string[];
  required: EnvKeyStatus[];
  optional: EnvKeyStatus[];
  warnings: EnvWarning[];
  /** Masked, render/log-safe values for PRESENT keys (secrets aggressively masked). */
  masked: Record<string, string>;
}

const STARTUP_REQUIRED: EnvSpec[] = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL', required: true, kind: 'url', secret: false },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true, kind: 'key', secret: false },
  { key: 'NEXT_PUBLIC_APP_URL', required: true, kind: 'url', secret: false },
];

const STARTUP_OPTIONAL: EnvSpec[] = [
  { key: 'SUPABASE_SERVICE_ROLE_KEY', required: false, kind: 'key', secret: true },
  { key: 'OPENAI_API_KEY', required: false, kind: 'key', secret: true },
  { key: 'YOUTUBE_API_KEY', required: false, kind: 'key', secret: true },
  { key: 'PODCAST_INDEX_API_KEY', required: false, kind: 'key', secret: true },
  // Milestone 87/88 — transactional email + scheduled cron auth (optional; the
  // beta/demo forms and cron degrade gracefully when these are absent).
  { key: 'RESEND_API_KEY', required: false, kind: 'key', secret: true },
  { key: 'RESEND_FROM', required: false, kind: 'string', secret: false },
  { key: 'BETA_NOTIFY_EMAIL', required: false, kind: 'string', secret: false },
  { key: 'CRON_SECRET', required: false, kind: 'key', secret: true },
];

function evalEnvKey(
  spec: EnvSpec,
  requirement: EnvRequirement,
  raw: string | undefined,
  warnings: EnvWarning[],
  masked: Record<string, string>,
): EnvKeyStatus {
  if (isBlank(raw)) {
    return { key: spec.key, requirement, present: false, valid: false, secret: spec.secret };
  }
  const value = raw as string;
  masked[spec.key] = maskValue(value, spec.secret);

  if (isPlaceholder(spec.key, value)) {
    const message = `${spec.key} is using a placeholder value (not configured).`;
    warnings.push({ key: spec.key, message });
    return { key: spec.key, requirement, present: true, valid: false, secret: spec.secret, message };
  }
  if (spec.kind === 'url' && !looksLikeUrl(value)) {
    const message = `${spec.key} is not a valid http(s) URL.`;
    warnings.push({ key: spec.key, message });
    return { key: spec.key, requirement, present: true, valid: false, secret: spec.secret, message };
  }
  return { key: spec.key, requirement, present: true, valid: true, secret: spec.secret };
}

/**
 * Validate startup env with explicit required/optional separation.
 * Required missing/invalid → ok:false (app should warn). Optional missing →
 * degraded only (never blocks). Never exposes raw secret values.
 */
export function validateStartupEnv(env: Record<string, string | undefined>): StartupEnvResult {
  const warnings: EnvWarning[] = [];
  const masked: Record<string, string> = {};

  const required = STARTUP_REQUIRED.map((s) => evalEnvKey(s, 'required', env[s.key], warnings, masked));
  const optional = STARTUP_OPTIONAL.map((s) => evalEnvKey(s, 'optional', env[s.key], warnings, masked));

  // Re-flag any server-only secret accidentally exposed via a NEXT_PUBLIC_ name.
  for (const key of Object.keys(env)) {
    const value = env[key];
    if (isBlank(value)) continue;
    if (/^NEXT_PUBLIC_/.test(key) && /(SERVICE_ROLE|SECRET|PRIVATE|API_KEY)/i.test(key)) {
      warnings.push({
        key,
        message: `${key} exposes a server-only secret to the browser — rename it without the NEXT_PUBLIC_ prefix.`,
      });
    }
  }

  const requiredMissing = required.filter((s) => !s.present).map((s) => s.key);
  const optionalMissing = optional.filter((s) => !s.present).map((s) => s.key);
  const ok = required.every((s) => s.present && s.valid);

  return { ok, requiredMissing, optionalMissing, required, optional, warnings, masked };
}

export interface RequireServerEnvResult {
  ok: boolean;
  missing: string[];
  values: Record<string, string>;
}

/**
 * Throws-safe variant: returns ok:false + the list of missing keys instead of
 * throwing, plus the resolved values for the keys that ARE present. Pure.
 */
export function requireServerEnv(
  env: Record<string, string | undefined>,
  keys: string[],
): RequireServerEnvResult {
  const missing: string[] = [];
  const values: Record<string, string> = {};
  for (const key of keys) {
    const v = env[key];
    if (isBlank(v)) {
      missing.push(key);
    } else {
      values[key] = v as string;
    }
  }
  return { ok: missing.length === 0, missing, values };
}
