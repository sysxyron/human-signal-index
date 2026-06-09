// =============================================================================
// HSI Phase 14 — SecurityStatCards. The three 24h security counters
// (Failed logins / Access denials / Critical events). Server-safe; reuses the
// IntelStatCard aesthetic.
// =============================================================================

import { KeyRound, ShieldX, AlertOctagon } from 'lucide-react';
import { IntelStatCard } from '@/components/signals/IntelStatCard';
import type { SecurityDashboardData } from '@hsi/shared-types';

export function SecurityStatCards({
  counts,
}: {
  counts: SecurityDashboardData['counts'];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <IntelStatCard
        label="Failed logins (24h)"
        value={counts.failedLogins24h}
        icon={KeyRound}
        accent="#F59E0B"
        hint="Rejected sign-in attempts"
      />
      <IntelStatCard
        label="Access denials (24h)"
        value={counts.accessDenials24h}
        icon={ShieldX}
        accent="#3B82F6"
        hint="RBAC-blocked route requests"
      />
      <IntelStatCard
        label="Critical events (24h)"
        value={counts.criticalEvents24h}
        icon={AlertOctagon}
        accent="#EF4444"
        hint="Severity = critical"
      />
    </div>
  );
}
