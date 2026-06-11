// =============================================================================
// HSI Phase 16 — shared badge / chip primitives for the Calibration & Trust UI
// (server-safe, pure presentational). Each maps a Decorated {label,color,tone}
// from lib/calibration/view into an inline-styled pill matching the @hsi/ui
// aesthetic. No client interactivity here.
// =============================================================================

import { type ReactNode } from 'react';
import { cn } from '@hsi/ui';
import type {
  CalibrationQuality,
  ConfidenceDriftKind,
  TrustBand,
  TrustEntityType,
} from '@hsi/shared-types';
import {
  bandDecor,
  driftDecor,
  entityTypeDecor,
  qualityDecor,
  type Decorated,
} from '@/lib/calibration/view';

export function DecoratedPill({
  decor,
  dot = true,
  icon,
  className = '',
}: {
  decor: Decorated;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  const { label, color } = decor;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold',
        className,
      )}
      style={{ backgroundColor: `${color}1f`, color, border: `1px solid ${color}55` }}
    >
      {icon ??
        (dot ? (
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
          />
        ) : null)}
      {label}
    </span>
  );
}

/** Trust band pill (low / medium / high). */
export function TrustBandBadge({ band }: { band?: TrustBand | string | null }) {
  return <DecoratedPill decor={bandDecor(band)} />;
}

/** Calibration-quality pill (excellent → poor / insufficient). */
export function CalibrationQualityBadge({
  quality,
}: {
  quality?: CalibrationQuality | string | null;
}) {
  return <DecoratedPill decor={qualityDecor(quality)} />;
}

/** Confidence-drift kind pill. */
export function DriftBadge({ kind }: { kind?: ConfidenceDriftKind | string | null }) {
  return <DecoratedPill decor={driftDecor(kind)} />;
}

/** Entity-type pill (source / narrative / forecast / decision …). */
export function EntityTypeBadge({
  type,
}: {
  type?: TrustEntityType | string | null;
}) {
  return <DecoratedPill decor={entityTypeDecor(type)} dot={false} />;
}
