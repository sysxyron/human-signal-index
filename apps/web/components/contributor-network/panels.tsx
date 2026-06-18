// =============================================================================
// HSI Phase 54 — Contributor Network & Reputation panels (server-rendered,
// read-only). Aggregate contribution intelligence — not social, no identities.
// Explainable reputation/quality model (no black box). Graceful empty states.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import {
  Users, UserCheck, UserPlus, Microscope, ShieldCheck, Crown, Radio, FileCheck2, Gauge, Layers, Network, Award,
} from 'lucide-react';
import { colorForBucket } from '@/lib/public-intelligence-mapping';
import type {
  ContributorOverview, ContributionHealth, ContributorQuality, CategoryCoverage, ReputationTier,
  NetworkHealth, ContributorSummary, ScoreExplained,
} from '@/lib/contributor-network';

const n = (v: number) => v.toLocaleString('en-US');
const TONE: Record<string, string> = { green: '#10B981', amber: '#F59E0B', red: '#EF4444' };
const SCORE_COLOR: Record<string, string> = { High: '#10B981', Moderate: '#F59E0B', Low: '#94A3B8' };

function ScoreBadge({ score }: { score: ScoreExplained }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${SCORE_COLOR[score.label]}1f`, color: SCORE_COLOR[score.label] }} title={score.reason}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SCORE_COLOR[score.label] }} />{score.label}
    </span>
  );
}

export function ContributorExecutiveSummary({ summary, role }: { summary: ContributorSummary; role: string | null }) {
  const dot = TONE[summary.tone];
  const items = [
    { label: 'Contributor growth', value: summary.growth },
    { label: 'Contributor quality', value: summary.quality },
    { label: 'Coverage risk', value: summary.coverageRisk },
    { label: 'Reviewer pressure', value: summary.reviewerPressure },
    { label: 'Network outlook', value: summary.outlook },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Gauge className="h-4 w-4 text-electric" /><h2 className="text-h6 font-semibold text-text-primary">Executive summary</h2>
        {role ? <span className="rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{role} view</span> : null}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold" style={{ backgroundColor: `${dot}1f`, color: dot }}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />{summary.outlook}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => (
          <div key={it.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{it.label}</div>
            <div className="mt-0.5 truncate text-body-sm font-semibold text-text-primary" title={it.value}>{it.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ContributorOverviewPanel({ overview }: { overview: ContributorOverview }) {
  if (!overview.available) {
    return (
      <Card className="space-y-2">
        <div className="flex items-center gap-2"><Users className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Contributor overview</h3></div>
        <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-6 text-center text-caption text-text-muted">Aggregate contributor counts are shown to administrators (counts only, no identities).</p>
      </Card>
    );
  }
  const max = Math.max(1, ...overview.roleDistribution.map((r) => r.count));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active contributors" value={n(overview.active)} accent="#10B981" icon={UserCheck} />
        <MetricCard label="New (7d)" value={n(overview.newRecent)} accent="#F59E0B" icon={UserPlus} />
        <MetricCard label="Researchers" value={n(overview.researchers)} accent="#8B5CF6" icon={Microscope} />
        <MetricCard label="Reviewers" value={n(overview.reviewers)} accent="#06B6D4" icon={ShieldCheck} />
        <MetricCard label="Contributors" value={n(overview.contributors)} accent="#3B82F6" icon={Users} />
        <MetricCard label="Admins" value={n(overview.admins)} accent="#EF4444" icon={Crown} />
      </div>
      <Card className="space-y-3">
        <h3 className="text-h6 font-semibold text-text-primary">Role distribution</h3>
        {overview.roleDistribution.length === 0 ? <p className="text-caption text-text-muted">No role assignments yet.</p> : (
          <ul className="space-y-2">
            {overview.roleDistribution.map((r) => (
              <li key={r.role} className="space-y-1">
                <div className="flex items-center justify-between text-caption"><span className="font-medium text-text-secondary">{r.role}</span><span className="font-semibold tabular-nums text-text-primary">{n(r.count)}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-electric" style={{ width: `${Math.round((r.count / max) * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function ContributionHealthPanel({ health }: { health: ContributionHealth }) {
  const cells = [
    { label: 'Signals submitted', value: n(health.signalsSubmitted), color: '#3B82F6', icon: Radio },
    { label: 'Evidence added', value: n(health.evidenceAdded), color: '#10B981', icon: Layers },
    { label: 'Reviews (today)', value: n(health.reviewsCompleted), color: '#F59E0B', icon: ShieldCheck },
    { label: 'Reports published', value: n(health.reportsPublished), color: '#8B5CF6', icon: FileCheck2 },
    { label: 'Approval rate', value: health.approvalRate == null ? '—' : `${health.approvalRate}%`, color: '#10B981', icon: UserCheck },
    { label: 'Rejection rate', value: health.rejectionRate == null ? '—' : `${health.rejectionRate}%`, color: '#EF4444', icon: Users },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Radio className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Contribution health</h3></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cells.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
              <div className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" style={{ color: c.color }} /><span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{c.label}</span></div>
              <div className="mt-0.5 text-h6 font-bold tabular-nums text-text-primary">{c.value}</div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-text-muted">Approval / rejection rates reflect recent (today's) review decisions.</p>
    </Card>
  );
}

export function ContributorQualityPanel({ quality }: { quality: ContributorQuality }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Award className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Contributor quality</h3></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Cell label="Traceability avg" value={`${quality.traceabilityAvg.toFixed(1)}%`} />
        <Cell label="Publication success" value={`${quality.publicationSuccessRate}%`} />
        <Cell label="Review outcome quality" value={quality.reviewOutcomeQuality == null ? '—' : `${quality.reviewOutcomeQuality}%`} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between rounded-card border border-border bg-background-deep/40 px-3 py-2"><span className="text-caption text-text-secondary">Consistency</span><ScoreBadge score={quality.consistency} /></div>
        <div className="flex items-center justify-between rounded-card border border-border bg-background-deep/40 px-3 py-2"><span className="text-caption text-text-secondary">Confidence</span><ScoreBadge score={quality.confidence} /></div>
      </div>
      <p className="text-[11px] text-text-muted">Every score is explainable — consistency and confidence derive from observed multi-period sample size and continuity (hover for the reason). No black-box scoring.</p>
    </Card>
  );
}

export function CategoryCoveragePanel({ coverage }: { coverage: CategoryCoverage[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Category coverage</h3></div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-caption">
          <thead className="text-[10px] uppercase tracking-wide text-text-muted"><tr className="border-b border-border"><th className="py-2 pr-3 font-medium">Category</th><th className="py-2 pr-3 font-medium">Contributors</th><th className="py-2 pr-3 font-medium">Signals</th><th className="py-2 pr-3 font-medium">Publications</th><th className="py-2 font-medium">Status</th></tr></thead>
          <tbody>
            {coverage.map((c) => (
              <tr key={c.category} className="border-b border-border/50">
                <td className="py-2 pr-3"><span className="flex items-center gap-2 text-text-primary"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForBucket(c.category) }} />{c.category}</span></td>
                <td className="py-2 pr-3 tabular-nums text-text-secondary">{n(c.contributors)}</td>
                <td className="py-2 pr-3 tabular-nums text-text-secondary">{n(c.signals)}</td>
                <td className="py-2 pr-3 tabular-nums text-text-secondary">{n(c.publications)}</td>
                <td className="py-2">{c.gap ? <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">Gap</span> : <span className="rounded-full bg-verified/10 px-2 py-0.5 text-[10px] font-semibold text-verified">Covered</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function ReputationModelPanel({ model }: { model: ReputationTier[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Award className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Reputation model</h3></div>
      <p className="text-caption text-text-muted">A transparent, criteria-based model — every level is explained. Inputs: approved contributions, traceability, publication outcomes, consistency, and activity continuity. No hidden scoring. Per-contributor standing appears in the reliability board below.</p>
      <ul className="space-y-2">
        {model.map((t) => (
          <li key={t.tier} className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
            <div className="text-body-sm font-semibold text-text-primary">{t.tier}</div>
            <div className="text-caption text-text-muted">{t.criteria}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function NetworkHealthPanel({ health }: { health: NetworkHealth }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Network className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Network health</h3></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Cell label="Coverage strength" value={`${health.coverageStrength.covered}/${health.coverageStrength.total} (${health.coverageStrength.pct}%)`} />
        <Cell label="Reviewer capacity" value={health.reviewerCapacity} />
        <Cell label="Research capacity" value={health.researchCapacity} />
        <Cell label="Growth rate" value={health.growthRate} />
        <Cell label="Retention" value={health.retention} />
      </div>
      <div>
        <h4 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted">Single-point dependency risks</h4>
        {health.dependencyRisks.length === 0 ? <p className="text-caption text-verified">No single-point dependencies detected.</p> : (
          <div className="flex flex-wrap gap-1.5">{health.dependencyRisks.map((r) => <span key={r} className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] text-warning">{r}</span>)}</div>
        )}
      </div>
    </Card>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2"><div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div><div className="mt-0.5 truncate text-body-sm font-semibold text-text-primary" title={value}>{value}</div></div>;
}
