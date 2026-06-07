'use client';

// =============================================================================
// Browser Supabase client (App Router, @supabase/ssr).
//
// Singleton getter `getBrowserSupabase()`. Env-tolerant: when Supabase env is
// empty (the sandbox), it falls back to harmless placeholders so constructing
// the client during hydration never throws. Auth form submits only run in the
// browser on the deploy where real env is present.
// =============================================================================

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from './env';

let browserClient: SupabaseClient | null = null;

/**
 * Returns the process-wide browser Supabase client (created lazily on first
 * call). @supabase/ssr's browser client manages the auth session via cookies so
 * the server can read it. Safe to call from any 'use client' module.
 */
export function getBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(supabaseUrl(), supabaseAnonKey());
  return browserClient;
}
