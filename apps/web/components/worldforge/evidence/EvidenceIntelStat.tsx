import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import { Card } from '@hsi/ui';

export interface EvidenceIntelStatProps {
  label: string;
  /** Pre-formatted display value (e.g. "62%"). */
  value: string;
  /** Optional secondary line under the value. */
  sub?: string;
  /** Accent / value color (hex). */
  color?: string;
  icon?: ComponentType<LucideProps>;
  className?: string;
}

/**
 * A compact, color-coded stat card for the Evidence Intelligence dashboard.
 * Server-safe (no hooks) so it can render inside the Server Component page.
 */
export function EvidenceIntelStat({
  label,
  value,
  sub,
  color = '#3B82F6',
  icon: Icon,
  className = '',
}: EvidenceIntelStatProps) {
  return (
    <Card className={`relative overflow-hidden ${className}`} padded>
      <div
        className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl"
        style={{ backgroundColor: color }}
      />
      <div className="relative flex items-start justify-between">
        <span className="text-label text-text-muted">{label}</span>
        {Icon ? (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <div className="relative mt-3">
        <div className="text-3xl font-bold tracking-tight" style={{ color }}>
          {value}
        </div>
        {sub ? (
          <p className="mt-1.5 text-caption text-text-muted">{sub}</p>
        ) : null}
      </div>
    </Card>
  );
}
