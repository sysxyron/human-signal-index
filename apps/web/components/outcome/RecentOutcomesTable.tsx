// =============================================================================
// HSI Phase 15 — RecentOutcomesTable. Lists recorded recommendation outcomes:
// the status badge, the 0..100 success score, and the confidence update
// (before→after) per outcome, each linking to the full outcome detail + audit
// trail. Success, confidence delta, and status are ALWAYS surfaced — an outcome is
// an aid for a human reviewer, never a black box. Server-safe / presentational.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { ClipboardList, ArrowRight } from 'lucide-react';
import type { HsinRecommendationOutcomeRecord } from '@hsi/shared-types';
import { OutcomeStatusBadge } from './badges';
import { SuccessScoreBar } from './SuccessScore';
import { ConfidenceDeltaChip } from './ConfidenceDeltaChip';
import { formatDate, sortOutcomesRecent } from '@/lib/outcome/view';

export function RecentOutcomesTable({
  outcomes,
  title = 'Recent outcomes',
  limit = 8,
}: {
  outcomes: HsinRecommendationOutcomeRecord[];
  title?: string;
  limit?: number;
}) {
  const rows = sortOutcomesRecent(outcomes).slice(0, limit);

  return (
    <Card className="space-y-3" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <ClipboardList className="h-4 w-4 text-electric" /> {title}
      </h3>

      {rows.length === 0 ? (
        <p className="text-caption text-text-muted">
          No outcomes recorded yet — record an outcome for a decision run to start
          closing the loop.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border text-label text-text-muted">
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Success score</th>
                <th className="py-2 pr-3 font-medium">Confidence before → after</th>
                <th className="py-2 pr-3 font-medium">Recorded</th>
                <th className="py-2 pr-0 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-border/60 align-middle last:border-0 hover:bg-surface-2/30"
                >
                  <td className="py-2.5 pr-3">
                    <OutcomeStatusBadge status={o.status} />
                  </td>
                  <td className="min-w-[160px] py-2.5 pr-3">
                    <SuccessScoreBar score={o.success_score} />
                  </td>
                  <td className="py-2.5 pr-3">
                    <ConfidenceDeltaChip
                      before={o.confidence_before}
                      after={o.confidence_after}
                      compact
                    />
                  </td>
                  <td className="py-2.5 pr-3 text-caption text-text-muted">
                    {formatDate(o.created_at)}
                  </td>
                  <td className="py-2.5 pr-0 text-right">
                    <Link
                      href={`/dashboard/outcomes/${encodeURIComponent(o.id)}` as never}
                      className="inline-flex items-center gap-1 text-caption font-semibold text-electric hover:text-white"
                    >
                      Audit <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
