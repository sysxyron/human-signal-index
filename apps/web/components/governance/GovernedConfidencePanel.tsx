import { Card } from '@hsi/ui';
import { Gauge, ShieldCheck, AlertTriangle, BarChart3 } from 'lucide-react';
import { ConfidenceScore } from '@/components/worldforge/research/ConfidenceScore';
import { readEntitySummary, fmtPercent } from '@/lib/governance/view';

/**
 * Surfaces a research entity's evidence-governance signals side-by-side:
 * raw consensus confidence vs. governed (evidence-weighted) confidence, plus
 * evidence coverage, agreement, and the contradiction count. Following HSI's
 * "no black-box conclusions" principle, contradictions are always shown — never
 * collapsed away — even when zero.
 */
export function GovernedConfidencePanel({
  entitySummary,
  className = '',
}: {
  entitySummary?: Record<string, unknown> | null;
  className?: string;
}) {
  const view = readEntitySummary(entitySummary);
  const hasGoverned = view.governedConfidence !== undefined;
  const hasConsensus = view.consensusConfidence !== undefined;
  const drop =
    hasGoverned && hasConsensus
      ? Math.round(view.consensusConfidence! - view.governedConfidence!)
      : null;

  return (
    <Card className={`space-y-4 ${className}`} padded>
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Governed confidence</h3>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        {hasConsensus ? (
          <ConfidenceScore
            score={view.consensusConfidence!}
            label="Consensus"
            variant="ring"
            size={64}
          />
        ) : null}
        {hasGoverned ? (
          <ConfidenceScore
            score={view.governedConfidence!}
            label="Governed"
            variant="ring"
            size={64}
          />
        ) : null}
        {!hasGoverned && !hasConsensus ? (
          <p className="text-caption text-text-muted">
            No confidence signals recorded for this entity yet.
          </p>
        ) : null}
      </div>

      {drop !== null ? (
        <p
          className={`flex items-center gap-2 text-caption ${
            drop > 0 ? 'text-warning' : 'text-verified'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {drop > 0
            ? `Evidence weighting lowered confidence by ${drop} points — claims lack full support.`
            : drop < 0
              ? `Evidence weighting raised confidence by ${Math.abs(drop)} points.`
              : 'Evidence weighting left confidence unchanged.'}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon={<BarChart3 className="h-3.5 w-3.5" />}
          label="Evidence coverage"
          value={view.coverageScore !== undefined ? fmtPercent(view.coverageScore) : '—'}
        />
        <Stat
          icon={<BarChart3 className="h-3.5 w-3.5" />}
          label="Agreement"
          value={view.agreementScore !== undefined ? fmtPercent(view.agreementScore) : '—'}
        />
        <Stat
          icon={<BarChart3 className="h-3.5 w-3.5" />}
          label="Support ratio"
          value={view.supportRatio !== undefined ? fmtPercent(view.supportRatio) : '—'}
        />
        <Stat
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Contradictions"
          value={view.contradictionCount !== undefined ? String(view.contradictionCount) : '0'}
          tone={view.contradictionCount && view.contradictionCount > 0 ? 'warn' : 'muted'}
        />
      </div>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  tone = 'muted',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'muted' | 'warn';
}) {
  return (
    <div className="rounded-card border border-border bg-surface-2/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-text-muted">
        {icon}
        {label}
      </div>
      <div
        className={`mt-1 text-h6 font-semibold ${
          tone === 'warn' ? 'text-warning' : 'text-text-primary'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
