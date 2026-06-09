// =============================================================================
// HSI Phase 14 — Security dashboard loading skeleton.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';

export default function SecurityLoading() {
  return (
    <>
      <TopNav title="Security" subtitle="Loading security telemetry…" />
      <main className="space-y-6 p-5 lg:p-6">
        <Card className="h-12 animate-pulse bg-surface-2/40" padded>
          <span className="sr-only">Loading</span>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-40 animate-pulse bg-surface-2/40" padded>
              <span className="sr-only">Loading</span>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-28 animate-pulse bg-surface-2/40" padded>
              <span className="sr-only">Loading</span>
            </Card>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="h-64 animate-pulse bg-surface-2/40" padded>
              <span className="sr-only">Loading</span>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
