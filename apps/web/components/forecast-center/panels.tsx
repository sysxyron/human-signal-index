// =============================================================================
// HSI Phase 52 — Forecasting & Early Warning panels (server-rendered, read-only).
// Everything is framed as likelihood / direction / confidence — never certainty.
// Public-safe observed counts only; graceful empty states. (Separate folder from
// the Phase 21 forecasting workflow components, which are untouched.)
// =============================================================================

import { Card } from '@hsi/ui';
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, Gauge, Database, ClipboardCheck, Activity, History, Radio,
} from 'lucide-react';
import { colorForBucket } from '@/lib/public-intelligence-mapping';
import type {
  MomentumWindow, RiskTrajectory, NarrativeMomentum, SourceForecasts, ReviewForecast, ExecutiveOutlook,
  EarlyWarning, ForecastHistory, Confidence, Direction,
} from '@/lib/forecasting-intelligence';

const CONF_COLOR: Record<Confidence, string> = { High: '#10B981', Moderate: '#F59E0B', Low: '#94A3B8' };
const TONE: Record<string, string> = { green: '#10B981', amber: '#F59E0B', red: '#EF4444' };

function ConfidenceBadge({ level }: { level: Confidence }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${CONF_COLOR[level]}1f`, color: CONF_COLOR[level] }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CONF_COLOR[level] }} />{level} confidence
    </span>
  );
}

function DirectionPill({ direction, deltaPct }: { direction: Direction; deltaPct?: number }) {
  const color = direction === 'Increasing' ? '#EF4444' : direction === 'Declining' ? '#10B981' : '#94A3B8';
  const Icon = direction === 'Increasing' ? TrendingUp : direction === 'Declining' ? TrendingDown : Minus;
  return (
    <span className="inline-flex items-center gap-1 text-caption font-semibold" style={{ color }}>
      <Icon className="h-3.5 w-3.5" /> {direction}{typeof deltaPct === 'number' && deltaPct !== 0 ? ` ${deltaPct > 0 ? '+' : ''}${deltaPct}%` : ''}
    </span>
  );
}

export function ExecutiveOutlookPanel({ outlook }: { outlook: ExecutiveOutlook }) {
  const dot = TONE[outlook.outlookTone];
  const items = [
    { label: 'Top emerging risk', value: outlook.topEmergingRisk },
    { label: 'Top growing category', value: outlook.topGrowingCategory },
    { label: 'Source concern', value: outlook.sourceConcern },
    { label: 'Operational pressure', value: outlook.operationalPressure },
    { label: 'Platform outlook', value: outlook.platformOutlook },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-electric" /><h2 className="text-h6 font-semibold text-text-primary">Executive outlook</h2>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold" style={{ backgroundColor: `${dot}1f`, color: dot }}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />{outlook.platformOutlook}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => (
          <div key={it.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{it.label}</div>
            <div className="mt-0.5 truncate text-body-sm font-semibold text-text-primary" title={it.value}>{it.value}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-text-muted">Forecasts are likelihood-based and non-deterministic — directional signals from observed activity, not predictions of certainty.</p>
    </Card>
  );
}

export function EarlyWarningPanel({ warnings }: { warnings: EarlyWarning[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-risk" /><h3 className="text-h6 font-semibold text-text-primary">Early warning</h3></div>
      {warnings.length === 0 ? (
        <p className="rounded-card border border-verified/30 bg-verified/10 px-4 py-6 text-center text-caption text-verified">No early-warning indicators are firing.</p>
      ) : (
        <ul className="space-y-2">
          {warnings.map((w) => (
            <li key={w.label} className="flex items-start gap-2.5 rounded-card border border-border bg-background-deep/40 px-3 py-2">
              <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <div className="min-w-0 flex-1"><div className="text-body-sm font-medium text-text-primary">{w.label}</div><div className="text-caption text-text-muted">{w.indicator}</div></div>
              <ConfidenceBadge level={w.confidence} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function TrendMomentumPanel({ momentum }: { momentum: MomentumWindow[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Trend momentum</h3></div>
      <div className="grid gap-3 sm:grid-cols-3">
        {momentum.map((m) => (
          <div key={m.period} className="rounded-card border border-border bg-background-deep/40 p-3">
            <div className="flex items-center justify-between"><span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{m.period} movement</span><DirectionPill direction={m.direction} deltaPct={m.deltaPct} /></div>
            <div className="mt-1 text-body-sm text-text-secondary">{m.current} now · {m.prior} prior</div>
            <div className="mt-2" title={m.confidenceReason}><ConfidenceBadge level={m.confidence} /></div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-text-muted">Movement compares the most recent window to the immediately preceding one, from observed publication timestamps.</p>
    </Card>
  );
}

export function RiskTrajectoryPanel({ trajectory }: { trajectory: RiskTrajectory[] }) {
  return (
    <Card className="space-y-3">
      <h3 className="text-h6 font-semibold text-text-primary">Risk trajectory (30d)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-caption">
          <thead className="text-[10px] uppercase tracking-wide text-text-muted"><tr className="border-b border-border"><th className="py-2 pr-3 font-medium">Category</th><th className="py-2 pr-3 font-medium">Current risk</th><th className="py-2 pr-3 font-medium">Direction</th><th className="py-2 pr-3 font-medium">Velocity</th><th className="py-2 font-medium">Confidence</th></tr></thead>
          <tbody>
            {trajectory.map((t) => (
              <tr key={t.category} className="border-b border-border/50">
                <td className="py-2 pr-3"><span className="flex items-center gap-2 text-text-primary"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForBucket(t.category) }} />{t.category}</span></td>
                <td className="py-2 pr-3 text-text-secondary">{t.currentRisk}</td>
                <td className="py-2 pr-3"><DirectionPill direction={t.direction} /></td>
                <td className="py-2 pr-3 tabular-nums text-text-secondary">{t.velocity > 0 ? '+' : ''}{t.velocity}</td>
                <td className="py-2"><ConfidenceBadge level={t.confidence} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function NarrativeMomentumPanel({ momentum }: { momentum: NarrativeMomentum }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Narrative momentum</h3></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Block title="Fastest growing">
          {momentum.fastestGrowing.length === 0 ? <Empty /> : momentum.fastestGrowing.map((g) => (
            <Row key={g.category} left={g.category} right={`+${g.deltaPct}% (${g.current})`} color={colorForBucket(g.category)} />
          ))}
        </Block>
        <Block title="Most persistent">
          {momentum.mostPersistent.length === 0 ? <Empty /> : momentum.mostPersistent.map((p) => (
            <Row key={p.category} left={p.category} right={`${p.periods}/3 periods`} color={colorForBucket(p.category)} />
          ))}
        </Block>
        <Block title="Emerging">
          {momentum.emerging.length === 0 ? <Empty /> : momentum.emerging.map((e) => (
            <Row key={e.label} left={e.label} right="" color="#F59E0B" />
          ))}
        </Block>
        <Block title="Dormant">
          {momentum.dormant.length === 0 ? <Empty /> : momentum.dormant.map((d) => (
            <Row key={d.category} left={d.category} right={`last ${d.lastSeen}`} color={colorForBucket(d.category)} />
          ))}
        </Block>
      </div>
    </Card>
  );
}

export function SourceForecastsPanel({ forecasts }: { forecasts: SourceForecasts }) {
  const rows = [forecasts.likelyFailures, forecasts.likelyRecoveries, forecasts.coverageGaps, forecasts.coverageExpansion, forecasts.highYieldTrajectory];
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Database className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Source forecasts</h3></div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-start gap-2.5 rounded-card border border-border bg-background-deep/40 px-3 py-2">
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-body-sm font-medium text-text-primary">{r.label}</span><span className="text-h6 font-bold tabular-nums text-electric">{r.value}</span></div><div className="text-caption text-text-muted">{r.note}</div></div>
            <ConfidenceBadge level={r.confidence} />
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-text-muted">Based on observed activity patterns only — directional, not guaranteed.</p>
    </Card>
  );
}

export function ReviewForecastPanel({ forecast }: { forecast: ReviewForecast }) {
  const pressureColor = forecast.estimatedPressure === 'High' ? '#EF4444' : forecast.estimatedPressure === 'Medium' ? '#F59E0B' : '#10B981';
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Review forecasting</h3><div className="ml-auto"><ConfidenceBadge level={forecast.confidence} /></div></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Backlog trend"><DirectionPill direction={forecast.backlogTrend} /></Stat>
        <Stat label="Throughput"><DirectionPill direction={forecast.throughputTrend} /></Stat>
        <Stat label="Publication"><DirectionPill direction={forecast.publicationTrend} /></Stat>
        <Stat label="Pressure"><span className="text-body-sm font-bold" style={{ color: pressureColor }}>{forecast.estimatedPressure}</span></Stat>
      </div>
      <p className="text-[11px] text-text-muted">No ETAs are fabricated — only directional trends from observed throughput.</p>
    </Card>
  );
}

export function ForecastHistoryPanel({ history }: { history: ForecastHistory }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><History className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Forecast history</h3></div>
      {!history.available || history.items.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-8 text-center text-caption text-text-muted">No forecast history yet. Once forecasts are recorded over time, their outcomes and success rate will appear here.</p>
      ) : (
        <ul className="space-y-1.5">
          {history.items.map((h, i) => (
            <li key={i} className="flex items-center justify-between rounded-card border border-border bg-background-deep/40 px-3 py-2 text-caption">
              <span className="text-text-secondary">{h.label}</span><span className="text-text-muted">{h.outcome} · {h.observed}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">{title}</h4><div className="space-y-1.5">{children}</div></div>;
}
function Row({ left, right, color }: { left: string; right: string; color: string }) {
  return <div className="flex items-center gap-2 text-body-sm"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} /><span className="min-w-0 flex-1 truncate text-text-secondary">{left}</span>{right ? <span className="shrink-0 text-caption text-text-muted">{right}</span> : null}</div>;
}
function Empty() { return <p className="text-caption text-text-muted">None observed.</p>; }
function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2"><div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div><div className="mt-0.5">{children}</div></div>;
}
