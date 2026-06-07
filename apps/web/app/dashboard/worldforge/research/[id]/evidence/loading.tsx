import { TopNav, Card } from '@hsi/ui';

/** Skeleton for the evidence tab while the run + evidence bundle load. */
export default function ResearchEvidenceLoading() {
  return (
    <>
      <TopNav title="Research run" subtitle="Loading evidence…" />
      <main className="space-y-6 p-5 lg:p-6">
        <Card className="h-12 animate-pulse bg-surface-2/40" padded>
          <span className="sr-only">Loading</span>
        </Card>
        <Card className="h-36 animate-pulse bg-surface-2/40" padded>
          <span className="sr-only">Loading coverage</span>
        </Card>
        <Card className="h-24 animate-pulse bg-surface-2/40" padded>
          <span className="sr-only">Loading claim links</span>
        </Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-40 animate-pulse bg-surface-2/40" padded>
              <span className="sr-only">Loading source</span>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
