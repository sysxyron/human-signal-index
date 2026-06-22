// =============================================================================
// HSI Phase 74.2 — Read client facade (SERVER-ONLY). Returns the appropriate
// PRIMARY Supabase client for a read scope, plus routing metadata. Effective
// backend is always `primary` today — replica/D1/cache are not active, so this
// never pretends otherwise. Callers can adopt this facade now so future routing
// requires no caller changes. Auth/RLS unchanged: dashboard/admin/system use the
// cookie-backed RLS client; public uses the non-cookie read client.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { readPublicClient } from '@/lib/public-intelligence';
import { resolveReadBackend, type ReadBackend, type ReadScope } from './read-backends';

export interface ReadClientResult {
  client: SupabaseClient | null;
  scope: ReadScope;
  backend: ReadBackend;          // effective (today always 'primary')
  requestedBackend: ReadBackend;
  effectiveBackend: ReadBackend;
  fallbackReason: string | null;
}

async function build(scope: ReadScope): Promise<ReadClientResult> {
  const decision = await resolveReadBackend(scope);
  // Effective backend is primary today regardless of selection — pick the right
  // PRIMARY client for the scope (public = non-cookie read client; everything
  // else = cookie/RLS client). No alternate backend is ever used here.
  const client: SupabaseClient | null = scope === 'public' ? readPublicClient() : createClient();
  return {
    client,
    scope,
    backend: decision.effectiveBackend,
    requestedBackend: decision.requestedBackend,
    effectiveBackend: decision.effectiveBackend,
    fallbackReason: decision.fallbackReason,
  };
}

export function getPublicReadClient(): Promise<ReadClientResult> { return build('public'); }
export function getDashboardReadClient(): Promise<ReadClientResult> { return build('dashboard'); }
export function getAdminReadClient(): Promise<ReadClientResult> { return build('admin'); }
export function getSystemReadClient(): Promise<ReadClientResult> { return build('system'); }
