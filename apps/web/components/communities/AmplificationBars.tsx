// =============================================================================
// HSI Phase 9 — AmplificationBars. Ranked narratives by 0..100 amplification with
// a colored bar, sourceCount / signalCount / velocity counters, a tone band, and
// the rationale. Server-safe. Low-amplification narratives are still shown.
// =============================================================================

import { Card } from '@hsi/ui';
import { TrendingUp, Radio, Inbox, Gauge } from 'lucide-react';
import type { AmplificationView } from '@hsi/shared-types';
import { amplificationColor, amplificationDecor } from '@/lib/operations/phase9-view';

export function AmplificationBars({ view }: { view: AmplificationView }) {
  const names = new Map(view.narratives.map((n) => [n.id, n.name]));
  const ranked = [...view.scores].sort((a, b) => (b.amplification ?? 0) - (a.amplification ?? 0));

  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <TrendingUp className="h-4 w-4 text-electric" /> Narrative amplification
        </h3>
        <span className="text-caption text-text-muted">{ranked.length} ranked</span>
      </div>
      {ranked.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          No amplification scores yet. Rebuild amplification once narratives carry signals.
        </p>
      ) : (
        <ul className="space-y-4">
          {ranked.map((s, i) => {
            const amp = s.amplification ?? 0;
            const color = amplificationColor(s.amplification);
            const decor = amplificationDecor(s.amplification);
            const name = names.get(s.narrative_id) ?? s.narrative_id;
            return (
              <li key={s.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-body-sm font-semibold text-text-primary">
                    <span className="text-text-muted">#{i + 1}</span>
                    <span className="truncate" title={name}>{name}</span>
                  </span>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <span
                      className="rounded-full px-2 py-0.5 text-caption font-semibold"
                      style={{ backgroundColor: `${color}1f`, color, border: `1px solid ${color}55` }}
                    >
                      {decor.label}
                    </span>
                    <span className="font-mono text-h6 font-bold" style={{ color }}>
                      {Math.round(amp)}
                    </span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(0, Math.min(100, amp))}%`, backgroundColor: color }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Radio className="h-3.5 w-3.5" /> {s.source_count ?? 0} sources
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Inbox className="h-3.5 w-3.5" /> {s.signal_count ?? 0} signals
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Gauge className="h-3.5 w-3.5" /> velocity {s.velocity ?? 0}
                  </span>
                </div>
                {s.rationale ? (
                  <p className="text-[11px] leading-relaxed text-text-secondary">{s.rationale}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
