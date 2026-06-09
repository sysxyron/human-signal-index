// =============================================================================
// HSI Phase 12 — CounterfactualRunCard. A compact card for one counterfactual
// run: scenario-type badge, confidence band (always shown), the "what if?"
// framing, the run summary, and a link to the full counterfactual view. Server-
// safe / presentational.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { ArrowRight, FlaskConical } from 'lucide-react';
import type { HsinCounterfactualRunRecord } from '@hsi/shared-types';
import { ConfidenceBandBadge, ScenarioTypeBadge } from './badges';
import { bandFromConfidence, formatDate, scenarioDecor } from '@/lib/simulation/view';

export function CounterfactualRunCard({
  run,
  narrativeName,
}: {
  run: HsinCounterfactualRunRecord;
  narrativeName?: string;
}) {
  const decor = scenarioDecor(run.scenario_type);
  const href = `/dashboard/simulation/counterfactual?runId=${encodeURIComponent(run.id)}`;
  return (
    <Link href={href as never} className="block">
      <Card className="h-full space-y-3" interactive padded>
        <div className="flex flex-wrap items-center gap-2">
          <ScenarioTypeBadge type={run.scenario_type} />
          <ConfidenceBandBadge
            band={bandFromConfidence(run.confidence)}
            confidence={run.confidence}
          />
          <span className="ml-auto text-caption text-text-muted">
            {formatDate(run.generated_at ?? run.created_at)}
          </span>
        </div>

        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-body-sm font-semibold text-text-primary">
            <FlaskConical className="h-4 w-4 text-electric" />
            {run.scenario_name ?? decor.whatIf}
          </p>
          {narrativeName ? (
            <p className="text-caption text-text-muted">{narrativeName}</p>
          ) : null}
        </div>

        {run.summary ? (
          <p className="line-clamp-3 text-caption leading-relaxed text-text-secondary">
            {run.summary}
          </p>
        ) : (
          <p className="text-caption italic text-text-muted">{decor.whatIf}</p>
        )}

        <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric">
          View counterfactual <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Card>
    </Link>
  );
}
