'use client';

// =============================================================================
// HSI Phase 14 — Security dashboard error boundary. Never a white screen.
// =============================================================================

import { useEffect } from 'react';
import Link from 'next/link';
import { TopNav, Card, Button } from '@hsi/ui';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function SecurityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Security route error:', error);
  }, [error]);

  return (
    <>
      <TopNav title="Security" subtitle="Something went wrong" />
      <main className="space-y-6 p-5 lg:p-6">
        <Card className="space-y-3 border-risk/40 bg-risk/5" padded>
          <h3 className="flex items-center gap-2 text-h5 font-semibold text-risk">
            <AlertTriangle className="h-5 w-5" /> Security dashboard failed to render
          </h3>
          <p className="text-body-sm leading-relaxed text-text-secondary">
            {error.message ||
              'An unexpected error occurred while loading the security dashboard.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Try again
            </Button>
            <Link href={'/dashboard/operations' as never}>
              <Button variant="secondary">Back to operations</Button>
            </Link>
          </div>
        </Card>
      </main>
    </>
  );
}
