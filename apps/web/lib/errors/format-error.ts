// =============================================================================
// Shared error formatting — turns ANY thrown/returned value into a readable
// message + structured details. Built to defeat "[object Object]" rendering of
// Supabase / PostgREST error objects (which are plain objects, NOT Error
// instances: { message, code, details, hint }).
//
// Used by the DAL `fail()` helpers (server) and the error panels (client) so a
// failed query NEVER surfaces as "[object Object]" and migration/RLS problems
// are spelled out for the operator.
// =============================================================================

export interface ErrorDetails {
  message: string;
  code?: string;
  hint?: string;
  details?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Normalize any value into { message, code, hint, details }.
 * Handles: Error instances, Supabase/PostgREST error objects, plain objects,
 * strings, and null/undefined.
 */
export function formatErrorDetails(error: unknown): ErrorDetails {
  if (error === null || error === undefined) {
    return { message: 'Unknown error (no details provided).' };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  if (typeof error === 'number' || typeof error === 'boolean') {
    return { message: String(error) };
  }
  if (error instanceof Error) {
    const rec = error as unknown as Record<string, unknown>;
    return {
      message: error.message || error.name || 'Error',
      code: str(rec.code),
      hint: str(rec.hint),
      details: str(rec.details),
    };
  }
  if (isRecord(error)) {
    // Supabase PostgrestError: { message, details, hint, code }
    // GoTrue/auth: { message, status, code } | { error, error_description }
    const message =
      str(error.message) ??
      str(error.msg) ??
      str(error.error_description) ??
      str(error.error) ??
      '';
    const code =
      str(error.code) ??
      (typeof error.status === 'number' ? String(error.status) : str(error.status));
    const hint = str(error.hint);
    const details = str(error.details) ?? str(error.detail);
    if (message) return { message, code, hint, details };
    // Object with no recognizable message → JSON (never "[object Object]").
    try {
      return { message: JSON.stringify(error), code, hint, details };
    } catch {
      return { message: 'Unserializable error object.', code, hint, details };
    }
  }
  return { message: String(error) };
}

// Postgres SQLSTATE codes worth special-casing.
const UNDEFINED_TABLE = '42P01'; // relation does not exist
const UNDEFINED_COLUMN = '42703';
const INSUFFICIENT_PRIVILEGE = '42501'; // RLS / GRANT

/** Pull a table/relation name out of a Postgres/PostgREST error text. */
function extractRelation(text: string): string | undefined {
  const patterns = [
    /relation "([^"]+)"/i, // PG: relation "public.hsin_sources" does not exist
    /find the table '([^']+)'/i, // PGRST205: Could not find the table 'public.hsin_sources'
    /table "([^"]+)"/i,
    /['"]([a-z0-9_]+\.[a-z0-9_]+)['"]/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].replace(/^public\./, '');
  }
  return undefined;
}

/**
 * A single human-readable error string. Special-cases the two operator-facing
 * failure modes the dashboards hit most:
 *   - missing table / unapplied migration  → actionable message (+ table name)
 *   - row-level-security / permission denied → actionable message
 * Otherwise: "<message> [code] — <hint>".
 */
export function formatErrorMessage(error: unknown): string {
  const d = formatErrorDetails(error);
  const code = d.code ?? '';
  const haystack = `${d.message} ${d.details ?? ''} ${d.hint ?? ''}`;

  // Missing table / migration not applied.
  if (
    code === UNDEFINED_TABLE ||
    code === 'PGRST205' ||
    /does not exist|schema cache|undefined[_ ]table|find the table/i.test(haystack)
  ) {
    const rel = extractRelation(haystack);
    return rel
      ? `Database table missing or migration not applied: ${rel}.`
      : 'Database table missing or migration not applied. Apply the latest Supabase migrations (0001–0011).';
  }

  // Missing column (often a migration mismatch too).
  if (code === UNDEFINED_COLUMN || /column .* does not exist/i.test(haystack)) {
    return `Database schema out of date (missing column). Apply the latest migrations. ${d.message}`;
  }

  // Row-level security / permission.
  if (
    code === INSUFFICIENT_PRIVILEGE ||
    code === 'PGRST301' ||
    /row-level security|permission denied|insufficient_privilege|violates row-level/i.test(
      haystack,
    )
  ) {
    return `Access blocked by a row-level security (RLS) policy${
      code ? ` [${code}]` : ''
    }. Your role may lack access, or RLS/migrations need attention.`;
  }

  // Network failure reaching the database (e.g. unreachable Supabase).
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network|timeout/i.test(haystack)) {
    return `Could not reach the database (${d.message}). Check that Supabase is running and the URL is correct.`;
  }

  let msg = d.message || 'Unknown error.';
  if (code) msg += ` [${code}]`;
  if (d.hint) msg += ` — ${d.hint}`;
  return msg;
}

/**
 * Log the FULL error safely (server or client), with structured fields and the
 * raw value, without throwing on circular references. Call alongside returning
 * a formatted message so nothing is swallowed.
 */
export function logError(context: string, error: unknown): void {
  const d = formatErrorDetails(error);
  try {
    // eslint-disable-next-line no-console
    console.error(`[${context}] ${d.message}`, {
      code: d.code,
      hint: d.hint,
      details: d.details,
      raw: error,
    });
  } catch {
    // eslint-disable-next-line no-console
    console.error(`[${context}] (error while logging error)`, d.message);
  }
}
