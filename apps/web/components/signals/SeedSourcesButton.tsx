'use client';

// HSI Phase 40 — admin-only: seed the recommended starter sources (disabled by
// default). The server action gates admin; this is UX only. Public feeds + one
// watchlist example.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Sparkles, Loader2 } from 'lucide-react';
import { seedRecommendedSourcesAction } from '@/lib/signals/actions';

export function SeedSourcesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = () => {
    setMsg(null);
    startTransition(async () => {
      const r = await seedRecommendedSourcesAction();
      setMsg(r.ok ? `Seeded ${r.data.created} source(s)${r.data.skipped ? `, ${r.data.skipped} already present` : ''} (disabled by default).` : (r.error ?? 'Seeding failed.'));
      if (r.ok) router.refresh();
    });
  };
  return (
    <div className="inline-flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={run} disabled={pending} title="Seed recommended starter sources (admin)">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Seed starter sources
      </Button>
      {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
    </div>
  );
}
