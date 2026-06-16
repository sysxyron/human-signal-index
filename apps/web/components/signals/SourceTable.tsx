'use client';

// =============================================================================
// HSI Phase 7 — Source Registry table. Client component: type/status filters,
// optional grouping by type, per-row Capture / Disable / Assign-watchlist /
// Edit / open-detail. Pure presentational over SourceWithStats[] passed in.
// =============================================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Select } from '@hsi/ui';
import { Database, ExternalLink } from 'lucide-react';
import type {
  HsinSourceStatus,
  HsinSourceType,
  HsinWatchlistRecord,
  SourceWithStats,
} from '@hsi/shared-types';
import {
  captureExplanation,
  captureStatusDecor,
  formatDateTime,
  relativeTime,
  sourceTypeLabel,
} from '@/lib/signals/view';
import {
  SourceStatusBadge,
  SourceHealthBadge,
} from './badges';
import { CaptureNowButton } from './CaptureNowButton';
import { SourceForm } from './SourceForm';
import {
  AssignWatchlistControl,
  DisableSourceButton,
  ArchiveSourceButton,
} from './SourceRowActions';
import { EmptyState } from './states';

const SOURCE_TYPES: HsinSourceType[] = [
  'website',
  'rss',
  'youtube',
  'tiktok',
  'podcast',
  'forum',
  'document',
  'manual',
];
const STATUSES: HsinSourceStatus[] = ['active', 'paused', 'disabled', 'error'];

export function SourceTable({
  sources,
  watchlists,
  canManage,
  canCapture,
  canArchive = false,
  demo = false,
}: {
  sources: SourceWithStats[];
  watchlists: HsinWatchlistRecord[];
  canManage: boolean;
  canCapture: boolean;
  canArchive?: boolean;
  demo?: boolean;
}) {
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [grouped, setGrouped] = useState(false);

  const filtered = useMemo(
    () =>
      sources.filter((s) => {
        if (typeFilter && String(s.source.source_type) !== typeFilter) return false;
        if (statusFilter && s.source.status !== statusFilter) return false;
        return true;
      }),
    [sources, typeFilter, statusFilter],
  );

  const groups = useMemo(() => {
    if (!grouped) return [{ key: 'all', label: '', rows: filtered }];
    const map = new Map<string, SourceWithStats[]>();
    for (const s of filtered) {
      const k = String(s.source.source_type);
      const arr = map.get(k) ?? [];
      arr.push(s);
      map.set(k, arr);
    }
    return [...map.entries()].map(([key, rows]) => ({
      key,
      label: sourceTypeLabel(key),
      rows,
    }));
  }, [filtered, grouped]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {sourceTypeLabel(t)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-caption text-text-secondary">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(e) => setGrouped(e.target.checked)}
            className="accent-electric"
          />
          Group by type
        </label>
        <span className="text-caption text-text-muted">
          {filtered.length} source{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Database className="h-5 w-5" />}
          title="No sources match"
          message="Adjust the filters, or add a new monitored source to begin capturing signals."
        />
      ) : (
        groups.map((g) => (
          <div key={g.key} className="space-y-2">
            {g.label ? (
              <h3 className="text-label text-text-muted">{g.label}</h3>
            ) : null}
            <div className="overflow-x-auto rounded-card border border-border bg-surface/60">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {['Source', 'Type', 'Status', 'Health', 'Last checked', 'Signals', 'Capture', 'Snap', 'Diffs', 'Alerts', 'Actions'].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-label font-semibold text-text-muted"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((item) => {
                    const { source, health, signalCount, alertCount, watchlists: wls, capture } = item;
                    const capStatus = capture?.lastEvent?.status;
                    const capDecor = captureStatusDecor(capStatus);
                    const capReason = captureExplanation(item);
                    return (
                    <tr
                      key={source.id}
                      className="border-b border-border/60 align-top transition last:border-0 hover:bg-surface-2/40"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/sources/${source.id}` as never}
                          className="inline-flex items-center gap-1.5 font-semibold text-text-primary hover:text-electric"
                        >
                          {source.name}
                          <ExternalLink className="h-3 w-3 text-text-muted" />
                        </Link>
                        {source.platform ? (
                          <p className="text-caption text-text-muted">{source.platform}</p>
                        ) : null}
                        {wls && wls.length > 0 ? (
                          <p className="mt-0.5 text-caption text-text-muted">
                            Watchlists: {wls.join(', ')}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {sourceTypeLabel(source.source_type)}
                      </td>
                      <td className="px-4 py-3">
                        <SourceStatusBadge status={source.status} />
                      </td>
                      <td className="px-4 py-3">
                        <SourceHealthBadge status={health?.status} />
                      </td>
                      <td
                        className="px-4 py-3 text-caption text-text-secondary"
                        title={formatDateTime(source.last_checked_at)}
                      >
                        {relativeTime(source.last_checked_at)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{signalCount}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center rounded-btn px-1.5 py-0.5 text-caption font-semibold"
                          style={{ color: capDecor.color, backgroundColor: `${capDecor.color}1a` }}
                        >
                          {capDecor.label}
                        </span>
                        <p className="mt-0.5 max-w-[18rem] text-caption text-text-muted">{capReason}</p>
                      </td>
                      <td className="px-4 py-3 text-caption text-text-secondary">{capture?.snapshotsCount ?? 0}</td>
                      <td className="px-4 py-3 text-caption text-text-secondary">{capture?.diffsCount ?? 0}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            alertCount > 0
                              ? 'font-semibold text-risk'
                              : 'text-text-muted'
                          }
                        >
                          {alertCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <CaptureNowButton
                            sourceId={source.id}
                            canCapture={canCapture}
                            demo={demo}
                          />
                          <div className="flex flex-wrap items-center gap-1.5">
                            <SourceForm
                              canManage={canManage}
                              demo={demo}
                              mode="edit"
                              existing={source}
                            />
                            <DisableSourceButton
                              sourceId={source.id}
                              canManage={canManage}
                              demo={demo}
                              disabled={source.status === 'disabled'}
                            />
                            <ArchiveSourceButton
                              sourceId={source.id}
                              canArchive={canArchive}
                              demo={demo}
                              archived={source.status === 'archived'}
                            />
                          </div>
                          <AssignWatchlistControl
                            sourceId={source.id}
                            watchlists={watchlists}
                            canManage={canManage}
                            demo={demo}
                          />
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
