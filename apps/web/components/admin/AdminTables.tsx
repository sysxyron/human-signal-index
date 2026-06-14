// =============================================================================
// HSI Phase 24B — read-only admin tables: TestersTable + AccessLogsTable.
// Server-safe presentational.
// =============================================================================

import { Card } from '@hsi/ui';
import { CheckCircle2, Circle } from 'lucide-react';
import type { AdminAccessLogsData, AdminTestersData } from '@hsi/shared-types';
import { formatDateTime, statusColor, statusLabel } from '@/lib/admin/view';

export function TestersTable({ data }: { data: AdminTestersData }) {
  if (data.testers.length === 0) {
    return <Card className="border-border p-6 text-center text-caption text-text-muted" padded>No testers yet. Invite users from the Users console.</Card>;
  }
  return (
    <Card className="overflow-x-auto border-border p-0" padded={false}>
      <table className="w-full text-caption">
        <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
          <tr>
            <th className="px-4 py-2 text-left">Tester</th><th className="px-4 py-2 text-left">Role</th><th className="px-4 py-2 text-left">Team</th>
            <th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2 text-left">Last login</th>
            <th className="px-4 py-2 text-right">Signals</th><th className="px-4 py-2 text-right">Reviews</th><th className="px-4 py-2 text-right">Reports</th>
            <th className="px-4 py-2 text-center">Ready</th>
          </tr>
        </thead>
        <tbody>
          {data.testers.map((t) => (
            <tr key={t.id} className="border-b border-border/50 last:border-0">
              <td className="px-4 py-2.5"><div className="font-medium text-text-primary">{t.name ?? t.email.split('@')[0]}</div><div className="text-label text-text-muted">{t.email}</div></td>
              <td className="px-4 py-2.5 text-text-secondary">{t.role ?? '—'}</td>
              <td className="px-4 py-2.5 text-text-secondary">{t.team ?? '—'}</td>
              <td className="px-4 py-2.5"><span className="text-label font-semibold" style={{ color: statusColor(t.status) }}>{statusLabel(t.status)}</span></td>
              <td className="px-4 py-2.5 text-text-muted">{formatDateTime(t.lastLoginAt)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{t.signalsCreated}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{t.reviewsCompleted}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{t.reportsSubmitted}</td>
              <td className="px-4 py-2.5 text-center">{t.ready ? <CheckCircle2 className="mx-auto h-4 w-4 text-verified" /> : <Circle className="mx-auto h-4 w-4 text-text-muted" />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const SEV_COLOR: Record<string, string> = { info: '#3B82F6', warning: '#F59E0B', error: '#EF4444', critical: '#EF4444' };

export function AccessLogsTable({ data }: { data: AdminAccessLogsData }) {
  if (data.events.length === 0) {
    return <Card className="border-border p-6 text-center text-caption text-text-muted" padded>No access events recorded yet.</Card>;
  }
  return (
    <Card className="overflow-x-auto border-border p-0" padded={false}>
      <table className="w-full text-caption">
        <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
          <tr><th className="px-4 py-2 text-left">When</th><th className="px-4 py-2 text-left">Actor</th><th className="px-4 py-2 text-left">Event</th><th className="px-4 py-2 text-left">Detail</th></tr>
        </thead>
        <tbody>
          {data.events.map((e) => (
            <tr key={e.id} className="border-b border-border/50 last:border-0">
              <td className="px-4 py-2.5 whitespace-nowrap text-text-muted">{formatDateTime(e.createdAt)}</td>
              <td className="px-4 py-2.5 text-text-secondary">{e.email ?? e.userId ?? 'system'}</td>
              <td className="px-4 py-2.5"><span className="rounded-full px-2 py-0.5 text-label font-semibold" style={{ backgroundColor: `${SEV_COLOR[e.severity ?? 'info']}1f`, color: SEV_COLOR[e.severity ?? 'info'] }}>{e.eventType ?? '—'}</span></td>
              <td className="px-4 py-2.5 text-text-secondary">{e.message ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
