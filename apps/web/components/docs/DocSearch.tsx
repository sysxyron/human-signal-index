'use client';
// =============================================================================
// HSI Phase 73.4 — Documentation search (client). Local, deterministic search
// over the static index (docs, FAQ, lessons). No external service, no AI.
// =============================================================================

import { useMemo, useState } from 'react';
import { Input } from '@hsi/ui';
import { Search } from 'lucide-react';
import { searchDocs, type SearchEntry } from '@/lib/docs/search';

const TYPE_LABEL: Record<string, string> = { doc: 'Docs', faq: 'FAQ', lesson: 'Lesson' };

export function DocSearch({ index }: { index: SearchEntry[] }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => searchDocs(index, q), [index, q]);
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input aria-label="Search documentation" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documentation, FAQ, and lessons" className="pl-9" />
      </div>
      {q.trim().length >= 2 ? (
        results.length === 0 ? (
          <p className="text-caption text-text-muted">No matches for “{q}”.</p>
        ) : (
          <ul className="space-y-1">
            {results.map((r, i) => (
              <li key={`${r.url}-${i}`}>
                <a href={r.url} className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2 text-body-sm text-text-secondary hover:border-electric/60 hover:text-text-primary">
                  <span className="shrink-0 rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">{TYPE_LABEL[r.type] ?? r.type}</span>
                  <span className="truncate">{r.title}</span>
                </a>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
