// =============================================================================
// HSI Phase 8 — EdgeTypeLegend. The narrative-graph edge-type legend
// (related_to / contradicts / amplifies / evolves_into / derived_from /
// co_occurs_with) with colors + descriptions. Server-safe.
// =============================================================================

import { edgeTypeLegend } from '@/lib/operations/view';

export function EdgeTypeLegend() {
  const items = edgeTypeLegend();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {items.map((e) => (
        <span
          key={e.edgeType}
          className="inline-flex items-center gap-1.5 text-caption text-text-secondary"
          title={e.description}
        >
          <span
            className="inline-block h-0.5 w-5 rounded-full"
            style={{ backgroundColor: e.color }}
          />
          {e.label}
        </span>
      ))}
    </div>
  );
}
