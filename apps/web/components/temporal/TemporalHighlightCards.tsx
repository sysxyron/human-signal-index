// =============================================================================
// HSI Phase 10 — TemporalHighlightCards. A compact strip of headline temporal
// callouts for the operations console: Fastest Growing, Largest Community
// Expansion, Largest Amplification Spike, Most Influential, Newest Emerging.
// Server-safe. Each card links to the relevant temporal dashboard. Demo labeled.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import {
  History,
  TrendingUp,
  Network,
  Zap,
  Crown,
  Sparkles,
  type LucideProps,
} from 'lucide-react';
import { type ComponentType } from 'react';
import type { TemporalHighlights } from '@hsi/shared-types';
import { DemoBadge } from '@/components/signals/badges';
import { formatGrowthPct, formatDelta, formatProbability } from '@/lib/temporal/view';

interface HighlightItem {
  label: string;
  name: string;
  metric: string;
  href: string;
  icon: ComponentType<LucideProps>;
  accent: string;
}

export function TemporalHighlightCards({
  highlights,
  demo = false,
}: {
  highlights: TemporalHighlights;
  demo?: boolean;
}) {
  const items: HighlightItem[] = [];

  if (highlights.fastestGrowing) {
    items.push({
      label: 'Fastest growing',
      name: highlights.fastestGrowing.name,
      metric: `${formatGrowthPct(highlights.fastestGrowing.growthPct)} signals`,
      href: '/dashboard/intelligence/evolution',
      icon: TrendingUp,
      accent: '#10B981',
    });
  }
  if (highlights.largestCommunityExpansion) {
    items.push({
      label: 'Largest community expansion',
      name: highlights.largestCommunityExpansion.name,
      metric: `${formatDelta(highlights.largestCommunityExpansion.communityDelta)} communities`,
      href: '/dashboard/intelligence/evolution',
      icon: Network,
      accent: '#06B6D4',
    });
  }
  if (highlights.largestAmplificationSpike) {
    items.push({
      label: 'Largest amplification spike',
      name: highlights.largestAmplificationSpike.name,
      metric: `${formatDelta(highlights.largestAmplificationSpike.amplificationDelta)} amplification`,
      href: '/dashboard/intelligence/evolution',
      icon: Zap,
      accent: '#F59E0B',
    });
  }
  if (highlights.mostInfluential) {
    items.push({
      label: 'Most influential',
      name: highlights.mostInfluential.name,
      metric: `${Math.round(highlights.mostInfluential.influenceScore)} out-influence`,
      href: '/dashboard/intelligence/influence',
      icon: Crown,
      accent: '#8B5CF6',
    });
  }
  if (highlights.newestEmerging) {
    items.push({
      label: 'Newest emerging',
      name: highlights.newestEmerging.name,
      metric: `~${formatProbability(highlights.newestEmerging.probability)} emerging`,
      href: '/dashboard/intelligence/forecast',
      icon: Sparkles,
      accent: '#3B82F6',
    });
  }

  if (items.length === 0) return null;

  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <History className="h-4 w-4 text-electric" /> Temporal highlights
        </h3>
        {demo ? <DemoBadge /> : null}
        <span className="ml-auto text-caption text-text-muted">
          probabilistic / descriptive — never auto-actioned
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href as never} className="block">
              <div className="h-full space-y-1.5 rounded-card border border-border bg-surface-2/40 p-3 transition hover:border-electric/50">
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${item.accent}1f`, color: item.accent }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <p className="text-label text-text-muted">{item.label}</p>
                <p className="truncate text-body-sm font-semibold text-text-primary" title={item.name}>
                  {item.name}
                </p>
                <p className="font-mono text-caption font-semibold" style={{ color: item.accent }}>
                  {item.metric}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
