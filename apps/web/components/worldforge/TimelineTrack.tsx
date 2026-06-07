'use client';

import { Clock } from 'lucide-react';
import type { TimelineEvent } from '@hsi/timeline-engine';
import { categoryColor } from '@/lib/worldforge/confidence';

export interface TimelineTrackProps {
  events: TimelineEvent[];
  /** Total span in years (for the log scale). */
  span: number;
  className?: string;
}

/** Format a year offset into a human-readable deep-time label. */
export function fmtYears(years: number): string {
  if (years <= 0) return 'present (t = 0)';
  if (years >= 1e9) return `${(years / 1e9).toPrecision(3)} Gyr`;
  if (years >= 1e6) return `${(years / 1e6).toPrecision(3)} Myr`;
  if (years >= 1e3) return `${(years / 1e3).toPrecision(3)} kyr`;
  return `${years.toPrecision(3)} yr`;
}

/** Vertical, log-scaled timeline with per-event confidence + category color. */
export function TimelineTrack({ events, span, className = '' }: TimelineTrackProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface-2/50 px-4 py-8 text-center text-caption text-text-muted">
        No timeline events for this configuration.
      </div>
    );
  }

  const minYears = Math.max(
    1,
    Math.min(...events.map((e) => (e.tYears > 0 ? e.tYears : Infinity)).filter(Number.isFinite)),
  );
  const lo = Math.log10(Math.max(minYears, 1));
  const hi = Math.log10(Math.max(span, minYears * 10));
  const place = (y: number): number => {
    if (y <= 0) return 0;
    const f = (Math.log10(Math.max(y, 1)) - lo) / Math.max(hi - lo, 1e-6);
    return Math.min(1, Math.max(0, f));
  };

  return (
    <div className={`relative ${className}`}>
      <ol className="relative space-y-4 border-l-2 border-border pl-6">
        {events.map((e, i) => {
          const color = categoryColor(e.category);
          const frac = place(e.tYears);
          return (
            <li key={`${e.category}-${i}-${e.title}`} className="relative">
              <span
                className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full ring-4 ring-surface"
                style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }}
              />
              <div className="rounded-card border border-border bg-surface-2/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-text-muted" />
                    <span className="font-mono text-caption text-text-secondary">
                      {fmtYears(e.tYears)}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ backgroundColor: `${color}1f`, color }}
                    >
                      {e.category}
                    </span>
                  </div>
                  <span className="flex items-center gap-1.5 text-caption text-text-muted">
                    <span className="h-1 w-16 overflow-hidden rounded-full bg-surface-3">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.round(e.confidence * 100)}%`, backgroundColor: color }}
                      />
                    </span>
                    {Math.round(e.confidence * 100)}%
                  </span>
                </div>
                <p className="mt-1.5 text-body-sm font-semibold text-text-primary">{e.title}</p>
                <p className="mt-0.5 text-caption leading-snug text-text-secondary">
                  {e.description}
                </p>
                {/* log-position indicator */}
                <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full opacity-60"
                    style={{ width: `${Math.round(frac * 100)}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
