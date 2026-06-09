// =============================================================================
// HSI Phase 14 — LoginAttemptsTable. Recent failed login attempts
// (email / ip / when). Server-safe. Values are already redacted by the action.
// =============================================================================

import { Card } from '@hsi/ui';
import { KeyRound } from 'lucide-react';
import type { LoginAttemptRecord } from '@hsi/shared-types';
import { SeverityBadge } from './HealthStatusBadge';
import { displayOrDash, formatDateTime } from '@/lib/security/view';

export function LoginAttemptsTable({ rows }: { rows: LoginAttemptRecord[] }) {
  return (
    <Card className="space-y-3" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <KeyRound className="h-4 w-4 text-warning" /> Failed login attempts
      </h3>
      {rows.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          No failed login attempts recorded.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-caption">
            <thead className="text-label text-text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">IP address</th>
                <th className="py-2 pr-3 font-medium">Severity</th>
                <th className="py-2 pr-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3 font-mono text-text-secondary">
                    {displayOrDash(r.email)}
                  </td>
                  <td className="py-2 pr-3 font-mono text-text-muted">
                    {displayOrDash(r.ip_address)}
                  </td>
                  <td className="py-2 pr-3">
                    <SeverityBadge severity={r.severity} />
                  </td>
                  <td className="py-2 pr-3 text-text-secondary">
                    {formatDateTime(r.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
