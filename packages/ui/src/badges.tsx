import { type ReactNode } from 'react';
import { ShieldCheck, CircleDot } from 'lucide-react';
import { cn } from './utils';
import { riskLevels, type RiskLevel } from './tokens';

/* -------------------------------------------------------------------------- */
/* RiskBadge                                                                    */
/* -------------------------------------------------------------------------- */

export interface RiskBadgeProps {
  level: RiskLevel;
  showDot?: boolean;
  className?: string;
}

export function RiskBadge({ level, showDot = true, className = '' }: RiskBadgeProps) {
  const { label, color, soft } = riskLevels[level];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold',
        className,
      )}
      style={{ backgroundColor: soft, color, border: `1px solid ${color}55` }}
    >
      {showDot ? (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
        />
      ) : null}
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* TraceabilityBadge                                                            */
/* -------------------------------------------------------------------------- */

export interface TraceabilityBadgeProps {
  /** 0–100 traceability score. */
  score: number;
  className?: string;
}

export function TraceabilityBadge({ score, className = '' }: TraceabilityBadgeProps) {
  const color =
    score >= 90 ? '#10B981' : score >= 70 ? '#F59E0B' : '#EF4444';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold',
        className,
      )}
      style={{ backgroundColor: `${color}1f`, color, border: `1px solid ${color}55` }}
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      {score.toFixed(1)}% traceable
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* ReviewStatusBadge                                                            */
/* -------------------------------------------------------------------------- */

export type ReviewStatus =
  | 'Approved'
  | 'Rejected'
  | 'Pending'
  | 'In Review'
  | 'Escalated';

const reviewStatusColors: Record<ReviewStatus, string> = {
  Approved: '#10B981',
  Rejected: '#EF4444',
  Pending: '#F59E0B',
  'In Review': '#3B82F6',
  Escalated: '#8B5CF6',
};

export function ReviewStatusBadge({
  status,
  className = '',
}: {
  status: ReviewStatus;
  className?: string;
}) {
  const color = reviewStatusColors[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold',
        className,
      )}
      style={{ backgroundColor: `${color}1f`, color, border: `1px solid ${color}55` }}
    >
      <CircleDot className="h-3 w-3" />
      {status}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* CategoryTag                                                                  */
/* -------------------------------------------------------------------------- */

export type CategoryTone =
  | 'neutral'
  | 'blue'
  | 'purple'
  | 'green'
  | 'orange'
  | 'red';

const categoryTones: Record<CategoryTone, string> = {
  neutral: '#94A3B8',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  green: '#10B981',
  orange: '#F59E0B',
  red: '#EF4444',
};

export function CategoryTag({
  label,
  tone = 'neutral',
  className = '',
}: {
  label: ReactNode;
  tone?: CategoryTone;
  className?: string;
}) {
  const color = categoryTones[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em]',
        className,
      )}
      style={{ backgroundColor: `${color}14`, color, border: `1px solid ${color}33` }}
    >
      {label}
    </span>
  );
}
