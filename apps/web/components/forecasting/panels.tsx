// =============================================================================
// HSI Phase 21 — ForecastExplanationPanel · ForecastTimeline ·
// ForecastAccuracyPanel · ForecastReliabilityChart · EarlyWarningPanel.
// The explainable forecast surface + reliability metrics. Every forecast is a
// hypothesis carrying assumptions/invalidation/limitations. Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { Lightbulb, History, Gauge, AlertTriangle, Info } from 'lucide-react';
import type {
  ForecastDetailData,
  HsinEarlyWarningAlertRecord,
  HsinForecastReliabilityRecord,
  HsinForecastVersionRecord,
} from '@hsi/shared-types';
import { WarningLevelBadge } from './badges';
import { formatBrier, formatDateTime, formatPct, readAccuracyBins, readStringArray } from '@/lib/forecasting/view';

export function ForecastExplanationPanel({ explanation }: { explanation: ForecastDetailData['explanation'] }) {
  return (
    <Card className="space-y-3 border-border" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <Lightbulb className="h-4 w-4 text-electric" /> Why this forecast
      </h3>
      <p className="text-caption leading-relaxed text-text-secondary">{explanation.summary}</p>

      <Section title="Supporting factors">
        <ul className="space-y-1.5">
          {explanation.factors.map((f, i) => (
            <li key={i} className="space-y-1">
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-primary">{f.label}</span>
                <span className="tabular-nums" style={{ color: f.direction >= 0 ? '#10B981' : '#EF4444' }}>
                  {f.direction >= 0 ? '+' : '−'} {formatPct(Math.abs(f.contribution))}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.abs(f.contribution) * 100)}%`, backgroundColor: f.direction >= 0 ? '#10B981' : '#EF4444' }} />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Assumptions"><Bullets items={explanation.assumptions} /></Section>
      <Section title="What would invalidate this"><Bullets items={explanation.invalidationCriteria} /></Section>
      <div className="rounded-card border border-border bg-surface/50 p-2">
        <div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Info className="h-3.5 w-3.5" /> Limitations</div>
        <Bullets items={explanation.limitations} muted />
      </div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-label uppercase tracking-wide text-text-muted">{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
function Bullets({ items, muted = false }: { items: string[]; muted?: boolean }) {
  if (items.length === 0) return <p className="text-[12px] text-text-muted">—</p>;
  return (
    <ul className={`ml-4 list-disc space-y-0.5 text-[12px] ${muted ? 'text-text-muted' : 'text-text-secondary'}`}>
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

export function ForecastTimeline({ versions }: { versions: HsinForecastVersionRecord[] }) {
  return (
    <Card className="space-y-3 border-border" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <History className="h-4 w-4 text-electric" /> Forecast history
      </h3>
      {versions.length === 0 ? (
        <p className="text-caption text-text-muted">No version history.</p>
      ) : (
        <ol className="relative ml-3 space-y-3 border-l border-border pl-5">
          {versions.map((v) => (
            <li key={v.id} className="relative">
              <span className="absolute -left-[27px] top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-electric" />
              <div className="flex items-center gap-2 text-caption">
                <span className="font-semibold text-text-primary">v{v.version}</span>
                <span className="text-text-muted">conf {formatPct(v.confidence)} · {formatDateTime(v.at ?? v.created_at)}</span>
              </div>
              {v.reason ? <p className="text-[11px] text-text-secondary">{v.reason}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function ForecastAccuracyPanel({ accuracy }: { accuracy?: HsinForecastReliabilityRecord }) {
  if (!accuracy) return null;
  return (
    <Card className="space-y-3 border-border" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <Gauge className="h-4 w-4 text-electric" /> Forecast reliability
      </h3>
      <div className="grid grid-cols-2 gap-3 text-caption sm:grid-cols-4">
        <Metric label="Success rate" value={formatPct(accuracy.success_rate)} color="#10B981" />
        <Metric label="Failure rate" value={formatPct(accuracy.failure_rate)} color="#EF4444" />
        <Metric label="Calibration (ECE)" value={formatPct(accuracy.ece)} color="#F59E0B" />
        <Metric label="Brier" value={formatBrier(accuracy.brier_score)} color="#3B82F6" />
      </div>
      <p className="text-[11px] text-text-muted">{accuracy.sample_count ?? 0} resolved forecast(s) · lower ECE / Brier is better.</p>
      <ForecastReliabilityChart accuracy={accuracy} />
    </Card>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-card border border-border bg-surface/50 px-2 py-1.5 text-center">
      <div className="text-label uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

export function ForecastReliabilityChart({ accuracy }: { accuracy?: HsinForecastReliabilityRecord }) {
  const bins = readAccuracyBins(accuracy).filter((b) => b.count > 0);
  if (bins.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-label uppercase tracking-wide text-text-muted">Calibration — predicted vs observed</div>
      <div className="space-y-1.5">
        {bins.map((b) => (
          <div key={b.label} className="flex items-center gap-2 text-[11px]">
            <span className="w-14 text-text-muted">{b.label}</span>
            <div className="relative h-3 flex-1 rounded-full bg-surface-2">
              <div className="absolute inset-y-0 rounded-full bg-electric/40" style={{ width: `${b.meanConfidence * 100}%` }} title={`predicted ${formatPct(b.meanConfidence)}`} />
              <div className="absolute inset-y-0 w-0.5 bg-verified" style={{ left: `${b.observedSuccess * 100}%` }} title={`observed ${formatPct(b.observedSuccess)}`} />
            </div>
            <span className="w-8 text-right tabular-nums text-text-muted">{b.count}</span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-text-muted">Bar = mean predicted confidence · line = observed success.</p>
    </div>
  );
}

export function EarlyWarningPanel({ warnings }: { warnings: HsinEarlyWarningAlertRecord[] }) {
  if (warnings.length === 0) {
    return <Card className="flex items-center gap-2 border-border" padded><AlertTriangle className="h-4 w-4 text-text-muted" /><p className="text-caption text-text-secondary">No early warnings.</p></Card>;
  }
  return (
    <div className="space-y-3">
      {warnings.map((w) => (
        <Card key={w.id} className="space-y-2 border-border" padded>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-text-primary">{w.title}</span>
            <WarningLevelBadge level={w.level} />
          </div>
          <p className="text-caption text-text-secondary">{w.signal}</p>
          {w.recommendation ? <p className="rounded-card border border-border bg-surface/50 p-2 text-[12px] text-text-secondary"><span className="font-semibold text-text-primary">Recommendation: </span>{w.recommendation}</p> : null}
          {readStringArray(w.evidence).length > 0 ? (
            <ul className="ml-4 list-disc space-y-0.5 text-[11px] text-text-muted">{readStringArray(w.evidence).map((e, i) => <li key={i}>{e}</li>)}</ul>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
