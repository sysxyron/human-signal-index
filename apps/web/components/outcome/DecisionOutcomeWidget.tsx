// =============================================================================
// HSI Phase 15 — DecisionOutcomeWidget. A compact, best-effort widget for the
// decision-intelligence + scenario-compare consoles: did past recommendations for
// these narratives actually WORK? Shows the observed success rate, how many worked
// vs did not, the average post-observation confidence, and a short list of recent
// outcomes (status + success score) linking to their audit trails. Honest framing —
// these are observed results, not certainties. Server-safe / presentational.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { Activity, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { OutcomeStatusBadge } from './badges';
import { DemoBadge } from '@/components/signals/badges';
import {
  formatConfidence,
  formatRate,
  formatScore,
  sortOutcomesRecent,
  summarizeOutcomeWidget,
  type DecisionOutcomeWidgetData,
} from '@/lib/outcome/view';

export function DecisionOutcomeWidget({
  data,
  demo = false,
  title = 'Did past recommendations work?',
}: {
  data: DecisionOutcomeWidgetData;
  demo?: boolean;
  title?: string;
}) {
  const summary = summarizeOutcomeWidget(data);
  const recent = sortOutcomesRecent(summary.outcomes).slice(0, 4);
  const hasAnything =
    summary.outcomes.length > 0 ||
    summary.successRate !== undefined ||
    summary.worked + summary.didNotWork > 0;

  if (!hasAnything) return null;

  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Activity className="h-4 w-4 text-electric" /> {title}
        </h3>
        {demo ? <DemoBadge /> : null}
        <span className="ml-auto text-caption text-text-muted">observed — not a forecast</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-card border border-border bg-surface-2/40 px-3 py-2">
          <p className="text-label text-text-muted">Observed success rate</p>
          <p className="text-h6 font-bold text-text-primary">
            {summary.successRate !== undefined ? formatRate(summary.successRate) : '—'}
          </p>
        </div>
        <div className="rounded-card border border-border bg-surface-2/40 px-3 py-2">
          <p className="text-label text-text-muted">Worked / did not</p>
          <p className="flex items-center gap-2 text-h6 font-bold text-text-primary">
            <span className="inline-flex items-center gap-1 text-verified">
              <CheckCircle2 className="h-4 w-4" />
              {summary.worked}
            </span>
            <span className="text-text-muted">/</span>
            <span className="inline-flex items-center gap-1 text-risk">
              <XCircle className="h-4 w-4" />
              {summary.didNotWork}
            </span>
          </p>
        </div>
        <div className="rounded-card border border-border bg-surface-2/40 px-3 py-2">
          <p className="text-label text-text-muted">Avg confidence (after)</p>
          <p className="text-h6 font-bold text-text-primary">
            {formatConfidence(summary.avgConfidenceAfter)}
          </p>
        </div>
      </div>

      {recent.length > 0 ? (
        <ul className="space-y-1.5">
          {recent.map((o) => (
            <li key={o.id} className="flex items-center gap-2">
              <OutcomeStatusBadge status={o.status} />
              <span className="text-caption text-text-muted">
                score {formatScore(o.success_score)}
              </span>
              <Link
                href={`/dashboard/outcomes/${encodeURIComponent(o.id)}` as never}
                className="ml-auto inline-flex items-center gap-1 text-caption font-semibold text-electric hover:text-white"
              >
                Audit <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <Link
        href={'/dashboard/outcomes' as never}
        className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white"
      >
        Full decision performance <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </Card>
  );
}
