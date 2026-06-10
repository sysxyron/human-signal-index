// =============================================================================
// HSI Phase 15 — OutcomeHighlightCards. The operations-console outcome strip:
// recommendation Success Rate, Open Alerts, Pending Reviews, and Learning Entries.
// Server-safe; each card links into the outcome / governance consoles. Demo
// labeled. Success rate shown honestly — these are observed results + a governance
// workload, never certainties.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import {
  TrendingUp,
  Bell,
  ShieldCheck,
  Brain,
  type LucideIcon,
} from 'lucide-react';
import type { OutcomeDashboardHighlights } from '@hsi/shared-types';
import { DemoBadge } from '@/components/signals/badges';
import { formatRate } from '@/lib/outcome/view';

interface HighlightItem {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  accent: string;
  href: string;
}

const OUTCOMES_HREF = '/dashboard/outcomes';
const GOVERNANCE_HREF = '/dashboard/governance';

export function OutcomeHighlightCards({
  highlights,
  demo = false,
}: {
  highlights: OutcomeDashboardHighlights;
  demo?: boolean;
}) {
  const items: HighlightItem[] = [];

  if (typeof highlights.successRate === 'number') {
    items.push({
      label: 'Recommendation success rate',
      value: formatRate(highlights.successRate),
      detail: 'observed outcomes that worked',
      icon: TrendingUp,
      accent: '#10B981',
      href: OUTCOMES_HREF,
    });
  }
  if (typeof highlights.openAlerts === 'number') {
    items.push({
      label: 'Open alerts',
      value: String(highlights.openAlerts),
      detail: 'decision alerts to triage',
      icon: Bell,
      accent: '#EF4444',
      href: GOVERNANCE_HREF,
    });
  }
  if (typeof highlights.pendingReviews === 'number') {
    items.push({
      label: 'Pending reviews',
      value: String(highlights.pendingReviews),
      detail: 'outcomes awaiting governance',
      icon: ShieldCheck,
      accent: '#F59E0B',
      href: GOVERNANCE_HREF,
    });
  }
  if (typeof highlights.learningEntries === 'number') {
    items.push({
      label: 'Learning entries',
      value: String(highlights.learningEntries),
      detail: 'calibrated intervention types',
      icon: Brain,
      accent: '#8B5CF6',
      href: OUTCOMES_HREF,
    });
  }

  if (items.length === 0) return null;

  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <TrendingUp className="h-4 w-4 text-electric" /> Outcome &amp; governance
        </h3>
        {demo ? <DemoBadge /> : null}
        <span className="ml-auto text-caption text-text-muted">
          observed results — never certainties
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
