// =============================================================================
// CMS search (Deliverable 24). PURE — case-insensitive substring match over
// pre-collected searchable items (pages/blocks/templates/media).
// =============================================================================

import type { SearchableItem } from './types';

export function searchContent(items: SearchableItem[], query: string, kinds?: SearchableItem['kind'][]): SearchableItem[] {
  const q = query.trim().toLowerCase();
  const allowed = kinds && kinds.length ? new Set(kinds) : null;
  if (q.length === 0) return allowed ? items.filter((i) => allowed.has(i.kind)) : items;
  return items.filter((i) => {
    if (allowed && !allowed.has(i.kind)) return false;
    return i.title.toLowerCase().includes(q) || i.text.toLowerCase().includes(q);
  });
}
