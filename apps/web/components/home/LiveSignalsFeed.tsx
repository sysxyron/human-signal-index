'use client';

// =============================================================================
// HSI Phase 42 — "Latest Public Signals" live feed. Data is passed from the
// server (real published intelligence when available, else seeded demo). Rows
// reveal in sequence; the newest carries a subtle live pulse.
// =============================================================================

import { RiskBadge, CategoryTag, type RiskLevel, type CategoryTone } from '@hsi/ui';
import { Radio } from 'lucide-react';
import { RevealGroup, RevealItem } from './motion';
import { LiveActivityPulse } from './LiveActivityPulse';

export interface FeedItem {
  title: string;
  category: string;
  time: string; // pre-formatted on the server (no client Date.now → no hydration drift)
  risk?: RiskLevel;
  tone?: CategoryTone;
  demo?: boolean;
}

export function LiveSignalsFeed({ items }: { items: FeedItem[] }) {
  return (
    <div className="h-full rounded-card border border-border bg-surface/60 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-verified opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-verified" />
          </span>
          Latest Public Signals
        </h3>
        <Radio className="h-4 w-4 text-text-muted" />
      </div>
      <RevealGroup className="divide-y divide-border/60">
        {items.map((it, i) => {
          const badge = it.risk ? <RiskBadge level={it.risk} /> : <CategoryTag label="Published" tone="green" />;
          return (
            <RevealItem
              key={i}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3"
            >
              {/* leading badge — desktop only */}
              <span className="hidden shrink-0 sm:inline-flex">{badge}</span>
              <div className="min-w-0 flex-1">
                {/* title first; clean 2-line clamp on mobile, single-line truncate on desktop */}
                <span className="line-clamp-2 text-body-sm font-medium leading-snug text-text-primary sm:truncate">
                  {it.title}
                </span>
                {/* meta row: badge (mobile only) + category + time */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted sm:mt-1">
                  <span className="inline-flex origin-left scale-[0.85] sm:hidden">{badge}</span>
                  <span className="inline-flex origin-left scale-90 sm:scale-100">
                    <CategoryTag label={it.category} tone={it.tone ?? 'neutral'} />
                  </span>
                  <span>{it.time}</span>
                </div>
              </div>
            </RevealItem>
          );
        })}
      </RevealGroup>
      <LiveActivityPulse />
    </div>
  );
}
