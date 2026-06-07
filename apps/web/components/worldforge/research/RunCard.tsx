'use client';

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { ArrowRight, CheckCircle2, Clock, Orbit, Loader2 } from 'lucide-react';
import {
  conceptSnippet,
  fmtDate,
  fmtScore,
  type ResearchRunRecord,
} from '@/lib/worldforge/research-view';
import { ConfidenceScore } from './ConfidenceScore';

export interface RunCardProps {
  run: ResearchRunRecord;
  /** Override the link target (used for the demo card). */
  href?: string;
  /** Mark this card as the labeled demo. */
  demo?: boolean;
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

/** Grid card summarising a single research run. */
export function RunCard({ run, href, demo = false }: RunCardProps) {
  const target = href ?? `/dashboard/worldforge/research/${run.id}`;
  return (
    <Link href={target as never}>
      <Card className="group flex h-full flex-col gap-3" interactive padded>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={run.status} />
              {demo ? (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
                  Demo
                </span>
              ) : null}
              {run.world_id ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-verified/15 px-2 py-0.5 text-[11px] font-semibold text-verified">
                  <Orbit className="h-3 w-3" /> World generated
                </span>
              ) : null}
            </div>
            <h4 className="truncate text-h6 font-semibold text-text-primary">
              {run.title?.trim() || 'Untitled research run'}
            </h4>
          </div>
          <ConfidenceScore score={run.overall_confidence ?? 0} size={50} />
        </div>

        <p className="line-clamp-3 text-caption leading-relaxed text-text-secondary">
          {conceptSnippet(run.concept_text)}
        </p>

        <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3 text-caption text-text-muted">
          <span>Agreement {fmtScore(run.agreement_score)}</span>
          <span>{fmtDate(run.created_at)}</span>
          <span className="inline-flex items-center gap-1 font-semibold text-electric">
            Open
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </span>
        </div>
      </Card>
    </Link>
  );
}
