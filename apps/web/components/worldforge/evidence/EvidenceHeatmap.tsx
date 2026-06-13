import { Card } from '@hsi/ui';
import { Grid3x3 } from 'lucide-react';
import { COVERAGE_STYLES } from '@/lib/worldforge/evidence-view';
import type { EvidenceIntelligence } from '@/lib/worldforge/evidence-intel-view';

export interface EvidenceHeatmapProps {
  intel: EvidenceIntelligence;
  className?: string;
}

const CATEGORIES = [
  { key: 'supported', label: 'Supported', total: 'totalSupported' as const },
  { key: 'contradicted', label: 'Contradicted', total: 'totalContradicted' as const },
  { key: 'background', label: 'Background', total: 'totalBackground' as const },
  { key: 'unsupported', label: 'Unsupported', total: 'totalUnsupported' as const },
] as const;

/**
 * Evidence intensity heatmap. Renders a single normalized intensity row across
 * the four claim-coverage categories (supported/contradicted/background/
 * unsupported) so disagreement (contradicted) and gaps (unsupported) are ALWAYS
 * visible — no hiding disagreement. Server-safe. A custom grid (not HeatmapCard)
 * so each cell keeps its category color rather than a single hue.
 */
export function EvidenceHeatmap({ intel, className = '' }: EvidenceHeatmapProps) {
  const totals = CATEGORIES.map((c) => intel[c.total] ?? 0);
  const max = Math.max(...totals, 1);
  const grandTotal = totals.reduce((a, b) => a + b, 0);

  return (
    <Card className={`space-y-4 ${className}`} padded>
      <div>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Grid3x3 className="h-4 w-4 text-electric" /> Evidence outcome heatmap
        </h3>
        <p className="mt-0.5 text-caption text-text-muted">
          Claim outcomes across every run. Disagreement and gaps are surfaced, not
          hidden.
        </p>
      </div>

      {grandTotal === 0 ? (
        <p className="text-caption text-text-muted">
          No claim-level evidence outcomes recorded yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORIES.map((c, i) => {
            const style =
              COVERAGE_STYLES[c.key as keyof typeof COVERAGE_STYLES];
            const value = totals[i];
            const intensity = value / max;
            const pct = grandTotal > 0 ? Math.round((value / grandTotal) * 100) : 0;
            return (
              <div
                key={c.key}
                className="space-y-2 rounded-lg border p-3"
                style={{ borderColor: style.border }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: style.color }}
                  >
                    {c.label}
                  </span>
                  <span className="text-[11px] text-text-muted">{pct}%</span>
                </div>
                <div className="text-h4 font-bold" style={{ color: style.color }}>
                  {value}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full"
                    style={{
                      // Round so the serialized style is identical on server +
                      // client (avoids 1-ULP float hydration mismatches).
                      width: `${Math.round(Math.max(4, intensity * 100))}%`,
                      backgroundColor: style.color,
                      opacity: Number((0.4 + intensity * 0.6).toFixed(3)),
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SourceTypeBreakdown breakdown={intel.sourceTypeBreakdown} />
    </Card>
  );
}

function SourceTypeBreakdown({
  breakdown,
}: {
  breakdown: Record<string, number>;
}) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-label text-text-muted">Source types</p>
      <div className="space-y-1.5">
        {entries.map(([type, count]) => (
          <div key={type} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-[11px] text-text-secondary">
              {type}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-electric"
                style={{ width: `${Math.max(4, (count / max) * 100)}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-[11px] font-semibold text-text-primary">
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
