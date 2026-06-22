// =============================================================================
// HSI Phase 74.2 — Backend availability registry (PURE). The single source of
// truth for which read backends actually exist. Today ONLY `primary` (Coolify
// Supabase, the write system of record) is live. Replica / D1 / cache are
// declared but NOT implemented — their availability is honestly `false`, so the
// resolver always falls back to primary. Flipping one of these to `available`
// without a real backend would fabricate capability — do not.
// =============================================================================

import type { ReadBackend } from './read-backends';

export interface BackendCapability { available: boolean; reads: boolean; writes: boolean }

export const BACKEND_AVAILABILITY: Record<ReadBackend, BackendCapability> = {
  primary: { available: true, reads: true, writes: true },
  // Not implemented yet — kept false until a real backend is wired.
  replica: { available: false, reads: false, writes: false },
  d1: { available: false, reads: false, writes: false },
  cache: { available: false, reads: false, writes: false },
};

export function getBackendAvailability(): Record<ReadBackend, BackendCapability> {
  return BACKEND_AVAILABILITY;
}

/** True only when the backend exists AND can serve reads. PURE. */
export function isBackendReadable(backend: ReadBackend, registry: Record<ReadBackend, BackendCapability> = BACKEND_AVAILABILITY): boolean {
  const cap = registry[backend];
  return Boolean(cap && cap.available && cap.reads);
}
