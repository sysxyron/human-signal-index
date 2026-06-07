import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Human Signal Index — Supabase client factories
//
// THREE WAYS TO TALK TO SUPABASE:
//   1. Browser / anon client  -> uses the public anon key. RLS applies. Safe to
//      ship to the client. Use for unauthenticated reads (published reports) and
//      for authenticated user sessions (the user's JWT scopes their access).
//   2. Server client (per-request) -> created on the server with the anon key
//      but optionally configured with the caller's access token so RLS evaluates
//      `auth.uid()` correctly. Use in server actions / route handlers.
//   3. Service-role client -> bypasses RLS entirely. Use ONLY in trusted
//      server-side code (ingestion workers, AI runs, seeding, admin tasks).
//      NEVER import or expose this in browser bundles.
// =============================================================================

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function assertUrlAndAnon(): void {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase URL and anon key are required. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }
}

// Import-safe fallbacks. `createClient` throws if the URL is empty, so when env
// is unconfigured we construct the eager singletons against harmless local
// placeholders. This keeps merely *importing* this module side-effect-safe
// (e.g. during `next build` page-data collection); any real network call still
// fails and is surfaced via the throwing factory functions below (which callers
// wrap in try/catch). Configure real env to talk to the live database.
const FALLBACK_URL = 'http://127.0.0.1:54321';
const FALLBACK_ANON = 'anon-placeholder-key';

// -----------------------------------------------------------------------------
// 1. Browser / anon singleton.
//    RLS-enforced. Safe to expose to the client.
// -----------------------------------------------------------------------------
export const supabase: SupabaseClient = createClient(
  supabaseUrl || FALLBACK_URL,
  supabaseAnonKey || FALLBACK_ANON,
  {
    auth: { persistSession: false }
  }
);

/**
 * Returns a fresh browser-safe (anon-key) client. Prefer the shared `supabase`
 * singleton in app code; use this when you need an isolated instance.
 */
export function createBrowserClient(): SupabaseClient {
  assertUrlAndAnon();
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
}

// -----------------------------------------------------------------------------
// 2. Server client (per-request), RLS-enforced.
//    Pass the caller's access token so `auth.uid()` resolves inside policies.
//    Use in server components, route handlers, and server actions.
// -----------------------------------------------------------------------------
/**
 * Create a server-side, RLS-enforced client. If `accessToken` is provided, the
 * request runs as that authenticated user (policies see their `auth.uid()`).
 * Without a token it behaves as the anon role (published-only access).
 */
export function createServerClient(accessToken?: string): SupabaseClient {
  assertUrlAndAnon();
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined
  });
}

// -----------------------------------------------------------------------------
// 3. Service-role client. BYPASSES RLS. SERVER-ONLY.
//    Never expose the service role key to the client.
// -----------------------------------------------------------------------------
/**
 * Create a service-role client that BYPASSES RLS. Use ONLY in trusted
 * server-side contexts (workers, seeding, admin tooling). Throws if the
 * service-role key is missing so misconfiguration fails loudly instead of
 * silently downgrading to anon access.
 */
export function createServiceRoleClient(): SupabaseClient {
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required for the service-role client.');
  }
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for the service-role client. ' +
        'This must NEVER be exposed to the browser.'
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/**
 * Lazily-created service-role singleton. Falls back to the anon client only if
 * no service-role key is configured (development convenience). In production,
 * prefer `createServiceRoleClient()` which throws on misconfiguration.
 */
export const supabaseAdmin: SupabaseClient =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : supabase;

// -----------------------------------------------------------------------------
// Chain-of-custody hashing helpers (used when capturing evidence).
// -----------------------------------------------------------------------------
export const HASH_ALGORITHM = 'SHA-256';

/** Compute a hex SHA-256 digest for evidence integrity (Web Crypto). */
export async function createEvidenceHash(text: string): Promise<string> {
  if (typeof crypto?.subtle === 'undefined') {
    return '';
  }
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest(HASH_ALGORITHM, data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
