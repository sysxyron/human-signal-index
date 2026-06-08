// =============================================================================
// HSI Phase 11 — NarrativeCausalSection (ADDITIVE, for the signal detail page).
// Server-safe. Given a narrative's causal bundle (events + chains + milestones +
// explanation, already scoped to that narrative), renders its causal EVENTS
// (evolution / influence surfaced via the typed event explanations), the top
// causal CHAIN ("why it moved"), a compact lifecycle MilestoneTimeline, and a
// prominent link into the Narrative Replay scrubber. Descriptive only. The caller
// wraps this so any failure hides the block.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { GitBranch, Clapperboard } from 'lucide-react';
import type { NarrativeCausalBundle } from '@/lib/causal/actions';
import { DemoBadge } from '@/components/signals/badges';
import { CausalChainFlow } from './CausalChainFlow';
import { EventList } from './EventList';
import { MilestoneTimeline } from './MilestoneTimeline';
import { ChangeExplanation } from './ChangeExplanation';
import { rankChains, rankEvents } from '@/lib/causal/view';

export function NarrativeCausalSection({
  bundle,
  narrativeName,
  narrativeId,
  demo = false,
}: {
  bundle: NarrativeCausalBundle;
  narrativeName?: string;
  narrativeId: string;
  demo?: boolean;
}) {
  const events = rankEvents(bundle.events);
  const chains = rankChains(bundle.chains);

  if (
    events.length === 0 &&
    chains.length === 0 &&
    bundle.milestones.length === 0 &&
    !bundle.explanation
  ) {
    return null;
  }

  const replayHref = `/dashboard/intelligence/replay?narrativeId=${encodeURIComponent(
    narrativeId,
  )}`;

  return (
    <Card className="space-y-4" padded>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <GitBranch className="h-4 w-4 text-electric" /> Narrative causal events &
            evolution
          </h3>
          {demo ? <DemoBadge /> : null}
        </div>
        <Link
          href={replayHref as never}
          className="inline-flex items-center gap-1.5 rounded-btn border border-accent/40 bg-accent/10 px-3 py-1.5 text-caption font-semibold text-accent transition hover:border-accent hover:text-white"
        >
          <Clapperboard className="h-3.5 w-3.5" /> Replay this narrative
        </Link>
      </div>
      {narrativeName ? (
        <p className="text-caption text-text-muted">{narrativeName}</p>
      ) : null}

      {bundle.explanation ? (
        <ChangeExplanation
          explanation={bundle.explanation}
          narrativeName={narrativeName}
        />
      ) : null}

      {events.length > 0 ? (
        <div className="space-y-2">
          <p className="text-label text-text-muted">Causal events & influence</p>
          <EventList events={events} limit={5} />
        </div>
      ) : null}

      {chains.length > 0 ? (
        <div className="space-y-2">
          <p className="text-label text-text-muted">Why it moved</p>
          <CausalChainFlow chain={chains[0]} narrativeName={narrativeName} />
        </div>
      ) : null}

      {bundle.milestones.length > 0 ? (
        <div className="space-y-2">
          <p className="text-label text-text-muted">Lifecycle milestones</p>
          <MilestoneTimeline milestones={bundle.milestones} />
        </div>
      ) : null}
    </Card>
  );
}
