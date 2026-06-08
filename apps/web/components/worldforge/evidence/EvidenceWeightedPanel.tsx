import { Card } from '@hsi/ui';
import {
  Scale,
  TrendingDown,
  TrendingUp,
  Minus,
  FlaskConical,
} from 'lucide-react';
import { scoreColor } from '@/lib/worldforge/research-view';
import {
  asScore,
  type ExtendedCoverageSummary,
} from '@/lib/worldforge/evidence-intel-view';

export interface EvidenceWeightedPanelProps {
  coverage: ExtendedCoverageSummary;
  /** Run-level research confidence fallback when coverage.researchConfidence is absent. */
  researchConfidenceFallback?: number;
  className?: string;
}

/**
 * Surfaces the evidence-weighted confidence layer: Research vs Evidence vs
 * Evidence-Weighted confidence, plus the "why the score changed" explanation
 * list. Renders nothing (returns a gentle prompt) when evidence has not been
 * weighted yet. Server-safe (no hooks).
 */
export function EvidenceWeightedPanel({
  coverage,
  researchConfidenceFallback,
  className = '',
}: EvidenceWeightedPanelProps) {
  const weighted = coverage.evidenceWeightedConfidence;
  const hasWeighted = typeof weighted === 'number' && Number.isFinite(weighted);

  if (!hasWeighted) {
    return (
      <Card className={`space-y-2 ${className}`} padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Scale className="h-4 w-4 text-electric" /> Evidence-weighted confidence
        </h3>
        <p className="text-caption leading-relaxed text-text-muted">
          Run evidence to see evidence-weighted confidence. Once evidence is
          gathered, the consensus confidence is re-weighted by how many claims the
          evidence actually supports, contradicts, or leaves unsupported.
        </p>
      </Card>
    );
  }

  const research =
    typeof coverage.researchConfidence === 'number'
      ? coverage.researchConfidence
      : researchConfidenceFallback ?? null;
  const evidence =
    typeof coverage.evidenceConfidence === 'number'
      ? coverage.evidenceConfidence
      : null;
  const delta =
    typeof coverage.delta === 'number'
      ? coverage.delta
      : research !== null
        ? Math.round((weighted! - research) * 10) / 10
        : null;

  const DeltaIcon =
    delta === null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const deltaColor =
    delta === null || delta === 0 ? '#94A3B8' : delta > 0 ? '#10B981' : '#EF4444';

  const explanation = coverage.explanation ?? [];

  return (
    <Card className={`space-y-4 ${className}`} padded>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
          <Scale className="h-5 w-5 text-electric" /> Evidence-weighted confidence
        </h3>
        {delta !== null ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold"
            style={{
              backgroundColor: `${deltaColor}1f`,
              color: deltaColor,
              border: `1px solid ${deltaColor}55`,
            }}
          >
            <DeltaIcon className="h-3.5 w-3.5" />
            {delta > 0 ? '+' : ''}
            {delta} pts
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ConfidenceTile
          label="Research confidence"
          hint="Agent / consensus only"
          value={research}
        />
        <ConfidenceTile
          label="Evidence confidence"
          hint="From gathered evidence"
          value={evidence}
        />
        <ConfidenceTile
          label="Evidence-weighted"
          hint="Final blended score"
          value={weighted ?? null}
          emphasize
        />
      </div>

      {explanation.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-border bg-surface-2/40 p-3">
          <p className="flex items-center gap-2 text-label text-text-muted">
            <FlaskConical className="h-3.5 w-3.5" /> Why the score changed
          </p>
          <ul className="space-y-1.5">
            {explanation.map((line, i) => (
              <li
                key={i}
                className={
                  i === 0
                    ? 'text-body-sm font-semibold text-text-primary'
                    : 'text-caption leading-relaxed text-text-secondary'
                }
              >
                {i === 0 ? line : `• ${line}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function ConfidenceTile({
  label,
  hint,
  value,
  emphasize = false,
}: {
  label: string;
  hint: string;
  value: number | null;
  emphasize?: boolean;
}) {
  const has = typeof value === 'number' && Number.isFinite(value);
  const score = has ? asScore(value) : 0;
  const color = has ? scoreColor(score) : '#475569';
  return (
    <div
      className="space-y-2 rounded-lg border p-3"
      style={{
        borderColor: emphasize ? `${color}66` : 'rgba(148,163,184,0.2)',
        backgroundColor: emphasize ? `${color}12` : 'transparent',
      }}
    >
      <p className="text-label text-text-muted">{label}</p>
      <div className="flex items-end gap-2">
        <span className="text-h3 font-bold leading-none" style={{ color }}>
          {has ? score : '—'}
        </span>
        {has ? (
          <span className="pb-0.5 text-caption text-text-muted">/ 100</span>
        ) : null}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-[11px] text-text-muted">{hint}</p>
    </div>
  );
}
