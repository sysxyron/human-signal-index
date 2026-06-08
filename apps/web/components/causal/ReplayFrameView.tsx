'use client';

// =============================================================================
// HSI Phase 11 — ReplayFrameView. Renders the current replay frame as a grid of
// animated stat cards (signals / sources / communities / amplification /
// influence in-out / reliability / forecast / changeType) plus the event-type
// badges active at this frame. Client component (used by the scrubber) but takes
// only a typed, already-projected metrics object — no engine/server imports.
// =============================================================================

import {
  Activity,
  Database,
  Network,
  Zap,
  ShieldCheck,
  ArrowDownToLine,
  ArrowUpFromLine,
  LineChart,
} from 'lucide-react';
import type { ReplayFrameMetrics } from '@/lib/causal/view';
import { CausalEventBadge } from './CausalEventBadge';
import { formatDate } from '@/lib/causal/view';

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  suffix,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  accent: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-card border border-border bg-surface-2/40 p-3">
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${accent}1f`, color: accent }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-1.5 text-label text-text-muted">{label}</p>
      <p
        key={value}
        className="animate-fade-up text-xl font-bold tabular-nums text-text-primary"
      >
        {Math.round(value)}
        {suffix ? <span className="text-caption text-text-muted">{suffix}</span> : null}
      </p>
    </div>
  );
}

export function ReplayFrameView({ frame }: { frame: ReplayFrameMetrics }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label text-text-muted">Frame</span>
        <span className="font-mono text-caption font-semibold text-text-primary">
          {formatDate(frame.frameTimestamp)}
        </span>
        {frame.forecast ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple/40 bg-purple/10 px-2.5 py-1 text-caption font-semibold text-[#8B5CF6]">
            <LineChart className="h-3.5 w-3.5" /> forecast: {frame.forecast}
          </span>
        ) : null}
        {frame.changeType ? (
          <span className="rounded-full border border-border bg-surface-2/60 px-2.5 py-1 text-caption text-text-secondary">
            {frame.changeType}
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Signals" value={frame.signals} icon={Activity} accent="#3B82F6" />
        <StatCard label="Sources" value={frame.sources} icon={Database} accent="#06B6D4" />
        <StatCard
          label="Communities"
          value={frame.communities}
          icon={Network}
          accent="#10B981"
        />
        <StatCard
          label="Amplification"
          value={frame.amplification}
          icon={Zap}
          accent="#F59E0B"
        />
        <StatCard
          label="Reliability"
          value={frame.reliability}
          icon={ShieldCheck}
          accent="#10B981"
        />
        <StatCard
          label="Influence in"
          value={frame.influenceIn}
          icon={ArrowDownToLine}
          accent="#EC4899"
        />
        <StatCard
          label="Influence out"
          value={frame.influenceOut}
          icon={ArrowUpFromLine}
          accent="#EC4899"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-label text-text-muted">Active events this frame</p>
        {frame.events.length === 0 ? (
          <p className="text-caption text-text-muted">No causal events fired this frame.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {frame.events.map((ev, i) => (
              <CausalEventBadge key={`${ev}-${i}`} type={ev} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
