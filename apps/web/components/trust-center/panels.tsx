// =============================================================================
// HSI Phase 49 — Trust & Transparency Center panels (server-rendered, read-only).
// Public-safe aggregates + already-public corrections. Graceful empty states.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import {
  Radio, FileCheck2, UserCheck, ShieldCheck, History, Database, ArrowRight, Layers,
  Gauge, Scale, BrainCircuit, Users, AlertCircle,
} from 'lucide-react';
import { colorForBucket } from '@/lib/public-intelligence-mapping';
import type {
  TrustOverviewData, TransparencyScore, PlatformHealthData, TrustCorrection, SourceAccountabilityData, TrustAuditItem,
} from '@/lib/trust-intelligence';
import type { PipelineStage } from '@/lib/operations-intelligence';

const n = (v: number) => v.toLocaleString('en-US');

export function TrustOverview({ data }: { data: TrustOverviewData }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard label="Published signals" value={n(data.publishedSignals)} accent="#3B82F6" icon={Radio} />
      <MetricCard label="Published reports" value={n(data.publishedReports)} accent="#8B5CF6" icon={FileCheck2} />
      <MetricCard label="Human reviewed" value={data.humanReviewedPct == null ? 'Not enough data yet' : `${data.humanReviewedPct}%`} accent="#F59E0B" icon={UserCheck} />
      <MetricCard label="Traceability" value={`${data.traceabilityPct.toFixed(1)}%`} accent="#10B981" icon={ShieldCheck} />
      <MetricCard label="Corrections issued" value={n(data.correctionsIssued)} accent="#06B6D4" icon={History} />
      <MetricCard label="Sources active" value={n(data.sourcesActive)} accent="#3B82F6" icon={Database} />
    </div>
  );
}

export function TransparencyScorecard({ scores }: { scores: TransparencyScore[] }) {
  return (
    <Card className="space-y-4">
      <h3 className="text-h6 font-semibold text-text-primary">Transparency scorecard</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {scores.map((s) => (
          <div key={s.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-caption">
              <span className="font-medium text-text-secondary">{s.label}</span>
              {s.pct == null ? (
                <span className="text-[11px] font-medium text-text-muted">Not enough data yet</span>
              ) : (
                <span className="font-bold tabular-nums text-text-primary">{s.pct}%</span>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-verified" style={{ width: `${s.pct ?? 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ReviewPipeline({ stages }: { stages: PipelineStage[] }) {
  const labels: Record<string, string> = { Review: 'Human Review' };
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <Card className="space-y-4">
      <h3 className="text-h6 font-semibold text-text-primary">Review pipeline</h3>
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {stages.map((s, i) => (
          <div key={s.stage} className="flex items-center gap-1">
            <div className="flex w-24 shrink-0 flex-col items-center gap-1 rounded-card border border-border bg-background-deep/40 px-2 py-3">
              <span className="text-h5 font-bold tabular-nums" style={{ color: s.color }}>{n(s.count)}</span>
              <span className="text-center text-[10px] font-medium uppercase tracking-wide text-text-muted">{labels[s.stage] ?? s.stage}</span>
              <span className="h-1 w-full overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full" style={{ width: `${Math.max(6, (s.count / max) * 100)}%`, backgroundColor: s.color }} /></span>
            </div>
            {i < stages.length - 1 ? <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" /> : null}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-text-muted">Every published finding clears each stage — nothing publishes without human review.</p>
    </Card>
  );
}

export function CorrectionsCenter({ corrections }: { corrections: TrustCorrection[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><History className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Corrections center</h3></div>
      {corrections.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-8 text-center text-caption text-text-muted">No corrections issued — the published record is clean. Any future correction will be logged here with its reason.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-caption">
            <thead className="text-[10px] uppercase tracking-wide text-text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Affected publication</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Resolution</th>
              </tr>
            </thead>
            <tbody>
              {corrections.map((c) => (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-text-muted">{c.date}</td>
                  <td className="py-2 pr-3 text-text-secondary">{c.type}</td>
                  <td className="py-2 pr-3 text-text-primary">{c.publication}</td>
                  <td className="py-2 pr-3"><span className="rounded-full bg-verified/10 px-2 py-0.5 text-[10px] font-semibold text-verified">{c.status}</span></td>
                  <td className="py-2 text-text-secondary">{c.resolution}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function SourceAccountability({ data }: { data: SourceAccountabilityData }) {
  const max = Math.max(1, ...data.coverage.map((c) => c.signals));
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Source accountability</h3></div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Sources" value={`${data.totalSources}`} color="#3B82F6" />
        <Stat label="Reliability avg" value={`${data.reliabilityAvg}%`} color="#10B981" />
        <Stat label="Validation rate" value={`${data.validationRate}%`} color="#F59E0B" />
      </div>
      {data.coverage.length === 0 ? (
        <p className="text-caption text-text-muted">No source coverage data yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {data.coverage.map((c) => (
            <li key={c.category} className="space-y-1">
              <div className="flex items-center justify-between text-caption">
                <span className="flex items-center gap-2 font-medium text-text-secondary"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForBucket(c.category) }} />{c.category}</span>
                <span className="text-text-muted">{c.sources} {c.sources === 1 ? 'source' : 'sources'}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.round((c.signals / max) * 100)}%`, backgroundColor: colorForBucket(c.category), opacity: 0.85 }} /></div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-text-muted">Source identities are never exposed — accountability is reported at the category level.</p>
    </Card>
  );
}

const FRAMEWORKS = [
  { icon: Scale, title: 'Risk scoring framework', body: 'Every signal is scored on a clear, ordered risk scale (Low → Critical) tied to its narrative category — explainable, never a black box.' },
  { icon: Users, title: 'Review framework', body: 'Findings move through evidence collection and analysis, then a human reviewer approves or rejects before anything publishes.' },
  { icon: Gauge, title: 'Confidence framework', body: 'Each published finding carries a confidence and traceability score so readers can weigh how strongly it is supported.' },
  { icon: BrainCircuit, title: 'Human oversight framework', body: 'No publication, correction, or enforcement is automated. A person decides, and the decision is recorded and reversible.' },
] as const;

export function DecisionExplainability() {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Decision explainability</h3></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FRAMEWORKS.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="rounded-card border border-border bg-background-deep/40 p-4">
              <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-electric/15 text-electric"><Icon className="h-4 w-4" /></span><h4 className="text-body-sm font-semibold text-text-primary">{f.title}</h4></div>
              <p className="mt-2 text-caption leading-relaxed text-text-secondary">{f.body}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function PlatformHealth({ data }: { data: PlatformHealthData }) {
  const cells = [
    { label: 'Signals reviewed today', value: n(data.signalsReviewedToday), color: '#F59E0B' },
    { label: 'Reports published today', value: n(data.reportsPublishedToday), color: '#10B981' },
    { label: 'Avg traceability', value: `${data.avgTraceability.toFixed(1)}%`, color: '#10B981' },
    { label: 'Review backlog', value: n(data.reviewBacklog), color: '#EF4444' },
    { label: 'Source activity', value: n(data.sourceActivity), color: '#3B82F6' },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cells.map((c) => (
        <Card key={c.label} className="space-y-1">
          <div className="text-h5 font-bold tabular-nums" style={{ color: c.color }}>{c.value}</div>
          <div className="text-caption text-text-muted">{c.label}</div>
        </Card>
      ))}
    </div>
  );
}

const AUDIT_COLOR: Record<string, string> = {
  'NEW SIGNAL': '#3B82F6',
  'EVIDENCE LINKED': '#10B981',
  'REVIEW COMPLETED': '#F59E0B',
  'REPORT PUBLISHED': '#8B5CF6',
  'SOURCE VERIFIED': '#06B6D4',
  'CORRECTION ISSUED': '#EF4444',
};

export function AuditTimeline({ items }: { items: TrustAuditItem[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Audit timeline</h3></div>
      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-8 text-center text-caption text-text-muted">No public audit events yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: AUDIT_COLOR[e.kind] ?? '#3B82F6' }} />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: AUDIT_COLOR[e.kind] ?? '#3B82F6' }}>{e.kind}</div>
                <div className="truncate text-caption text-text-secondary">{e.text}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center">
      <div className="text-h6 font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
    </div>
  );
}
