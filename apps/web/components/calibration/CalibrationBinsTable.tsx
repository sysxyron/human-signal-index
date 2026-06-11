// =============================================================================
// HSI Phase 16 — CalibrationBinsTable. The per-bin confidence table behind the
// reliability diagram: confidence RANGE, observation COUNT, mean predicted
// confidence, observed success rate, and the calibration error per bin. Every
// number is shown — this is the auditable evidence under the diagram. Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { Table2 } from 'lucide-react';
import { formatErrorPct, formatRate, toneColor, type DiagramBin } from '@/lib/calibration/view';

function errColor(err: number): string {
  if (err <= 0.05) return toneColor('green');
  if (err <= 0.15) return toneColor('orange');
  return toneColor('red');
}

export function CalibrationBinsTable({
  bins,
  title = 'Confidence bins',
}: {
  bins: DiagramBin[];
  title?: string;
}) {
  const populated = bins.filter((b) => b.count > 0);

  return (
    <Card className="space-y-3" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <Table2 className="h-4 w-4 text-electric" /> {title}
      </h3>

      {populated.length === 0 ? (
        <p className="text-caption text-text-muted">No populated bins to show.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-caption">
            <thead>
              <tr className="border-b border-border text-left text-label text-text-muted">
                <th className="py-2 pr-3 font-medium">Confidence range</th>
                <th className="py-2 pr-3 font-medium text-right">Count</th>
                <th className="py-2 pr-3 font-medium text-right">Mean confidence</th>
                <th className="py-2 pr-3 font-medium text-right">Observed success</th>
                <th className="py-2 font-medium text-right">Calibration error</th>
              </tr>
            </thead>
            <tbody>
              {populated.map((b) => (
                <tr key={b.label} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-3 font-medium text-text-primary">{b.label}</td>
                  <td className="py-2 pr-3 text-right text-text-secondary">{b.count}</td>
                  <td className="py-2 pr-3 text-right text-text-secondary">
                    {formatRate(b.meanConfidence)}
                  </td>
                  <td className="py-2 pr-3 text-right text-text-secondary">
                    {formatRate(b.observedSuccess)}
                  </td>
                  <td className="py-2 text-right font-semibold" style={{ color: errColor(b.calibrationError) }}>
                    {formatErrorPct(b.calibrationError)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-caption text-text-muted">
        Calibration error = |mean confidence − observed success| per bin. Lower is
        better; 0% means that band succeeded exactly as often as it claimed.
      </p>
    </Card>
  );
}
