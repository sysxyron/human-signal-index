// =============================================================================
// HSI Phase 58.1 (FIX 4) — read-only guidance banner. Explains, on the read-only
// intelligence workspaces, what the user can do here, why the surface is
// view-only, and where to go to submit / review / publish (with role notes).
// Presentational only — adds NO write actions and bypasses NO role gate.
// =============================================================================

import { Card } from '@hsi/ui';
import { Info, ArrowUpRight } from 'lucide-react';

export function ReadOnlyNotice({
  title,
  points,
  actions = [],
}: {
  title: string;
  points: string[];
  actions?: { label: string; href: string }[];
}) {
  return (
    <Card className="flex items-start gap-3 border-border bg-surface/50" padded>
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
      <div className="min-w-0 space-y-2">
        <h3 className="text-body-sm font-semibold text-text-primary">{title}</h3>
        <ul className="space-y-1">
          {points.map((p) => (
            <li key={p} className="text-caption leading-relaxed text-text-secondary">• {p}</li>
          ))}
        </ul>
        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {actions.map((a) => (
              <a
                key={a.href}
                href={a.href}
                className="inline-flex items-center gap-1 rounded-btn border border-border bg-surface-2/60 px-3 py-1.5 text-caption font-semibold text-electric transition hover:border-electric hover:text-white"
              >
                {a.label} <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
