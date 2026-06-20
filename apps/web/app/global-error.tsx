'use client';

// =============================================================================
// HSI Phase 70.1 — root error boundary (frontend error capture). Additive Next
// convention file: on a root error it beacons the message to the observability
// sink (/api/observability/report → infra_events + Sentry-capturable) and renders
// a minimal fallback. No business logic; no data exposure.
// =============================================================================

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try {
      void fetch('/api/observability/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: error.message, digest: error.digest, path: typeof window !== 'undefined' ? window.location.pathname : undefined }),
        keepalive: true,
      });
    } catch { /* never block the fallback */ }
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#0b0f17', color: '#e5e7eb', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
        <div style={{ textAlign: 'center', padding: 24, maxWidth: 480 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 16 }}>The error has been logged. You can try again.</p>
          <button onClick={() => reset()} style={{ background: '#2563eb', color: '#fff', border: 0, borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
