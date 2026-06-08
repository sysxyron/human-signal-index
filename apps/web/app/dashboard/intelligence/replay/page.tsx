// =============================================================================
// HSI Phase 11 — Narrative Replay (/dashboard/intelligence/replay). Server
// Component, force-dynamic. Pick a narrative (?narrativeId=), getReplayAction()
// returns its ordered replay frames + lifecycle milestones. The client
// ReplayScrubber drives Play / Pause / Step / Jump-to-milestone over the frames,
// rendering the current frame's metrics as animated stat cards + a LineChart up to
// the current frame, with milestone markers on the track. A MilestoneTimeline
// summarizes the narrative's lifecycle. Offline (NOT_CONFIGURED) → labeled demo
// replay from the @hsi/causal-intelligence causalDemo() fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Clapperboard, Info, Flag, GitBranch } from 'lucide-react';
import Link from 'next/link';
import type { MilestonesView, ReplayView } from '@hsi/shared-types';
import { getReplayAction, getMilestonesAction } from '@/lib/causal/actions';
import {
  demoReplayView,
  demoMilestonesView,
  demoNarratives,
} from '@/lib/causal/view';
import { IntelNav } from '@/components/signals/IntelNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { ReplayScrubber } from '@/components/causal/ReplayScrubber';
import { MilestoneTimeline } from '@/components/causal/MilestoneTimeline';
import { NarrativePicker } from '@/components/causal/NarrativePicker';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ReplayPage({
  searchParams,
}: {
  searchParams: { narrativeId?: string };
}) {
  // First resolve the narrative roster (also tells us if we're offline).
  const milestonesRes = await getMilestonesAction();

  let roster: MilestonesView | null = null;
  let isDemo = false;
  if (milestonesRes.ok) {
    roster = milestonesRes.data;
  } else if (milestonesRes.code === 'NOT_CONFIGURED') {
    roster = demoMilestonesView();
    isDemo = true;
  }

  const narratives = roster?.narratives ?? (isDemo ? demoNarratives() : []);
  const selectedId = searchParams.narrativeId?.trim() || narratives[0]?.id || undefined;

  // Resolve the replay for the selected narrative.
  let replay: ReplayView | null = null;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (selectedId) {
    if (isDemo) {
      replay = demoReplayView(selectedId);
    } else {
      const res = await getReplayAction(selectedId);
      if (res.ok) {
        replay = res.data;
      } else if (res.code === 'NOT_CONFIGURED') {
        replay = demoReplayView(selectedId);
        isDemo = true;
      } else {
        errored = { message: res.error, code: res.code };
      }
    }
  }

  const narrativeName =
    replay?.narrative?.name ??
    narratives.find((n) => n.id === selectedId)?.name ??
    selectedId;

  return (
    <>
      <TopNav title="Narrative Replay" subtitle="Scrub a narrative's history frame by frame" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Clapperboard className="h-5 w-5 text-electric" /> Narrative replay
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={'/dashboard/intelligence/causal' as never}
              className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white"
            >
              <GitBranch className="h-3.5 w-3.5" /> Causal intelligence
            </Link>
            {narratives.length > 0 ? (
              <NarrativePicker narratives={narratives} selectedId={selectedId} />
            ) : null}
          </div>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Replay reconstructs a narrative&apos;s history as an ordered series of
            frames — each one the narrative&apos;s state at that moment (signals,
            sources, communities, amplification, influence, forecast) plus the causal
            events firing at that boundary. Scrub, play, step, or jump to a lifecycle
            milestone. Every frame is derived from real snapshots — descriptive only.
          </p>
        </Card>

        {errored ? (
          <ErrorState
            title="Could not load narrative replay"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/intelligence/replay"
          />
        ) : !selectedId ? (
          <EmptyState
            icon={<Clapperboard className="h-5 w-5" />}
            title="No narratives to replay yet"
            message="Once narratives accumulate snapshots and causal intelligence is built, pick one here to scrub its history frame by frame."
          />
        ) : replay && replay.frames.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ReplayScrubber frames={replay.frames} milestones={replay.milestones} />
            </div>
            <Card className="space-y-3" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <Flag className="h-4 w-4 text-electric" /> Lifecycle milestones
              </h3>
              {narrativeName ? (
                <p className="text-caption text-text-muted">{narrativeName}</p>
              ) : null}
              <MilestoneTimeline milestones={replay.milestones} />
            </Card>
          </div>
        ) : (
          <EmptyState
            icon={<Clapperboard className="h-5 w-5" />}
            title="No replay frames for this narrative"
            message="This narrative has no replay frames yet. Rebuild causal intelligence once it has at least two snapshots."
          />
        )}
      </main>
    </>
  );
}
