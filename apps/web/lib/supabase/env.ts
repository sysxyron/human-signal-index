// =============================================================================
// Supabase env resolution — env-tolerant, import-safe.
//
// SANDBOX NOTE: the build/typecheck sandbox has EMPTY Supabase env. The
// @supabase/ssr client factories throw if given an empty URL, so we mirror the
// FALLBACK_URL pattern from packages/database/src/supabaseClient.ts: when env is
// missing we hand the factories harmless local placeholders. This keeps merely
// *importing* this module (and constructing a client) side-effect-safe during
// `next build` page-data collection and hydration. Any real network call still
// fails and is surfaced as a DbResult error by the DAL (which wraps calls in
// try/catch). On the deploy, real env is present so clients talk to Supabase.
// =============================================================================

const FALLBACK_URL = 'http://127.0.0.1:54321';
const FALLBACK_ANON = 'anon-placeholder-key';

/** The configured Supabase URL, or a harmless placeholder when env is empty. */
export function supabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    FALLBACK_URL
  );
}

/** The configured anon key, or a harmless placeholder when env is empty. */
export function supabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    FALLBACK_ANON
  );
}

/** True when real Supabase env is configured (not using the placeholders). */
export function isSupabaseConfigured(): boolean {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  return Boolean(url && key);
}
