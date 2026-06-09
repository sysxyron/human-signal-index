// =============================================================================
// HSI Phase 14 — SecurityEventsTable. General security audit-trail events
// (event type / severity / message / when). Critical/error rows are never
// hidden — severity is always shown via SeverityBadge. Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { ScrollText } from 'lucide-react';
import type { SecurityAuditEventRecord } from '@hsi/shared-types';
import { SeverityBadge } from './HealthStatusBadge';
import { displayOrDash, formatDateTime } from '@/lib/security/view';

export function SecurityEventsTable({ rows }: { rows: SecurityAuditEventRecord[] }) {
  return (
    <Card className="space-y-3" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <ScrollText className="h-4 w-4 text-electric" /> Security events
      </h3>
      {rows.length === 0 ? (
        <p className="text-body-sm text-text-secondary">No security events recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-caption">
            <thead className="text-label text-text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Event</th>
                <th className="py-2 pr-3 font-medium">Severity</th>
                <th className="py-2 pr-3 font-medium">Message</th>
                <th className="py-2 pr-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3 font-mono text-text-secondary">
                    {displayOrDash(r.event_type)}
                  </td>
                  <td className="py-2 pr-3">
                    <SeverityBadge severity={r.severity} />
                  </td>
                  <td className="py-2 pr-3 text-text-secondary">
                    <span className="block max-w-md break-words">
                      {displayOrDash(r.message)}
                    </span>
                    {r.route ? (
                      <span className="mt-0.5 block font-mono text-text-muted">
                        {r.route}
                      </span>
                    ) : null}
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
