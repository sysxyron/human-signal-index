'use client';

// =============================================================================
// HSI Phase 11 — ReplayScrubber. The narrative-replay control surface: a timeline
// scrubber with Play / Pause / Step forward / Step back / Jump-to-milestone, plus
// milestone markers on the track. As the frame index changes it renders the
// current frame's metrics (ReplayFrameView) + a LineChart of the trajectory UP TO
// the current frame. Deterministic client-side animation via setInterval. Takes
// already-projected, typed data (no engine/server imports).
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, LineChart, Button } from '@hsi/ui';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Rewind,
  Flag,
} from 'lucide-react';
import type {
  HsinNarrativeMilestoneRecord,
  HsinReplayFrameRecord,
} from '@hsi/shared-types';
import { ReplayFrameView } from './ReplayFrameView';
import { MilestoneBadge } from './CausalEventBadge';
import {
  formatDate,
  milestoneDecor,
  readFrameMetrics,
  type ReplayFrameMetrics,
} from '@/lib/causal/view';

const PLAY_INTERVAL_MS = 1100;

export function ReplayScrubber({
  frames,
  milestones,
}: {
  frames: HsinReplayFrameRecord[];
  milestones: HsinNarrativeMilestoneRecord[];
}) {
  // Order frames by time, project jsonb → typed metrics once.
  const ordered = useMemo<ReplayFrameMetrics[]>(
    () =>
      [...frames]
        .sort((a, b) => Date.parse(a.frame_timestamp) - Date.parse(b.frame_timestamp))
        .map((f) => readFrameMetrics(f)),
    [frames],
  );

  const orderedMilestones = useMemo(
    () =>
      [...milestones].sort(
        (a, b) =>
          Date.parse(a.occurred_at ?? a.created_at) -
          Date.parse(b.occurred_at ?? b.created_at),
      ),
    [milestones],
  );

  const count = ordered.length;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clamp = useCallback(
    (i: number) => Math.max(0, Math.min(count - 1, i)),
    [count],
  );

  const stepForward = useCallback(() => setIndex((i) => clamp(i + 1)), [clamp]);
  const stepBack = useCallback(() => setIndex((i) => clamp(i - 1)), [clamp]);
  const restart = useCallback(() => {
    setPlaying(false);
    setIndex(0);
  }, []);

  // Deterministic playback: advance one frame per interval; stop at the end.
  useEffect(() => {
    if (!playing) {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
      return;
    }
    timer.current = setInterval(() => {
      setIndex((i) => {
        if (i >= count - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, PLAY_INTERVAL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [playing, count]);

  if (count === 0) {
    return (
      <Card className="py-8 text-center" padded>
        <p className="text-body-sm text-text-muted">
          No replay frames available for this narrative.
        </p>
      </Card>
    );
  }

  const current = ordered[clamp(index)];

  // Map each milestone to the nearest frame index for the track markers + jump.
  const milestoneMarkers = orderedMilestones.map((m) => {
    const at = Date.parse(m.occurred_at ?? m.created_at);
    let best = 0;
    let bestDelta = Infinity;
    ordered.forEach((f, i) => {
      const d = Math.abs(Date.parse(f.frameTimestamp) - at);
      if (d < bestDelta) {
        bestDelta = d;
        best = i;
      }
    });
    return { milestone: m, frameIndex: best };
  });

  // LineChart trajectory UP TO the current frame (signals + amplification).
  const upto = ordered.slice(0, clamp(index) + 1);
  const xLabels = upto.map((f) => formatDate(f.frameTimestamp));
  const series = [
    { name: 'Signals', color: '#3B82F6', data: upto.map((f) => f.signals) },
    {
      name: 'Amplification',
      color: '#F59E0B',
      data: upto.map((f) => f.amplification),
    },
  ];

  const pct = count > 1 ? (clamp(index) / (count - 1)) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="space-y-4" padded>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={restart} title="Restart">
            <Rewind className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={stepBack} disabled={index <= 0}>
            <SkipBack className="h-4 w-4" /> Back
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setPlaying((p) => !p)}
            disabled={index >= count - 1 && !playing}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {playing ? 'Pause' : 'Play'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={stepForward}
            disabled={index >= count - 1}
          >
            Step <SkipForward className="h-4 w-4" />
          </Button>
          <span className="ml-auto font-mono text-caption text-text-muted">
            frame {clamp(index) + 1} / {count}
          </span>
        </div>

        {/* Scrubber track with milestone markers */}
        <div className="space-y-2">
          <div className="relative h-8">
            <input
              type="range"
              min={0}
              max={count - 1}
              step={1}
              value={clamp(index)}
              onChange={(e) => {
                setPlaying(false);
                setIndex(clamp(Number(e.target.value)));
              }}
              aria-label="Replay timeline scrubber"
              className="absolute inset-x-0 top-3 z-10 w-full cursor-pointer accent-[#3B82F6]"
            />
            {/* progress fill */}
            <div className="pointer-events-none absolute left-0 top-[15px] h-1 w-full rounded-full bg-surface-2">
              <div
                className="h-1 rounded-full bg-electric"
                style={{ width: `${pct}%` }}
              />
            </div>
            {/* milestone markers */}
            {milestoneMarkers.map(({ milestone, frameIndex }) => {
              const left = count > 1 ? (frameIndex / (count - 1)) * 100 : 0;
              const decor = milestoneDecor(milestone.milestone_type);
              return (
                <button
                  key={milestone.id}
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setIndex(clamp(frameIndex));
                  }}
                  title={`Jump to ${decor.label} — ${formatDate(milestone.occurred_at ?? milestone.created_at)}`}
                  className="absolute top-0 z-20 -translate-x-1/2"
                  style={{ left: `${left}%` }}
                >
                  <span
                    className="block h-3 w-3 rounded-full border-2 border-surface"
                    style={{ backgroundColor: decor.color }}
                  />
                </button>
              );
            })}
          </div>

          {/* Jump-to-milestone chips */}
          {milestoneMarkers.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-label text-text-muted">
                <Flag className="h-3.5 w-3.5" /> Jump to:
              </span>
              {milestoneMarkers.map(({ milestone, frameIndex }) => (
                <button
                  key={`chip-${milestone.id}`}
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setIndex(clamp(frameIndex));
                  }}
                >
                  <MilestoneBadge type={milestone.milestone_type} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      {/* Current frame metrics */}
      <Card padded>
        <ReplayFrameView frame={current} />
      </Card>

      {/* Trajectory up to the current frame */}
      <Card className="space-y-3" padded>
        <h3 className="text-h6 font-semibold text-text-primary">
          Trajectory to this point
        </h3>
        {upto.length < 2 ? (
          <p className="text-caption text-text-muted">
            Advance the scrubber to chart the narrative&apos;s trajectory.
          </p>
        ) : (
          <LineChart height={200} xLabels={xLabels} series={series} showLegend />
        )}
      </Card>
    </div>
  );
}
