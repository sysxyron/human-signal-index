'use client';

import { supportTypeStyle } from '@/lib/worldforge/evidence-view';

export interface SupportTypeBadgeProps {
  /** One of supports | contradicts | background | unclear. */
  support: string;
  /** Hide the icon for very dense rows. */
  compact?: boolean;
  className?: string;
}

/** Color-coded badge for how a source relates to a claim. */
export function SupportTypeBadge({
  support,
  compact = false,
  className = '',
}: SupportTypeBadgeProps) {
  const s = supportTypeStyle(support);
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}
      style={{ backgroundColor: s.soft, color: s.color, border: `1px solid ${s.border}` }}
      title={s.description}
    >
      {compact ? (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: s.color, boxShadow: `0 0 8px ${s.color}` }}
        />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      {compact ? s.short : s.label}
    </span>
  );
}
