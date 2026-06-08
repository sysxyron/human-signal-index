// =============================================================================
// HSI Phase 11 — CausalHighlightCards. The 6 operations-console causal widgets:
// Most Significant Event, Fastest Narrative Growth, Largest Forecast Shift,
// Largest Amplification Spike, Most Important Community Expansion, Most Influential
// Source. Server-safe; each card links to the causal dashboard. Demo labeled.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import {
  Sparkles,
  TrendingUp,
  LineChart,
  Zap,
  Network,
  Crown,
  type LucideIcon,
} from 'lucide-react';
import type { CausalHighlights } from '@hsi/shared-types';
import { DemoBadge } from '@/components/signals/badges';
import { eventDecor, formatGrowthPct, formatStrength } from '@/lib/causal/view';

interface HighlightItem {
  label: string;
  name: string;
  metric: string;
  icon: LucideIcon;
  accent: string;
}

const CAUSAL_HREF = '/dashboard/intelligence/causal';

export function CausalHighlightCards({
  highlights,
  demo = false,
}: {
  highlights: CausalHighlights;
  demo?: boolean;
}) {
  const items: HighlightItem[] = [];

  if (highlights.mostSignificantEvent) {
    const ev = highlights.mostSignificantEvent;
    items.push({
      label: 'Most significant event',
      name: ev.name,
      metric: `${eventDecor(ev.eventType).label} · ${formatStrength(ev.eventStrength)}/100`,
      icon: Sparkles,
      accent: eventDecor(ev.eventType).color,
    });
  }
  if (highlights.fastestGrowth) {
    items.push({
      label: 'Fastest narrative growth',
      name: highlights.fastestGrowth.name,
      metric: `${formatGrowthPct(highlights.fastestGrowth.growthPct)} signals`,
      icon: TrendingUp,
      accent: '#10B981',
    });
  }
  if (highlights.largestForecastShift) {
    items.push({
      label: 'Largest forecast shift',
      name: highlights.largestForecastShift.name,
      metric: highlights.largestForecastShift.detail,
      icon: LineChart,
      accent: '#8B5CF6',
    });
  }
  if (highlights.largestAmplificationSpike) {
    items.push({
      label: 'Largest amplification spike',
      name: highlights.largestAmplificationSpike.name,
      metric: `${formatStrength(highlights.largestAmplificationSpike.eventStrength)}/100 strength`,
      icon: Zap,
      accent: '#F59E0B',
    });
  }
  if (highlights.mostImportantCommunityExpansion) {
    items.push({
      label: 'Most important community expansion',
      name: highlights.mostImportantCommunityExpansion.name,
      metric: `${formatStrength(highlights.mostImportantCommunityExpansion.eventStrength)}/100 strength`,
      icon: Network,
      accent: '#06B6D4',
    });
  }
  if (highlights.mostInfluentialSource) {
    items.push({
      label: 'Most influential source',
      name: highlights.mostInfluentialSource.name,
      metric: highlights.mostInfluentialSource.detail,
      icon: Crown,
      accent: '#EC4899',
    });
  }

  if (items.length === 0) return null;

  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Sparkles className="h-4 w-4 text-electric" /> Causal highlights
        </h3>
        {demo ? <DemoBadge /> : null}
        <span className="ml-auto text-caption text-text-muted">
          descriptive — never auto-actioned
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={CAUSAL_HREF as never} className="block">
              <div className="h-full space-y-1.5 rounded-card border border-border bg-surface-2/40 p-3 transition hover:border-electric/50">
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${item.accent}1f`, color: item.accent }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <p className="text-label text-text-muted">{item.label}</p>
                <p
                  className="truncate text-body-sm font-semibold text-text-primary"
                  title={item.name}
                >
                  {item.name}
                </p>
                <p
                  className="line-clamp-2 text-caption font-semibold"
                  style={{ color: item.accent }}
                  title={item.metric}
                >
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
