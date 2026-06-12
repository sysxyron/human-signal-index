// =============================================================================
// HSI Phase 19 — PublicationCard. A public portal card for one published report:
// title, summary, trust score, confidence, evidence/source counts, published date,
// review/governance status, and topics. Links to the full report. Server-safe.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { FileText, ShieldCheck } from 'lucide-react';
import type { PublicIntelligenceItem } from '@hsi/shared-types';
import { PublicationStateBadge, TrustBandBadge } from './badges';
import { formatConfidence, formatDate, formatTrust } from '@/lib/publishing/view';

export function PublicationCard({ item }: { item: PublicIntelligenceItem }) {
  return (
    <Link href={`/intelligence/${item.slug}` as never} className="block">
      <Card className="space-y-3 border-border transition hover:border-electric/50" padded>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-electric" />
            <h3 className="text-h6 font-semibold text-text-primary">{item.title}</h3>
          </div>
          <PublicationStateBadge state={item.state} />
        </div>
        <p className="line-clamp-2 text-caption leading-relaxed text-text-secondary">{item.summary}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-electric" />
            <span className="font-bold tabular-nums text-text-primary">{formatTrust(item.trustScore)}</span>
            <span className="text-text-muted">trust</span>
          </span>
          <TrustBandBadge score={item.trustScore} />
          <span className="text-text-muted">conf {formatConfidence(item.confidence)}</span>
          <span className="text-text-muted">{item.evidenceCount} evidence · {item.sourceCount} sources</span>
          <span className="text-text-muted">{formatDate(item.publishedAt)}</span>
        </div>
        {item.topics.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {item.topics.map((t) => (
              <span key={t} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted">{t}</span>
            ))}
          </div>
        ) : null}
      </Card>
    </Link>
  );
}
