// =============================================================================
// HSI Phase 16 — CalibrationHighlightCards. The operations-console calibration &
// trust strip: latest ECE, latest Brier score, current drift kind, and average
// trust across tracked entities. Server-safe; each card links into the
// calibration / trust consoles. Demo labeled. Calibration + trust are advisory
// signals — observed patterns, never certainties.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { Gauge, Activity, ShieldCheck, GitCompareArrows, type LucideIcon } from 'lucide-react';
import type { CalibrationHighlights } from '@hsi/shared-types';
import { DemoBadge } from '@/components/signals/badges';
import { driftDecor, formatBrier, formatErrorPct, formatTrustScore } from '@/lib/calibration/view';

interface HighlightItem {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  accent: string;
  href: string;
}

const CALIBRATION_HREF = '/dashboard/calibration';
const TRUST_HREF = '/dashboard/trust';

export function CalibrationHighlightCards({
  highlights,
  demo = false,
}: {
  highlights: CalibrationHighlights;
  demo?: boolean;
}) {
  const items: HighlightItem[] = [];

  if (typeof highlights.ece === 'number') {
    items.push({
      label: 'Expected calibration error',
      value: formatErrorPct(highlights.ece),
      detail: 'lower is better',
      icon: GitCompareArrows,
      accent: '#F59E0B',
      href: CALIBRATION_HREF,
    });
  }
  if (typeof highlights.brier === 'number') {
    items.push({
      label: 'Brier score',
      value: formatBrier(highlights.brier),
      detail: '0 = perfect',
      icon: Gauge,
      accent: '#3B82F6',
      href: CALIBRATION_HREF,
    });
  }
  if (highlights.driftKind) {
    const decor = driftDecor(highlights.driftKind);
    items.push({
      label: 'Confidence drift',
      value: decor.label,
      detail: 'advisory — recompute to act',
      icon: Activity,
      accent: decor.color,
      href: CALIBRATION_HREF,
    });
  }
  if (typeof highlights.avgTrust === 'number') {
    items.push({
      label: 'Average trust',
      value: `${formatTrustScore(highlights.avgTrust)}/100`,
      detail: 'across tracked entities',
      icon: ShieldCheck,
      accent: '#10B981',
      href: TRUST_HREF,
    });
  }

  if (items.length === 0) return null;

  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Gauge className="h-4 w-4 text-electric" /> Calibration &amp; trust
        </h3>
        {demo ? <DemoBadge /> : null}
        <span className="ml-auto text-caption text-text-muted">
          observed signals — never certainties
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
                <p className="truncate text-body-sm font-semibold text-text-primary" title={item.value}>
                  {item.value}
                </p>
                {item.detail ? (
                  <p className="line-clamp-1 text-caption font-semibold" style={{ color: item.accent }}>
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
