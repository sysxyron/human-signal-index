// =============================================================================
// HSI Phase 22 — DailyIntelligenceCard. A compact callout for today's daily
// intelligence report: date, headline, and top risk/opportunity counts, linking
// into the briefings dashboard. Server-safe presentational. Advisory.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { CalendarClock, ArrowRight } from 'lucide-react';
import type { ExecutiveBriefingsData } from '@hsi/shared-types';

export function DailyIntelligenceCard({ data }: { data: ExecutiveBriefingsData }) {
  const daily = data.latestDaily;
  if (!daily) return null;
  return (
    <Link href={'/dashboard/briefings' as never} className="block">
      <Card className="flex items-start justify-between gap-3 border-border transition hover:border-electric/50" padded>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-electric/15">
            <CalendarClock className="h-5 w-5 text-electric" />
          </span>
          <div>
            <div className="text-body font-semibold text-text-primary">{daily.title ?? 'Daily Intelligence Report'}</div>
            <p className="mt-0.5 text-caption leading-relaxed text-text-secondary line-clamp-2">{daily.headline}</p>
          </div>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-text-muted" />
      </Card>
    </Link>
  );
}
