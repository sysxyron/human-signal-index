// =============================================================================
// HSI Phase 74.1 — Maintenance banner (server, runtime-flag driven). Renders a
// global notice when Edge Config `maintenanceBanner` is true. Never throws (the
// config helper degrades to safe defaults). Renders nothing when off.
// =============================================================================

import { AlertTriangle } from 'lucide-react';
import { getHsiRuntimeConfig } from '@/lib/hsi/edge-config';

const FALLBACK = 'HSI is currently operating in maintenance mode. Some features may be limited.';

export async function MaintenanceBanner() {
  const c = await getHsiRuntimeConfig();
  if (!c.maintenanceBanner) return null;
  const message = c.maintenanceMessage.trim() || FALLBACK;
  return (
    <div role="status" className="flex items-center justify-center gap-2 border-b border-warning/40 bg-warning/10 px-4 py-2 text-center text-caption font-medium text-warning">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
