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
        {items.map((it, i) => (
          <RevealItem key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="shrink-0">
              {it.risk ? <RiskBadge level={it.risk} /> : <CategoryTag label="Published" tone="green" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm font-medium text-text-primary">{it.title}</span>
              <span className="text-caption text-text-muted">
                <CategoryTag label={it.category} tone={it.tone ?? 'neutral'} /> <span className="ml-1">{it.time}</span>
              </span>
            </span>
          </RevealItem>
        ))}
      </RevealGroup>
      <LiveActivityPulse />
    </div>
  );
}
