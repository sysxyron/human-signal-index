// =============================================================================
// HSI Phase 74.1 — Protected read-mode notice (server, runtime-flag driven).
// Surfaces a controlled, degraded-read notice on dashboard surfaces when Edge
// Config `protectedReadMode` (or protected_read / maintenance mode) is active.
// Advisory only — it does not change auth, RBAC, or what data is returned.
// =============================================================================

import { ShieldAlert } from 'lucide-react';
import { isProtectedReadMode } from '@/lib/hsi/edge-config';

export async function ProtectedReadNotice() {
  if (!(await isProtectedReadMode())) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b border-electric/40 bg-electric/10 px-4 py-2 text-caption text-electric">
      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
      <span>Protected read mode is active. Some heavy panels may show cached or summarized data to reduce load. Admin access is unchanged.</span>
    </div>
  );
}
