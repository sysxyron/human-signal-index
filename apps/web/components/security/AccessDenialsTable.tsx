// =============================================================================
// HSI Phase 14 — AccessDenialsTable. RBAC-blocked route requests
// (route / required role / actual role / when). Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { ShieldX } from 'lucide-react';
import type { AccessDenialRecord } from '@hsi/shared-types';
import { displayOrDash, formatDateTime } from '@/lib/security/view';

export function AccessDenialsTable({ rows }: { rows: AccessDenialRecord[] }) {
  return (
    <Card className="space-y-3" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <ShieldX className="h-4 w-4 text-electric" /> Access denials
      </h3>
      {rows.length === 0 ? (
        <p className="text-body-sm text-text-secondary">No access denials recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-caption">
            <thead className="text-label text-text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Route</th>
                <th className="py-2 pr-3 font-medium">Required</th>
                <th className="py-2 pr-3 font-medium">Actual</th>
                <th className="py-2 pr-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3 font-mono text-text-secondary">
                    {displayOrDash(r.route)}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="rounded-btn border border-border bg-surface-2/60 px-2 py-0.5 font-mono text-text-secondary">
                      {displayOrDash(r.required_role)}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="rounded-btn border border-border bg-surface-2/60 px-2 py-0.5 font-mono text-text-muted">
                      {displayOrDash(r.actual_role)}
                    </span>
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
