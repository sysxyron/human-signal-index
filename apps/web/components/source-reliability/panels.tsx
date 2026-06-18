// =============================================================================
// HSI Phase 61 — Source Reliability & Crawl Orchestration panels (server-only).
//
// Read-only observability surfaces over the cached source-reliability layer:
// status/type breakdowns, explainable per-source health, crawl schedule,
// retry/backoff visibility, block detection, collection analytics, dependency
// risks, and an executive summary. No interactivity, no writes — display only.
// =============================================================================

import { Card, MetricCard, Table } from '@hsi/ui';
import {
  Database, ShieldCheck, AlertTriangle, XOctagon, ShieldAlert, LogIn,
  CalendarClock, RefreshCw, Lock, Gauge, Network, ClipboardCheck,
} from 'lucide-react';
import type {
  SourceReliabilityData, ReliabilitySource, StatusBreakdown, TypeBreakdown,
  ScheduleRow, BlockRow, CollectionAnalytics, DependencyRisk, ReliabilityExec,
} from '@/lib/source-reliability';
import type { HealthStatus, ScoreTier } from '@/lib/source-reliability-classify';

const n = (v: number) => v.toLocaleString('en-US');

const STATUS_STYLE: Record<HealthStatus, string> = {
  HEALTHY: 'border-verified/40 bg-verified/10 text-verified',
  WARNING: 'border-warning/40 bg-warning/10 text-warning',
  FAILED: 'border-risk/40 bg-risk/10 text-risk',
};
function StatusBadge({ status }: { status: HealthStatus }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}>{status}</span>;
}

const TIER_STYLE: Record<ScoreTier, string> = {
  Excellent: 'text-verified',
  Healthy: 'text-electric',
  'At Risk': 'text-warning',
  Failing: 'text-risk',
};
function ScoreCell({ score, tier, explanation }: { score: number; tier: ScoreTier; explanation: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5" title={explanation}>
      <span className={`text-body-sm font-semibold tabular-nums ${TIER_STYLE[tier]}`}>{score}</span>
      <span className="text-[11px] text-text-muted">{tier}</span>
    </span>
  );
}

// ---- 1. Overview + type breakdown -----------------------------------------
export function ReliabilityOverview({ breakdown, byType }: { breakdown: StatusBreakdown; byType: TypeBreakdown[] }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Sources" value={n(breakdown.total)} accent="#3B82F6" icon={Database} />
        <MetricCard label="Active" value={n(breakdown.active)} accent="#6366F1" icon={Database} />
        <MetricCard label="Healthy" value={n(breakdown.healthy)} accent="#10B981" icon={ShieldCheck} />
        <MetricCard label="Warning" value={n(breakdown.warning)} accent="#F59E0B" icon={AlertTriangle} />
        <MetricCard label="Failed" value={n(breakdown.failed)} accent="#EF4444" icon={XOctagon} />
        <MetricCard label="Blocked" value={n(breakdown.blocked)} accent="#F97316" icon={ShieldAlert} />
        <MetricCard label="Login Required" value={n(breakdown.loginRequired)} accent="#A855F7" icon={LogIn} />
      </div>
      <Card className="space-y-4">
        <h3 className="text-h6 font-semibold text-text-primary">Sources by type</h3>
        {byType.length === 0 ? (
          <p className="text-caption text-text-muted">No source-type data yet.</p>
        ) : (
          <Table
            data={byType}
            rowKey={(r) => r.type}
            columns={[
              { key: 'type', header: 'Type', render: (r) => <span className="font-medium text-text-primary">{r.type}</span> },
              { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="tabular-nums">{n(r.total)}</span> },
              { key: 'healthy', header: 'Healthy', align: 'right', render: (r) => <span className="tabular-nums text-verified">{n(r.healthy)}</span> },
              { key: 'warning', header: 'Warning', align: 'right', render: (r) => <span className="tabular-nums text-warning">{n(r.warning)}</span> },
              { key: 'failed', header: 'Failed', align: 'right', render: (r) => <span className="tabular-nums text-risk">{n(r.failed)}</span> },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

// ---- 2 + 3. Per-source health + explainable score -------------------------
export function SourceHealthTable({ sources }: { sources: ReliabilitySource[] }) {
  const rows = [...sources].sort((a, b) => a.score - b.score); // worst first — triage view
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Source health &amp; score</h3>
      </div>
      <p className="text-caption text-text-muted">
        Score = success rate ×0.6 + parse success ×0.2 + recency ×0.2, minus a consecutive-failure penalty.
        Bands: 95–100 Excellent · 80–94 Healthy · 60–79 At Risk · &lt;60 Failing. Hover a score for its breakdown.
      </p>
      {rows.length === 0 ? (
        <p className="text-caption text-text-muted">No sources to report yet.</p>
      ) : (
        <Table
          data={rows}
          rowKey={(r) => r.id}
          columns={[
            { key: 'name', header: 'Source', render: (r) => <span className="font-medium text-text-primary">{r.name}</span> },
            { key: 'type', header: 'Type', render: (r) => <span className="text-text-muted">{r.type}</span> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'score', header: 'Score', render: (r) => <ScoreCell score={r.score} tier={r.tier} explanation={r.scoreExplanation} /> },
            { key: 'reason', header: 'Reason', render: (r) => <span className="text-caption" title={r.failureDetail}>{r.failureType}</span> },
            { key: 'success', header: 'Success', align: 'right', render: (r) => <span className="tabular-nums">{r.events > 0 ? `${r.successPct}%` : '—'}</span> },
            { key: 'last', header: 'Last success', align: 'right', render: (r) => <span className="text-caption text-text-muted">{r.lastSuccessLabel}</span> },
          ]}
        />
      )}
    </Card>
  );
}

// ---- 4. Crawl scheduler ----------------------------------------------------
export function CrawlScheduler({ schedule }: { schedule: ScheduleRow[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Crawl scheduler</h3>
      </div>
      <p className="text-caption text-text-muted">Capture cadence by source type (read-only policy). Scheduling is managed by the ingestion system.</p>
      {schedule.length === 0 ? (
        <p className="text-caption text-text-muted">No scheduled source types yet.</p>
      ) : (
        <Table
          data={schedule}
          rowKey={(r) => r.type}
          columns={[
            { key: 'type', header: 'Type', render: (r) => <span className="font-medium text-text-primary">{r.type}</span> },
            { key: 'interval', header: 'Interval', render: (r) => <span className="text-text-secondary">{r.interval}</span> },
            { key: 'sources', header: 'Sources', align: 'right', render: (r) => <span className="tabular-nums">{n(r.sources)}</span> },
            { key: 'last', header: 'Last fetch', align: 'right', render: (r) => <span className="text-caption text-text-muted">{r.lastFetchLabel}</span> },
            { key: 'next', header: 'Cadence', align: 'right', render: (r) => <span className="text-caption text-text-muted">{r.nextFetchLabel}</span> },
            { key: 'dur', header: 'Avg response', align: 'right', render: (r) => <span className="text-caption text-text-muted">{r.avgDurationLabel}</span> },
          ]}
        />
      )}
    </Card>
  );
}

// ---- 5. Retry & backoff visibility ----------------------------------------
export function RetryBackoff({ sources }: { sources: ReliabilitySource[] }) {
  const rows = sources.filter((s) => s.consecutiveFailures > 0).sort((a, b) => b.consecutiveFailures - a.consecutiveFailures);
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Retry &amp; backoff</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-caption text-text-muted">No sources are currently in a retry/backoff state.</p>
      ) : (
        <Table
          data={rows}
          rowKey={(r) => r.id}
          columns={[
            { key: 'name', header: 'Source', render: (r) => <span className="font-medium text-text-primary">{r.name}</span> },
            { key: 'count', header: 'Consecutive failures', align: 'right', render: (r) => <span className="tabular-nums text-risk">{r.consecutiveFailures}</span> },
            { key: 'stage', header: 'Backoff', render: (r) => <span className="text-caption text-text-secondary">{r.retryStage}</span> },
            { key: 'next', header: 'Next retry', render: (r) => <span className="text-caption text-text-muted">{r.nextRetry}</span> },
            { key: 'failure', header: 'Failure type', render: (r) => <span className="text-caption" title={r.failureDetail}>{r.failureType}</span> },
            { key: 'last', header: 'Last success', align: 'right', render: (r) => <span className="text-caption text-text-muted">{r.lastSuccessLabel}</span> },
          ]}
        />
      )}
    </Card>
  );
}

// ---- 6. Block detection ----------------------------------------------------
export function BlockDetection({ blocks }: { blocks: BlockRow[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Block detection</h3>
      </div>
      <p className="text-caption text-text-muted">Anti-bot protections observed in capture logs. HSI respects robots.txt and terms of service — protected sources are reported, never bypassed.</p>
      {blocks.length === 0 ? (
        <p className="text-caption text-text-muted">No anti-bot protection detected across active sources.</p>
      ) : (
        <Table
          data={blocks}
          rowKey={(r) => r.protection}
          columns={[
            { key: 'protection', header: 'Protection', render: (r) => <span className="font-medium text-text-primary">{r.protection}</span> },
            { key: 'affected', header: 'Affected sources', align: 'right', render: (r) => <span className="tabular-nums text-warning">{n(r.affected)}</span> },
            { key: 'first', header: 'First seen', align: 'right', render: (r) => <span className="text-caption text-text-muted">{r.firstSeenLabel}</span> },
            { key: 'last', header: 'Last seen', align: 'right', render: (r) => <span className="text-caption text-text-muted">{r.lastSeenLabel}</span> },
          ]}
        />
      )}
    </Card>
  );
}

// ---- 7. Collection analytics ----------------------------------------------
export function CollectionAnalyticsPanel({ analytics }: { analytics: CollectionAnalytics }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Fetches / day" value={n(analytics.fetchesPerDay)} accent="#3B82F6" icon={RefreshCw} />
      <MetricCard label="Success rate" value={`${analytics.successPct}%`} accent="#10B981" icon={ShieldCheck} />
      <MetricCard label="Failure rate" value={`${analytics.failurePct}%`} accent="#EF4444" icon={AlertTriangle} />
      <MetricCard label="Avg response" value={analytics.avgLatencyMs == null ? '—' : `${n(analytics.avgLatencyMs)} ms`} accent="#F59E0B" icon={Gauge} />
      <MetricCard label="Content volume" value={n(analytics.contentVolume)} accent="#6366F1" icon={Database} />
      <MetricCard label="Signals generated" value={n(analytics.newSignals)} accent="#8B5CF6" icon={Network} />
      <MetricCard label="Signals / source" value={n(analytics.signalsPerSource)} accent="#0EA5E9" icon={Network} />
    </div>
  );
}

// ---- 8. Dependency risks ---------------------------------------------------
export function DependencyRisks({ dependencies }: { dependencies: DependencyRisk[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Network className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Source dependency risks</h3>
      </div>
      {dependencies.length === 0 ? (
        <p className="text-caption text-text-muted">No single-point collection dependencies detected — coverage is well diversified.</p>
      ) : (
        <ul className="space-y-3">
          {dependencies.map((d) => (
            <li key={`${d.label}:${d.coverageImpact}`} className="rounded-card border border-border/70 bg-background-deep/30 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-body-sm font-semibold text-text-primary">{d.label}</span>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${d.severity === 'high' ? 'border-risk/40 bg-risk/10 text-risk' : 'border-warning/40 bg-warning/10 text-warning'}`}>
                  {d.severity === 'high' ? 'High' : 'Medium'}
                </span>
              </div>
              <p className="mt-1 text-caption text-text-secondary">{d.coverageImpact}</p>
              <p className="mt-1 text-caption text-text-muted">Suggested: {d.suggestion}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---- 9. Executive summary --------------------------------------------------
export function ExecutiveSummary({ summary }: { summary: ReliabilityExec }) {
  return (
    <Card className="space-y-5 border-electric/30">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Can we trust our collection network?</h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Healthy" value={`${summary.healthyPct}%`} tone="text-verified" />
        <Stat label="Failing" value={`${summary.failingPct}%`} tone="text-risk" />
        <Stat label="Blocked" value={`${summary.blockedPct}%`} tone="text-warning" />
        <Stat label="Coverage risk" value={summary.coverageRisk} tone="text-text-primary" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RankList title="Most reliable sources" rows={summary.mostReliable} tone="text-verified" />
        <RankList title="Most fragile sources" rows={summary.mostFragile} tone="text-risk" />
      </div>
      <div className="space-y-2">
        <h4 className="text-body-sm font-semibold text-text-primary">Recommended actions</h4>
        <ul className="space-y-1">
          {summary.recommendations.map((r) => (
            <li key={r} className="text-caption leading-relaxed text-text-secondary">• {r}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-card border border-border/70 bg-background-deep/30 p-4">
      <p className="text-label text-text-muted">{label}</p>
      <p className={`mt-1 text-h5 font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function RankList({ title, rows, tone }: { title: string; rows: { name: string; score: number }[]; tone: string }) {
  return (
    <div className="space-y-2">
      <h4 className="text-body-sm font-semibold text-text-primary">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-caption text-text-muted">Not enough data yet.</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.name} className="flex items-center gap-2 text-body-sm">
              <span className="w-4 shrink-0 text-caption font-semibold tabular-nums text-text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-text-secondary">{r.name}</span>
              <span className={`shrink-0 text-caption font-semibold tabular-nums ${tone}`}>{r.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function SourceReliabilitySurfaces({ data }: { data: SourceReliabilityData }) {
  return (
    <div className="space-y-8">
      <ExecutiveSummary summary={data.summary} />
      <ReliabilityOverview breakdown={data.breakdown} byType={data.byType} />
      <CollectionAnalyticsPanel analytics={data.analytics} />
      <SourceHealthTable sources={data.sources} />
      <div className="grid gap-6 xl:grid-cols-2">
        <CrawlScheduler schedule={data.schedule} />
        <RetryBackoff sources={data.sources} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <BlockDetection blocks={data.blocks} />
        <DependencyRisks dependencies={data.dependencies} />
      </div>
    </div>
  );
}
