// =============================================================================
// HSI Phase 12 — SimulationHighlightCards. The operations-console simulation
// strip: Simulation Queue, Latest Counterfactual Run, Forecast Accuracy,
// Calibration Health, and Scenario Generation. Server-safe; each card links into
// the simulation dashboard. Demo labeled. Confidence/accuracy shown honestly.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import {
  FlaskConical,
  Layers,
  Target,
  Gauge,
  Globe2,
  type LucideIcon,
} from 'lucide-react';
import type { SimulationHighlights } from '@hsi/shared-types';
import { DemoBadge } from '@/components/signals/badges';
import { formatConfidence, formatPct01, scenarioDecor } from '@/lib/simulation/view';

interface HighlightItem {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  accent: string;
  href: string;
}

const SIM_HREF = '/dashboard/simulation';

export function SimulationHighlightCards({
  highlights,
  demo = false,
}: {
  highlights: SimulationHighlights;
  demo?: boolean;
}) {
  const items: HighlightItem[] = [];

  if (typeof highlights.simulationQueue === 'number') {
    items.push({
      label: 'Simulation queue',
      value: String(highlights.simulationQueue),
      detail: 'counterfactual runs',
      icon: Layers,
      accent: '#3B82F6',
      href: SIM_HREF,
    });
  }
  if (highlights.latestRun) {
    const r = highlights.latestRun;
    items.push({
      label: 'Latest counterfactual',
      value: r.name,
      detail: `${scenarioDecor(r.scenarioType).label} · ${formatConfidence(r.confidence)} conf.`,
      icon: FlaskConical,
      accent: '#8B5CF6',
      href: `/dashboard/simulation/counterfactual?runId=${encodeURIComponent(r.id)}`,
    });
  }
  if (typeof highlights.forecastAccuracy === 'number') {
    items.push({
      label: 'Forecast accuracy',
      value: formatPct01(highlights.forecastAccuracy),
      detail: 'avg across narratives',
      icon: Target,
      accent: '#10B981',
      href: '/dashboard/simulation/backtesting',
    });
  }
  if (typeof highlights.calibrationHealth === 'number') {
    items.push({
      label: 'Calibration health',
      value: formatPct01(highlights.calibrationHealth),
      detail: 'reduces overconfidence',
      icon: Gauge,
      accent: '#F59E0B',
      href: '/dashboard/simulation/backtesting',
    });
  }
  if (typeof highlights.scenariosGenerated === 'number') {
    items.push({
      label: 'Scenarios generated',
      value: String(highlights.scenariosGenerated),
      detail: 'alternative timelines',
      icon: Globe2,
      accent: '#06B6D4',
      href: '/dashboard/worldforge/scenarios/counterfactual',
    });
  }

  if (items.length === 0) return null;

  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <FlaskConical className="h-4 w-4 text-electric" /> Counterfactual simulation
        </h3>
        {demo ? <DemoBadge /> : null}
        <span className="ml-auto text-caption text-text-muted">
          estimates — never certainties
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
