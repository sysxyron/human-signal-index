// =============================================================================
// HSI Phase 9 — ProviderRunsTable. Recent provider-adapter invocations with
// observability counters (item_count, bytes, http_status) + an outcome badge.
// Server-safe. Failed/blocked runs are never hidden — they carry their reason.
// =============================================================================

import { Card } from '@hsi/ui';
import { Plug } from 'lucide-react';
import type { HsinProviderRunRecord } from '@hsi/shared-types';
import { formatBytes, formatDateTime, titleize } from '@/lib/operations/phase9-view';
import { ProviderRunBadge } from './ProviderReasonBadge';

export function ProviderRunsTable({
  runs,
  title = 'Recent provider runs',
  limit,
}: {
  runs: HsinProviderRunRecord[];
  title?: string;
  limit?: number;
}) {
  const rows = limit ? runs.slice(0, limit) : runs;
  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Plug className="h-4 w-4 text-electric" /> {title}
        </h3>
        <span className="text-caption text-text-muted">{runs.length} run{runs.length === 1 ? '' : 's'}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          No provider runs recorded yet. Runs appear here as adapters fetch sources.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-caption">
            <thead>
              <tr className="border-b border-border text-left text-label text-text-muted">
                <th className="px-2 py-2 font-medium">Provider</th>
                <th className="px-2 py-2 font-medium">Source</th>
                <th className="px-2 py-2 font-medium">Outcome</th>
                <th className="px-2 py-2 text-right font-medium">Items</th>
                <th className="px-2 py-2 text-right font-medium">Bytes</th>
                <th className="px-2 py-2 text-right font-medium">HTTP</th>
                <th className="px-2 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50 last:border-0">
                  <td className="px-2 py-2 font-semibold text-text-primary">{titleize(r.provider_name)}</td>
                  <td className="px-2 py-2 font-mono text-text-muted" title={r.source_id}>
                    {r.source_id ? `${r.source_id.slice(0, 14)}…` : '—'}
                  </td>
                  <td className="px-2 py-2">
                    <ProviderRunBadge run={r} />
                    {r.note ? (
                      <span className="mt-1 block max-w-xs text-[11px] text-text-muted">{r.note}</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-text-primary">{r.item_count ?? '—'}</td>
                  <td className="px-2 py-2 text-right font-mono text-text-secondary">{formatBytes(r.bytes)}</td>
                  <td className="px-2 py-2 text-right font-mono text-text-secondary">{r.http_status ?? '—'}</td>
                  <td className="px-2 py-2 text-text-muted">{formatDateTime(r.finished_at ?? r.started_at ?? r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
