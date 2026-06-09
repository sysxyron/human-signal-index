// =============================================================================
// Health-response shaper — PURE.
//
// A consistent envelope for /health-style probes. The key safety property: a
// health response NEVER leaks secrets — redactDetails() strips/masks any
// secret-like key (key/secret/token/password/authorization) at any depth before
// it goes out.
//
// PURITY: no imports. No next/*, no Supabase, no Date.now()/Math.random().
// =============================================================================

export type HealthStatus = 'ok' | 'degraded' | 'down' | 'unconfigured';

export interface HealthResponse {
  ok: boolean;
  service: string;
  status: HealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

const SECRET_KEY_RE = /key|secret|token|password|authorization/i;
const REDACTED = '[REDACTED]';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Recursively strip/mask any property whose KEY looks secret-like. Arrays and
 * nested objects are walked. Returns a new object; the input is not mutated.
 */
export function redactDetails(details: Record<string, unknown>): Record<string, unknown> {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (isPlainObject(value)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (SECRET_KEY_RE.test(k)) {
          out[k] = REDACTED;
        } else {
          out[k] = walk(v);
        }
      }
      return out;
    }
    return value;
  };
  return walk(details) as Record<string, unknown>;
}

function defaultStatus(ok: boolean): HealthStatus {
  return ok ? 'ok' : 'down';
}

/**
 * Shape a health result into the canonical envelope. `ok` is derived from the
 * resolved status when an explicit status is supplied (only 'ok' is healthy);
 * otherwise it follows the passed `ok`. Details are always redacted.
 */
export function shapeHealth(
  service: string,
  input: { ok: boolean; status?: HealthStatus; message: string; details?: Record<string, unknown> },
): HealthResponse {
  const status: HealthStatus = input.status ?? defaultStatus(input.ok);
  const ok = input.status ? status === 'ok' : input.ok;
  const res: HealthResponse = {
    ok,
    service,
    status,
    message: input.message,
  };
  if (input.details) res.details = redactDetails(input.details);
  return res;
}

/** Convenience: a healthy (status 'ok') response. */
export function healthy(
  service: string,
  message: string,
  details?: Record<string, unknown>,
): HealthResponse {
  return shapeHealth(service, { ok: true, status: 'ok', message, details });
}

/** Convenience: an unhealthy (status 'down') response. */
export function unhealthy(
  service: string,
  message: string,
  details?: Record<string, unknown>,
): HealthResponse {
  return shapeHealth(service, { ok: false, status: 'down', message, details });
}

/** Convenience: an unconfigured (missing env) response — not ok, but distinct. */
export function unconfigured(service: string, message: string): HealthResponse {
  return shapeHealth(service, { ok: false, status: 'unconfigured', message });
}
