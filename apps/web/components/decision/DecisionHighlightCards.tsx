// =============================================================================
// HSI Phase 13 — DecisionHighlightCards. The operations-console decision strip:
// Decision Health (avg recommendation confidence), Recommendation Queue, Top
// Risks, Scenario Battles, and Cross-Narrative Effects. Server-safe; each card
// links into the decision-intelligence console. Demo labeled. Confidence shown
// honestly — these are decision aids, never certainties.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import {
  Target,
  ListChecks,
  ShieldAlert,
  Swords,
  Network,
  type LucideIcon,
} from 'lucide-react';
import type { DecisionHighlights } from '@hsi/shared-types';
import { DemoBadge } from '@/components/signals/badges';
import { formatConfidence } from '@/lib/decision/view';

interface HighlightItem {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  accent: string;
  href: string;
}

const DECISIONS_HREF = '/dashboard/intelligence/decisions';
const IMPACTS_HREF = '/dashboard/intelligence/impacts';
const BATTLE_HREF = '/dashboard/simulation/compare';

export function DecisionHighlightCards({
  highlights,
  demo = false,
}: {
  highlights: DecisionHighlights;
  demo?: boolean;
}) {
  const items: HighlightItem[] = [];

  if (typeof highlights.decisionHealth === 'number') {
    items.push({
      label: 'Decision health',
      value: formatConfidence(highlights.decisionHealth),
      detail: 'avg recommendation confidence',
      icon: Target,
      accent: '#10B981',
      href: DECISIONS_HREF,
    });
  }
  if (typeof highlights.recommendationQueue === 'number') {
    items.push({
      label: 'Recommendation queue',
      value: String(highlights.recommendationQueue),
      detail: 'decisions awaiting review',
      icon: ListChecks,
      accent: '#3B82F6',
      href: DECISIONS_HREF,
    });
  }
  if (highlights.topRisks && highlights.topRisks.length > 0) {
    const top = highlights.topRisks[0];
    items.push({
      label: 'Top risk',
      value: top.name,
      detail: `risk ${Math.round(top.riskScore)}/100`,
      icon: ShieldAlert,
      accent: '#EF4444',
      href: DECISIONS_HREF,
    });
  }
  if (typeof highlights.scenarioBattles === 'number') {
    items.push({
      label: 'Scenario battles',
      value: String(highlights.scenarioBattles),
      detail: 'war-games run',
      icon: Swords,
      accent: '#8B5CF6',
      href: BATTLE_HREF,
    });
  }
  if (typeof highlights.crossNarrativeEffects === 'number') {
    items.push({
      label: 'Cross-narrative effects',
      value: String(highlights.crossNarrativeEffects),
      detail: 'directed couplings',
      icon: Network,
      accent: '#06B6D4',
      href: IMPACTS_HREF,
    });
  }

  if (items.length === 0) return null;

  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Target className="h-4 w-4 text-electric" /> Decision intelligence
        </h3>
        {demo ? <DemoBadge /> : null}
        <span className="ml-auto text-caption text-text-muted">
          decision aids — never certainties
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                <p
                  className="truncate text-body-sm font-semibold text-text-primary"
                  title={item.value}
                >
                  {item.value}
                </p>
                {item.detail ? (
                  <p
                    className="line-clamp-1 text-caption font-semibold"
                    style={{ color: item.accent }}
                  >
                    {item.detail}
                  </p>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
