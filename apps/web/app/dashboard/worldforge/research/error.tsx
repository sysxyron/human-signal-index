'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { TopNav, Card, Button } from '@hsi/ui';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function ResearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the console for diagnostics; never show a white screen.
    console.error('Research route error:', error);
  }, [error]);

  return (
    <>
      <TopNav title="Research" subtitle="Something went wrong" />
      <main className="space-y-6 p-5 lg:p-6">
        <Card className="space-y-3 border-risk/40 bg-risk/5" padded>
          <h3 className="flex items-center gap-2 text-h5 font-semibold text-risk">
            <AlertTriangle className="h-5 w-5" /> Research failed to render
          </h3>
          <p className="text-body-sm leading-relaxed text-text-secondary">
            {error.message || 'An unexpected error occurred while loading this research view.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Try again
            </Button>
            <Link href={'/dashboard/worldforge/research' as never}>
              <Button variant="secondary">Back to research</Button>
            </Link>
          </div>
        </Card>
      </main>
    </>
  );
}
