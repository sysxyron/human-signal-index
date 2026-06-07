'use client';

import { Plus, Minus, ArrowRight } from 'lucide-react';
import type { WorldDiff } from '@hsi/simulation-engine';

export interface DiffViewerProps {
  diff: WorldDiff;
  /** Labels for the two compared worlds. */
  beforeLabel: string;
  afterLabel: string;
  className?: string;
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    if (Math.abs(v) !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e6)) {
      return v.toExponential(2);
    }
    return Number.isInteger(v) ? String(v) : v.toPrecision(4).replace(/\.?0+$/, '');
  }
  return String(v);
}

/** Added / Removed / Changed diff between two worlds, color-coded. */
export function DiffViewer({ diff, beforeLabel, afterLabel, className = '' }: DiffViewerProps) {
  const empty =
    diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
        <span className="rounded bg-surface-3 px-2 py-0.5 text-text-secondary">{beforeLabel}</span>
        <ArrowRight className="h-3.5 w-3.5" />
        <span className="rounded bg-surface-3 px-2 py-0.5 text-text-secondary">{afterLabel}</span>
        <span className="ml-auto">
          {diff.added.length} added · {diff.removed.length} removed · {diff.changed.length} changed
        </span>
      </div>

      {empty ? (
        <div className="rounded-card border border-border bg-surface-2/50 px-4 py-6 text-center text-caption text-text-muted">
          No differences — these worlds are identical.
        </div>
      ) : null}

      {diff.changed.length > 0 ? (
        <DiffSection title="Changed" color="#3B82F6">
          {diff.changed.map((c) => (
            <div
              key={c.path}
              className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2"
            >
              <span className="truncate font-mono text-[11px] text-text-secondary" title={c.path}>
                {c.path}
              </span>
              <span className="flex items-center gap-2 text-caption">
                <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-text-muted">
                  {fmtVal(c.before)}
                </span>
                <ArrowRight className="h-3 w-3 text-text-muted" />
                <span
                  className="rounded px-1.5 py-0.5 font-mono"
                  style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#93C5FD' }}
                >
                  {fmtVal(c.after)}
                </span>
              </span>
            </div>
          ))}
        </DiffSection>
      ) : null}

      {diff.added.length > 0 ? (
        <DiffSection title="Added" color="#10B981" icon={<Plus className="h-3 w-3" />}>
          {diff.added.map((a) => (
            <DiffLeaf key={a.path} path={a.path} value={fmtVal(a.value)} color="#34D399" />
          ))}
        </DiffSection>
      ) : null}

      {diff.removed.length > 0 ? (
        <DiffSection title="Removed" color="#EF4444" icon={<Minus className="h-3 w-3" />}>
          {diff.removed.map((r) => (
            <DiffLeaf key={r.path} path={r.path} value={fmtVal(r.value)} color="#FCA5A5" strike />
          ))}
        </DiffSection>
      ) : null}
    </div>
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
      <div
        className="inline-flex items-center gap-1.5 text-label"
        style={{ color }}
      >
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
