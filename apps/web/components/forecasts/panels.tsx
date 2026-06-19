// =============================================================================
// HSI Phase 67 — Forecast panels (server). Dashboard overview + performance +
// calibration + readiness + executive + alerts; detail summary/timeline/eval. All
// values computed from persisted forecasts — no AI predictions, no fabrication.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import { Target, Activity, CheckCircle2, XCircle, Clock, Gauge, ClipboardCheck, ShieldAlert, TrendingUp } from 'lucide-react';
import type { ForecastsDashboard, ReadinessItem } from '@/lib/forecasts/data';
import type { Forecast, ForecastStatus, PerformanceMetrics, CalibrationBucket, ForecastPrediction, ForecastOutcome, ForecastScore, ForecastEvaluation, ForecastTimelineEvent } from '@/lib/forecasts/types';
import type { ScoredForecast, AlertRow } from '@/lib/forecasts/persistence';

const n = (v: number) => v.toLocaleString('en-US');
const href = (id: string) => `/dashboard/forecast-validation/${id}`;

const STATUS_STYLE: Record<ForecastStatus, string> = {
  draft: 'border-border bg-surface-2/50 text-text-secondary', active: 'border-electric/40 bg-electric/10 text-electric',
  resolved: 'border-verified/40 bg-verified/10 text-verified', expired: 'border-warning/40 bg-warning/10 text-warning',
  cancelled: 'border-border bg-surface-2/40 text-text-muted',
};
export function StatusBadge({ status }: { status: ForecastStatus }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLE[status]}`}>{status}</span>;
}
const SEV_STYLE: Record<string, string> = { INFO: 'border-border bg-surface-2/50 text-text-secondary', NOTICE: 'border-electric/40 bg-electric/10 text-electric', WARNING: 'border-warning/40 bg-warning/10 text-warning', CRITICAL: 'border-risk/40 bg-risk/10 text-risk' };

export function ForecastsOverview({ d }: { d: ForecastsDashboard }) {
  const s = (k: string) => d.byStatus[k] ?? 0;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Total" value={n(d.total)} accent="#3B82F6" icon={Target} />
      <MetricCard label="Active" value={n(s('active'))} accent="#0EA5E9" icon={Activity} />
      <MetricCard label="Resolved" value={n(s('resolved'))} accent="#10B981" icon={CheckCircle2} />
      <MetricCard label="Expired" value={n(s('expired'))} accent="#F59E0B" icon={Clock} />
      <MetricCard label="Accuracy" value={`${d.performance.accuracy}%`} accent="#10B981" icon={CheckCircle2} />
      <MetricCard label="Calibration" value={`${d.performance.calibrationScore}/100`} accent="#8B5CF6" icon={Gauge} />
      <MetricCard label="Resolution rate" value={`${d.performance.resolutionRate}%`} accent="#6366F1" icon={Activity} />
      <MetricCard label="Readiness" value={`${d.readinessScore}%`} accent="#0EA5E9" icon={ClipboardCheck} />
    </div>
  );
}

export function PerformancePanel({ p }: { p: PerformanceMetrics }) {
  const cells = [
    { label: 'Accuracy', value: `${p.accuracy}%` }, { label: 'Precision', value: `${p.precision}%` },
    { label: 'Resolution rate', value: `${p.resolutionRate}%` }, { label: 'Expiration rate', value: `${p.expirationRate}%` },
    { label: 'Confidence quality', value: `${p.confidenceQuality}` }, { label: 'Calibration', value: `${p.calibrationScore}` },
    { label: 'Trend accuracy', value: `${p.trendAccuracy}%` }, { label: 'Volume', value: `${p.volume}` },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Performance metrics</h3></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map((c) => <div key={c.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{c.value}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{c.label}</div></div>)}
      </div>
    </Card>
  );
}

export function CalibrationPanel({ buckets }: { buckets: CalibrationBucket[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Calibration curve</h3></div>
      {buckets.length === 0 ? <p className="text-caption text-text-muted">No resolved forecasts yet — calibration appears after evaluations.</p> : (
        <ul className="space-y-2">
          {buckets.map((b) => (
            <li key={b.bucket} className="space-y-1">
              <div className="flex items-center justify-between text-caption"><span className="text-text-secondary">Confidence {b.bucket}</span><span className="text-text-muted">predicted {Math.round(b.predictedConfidence * 100)}% · actual {Math.round(b.actualAccuracy * 100)}% · n={b.count}</span></div>
              <div className="relative h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="absolute left-0 top-0 h-full rounded-full bg-electric/60" style={{ width: `${Math.round(b.predictedConfidence * 100)}%` }} />
                <div className="absolute left-0 top-0 h-full rounded-full bg-verified" style={{ width: `${Math.round(b.actualAccuracy * 100)}%`, opacity: 0.6 }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ReadinessPanel({ readiness, score }: { readiness: ReadinessItem[]; score: number }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Forecast readiness</h3><span className="ml-auto text-h6 font-bold tabular-nums text-text-primary">{score}%</span></div>
      <p className="text-caption text-text-muted">From the Phase 66 Forecast Prep Agent (coverage, source/narrative stability, graph + data completeness).</p>
      {readiness.length === 0 ? <p className="text-caption text-text-muted">Run the Forecast Prep Agent to populate readiness.</p> : (
        <ul className="space-y-1.5">
          {readiness.map((r, i) => (
            <li key={`${r.label}-${i}`} className="flex items-center gap-2 text-body-sm">
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEV_STYLE[r.severity] ?? SEV_STYLE.INFO}`}>{r.severity}</span>
              <span className="min-w-0 flex-1 truncate text-text-secondary">{r.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ScoredList({ title, rows, tone }: { title: string; rows: ScoredForecast[]; tone: string }) {
  return (
    <div className="space-y-2">
      <h4 className="text-body-sm font-semibold text-text-primary">{title}</h4>
      {rows.length === 0 ? <p className="text-caption text-text-muted">None yet.</p> : (
        <ol className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-body-sm">
              <a href={href(r.id)} className="min-w-0 flex-1 truncate text-electric hover:underline">{r.title}</a>
              <span className={`shrink-0 text-caption ${tone}`}>{r.result}{r.brier != null ? ` · ${r.brier}` : ''}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function ExecutivePanel({ d }: { d: ForecastsDashboard }) {
  return (
    <Card className="space-y-5 border-electric/30">
      <div className="flex items-center gap-2"><Target className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Executive intelligence</h3></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ScoredList title="Best performing" rows={d.bestPerforming} tone="text-verified" />
        <ScoredList title="Worst performing" rows={d.worstPerforming} tone="text-risk" />
      </div>
      {d.snapshots.length > 0 ? (
        <div>
          <h4 className="text-body-sm font-semibold text-text-primary">Trends (recent snapshots)</h4>
          <ul className="mt-1 space-y-1">
            {d.snapshots.slice(-8).map((s) => (
              <li key={s.snapshotAt} className="flex items-center gap-2 text-caption text-text-muted"><span className="w-24 shrink-0">{new Date(s.snapshotAt).toLocaleDateString()}</span><span>acc {s.accuracy}% · cal {s.calibrationScore} · vol {s.volume}</span></li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

export function ForecastAlertsPanel({ alerts }: { alerts: AlertRow[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Forecast alerts</h3><span className="ml-auto text-caption text-text-muted">{n(alerts.length)} recent</span></div>
      {alerts.length === 0 ? <p className="text-caption text-text-muted">No forecast alerts.</p> : (
        <ul className="space-y-1.5">
          {alerts.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2 text-body-sm">
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEV_STYLE[a.severity] ?? SEV_STYLE.INFO}`}>{a.severity}</span>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{a.alertType.replace('FORECAST_', '')}</span>
              <span className="min-w-0 flex-1 truncate text-text-secondary">{a.reason}</span>
              {a.notificationId ? <span className="shrink-0 text-caption text-verified" title="notified">✓</span> : null}
              <span className="shrink-0 text-caption text-text-muted">{a.createdLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ForecastList({ forecasts }: { forecasts: Forecast[] }) {
  return (
    <Card className="space-y-3">
      <h3 className="text-h6 font-semibold text-text-primary">Forecasts</h3>
      {forecasts.length === 0 ? <p className="text-caption text-text-muted">No forecasts yet.</p> : (
        <ul className="space-y-1.5">
          {forecasts.map((fcast) => (
            <li key={fcast.id} className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2 text-body-sm">
              <a href={href(fcast.id)} className="min-w-0 flex-1 truncate text-electric hover:underline">{fcast.title}</a>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-muted">{fcast.predictionType}</span>
              {fcast.confidence != null ? <span className="shrink-0 text-caption text-text-muted">{Math.round(fcast.confidence * 100)}%</span> : null}
              <StatusBadge status={fcast.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---- detail ----------------------------------------------------------------

export function ForecastSummaryPanel({ forecast, prediction, outcome, score }: { forecast: Forecast; prediction: ForecastPrediction | null; outcome: ForecastOutcome | null; score: ForecastScore | null }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Target className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">{forecast.title}</h3><StatusBadge status={forecast.status} /></div>
      {forecast.description ? <p className="text-caption text-text-secondary">{forecast.description}</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        <KV label="Type" value={forecast.predictionType} />
        <KV label="Confidence" value={forecast.confidence != null ? `${Math.round(forecast.confidence * 100)}%` : '—'} />
        <KV label="Forecast date" value={fmt(forecast.forecastDate)} />
        <KV label="Resolution" value={fmt(forecast.resolutionDate)} />
        <KV label="Predicted" value={prediction ? JSON.stringify(prediction.predictedValue) : '—'} />
        <KV label="Outcome" value={outcome ? (outcome.outcomeLabel ?? JSON.stringify(outcome.actualValue)) : 'not recorded'} />
        <KV label="Result" value={score?.result ?? '—'} />
        <KV label="Brier" value={score?.brierScore != null ? String(score.brierScore) : '—'} />
      </div>
    </Card>
  );
}

export function ForecastTimelinePanel({ events }: { events: ForecastTimelineEvent[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Timeline</h3></div>
      {events.length === 0 ? <p className="text-caption text-text-muted">No events.</p> : (
        <ul className="space-y-1.5">
          {events.map((e, i) => (
            <li key={`${e.event}-${i}`} className="flex items-center gap-2 text-caption"><span className="w-28 shrink-0 text-text-muted">{fmt(e.at)}</span><span className="font-semibold capitalize text-text-secondary">{e.event}</span>{e.detail ? <span className="text-text-muted">— {e.detail}</span> : null}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ForecastEvaluationsPanel({ evals }: { evals: ForecastEvaluation[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><XCircle className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Evaluation history</h3></div>
      {evals.length === 0 ? <p className="text-caption text-text-muted">Not yet evaluated.</p> : (
        <ul className="space-y-1.5">
          {evals.map((e, i) => (
            <li key={`${e.evaluatedAt}-${i}`} className="flex items-start gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2 text-body-sm">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{e.result}</span>
              <div className="min-w-0 flex-1"><p className="text-text-secondary">{e.rationale}</p><p className="text-[11px] text-text-muted">{fmt(e.evaluatedAt)}{e.score != null ? ` · score ${e.score}` : ''}</p></div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div><div className="truncate text-body-sm font-semibold text-text-primary" title={value}>{value}</div></div>;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmt(iso: string | null): string { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; }
