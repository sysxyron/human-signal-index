'use client';
// =============================================================================
// HSI Phase 71 — Geocode control (client, admin). Triggers the deterministic
// geocoding pipeline. Advisory/maintenance only — never activates or publishes.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { MapPinned } from 'lucide-react';
import { geocodeCandidatesAction } from '@/lib/global-map/actions';

export function GeocodeButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => start(async () => {
        setMsg(null);
        const r = await geocodeCandidatesAction();
        setMsg(r.ok ? `Geocoded ${r.data.geocoded} · ${r.data.unresolved} unresolved (of ${r.data.scanned}).` : (r.error ?? 'Failed.'));
        if (r.ok) router.refresh();
      })}><MapPinned className="h-3.5 w-3.5" /> {pending ? 'Geocoding…' : 'Run geocoder'}</Button>
      {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
    </div>
  );
}
