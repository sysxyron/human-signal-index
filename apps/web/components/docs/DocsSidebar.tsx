// =============================================================================
// HSI Phase 73.4 — Docs sidebar (server). Links to every documentation section
// plus related learning surfaces. Uses <a> for internal links (typed-routes safe).
// =============================================================================

import { Card } from '@hsi/ui';
import { DOC_INDEX } from '@/lib/docs/content';

export function DocsSidebar({ activeSlug }: { activeSlug?: string }) {
  return (
    <Card className="space-y-3 self-start">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">Documentation</p>
      <nav className="space-y-1">
        <a href="/docs" className={`block rounded-card px-2 py-1 text-body-sm ${!activeSlug ? 'bg-electric/10 text-electric' : 'text-text-secondary hover:text-text-primary'}`}>Overview</a>
        {DOC_INDEX.map((d) => (
          <a key={d.slug} href={`/docs/${d.slug}`} className={`block rounded-card px-2 py-1 text-body-sm ${activeSlug === d.slug ? 'bg-electric/10 text-electric' : 'text-text-secondary hover:text-text-primary'}`}>{d.title}</a>
        ))}
      </nav>
      <div className="border-t border-border pt-2">
        <p className="text-[10px] uppercase tracking-wide text-text-muted">Learn</p>
        <nav className="space-y-1 pt-1">
          <a href="/how-hsi-works" className="block rounded-card px-2 py-1 text-body-sm text-text-secondary hover:text-text-primary">How HSI Works</a>
          <a href="/education-hub" className="block rounded-card px-2 py-1 text-body-sm text-text-secondary hover:text-text-primary">Education Hub</a>
        </nav>
      </div>
    </Card>
  );
}
