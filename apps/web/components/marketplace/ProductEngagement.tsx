'use client';

// =============================================================================
// HSI Phase 69 — Product engagement (client). View beacon (logs a real view),
// download button, favorite toggle, and rating — for any visitor; favorite/rate
// require sign-in (the action returns a clear message otherwise). Real counters.
// =============================================================================

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Download, Heart, Star } from 'lucide-react';
import { favoriteProductAction, rateProductAction, logDownloadAction, logViewAction } from '@/lib/marketplace/actions';

export function ViewBeacon({ productId }: { productId: string }) {
  useEffect(() => { void logViewAction(productId); }, [productId]);
  return null;
}

export function ProductEngagement({ productId }: { productId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [fav, setFav] = useState(false);
  const [rating, setRating] = useState(0);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, after?: () => void) =>
    start(async () => { setMsg(null); const r = await fn(); setMsg(r.ok ? ok : (r.error ?? 'Failed.')); if (r.ok) { after?.(); router.refresh(); } });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" size="sm" disabled={pending} onClick={() => run(() => logDownloadAction(productId).then(() => ({ ok: true })), 'Download logged.')}><Download className="h-4 w-4" /> Download</Button>
      <Button variant={fav ? 'secondary' : 'ghost'} size="sm" disabled={pending} onClick={() => run(() => favoriteProductAction(productId, !fav), fav ? 'Removed from favorites.' : 'Added to favorites.', () => setFav(!fav))}><Heart className="h-4 w-4" /> {fav ? 'Favorited' : 'Favorite'}</Button>
      <div className="flex items-center gap-1" aria-label="Rate this product">
        {[1, 2, 3, 4, 5].map((v) => (
          <button key={v} type="button" disabled={pending} onClick={() => run(() => rateProductAction(productId, v), `Rated ${v}/5.`, () => setRating(v))} className="text-text-muted transition hover:text-warning disabled:opacity-50" aria-label={`Rate ${v}`}>
            <Star className={`h-4 w-4 ${v <= rating ? 'fill-warning text-warning' : ''}`} />
          </button>
        ))}
      </div>
      {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
    </div>
  );
}
