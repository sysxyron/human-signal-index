import { type ComponentType, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  ShieldAlert,
  Clock,
  type LucideProps,
} from 'lucide-react';
import { cn } from './utils';
import { Card } from './primitives';
import { Sparkline } from './charts';
import { RiskBadge, CategoryTag, TraceabilityBadge, type CategoryTone } from './badges';
import { type RiskLevel } from './tokens';

/* -------------------------------------------------------------------------- */
/* MetricCard                                                                   */
/* -------------------------------------------------------------------------- */

export interface MetricCardProps {
  label: string;
  value: string;
  delta?: { value: string; trend: 'up' | 'down' };
  /** Tone of the delta: 'positive' means up=good (green). */
  deltaTone?: 'positive' | 'negative';
  sparkline?: number[];
  sparklineColor?: string;
  icon?: ComponentType<LucideProps>;
  accent?: string;
  className?: string;
}

export function MetricCard({
  label,
  value,
  delta,
  deltaTone = 'positive',
  sparkline,
  sparklineColor = '#3B82F6',
  icon: Icon,
  accent = '#3B82F6',
  className = '',
}: MetricCardProps) {
  const deltaPositive =
    delta &&
    ((delta.trend === 'up' && deltaTone === 'positive') ||
      (delta.trend === 'down' && deltaTone === 'negative'));
  const deltaColor = delta ? (deltaPositive ? '#10B981' : '#EF4444') : '';

  return (
    <Card className={cn('relative overflow-hidden', className)} interactive>
      <div
        className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl"
        style={{ backgroundColor: accent }}
      />
      <div className="relative flex items-start justify-between">
        <span className="text-label text-text-muted">{label}</span>
        {Icon ? (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${accent}1f`, color: accent }}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <div className="relative mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-bold tracking-tight text-text-primary">
            {value}
          </div>
          {delta ? (
            <div
              className="mt-1.5 flex items-center gap-1 text-caption font-semibold"
              style={{ color: deltaColor }}
            >
              {delta.trend === 'up' ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {delta.value}
            </div>
          ) : null}
        </div>
        {sparkline ? (
          <Sparkline data={sparkline} color={sparklineColor} width={96} height={40} />
        ) : null}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* HeatmapCard                                                                   */
/* -------------------------------------------------------------------------- */

export interface HeatmapCardProps {
  title: string;
  subtitle?: string;
  /** 2D matrix of intensity values 0–1 (rows x cols). */
  matrix: number[][];
  rowLabels?: string[];
  colLabels?: string[];
  color?: string;
  className?: string;
}

export function HeatmapCard({
  title,
  subtitle,
  matrix,
  rowLabels = [],
  colLabels = [],
  color = '#EF4444',
  className = '',
}: HeatmapCardProps) {
  const cols = matrix[0]?.length ?? 0;
  return (
    <Card className={cn('space-y-4', className)}>
      <div>
        <h4 className="text-h6 font-semibold text-text-primary">{title}</h4>
        {subtitle ? (
          <p className="mt-0.5 text-caption text-text-muted">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex gap-2">
        {rowLabels.length > 0 ? (
          <div
            className="flex flex-col justify-around pr-1 text-caption text-text-muted"
            style={{ paddingTop: 2 }}
          >
            {rowLabels.map((r) => (
              <span key={r} className="h-5 leading-5">
                {r}
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex-1 space-y-1.5">
          {matrix.map((row, ri) => (
            <div key={ri} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
              {row.map((v, ci) => (
                <div
                  key={ci}
                  className="h-5 rounded-[3px] transition hover:scale-110"
                  style={{
                    backgroundColor: color,
                    // Round to 3 decimals so the serialized style string is
                    // byte-identical on server and client. The raw value can come
                    // from Math.sin/etc. which differs by ~1 ULP across the Node
                    // and browser math libs, triggering a hydration mismatch.
                    opacity: Number((0.12 + v * 0.85).toFixed(3)),
                  }}
                  title={`${v.toFixed(2)}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {colLabels.length > 0 ? (
        <div
          className="grid gap-1.5 text-caption text-text-muted"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
        >
          {colLabels.map((c) => (
            <span key={c} className="text-center">
              {c}
            </span>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* TimelineCard                                                                  */
/* -------------------------------------------------------------------------- */

export interface TimelineItem {
  time: string;
  title: string;
  description?: string;
  tone?: CategoryTone;
}

export function TimelineCard({
  title,
  items,
  className = '',
}: {
  title: string;
  items: TimelineItem[];
  className?: string;
}) {
  const dot: Record<string, string> = {
    neutral: '#94A3B8',
    blue: '#3B82F6',
    purple: '#8B5CF6',
    green: '#10B981',
    orange: '#F59E0B',
    red: '#EF4444',
  };
  return (
    <Card className={cn('space-y-4', className)}>
      <h4 className="text-h6 font-semibold text-text-primary">{title}</h4>
      <ol className="relative space-y-5 border-l border-border pl-5">
        {items.map((item, i) => (
          <li key={i} className="relative">
            <span
              className="absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-surface"
              style={{ backgroundColor: dot[item.tone ?? 'blue'] }}
            />
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3 text-text-muted" />
              <span className="text-caption text-text-muted">{item.time}</span>
            </div>
            <p className="mt-0.5 text-body-sm font-semibold text-text-primary">
              {item.title}
            </p>
            {item.description ? (
              <p className="mt-0.5 text-caption text-text-secondary">
                {item.description}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* AlertCard                                                                     */
/* -------------------------------------------------------------------------- */

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'info';

const alertConfig: Record<
  AlertSeverity,
  { color: string; soft: string; label: string }
> = {
  critical: { color: '#EF4444', soft: 'rgba(239,68,68,0.12)', label: 'Critical' },
  high: { color: '#F59E0B', soft: 'rgba(245,158,11,0.12)', label: 'High' },
  medium: { color: '#3B82F6', soft: 'rgba(59,130,246,0.12)', label: 'Medium' },
  info: { color: '#8B5CF6', soft: 'rgba(139,92,246,0.12)', label: 'Info' },
};

export interface AlertCardProps {
  severity: AlertSeverity;
  title: string;
  description: string;
  time?: string;
  className?: string;
}

export function AlertCard({
  severity,
  title,
  description,
  time,
  className = '',
}: AlertCardProps) {
  const cfg = alertConfig[severity];
  return (
    <div
      className={cn(
        'glass-card flex gap-3 rounded-card border p-4',
        className,
      )}
      style={{ borderColor: `${cfg.color}40`, backgroundColor: cfg.soft }}
    >
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${cfg.color}22`, color: cfg.color }}
      >
        <AlertTriangle className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-body-sm font-semibold text-text-primary">{title}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: `${cfg.color}22`, color: cfg.color }}
          >
            {cfg.label}
          </span>
        </div>
        <p className="mt-1 text-caption text-text-secondary">{description}</p>
        {time ? <p className="mt-1.5 text-caption text-text-muted">{time}</p> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SecurityEventCard                                                             */
/* -------------------------------------------------------------------------- */

export interface SecurityEventCardProps {
  title: string;
  source: string;
  severity: AlertSeverity;
  status: string;
  time: string;
  className?: string;
}

export function SecurityEventCard({
  title,
  source,
  severity,
  status,
  time,
  className = '',
}: SecurityEventCardProps) {
  const cfg = alertConfig[severity];
  return (
    <Card className={cn('space-y-3', className)} interactive>
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${cfg.color}1f`, color: cfg.color }}
        >
          <ShieldAlert className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semibold text-text-primary">{title}</p>
          <p className="mt-0.5 text-caption text-text-muted">{source}</p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
          style={{ backgroundColor: `${cfg.color}22`, color: cfg.color }}
        >
          {cfg.label}
        </span>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-2.5 text-caption">
        <span className="text-text-secondary">{status}</span>
        <span className="text-text-muted">{time}</span>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* SignalCard                                                                    */
/* -------------------------------------------------------------------------- */

export interface SignalCardProps {
  title: string;
  summary: string;
  category: string;
  categoryTone?: CategoryTone;
  riskLevel: RiskLevel;
  traceability: number;
  source: string;
  date: string;
  onOpen?: () => void;
  className?: string;
}

export function SignalCard({
  title,
  summary,
  category,
  categoryTone = 'blue',
  riskLevel,
  traceability,
  source,
  date,
  onOpen,
  className = '',
}: SignalCardProps) {
  return (
    <Card className={cn('flex flex-col gap-3', className)} interactive>
      <div className="flex flex-wrap items-center gap-2">
        <CategoryTag label={category} tone={categoryTone} />
        <RiskBadge level={riskLevel} />
        <TraceabilityBadge score={traceability} className="ml-auto" />
      </div>
      <h3 className="text-h5 font-semibold leading-snug text-text-primary">{title}</h3>
      <p className="text-body-sm leading-relaxed text-text-secondary">{summary}</p>
      <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-caption text-text-muted">
        <span className="truncate">{source}</span>
        <span>{date}</span>
      </div>
      {onOpen ? (
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-1 text-caption font-semibold text-electric hover:text-white"
        >
          View source trace <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* DashboardPreviewCard                                                          */
/* -------------------------------------------------------------------------- */

export interface DashboardPreviewCardProps {
  className?: string;
  children?: ReactNode;
}

/** A framed "browser window" style wrapper for showcasing dashboard visuals. */
export function DashboardPreviewCard({
  className = '',
  children,
}: DashboardPreviewCardProps) {
  return (
    <div
      className={cn(
        'glass-card overflow-hidden rounded-card border border-border bg-surface/80 shadow-glow',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-background-deep/60 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-risk/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-verified/70" />
        <span className="ml-3 text-caption text-text-muted">
          hsi://mission-control
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
