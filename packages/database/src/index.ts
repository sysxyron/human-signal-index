// =============================================================================
// @hsi/database — public entry point.
// Re-exports the Supabase client factories and the shared domain types so
// consumers can `import { createServerClient, type Signal } from '@hsi/database'`.
// =============================================================================

export {
  supabase,
  supabaseAdmin,
  createBrowserClient,
  createServerClient,
  createServiceRoleClient,
  createEvidenceHash,
  HASH_ALGORITHM
} from './supabaseClient';

// Re-export domain types/enums from the shared-types package for convenience.
export * from '@hsi/shared-types';
