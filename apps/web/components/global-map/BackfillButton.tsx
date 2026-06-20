'use client';
// =============================================================================
// HSI Phase 73.3 — "Backfill Geographic Data" control (client, admin). Triggers
// the deterministic geo backfill (location registry → gazetteer). Maintenance
// only; never activates, publishes, or invents coordinates.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Globe2 } from 'lucide-react';
import { backfillGeoAction } from '@/lib/global-map/backfill/actions';

export function BackfillGeoButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => start(async () => {
        setMsg(null);
        const r = await backfillGeoAction();
        setMsg(r.ok
          ? `Backfilled ${r.data.resolved} (${r.data.viaRegistry} registry, ${r.data.viaGazetteer} gazetteer); ${r.data.unresolved} kept GEO_UNKNOWN of ${r.data.scanned} scanned.`
          : (r.error ?? 'Failed.'));
        if (r.ok) router.refresh();
      })}><Globe2 className="h-3.5 w-3.5" /> {pending ? 'Backfilling…' : 'Backfill Geographic Data'}</Button>
      {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
    </div>
  );
}
