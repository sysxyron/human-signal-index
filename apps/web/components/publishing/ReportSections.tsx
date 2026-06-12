// =============================================================================
// HSI Phase 19 — ReportSections + PublicationTrustSurface + RetractionNotice.
// The public-facing body of a published report: the 12 explainable sections
// (each flagged sourced/unsourced), the open trust surface, and the always-visible
// retraction notice. Pure presentational, server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { AlertOctagon, BookOpen, Info, ShieldCheck } from 'lucide-react';
import type {
  HsinPublicationRetractionRecord,
  PublicIntelligenceItem,
  ReportSectionView,
} from '@hsi/shared-types';
import {
  formatConfidence,
  formatDate,
  formatTrust,
  retractionReasonLabel,
  trustBandDecor,
} from '@/lib/publishing/view';

export function ReportSections({ sections }: { sections: ReportSectionView[] }) {
  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <Card key={s.key} className="space-y-2 border-border" padded>
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
              <BookOpen className="h-4 w-4 text-electric" /> {s.title}
            </h3>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={s.sourced
                ? { color: '#10B981', backgroundColor: '#10B9811f', border: '1px solid #10B98155' }
                : { color: '#94A3B8', backgroundColor: '#94A3B81f', border: '1px solid #94A3B855' }}
            >
              {s.sourced ? 'Sourced' : 'Unsourced'}
            </span>
          </div>
          {s.items && s.items.length > 0 ? (
            <ul className="ml-4 list-disc space-y-0.5 text-caption leading-relaxed text-text-secondary">
              {s.items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          ) : (
            <p className="whitespace-pre-line text-caption leading-relaxed text-text-secondary">{s.body}</p>
          )}
        </Card>
      ))}
    </div>
  );
}

export function PublicationTrustSurface({
  publication,
  trustHistory,
}: {
  publication: PublicIntelligenceItem;
  trustHistory: { trustScore: number; at: string }[];
}) {
  const band = trustBandDecor(publication.trustScore);
  return (
    <Card className="space-y-3 border-border" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <ShieldCheck className="h-4 w-4 text-electric" /> Trust surface
      </h3>
      <div className="grid grid-cols-2 gap-3 text-caption sm:grid-cols-3">
        <Metric label="Trust score" value={`${formatTrust(publication.trustScore)}/100`} color={band.color} />
        <Metric label="Confidence" value={formatConfidence(publication.confidence)} />
        <Metric label="Evidence" value={String(publication.evidenceCount)} />
        <Metric label="Sources" value={String(publication.sourceCount)} />
        <Metric label="Review" value={publication.reviewStatus ?? '—'} />
        <Metric label="Governance" value={publication.governanceStatus ?? '—'} />
      </div>
      {trustHistory.length > 1 ? (
        <div>
          <div className="mb-1 text-label uppercase tracking-wide text-text-muted">Trust history</div>
          <div className="flex items-end gap-1">
            {trustHistory.map((h, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${Math.round(h.trustScore)} on ${formatDate(h.at)}`}>
                <div className="w-full rounded-t" style={{ height: `${Math.max(4, (h.trustScore / 100) * 48)}px`, backgroundColor: trustBandDecor(h.trustScore).color }} />
                <span className="text-[10px] text-text-muted">{formatTrust(h.trustScore)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-text-muted">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        Trust is advisory and shown openly with its history — never a hidden score. Corroborate independently.
      </p>
    </Card>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-card border border-border bg-surface/50 px-3 py-2">
      <div className="text-label uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-0.5 font-semibold" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

export function RetractionNotice({ retraction }: { retraction: HsinPublicationRetractionRecord }) {
  return (
    <Card className="space-y-2 border-risk/50 bg-risk/5" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-risk">
        <AlertOctagon className="h-4 w-4" /> This report was retracted
      </h3>
      <p className="text-caption text-text-secondary">
        <span className="font-semibold text-text-primary">Reason: </span>
        {retractionReasonLabel(retraction.reason)} — {retraction.detail}
      </p>
      <p className="text-[11px] text-text-muted">
        Retracted {formatDate(retraction.created_at)}. The report is kept visible for the record; history is never deleted.
      </p>
    </Card>
  );
}
