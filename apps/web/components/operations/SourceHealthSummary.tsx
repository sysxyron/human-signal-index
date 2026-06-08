// =============================================================================
// HSI Phase 8 — SourceHealthSummary. A small donut + legend over the operations
// overview's sourceHealthSummary (status -> count). Server-safe.
// =============================================================================

import { Card, DonutChart } from '@hsi/ui';
import { Activity } from 'lucide-react';
import { sourceHealthDecor } from '@/lib/operations/view';

export function SourceHealthSummary({
  summary,
}: {
  summary: Record<string, number>;
}) {
  const segments = Object.entries(summary).map(([k, v]) => {
    const d = sourceHealthDecor(k);
    return { label: d.label, value: v, color: d.color };
  });
  const total = segments.reduce((a, s) => a + s.value, 0);

  return (
    <Card className="space-y-4" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <Activity className="h-4 w-4 text-electric" /> Source health
      </h3>
      {segments.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          No source-health observations recorded yet.
        </p>
      ) : (
        <DonutChart segments={segments} centerValue={total} centerLabel="sources" />
      )}
    </Card>
  );
}
