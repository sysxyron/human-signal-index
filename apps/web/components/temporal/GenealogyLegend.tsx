// =============================================================================
// HSI Phase 10 — GenealogyLegend. A color/label key for the genealogy graph's
// relationship edges (derived_from / split_from / merged_from / contradicts /
// amplifies). Server-safe.
// =============================================================================

import { allRelationshipDecor } from '@/lib/temporal/view';

export function GenealogyLegend() {
  const items = allRelationshipDecor();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {items.map(({ relationship, decor }) => (
        <span
          key={relationship}
          className="inline-flex items-center gap-1.5 text-caption text-text-secondary"
          title={decor.description}
        >
          <span
            className="inline-block h-0.5 w-5 rounded-full"
            style={{ backgroundColor: decor.color }}
          />
          {decor.label}
        </span>
      ))}
    </div>
  );
}
