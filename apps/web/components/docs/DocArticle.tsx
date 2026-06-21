// =============================================================================
// HSI Phase 73.4 — Documentation article (server, display-only). Renders a
// DocPage from the content registry. "Coming Soon" sections are clearly marked.
// =============================================================================

import { Card } from '@hsi/ui';
import { Clock } from 'lucide-react';
import type { DocPage } from '@/lib/docs/content';

export function DocArticle({ page }: { page: DocPage }) {
  return (
    <article className="space-y-6">
      <p className="text-body-lg text-text-secondary">{page.intro}</p>
      <div className="space-y-4">
        {page.sections.map((s) => (
          <Card key={s.heading} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-h6 font-semibold text-text-primary">{s.heading}</h2>
              {s.comingSoon ? <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning"><Clock className="h-3 w-3" /> Coming Soon</span> : null}
            </div>
            {(s.body ?? []).map((p, i) => <p key={i} className="text-body-sm text-text-secondary">{p}</p>)}
            {s.bullets && s.bullets.length > 0 ? (
              <ul className="space-y-1 pl-1">{s.bullets.map((b, i) => <li key={i} className="text-body-sm text-text-secondary">• {b}</li>)}</ul>
            ) : null}
          </Card>
        ))}
      </div>
    </article>
  );
}
