'use client';

import { Card } from '@hsi/ui';
import { ExternalLink, FileText, Beaker } from 'lucide-react';
import {
  abstractExcerpt,
  fmtAuthors,
  publicationLabel,
  type EvidenceSourceRecord,
} from '@/lib/worldforge/evidence-view';
import { ReliabilityTierChip } from './ReliabilityTierChip';

export interface EvidenceSourceCardProps {
  source: EvidenceSourceRecord;
  /** Number of claims this source is linked to (optional badge). */
  linkCount?: number;
  className?: string;
}

interface SourceLink {
  href: string;
  label: string;
}

function sourceLinks(s: EvidenceSourceRecord): SourceLink[] {
  const links: SourceLink[] = [];
  if (s.doi) links.push({ href: `https://doi.org/${s.doi}`, label: `DOI ${s.doi}` });
  if (s.arxiv_id) {
    links.push({ href: `https://arxiv.org/abs/${s.arxiv_id}`, label: `arXiv:${s.arxiv_id}` });
  }
  if (s.pubmed_id) {
    links.push({
      href: `https://pubmed.ncbi.nlm.nih.gov/${s.pubmed_id}`,
      label: `PubMed ${s.pubmed_id}`,
    });
  }
  if (s.url && !s.doi && !s.arxiv_id) {
    links.push({ href: s.url, label: 'Source link' });
  }
  return links;
}

/** A single evidence source: bibliographic header + reliability + links + abstract. */
export function EvidenceSourceCard({
  source,
  linkCount,
  className = '',
}: EvidenceSourceCardProps) {
  const links = sourceLinks(source);
  const excerpt = abstractExcerpt(source.abstract);

  return (
    <Card className={`space-y-2.5 ${className}`} padded>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="flex items-start gap-1.5 text-body-sm font-semibold leading-snug text-text-primary">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-electric" />
            {source.title}
          </h4>
          <p className="text-caption text-text-muted">
            {fmtAuthors(source.authors)}
            {source.year ? ` · ${source.year}` : ''}
            {source.source_name ? ` · ${source.source_name}` : ''}
          </p>
        </div>
        {source.is_fixture ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: 'rgba(245,158,11,0.14)',
              color: '#F59E0B',
              border: '1px solid rgba(245,158,11,0.45)',
            }}
            title="Curated demo fixture — not retrieved from a live API"
          >
            <Beaker className="h-3 w-3" />
            Demo
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ReliabilityTierChip score={source.reliability_score} />
        <span className="inline-flex items-center rounded-full border border-border bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-text-secondary">
          {publicationLabel(source.publication_type)}
        </span>
        {typeof linkCount === 'number' && linkCount > 0 ? (
          <span className="inline-flex items-center rounded-full border border-border bg-surface-2/60 px-2 py-0.5 text-[11px] text-text-muted">
            {linkCount} claim{linkCount === 1 ? '' : 's'} linked
          </span>
        ) : null}
      </div>

      {excerpt ? (
        <p className="text-caption leading-relaxed text-text-secondary">{excerpt}</p>
      ) : null}

      {links.length ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-electric transition hover:text-white"
            >
              <ExternalLink className="h-3 w-3" />
              {l.label}
            </a>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-text-muted">No external identifier available.</p>
      )}
    </Card>
  );
}
