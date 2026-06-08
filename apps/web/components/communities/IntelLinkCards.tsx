// =============================================================================
// HSI Phase 9 — Communities + Amplification link cards (ADDITIVE) for the
// Intelligence dashboard. Server-safe presentational link cards matching the
// existing GraphLinkCard / OperationsLinkCard aesthetic.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { Users, TrendingUp, ArrowRight } from 'lucide-react';

export function CommunitiesLinkCard() {
  return (
    <Link href={'/dashboard/intelligence/communities' as never} className="block">
      <Card className="flex items-center gap-3" interactive padded>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Users className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-h6 font-semibold text-text-primary">Narrative communities</p>
          <p className="text-caption text-text-muted">Clusters detected over the narrative graph</p>
        </div>
        <ArrowRight className="ml-auto h-4 w-4 text-text-muted" />
      </Card>
    </Link>
  );
}

export function AmplificationLinkCard() {
  return (
    <Link href={'/dashboard/intelligence/amplification' as never} className="block">
      <Card className="flex items-center gap-3" interactive padded>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-electric/15 text-electric">
          <TrendingUp className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-h6 font-semibold text-text-primary">Narrative amplification</p>
          <p className="text-caption text-text-muted">How widely narratives are spreading</p>
        </div>
        <ArrowRight className="ml-auto h-4 w-4 text-text-muted" />
      </Card>
    </Link>
  );
}

/** Card linking to the providers console (Phase 9). */
export function ProvidersLinkCard() {
  return (
    <Link href={'/dashboard/providers' as never} className="block">
      <Card className="flex items-center gap-3" interactive padded>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-electric/15 text-electric">
          <TrendingUp className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-h6 font-semibold text-text-primary">Providers</p>
          <p className="text-caption text-text-muted">Adapter health, runs, limits &amp; reliability</p>
        </div>
        <ArrowRight className="ml-auto h-4 w-4 text-text-muted" />
      </Card>
    </Link>
  );
}
