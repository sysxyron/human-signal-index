'use client';

import { useMemo, useState } from 'react';
import { Card, Select } from '@hsi/ui';
import { GitCompareArrows, Plus, Minus, ArrowRight } from 'lucide-react';
import type { PublicationVersionRecord } from '@hsi/shared-types';
import { diffSnapshots, fmtDiffValue, fmtDate } from '@/lib/governance/view';

/**
 * Version history + a JSON DIFF VIEW comparing two selected publication
 * snapshots' snapshot_json (added / removed / changed leaves), in the DiffViewer
 * pattern. Defaults to comparing the two most recent versions.
 */
export function PublicationVersionDiff({
  versions,
}: {
  versions: PublicationVersionRecord[];
}) {
  const sorted = useMemo(
    () => [...versions].sort((a, b) => a.version_number - b.version_number),
    [versions],
  );

  const defaultBefore = sorted.length >= 2 ? sorted[sorted.length - 2].id : sorted[0]?.id ?? '';
  const defaultAfter = sorted[sorted.length - 1]?.id ?? '';

  const [beforeId, setBeforeId] = useState(defaultBefore);
  const [afterId, setAfterId] = useState(defaultAfter);

  const before = sorted.find((v) => v.id === beforeId);
  const after = sorted.find((v) => v.id === afterId);

  const diff = useMemo(
    () => diffSnapshots(before?.snapshot_json, after?.snapshot_json),
    [before, after],
  );

  if (sorted.length === 0) {
    return (
      <Card padded>
        <p className="text-caption text-text-muted">No versions recorded for this publication.</p>
      </Card>
    );
  }

  const empty =
    diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;

  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center gap-2">
        <GitCompareArrows className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Version history &amp; diff</h3>
      </div>

      {/* Version history */}
      <div className="flex flex-wrap gap-2">
        {sorted.map((v) => (
          <span
            key={v.id}
            className="rounded-full border border-border bg-surface-2/50 px-2.5 py-1 text-caption text-text-secondary"
            title={fmtDate(v.created_at)}
          >
            v{v.version_number}
          </span>
        ))}
      </div>

      {sorted.length < 2 ? (
        <p className="text-caption text-text-muted">
          Only one version exists — there is nothing to diff yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Compare from"
              value={beforeId}
              onChange={(e) => setBeforeId(e.target.value)}
            >
              {sorted.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version_number} — {fmtDate(v.created_at)}
                </option>
              ))}
            </Select>
            <Select label="to" value={afterId} onChange={(e) => setAfterId(e.target.value)}>
              {sorted.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version_number} — {fmtDate(v.created_at)}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
            <span className="rounded bg-surface-3 px-2 py-0.5 text-text-secondary">
              v{before?.version_number}
            </span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span className="rounded bg-surface-3 px-2 py-0.5 text-text-secondary">
              v{after?.version_number}
            </span>
            <span className="ml-auto">
              {diff.added.length} added · {diff.removed.length} removed ·{' '}
              {diff.changed.length} changed
            </span>
          </div>

          {empty ? (
            <div className="rounded-card border border-border bg-surface-2/50 px-4 py-6 text-center text-caption text-text-muted">
              No differences — these snapshots are identical.
            </div>
          ) : null}

          {diff.changed.length > 0 ? (
            <DiffSection title="Changed" color="#3B82F6">
              {diff.changed.map((c) => (
                <div
                  key={c.path}
                  className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2"
                >
                  <span
                    className="truncate font-mono text-[11px] text-text-secondary"
                    title={c.path}
                  >
                    {c.path}
                  </span>
                  <span className="flex items-center gap-2 text-caption">
                    <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-text-muted">
                      {fmtDiffValue(c.before)}
                    </span>
                    <ArrowRight className="h-3 w-3 text-text-muted" />
                    <span
                      className="rounded px-1.5 py-0.5 font-mono"
                      style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#93C5FD' }}
                    >
                      {fmtDiffValue(c.after)}
                    </span>
                  </span>
                </div>
              ))}
            </DiffSection>
          ) : null}

          {diff.added.length > 0 ? (
            <DiffSection title="Added" color="#10B981" icon={<Plus className="h-3 w-3" />}>
              {diff.added.map((a) => (
                <DiffLeaf key={a.path} path={a.path} value={fmtDiffValue(a.after)} color="#34D399" />
              ))}
            </DiffSection>
          ) : null}

          {diff.removed.length > 0 ? (
            <DiffSection title="Removed" color="#EF4444" icon={<Minus className="h-3 w-3" />}>
              {diff.removed.map((r) => (
                <DiffLeaf
                  key={r.path}
                  path={r.path}
                  value={fmtDiffValue(r.before)}
                  color="#FCA5A5"
                  strike
                />
              ))}
            </DiffSection>
          ) : null}
        </>
      )}
    </Card>
  );
}

function DiffSection({
  title,
  color,
  icon,
  children,
}: {
  title: string;
  color: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-1.5 text-label" style={{ color }}>
        {icon}
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function DiffLeaf({
  path,
  value,
  color,
  strike = false,
}: {
  path: string;
  value: string;
  color: string;
  strike?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2">
      <span className="truncate font-mono text-[11px] text-text-secondary" title={path}>
        {path}
      </span>
      <span
        className={`font-mono text-caption ${strike ? 'line-through opacity-70' : ''}`}
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}
