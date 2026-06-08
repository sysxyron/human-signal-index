// =============================================================================
// HSI Phase 9 — FusionDraftCard. Renders a WorldForge fusion draft assembled from
// a signal: the rationale (why this prompt), the linked signal/narrative, and the
// editable title + prompt approval form. Server-safe shell; the form is a nested
// client component.
// =============================================================================

import { Card } from '@hsi/ui';
import { Sparkles, ListChecks } from 'lucide-react';
import type { WorldforgeFusionDraft } from '@hsi/shared-types';
import { FusionApprovalForm } from './FusionApprovalForm';

export function FusionDraftCard({
  draft,
  linkId,
  canApprove,
  demo = false,
}: {
  draft: WorldforgeFusionDraft;
  linkId?: string;
  canApprove: boolean;
  demo?: boolean;
}) {
  return (
    <Card className="space-y-5" padded>
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Sparkles className="h-4 w-4 text-electric" /> Fusion draft
        </h3>
        <p className="text-caption text-text-muted">
          A neutral research prompt drafted from the signal. Edit it, then approve to spawn a
          WorldForge research run.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-caption">
        {draft.signalId ? (
          <span className="rounded-full border border-border bg-surface-2/50 px-2.5 py-1 font-mono text-text-secondary">
            signal {draft.signalId.slice(0, 12)}…
          </span>
        ) : null}
        {draft.narrativeId ? (
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-accent">
            narrative {draft.narrativeId.slice(0, 12)}…
          </span>
        ) : null}
      </div>

      {draft.rationale.length > 0 ? (
        <div className="space-y-2 rounded-card border border-border bg-surface-2/40 p-3">
          <p className="flex items-center gap-1.5 text-label text-text-muted">
            <ListChecks className="h-3.5 w-3.5" /> Why this prompt
          </p>
          <ul className="space-y-1">
            {draft.rationale.map((r, i) => (
              <li key={i} className="text-caption leading-relaxed text-text-secondary">
                • {r}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <FusionApprovalForm draft={draft} linkId={linkId} canApprove={canApprove} demo={demo} />
    </Card>
  );
}
