// =============================================================================
// HSI Phase 12 — WorldforgeScenarioCard. A materialized alternative-timeline
// scenario: title, the narrative outcome summary, probability/confidence band,
// key world-state metrics, and a link to the originating counterfactual run.
// Server-safe / presentational.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { Globe2, ArrowRight } from 'lucide-react';
import type {
  HsinCounterfactualRunRecord,
  HsinWorldforgeScenarioRecord,
} from '@hsi/shared-types';
import { ConfidenceBandBadge } from './badges';
import { bandFromConfidence, readWorldStateMetrics } from '@/lib/simulation/view';

export function WorldforgeScenarioCard({
  scenario,
  narrativeName,
}: {
  scenario: HsinWorldforgeScenarioRecord & { run?: HsinCounterfactualRunRecord };
  narrativeName?: string;
}) {
  const metrics = readWorldStateMetrics(scenario.world_state).slice(0, 6);
  const runHref = scenario.run
    ? `/dashboard/simulation/counterfactual?runId=${encodeURIComponent(scenario.run.id)}`
    : undefined;

  return (
    <Card className="h-full space-y-3" padded>
      <div className="flex flex-wrap items-start gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-electric/15 text-electric">
          <Globe2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-h6 font-semibold text-text-primary">
            {scenario.scenario_title ?? 'Alternative timeline'}
          </p>
          {narrativeName ? (
            <p className="text-caption text-text-muted">{narrativeName}</p>
          ) : null}
        </div>
        <ConfidenceBandBadge
          band={bandFromConfidence(scenario.confidence)}
          confidence={scenario.confidence}
        />
      </div>

      {scenario.scenario_summary ? (
        <p className="text-caption leading-relaxed text-text-secondary">
          {scenario.scenario_summary}
        </p>
      ) : null}

      {metrics.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((m) => (
            <div
              key={m.key}
              className="rounded-card border border-border bg-surface-2/40 px-2.5 py-2"
            >
              <p className="text-label text-text-muted">{m.label}</p>
              <p className="truncate text-body-sm font-semibold text-text-primary" title={m.value}>
                {m.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {runHref ? (
        <Link
          href={runHref as never}
          className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white"
        >
          View source counterfactual <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </Card>
  );
}
