// =============================================================================
// HSI Phase 13 — RecommendationCard. Renders a decision run's recommendation:
// the recommended_action headline, a decision-type badge, a PROMINENT confidence
// band, the grounded reasoning trail, and explicit limitations — plus an optional
// link to the full run. Server-safe. Confidence + reasoning + limitations are
// ALWAYS surfaced; this is a decision AID, never a command or a certainty.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { Target, ArrowRight } from 'lucide-react';
import type { HsinDecisionRunRecord } from '@hsi/shared-types';
import { DecisionTypeBadge, ConfidenceBandBadge } from './badges';
import { ReasoningList } from './ReasoningList';
import { LimitationsPanel } from './LimitationsPanel';
import {
  bandFromConfidence,
  formatDate,
  readLimitations,
  readReasoning,
} from '@/lib/decision/view';

export function RecommendationCard({
  run,
  narrativeName,
  href,
  showLimitations = true,
}: {
  run: HsinDecisionRunRecord;
  narrativeName?: string;
  href?: string;
  showLimitations?: boolean;
}) {
  const reasoning = readReasoning(run);
  const limitations = readLimitations(run);
  const band = bandFromConfidence(run.confidence);

  return (
    <Card className="space-y-3" padded>
      <div className="flex flex-wrap items-center gap-2">
        <DecisionTypeBadge type={run.decision_type} />
        <ConfidenceBandBadge band={band} confidence={run.confidence} prominent />
        <span className="ml-auto text-caption text-text-muted">
          {narrativeName ? (
            <>
              Narrative:{' '}
              <span className="font-semibold text-text-primary">{narrativeName}</span>
            </>
          ) : (
            run.narrative_id
          )}
        </span>
      </div>

      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-electric/15 text-electric">
          <Target className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-body-sm font-semibold leading-snug text-text-primary">
            {run.recommended_action || run.decision_name || 'Recommended action'}
          </p>
          <p className="text-caption text-text-muted">
            Generated {formatDate(run.generated_at ?? run.created_at)} — an aid for a
            human reviewer, never a command.
          </p>
        </div>
      </div>

      <ReasoningList reasoning={reasoning} />

      {showLimitations ? <LimitationsPanel limitations={limitations} /> : null}

      {href ? (
        <Link
          href={href as never}
          className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white"
        >
          Full decision run <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </Card>
  );
}
