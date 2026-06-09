// =============================================================================
// HSI Phase 14 — RbacAuditPanel. The protected-route map: every gated route and
// the minimum app role required to reach it (longest-prefix wins). Sourced from
// the action's RBAC audit. Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { Lock } from 'lucide-react';

/**
 * One audited protected route. Structurally compatible with the rbac-audit
 * pure helper's `AuditedRoute` (route + minRole) without importing the module.
 */
export interface RbacAuditRow {
  route: string;
  minRole: string;
}

const ROLE_COLOR: Record<string, string> = {
  admin: '#EF4444',
  curator: '#8B5CF6',
  reviewer: '#3B82F6',
  researcher: '#10B981',
  viewer: '#94A3B8',
};

function roleColor(role: string): string {
  return ROLE_COLOR[role.toLowerCase()] ?? '#94A3B8';
}

export function RbacAuditPanel({ routes }: { routes: RbacAuditRow[] }) {
  return (
    <Card className="space-y-3" padded>
      <div>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Lock className="h-4 w-4 text-electric" /> RBAC audit — protected routes
        </h3>
        <p className="mt-1 text-caption text-text-muted">
          Minimum app role required per route prefix. The longest matching prefix
          wins, so a more specific rule overrides a broader one.
        </p>
      </div>
      {routes.length === 0 ? (
        <p className="text-body-sm text-text-secondary">No protected routes mapped.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-caption">
            <thead className="text-label text-text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Route prefix</th>
                <th className="py-2 pr-3 font-medium">Minimum role</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => {
                const color = roleColor(r.minRole);
                return (
                  <tr key={r.route} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-mono text-text-secondary">{r.route}</td>
                    <td className="py-2 pr-3">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold"
                        style={{
                          backgroundColor: `${color}1f`,
                          color,
                          border: `1px solid ${color}55`,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        {r.minRole}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
