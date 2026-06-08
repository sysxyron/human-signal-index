'use client';

import { Card } from '@hsi/ui';
import {
  ExternalLink,
  CheckCircle2,
  XCircle,
  Link2,
  Beaker,
} from 'lucide-react';
import {
  fmtAuthors,
  publicationLabel,
  reliabilityTierStyle,
} from '@/lib/worldforge/evidence-view';
import type { EvidenceReviewQueueItem } from '@/lib/worldforge/evidence-intel-view';
import { EvidenceReviewControls } from './EvidenceReviewControls';

export interface EvidenceReviewQueueTableProps {
  items: EvidenceReviewQueueItem[];
  /** Whether the viewer may take reviewer actions. */
  canReview: boolean;
  /** Whether the viewer is signed in at all. */
  isAuthenticated: boolean;
  className?: string;
}

/**
 * Card list of evidence sources needing review. Each row shows the source title,
 * provider, publication type, reliability, linked-run count, and support /
 * contradiction counts (disagreement is always visible), plus the per-row
 * reviewer controls. Client component (rows are interactive).
 */
export function EvidenceReviewQueueTable({
  items,
  canReview,
  isAuthenticated,
  className = '',
}: EvidenceReviewQueueTableProps) {
  if (items.length === 0) {
    return (
      <Card className={`space-y-1.5 ${className}`} padded>
        <p className="text-body-sm text-text-secondary">
          The review queue is empty.
        </p>
        <p className="text-caption text-text-muted">
          Sources appear here once evidence has been gathered for a research run.
        </p>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {items.map((item) => (
        <QueueRow
          key={item.source.id}
          item={item}
          canReview={canReview}
          isAuthenticated={isAuthenticated}
        />
      ))}
    </div>
  );
}

function QueueRow({
  item,
  canReview,
  isAuthenticated,
}: {
  item: EvidenceReviewQueueItem;
  canReview: boolean;
  isAuthenticated: boolean;
}) {
  const { source } = item;
  const rel = reliabilityTierStyle(source.reliability_score);
  const link =
    (source.doi && `https://doi.org/${source.doi}`) ||
    (source.arxiv_id && `https://arxiv.org/abs/${source.arxiv_id}`) ||
    source.url ||
    null;

  return (
    <Card className="space-y-3" padded>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {/* Source meta */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ backgroundColor: rel.soft, color: rel.color, border: `1px solid ${rel.border}` }}
              title={`Reliability: ${rel.label}`}
            >
              {rel.label}
            </span>
            <span className="rounded-full border border-border bg-surface-2/60 px-2 py-0.5 text-[10px] font-medium text-text-secondary">
              {publicationLabel(source.publication_type)}
            </span>
            {source.is_fixture ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                <Beaker className="h-2.5 w-2.5" /> Demo
              </span>
            ) : null}
          </div>

          <h4 className="text-body-sm font-semibold leading-snug text-text-primary">
            {source.title}
          </h4>

          <p className="text-caption text-text-muted">
            {fmtAuthors(source.authors)}
            {source.year ? ` · ${source.year}` : ''}
            {source.source_name ? ` · ${source.source_name}` : ''}
          </p>

          {/* Aggregate signals — support/contradiction always shown */}
          <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[11px]">
            <span className="inline-flex items-center gap-1 text-text-muted">
              <Link2 className="h-3 w-3" />
              {item.linkedRunIds.length} run
              {item.linkedRunIds.length === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1 text-verified">
              <CheckCircle2 className="h-3 w-3" />
              {item.supportCount} support
            </span>
            <span className="inline-flex items-center gap-1 text-risk">
              <XCircle className="h-3 w-3" />
              {item.contradictionCount} contradict
            </span>
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-electric hover:text-white"
              >
                <ExternalLink className="h-3 w-3" /> Open source
              </a>
            ) : null}
          </div>
        </div>

        {/* Reviewer controls */}
        <div className="w-full shrink-0 lg:w-[320px]">
          <EvidenceReviewControls
            evidenceSourceId={source.id}
            status={item.latestReview?.status ?? item.status ?? 'pending'}
            canReview={canReview}
            isAuthenticated={isAuthenticated}
          />
        </div>
      </div>
    </Card>
  );
}
