'use client';

// =============================================================================
// AccessDeniedNotice — surfaces the reason a navigation "did nothing".
//
// When a user clicks a sidebar/menu item for a role-gated route they cannot
// access, the middleware redirects them to `/dashboard?denied=<route>`. Without
// feedback that reads as a dead menu ("I clicked it and it just went back to the
// dashboard"). This banner makes the bounce VISIBLE and explains why — it changes
// no auth/governance logic, it only reports what the middleware already decided.
//
// Reads the `denied` search param, renders a dismissible banner, and is rendered
// inside a <Suspense> boundary by the caller (useSearchParams requirement).
// =============================================================================

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldAlert, X } from 'lucide-react';

/** Turn `/dashboard/review` into a friendly label like "Review". */
function prettyRoute(path: string): string {
  const seg = path.split('/').filter(Boolean).pop() ?? path;
  return seg.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AccessDeniedNotice() {
  const params = useSearchParams();
  const denied = params.get('denied');
  const [dismissed, setDismissed] = useState(false);

  if (!denied || dismissed) return null;

  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-card border border-warning/40 bg-warning/10 px-4 py-3"
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="space-y-0.5">
          <p className="text-caption font-semibold text-text-primary">
            Access to “{prettyRoute(denied)}” requires a higher role.
          </p>
          <p className="text-caption text-text-secondary">
            You were returned here because your account doesn’t have permission to open{' '}
            <span className="font-mono text-[11px] text-text-muted">{denied}</span>. Ask an
            administrator if you need access — the menu item is not broken, it’s restricted.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 text-text-muted transition hover:text-text-primary"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
