// =============================================================================
// HSI Phase 7 — SignalProvenancePanel. The full provenance chain for a signal,
// shown honestly end-to-end: Source → Capture Time → Capture Job →
// Classification → Review History → Research Links → Publication Links.
// Server-safe. Missing steps are shown as "not recorded" rather than hidden.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import {
  Database,
  Clock,
  Cog,
  ScanText,
  Gavel,
  FlaskConical,
  FileBarChart,
  ArrowRight,
} from 'lucide-react';
import { type ComponentType, type ReactNode } from 'react';
import type {
  HsinCaptureJobRecord,
  HsinSignalRecord,
  HsinSignalReviewRecord,
  HsinSourceRecord,
} from '@hsi/shared-types';
import type { LucideProps } from 'lucide-react';
import {
  confidencePct,
  formatDateTime,
  signalCategoryDecor,
  sourceTypeLabel,
  titleize,
} from '@/lib/signals/view';

interface ProvStep {
  icon: ComponentType<LucideProps>;
  label: string;
  body: ReactNode;
  recorded: boolean;
}

export function SignalProvenancePanel({
  signal,
  source,
  captureJob,
  reviews,
  researchRunIds,
  publicationIds = [],
  demo = false,
}: {
  signal: HsinSignalRecord;
  source?: HsinSourceRecord;
  captureJob?: HsinCaptureJobRecord;
  reviews?: HsinSignalReviewRecord[];
  researchRunIds: string[];
  publicationIds?: string[];
  demo?: boolean;
}) {
  const cat = signalCategoryDecor(signal.signal_category);
  const reviewList = reviews ?? [];

  const steps: ProvStep[] = [
    {
      icon: Database,
      label: 'Source',
      recorded: Boolean(source),
      body: source ? (
        <Link
          href={`/dashboard/sources/${source.id}${demo ? '?demo=1' : ''}` as never}
          className="font-semibold text-text-primary hover:text-electric"
        >
          {source.name}{' '}
          <span className="text-caption text-text-muted">
            ({sourceTypeLabel(source.source_type)})
          </span>
        </Link>
      ) : (
        'Manual submission / source not recorded.'
      ),
    },
    {
      icon: Clock,
      label: 'Capture time',
      recorded: Boolean(signal.captured_at),
      body: formatDateTime(signal.captured_at ?? signal.created_at),
    },
    {
      icon: Cog,
      label: 'Capture job',
      recorded: Boolean(captureJob),
      body: captureJob
        ? `Job ${captureJob.id.slice(0, 8)} — ${captureJob.status}${
            captureJob.finished_at
              ? ` at ${formatDateTime(captureJob.finished_at)}`
              : ''
          }${captureJob.error_message ? ` (${captureJob.error_message})` : ''}`
        : 'No capture job linked (manual or pre-pipeline import).',
    },
    {
      icon: ScanText,
      label: 'Classification',
      recorded: Boolean(signal.signal_category || signal.confidence != null),
      body: (
        <span>
          {cat.label}
          {signal.signal_type ? ` · ${titleize(String(signal.signal_type))}` : ''}{' '}
          <span className="text-text-muted">
            (confidence {confidencePct(signal.confidence)})
          </span>
        </span>
      ),
    },
    {
      icon: Gavel,
      label: 'Review history',
      recorded: reviewList.length > 0,
      body:
        reviewList.length > 0 ? (
          <ul className="space-y-1">
            {reviewList.map((r) => (
              <li key={r.id} className="text-caption text-text-secondary">
                <span className="font-semibold text-text-primary">
                  {r.decision ?? 'noted'}
                </span>{' '}
                — {formatDateTime(r.created_at)}
                {r.notes ? `: ${r.notes}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          'Not yet reviewed.'
        ),
    },
    {
      icon: FlaskConical,
      label: 'Research links',
      recorded: researchRunIds.length > 0,
      body:
        researchRunIds.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {researchRunIds.map((id) => (
              <Link
                key={id}
                href={`/dashboard/worldforge/research/${id}` as never}
                className="inline-flex items-center gap-1 rounded-full border border-electric/40 bg-electric/5 px-2 py-0.5 text-caption font-semibold text-electric hover:text-white"
              >
                Run {id.slice(0, 8)} <ArrowRight className="h-3 w-3" />
              </Link>
            ))}
          </div>
        ) : (
          'No research runs created from this signal yet.'
        ),
    },
    {
      icon: FileBarChart,
      label: 'Publication links',
      recorded: publicationIds.length > 0,
      body:
        publicationIds.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {publicationIds.map((id) => (
              <span
                key={id}
                className="rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-caption text-text-secondary"
              >
                {id.slice(0, 8)}
              </span>
            ))}
          </div>
        ) : (
          'No publications generated from this signal yet.'
        ),
    },
  ];

  return (
    <Card className="space-y-4" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <ScanText className="h-4 w-4 text-electric" /> Provenance
      </h3>
      <ol className="relative space-y-4 border-l border-border pl-6">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.label} className="relative">
              <span
                className="absolute -left-[31px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface ring-4 ring-surface"
                aria-hidden
              >
                <Icon
                  className={
                    s.recorded ? 'h-3.5 w-3.5 text-electric' : 'h-3.5 w-3.5 text-text-muted'
                  }
                />
              </span>
              <p className="text-label text-text-muted">{s.label}</p>
              <div className="mt-0.5 text-body-sm text-text-secondary">{s.body}</div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
