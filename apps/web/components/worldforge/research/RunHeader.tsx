'use client';

import { Card } from '@hsi/ui';
import { CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { fmtDate, type ResearchRunView } from '@/lib/worldforge/research-view';
import { ConfidenceScore } from './ConfidenceScore';

export interface RunHeaderProps {
  view: ResearchRunView;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: typeof Clock }> = {
    complete: { color: '#10B981', icon: CheckCircle2 },
    running: { color: '#3B82F6', icon: Loader2 },
    pending: { color: '#F59E0B', icon: Clock },
    failed: { color: '#EF4444', icon: Clock },
  };
  const s = map[status] ?? { color: '#94A3B8', icon: Clock };
  const Icon = s.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize"
      style={{ backgroundColor: `${s.color}1f`, color: s.color }}
    >
      <Icon className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {status}
    </span>
  );
}

/** Run header: title, concept, status, and confidence/agreement scores. */
export function RunHeader({ view }: RunHeaderProps) {
  return (
    <Card className="space-y-4" padded>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={view.status} />
            {view.isDemo ? (
              <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent">
                Demo
              </span>
            ) : null}
            {view.createdAt ? (
              <span className="text-caption text-text-muted">
                {fmtDate(view.createdAt)}
              </span>
            ) : null}
          </div>
          <h2 className="text-h4 font-semibold text-text-primary">
            {view.title}
          </h2>
          <p className="max-w-3xl text-body-sm leading-relaxed text-text-secondary">
            {view.conceptText}
          </p>
        </div>
        <div className="flex shrink-0 gap-4">
          <ConfidenceScore
            score={view.overallConfidence}
            label="Confidence"
            size={64}
          />
          <ConfidenceScore
            score={view.agreementScore}
            label="Agreement"
            size={64}
          />
        </div>
      </div>
    </Card>
  );
}
