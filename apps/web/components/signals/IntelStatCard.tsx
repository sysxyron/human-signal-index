// =============================================================================
// HSI Phase 7 — IntelStatCard. A single intelligence-overview stat widget
// (label, value, icon, accent, optional hint). Thin wrapper over the @hsi/ui
// MetricCard aesthetic, but accepts a numeric value + caption. Server-safe.
// =============================================================================

import { type ComponentType } from 'react';
import { type LucideProps } from 'lucide-react';
import { Card } from '@hsi/ui';

export function IntelStatCard({
  label,
  value,
  icon: Icon,
  accent = '#3B82F6',
  hint,
}: {
  label: string;
  value: number | string;
  icon: ComponentType<LucideProps>;
  accent?: string;
  hint?: string;
}) {
  return (
    <Card className="relative overflow-hidden" interactive padded>
      <div
        className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl"
        style={{ backgroundColor: accent }}
      />
      <div className="relative flex items-start justify-between">
        <span className="text-label text-text-muted">{label}</span>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="relative mt-3">
        <div className="text-3xl font-bold tracking-tight text-text-primary">
          {value}
        </div>
        {hint ? <p className="mt-1 text-caption text-text-muted">{hint}</p> : null}
      </div>
    </Card>
  );
}
