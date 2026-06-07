import { TopNav, Card } from '@hsi/ui';

export default function ResearchListLoading() {
  return (
    <>
      <TopNav title="Research" subtitle="Loading research runs…" />
      <main className="space-y-6 p-5 lg:p-6">
        <Card className="h-32 animate-pulse bg-surface-2/40" padded>
          <span className="sr-only">Loading</span>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card
              key={i}
              className="h-44 animate-pulse bg-surface-2/40"
              padded
            >
              <span className="sr-only">Loading</span>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
