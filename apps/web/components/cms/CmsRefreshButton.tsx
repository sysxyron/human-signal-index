'use client';

// =============================================================================
// HSI Phase 41B.2 — "Refresh seeded content" admin action (client).
//
// Re-syncs seeded marketing pages to their code-defined baseline (upsert: blocks
// + title + SEO + status). Use this to clear a STALE published CMS page that is
// shadowing a rebuilt hardcoded page (e.g. /about). It resets seeded pages, so it
// will overwrite manual edits to those seeded pages — pages stay editable after.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Loader2, RefreshCw } from 'lucide-react';
import { refreshSeededPagesAction } from '@/lib/cms/seed';

export function CmsRefreshButton({ label = 'Refresh seeded content', slugs }: { label?: string; slugs?: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function refresh() {
    setMsg(null);
    startTransition(async () => {
      const res = await refreshSeededPagesAction(slugs);
      if (res.ok) {
        setMsg(`Refreshed ${res.data.refreshed} page${res.data.refreshed === 1 ? '' : 's'}: ${res.data.slugs.join(', ') || 'none'}.`);
        router.refresh();
      } else {
        setMsg(res.error ?? 'Refresh failed.');
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" onClick={refresh} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {label}
      </Button>
      {msg ? <p className="text-caption text-text-secondary">{msg}</p> : null}
    </div>
  );
}
