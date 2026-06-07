'use client';

import { useMemo, useState } from 'react';
import { Card } from '@hsi/ui';
import { Link2, AlertTriangle } from 'lucide-react';
import {
  coverageStyle,
  fmtPct01,
  groupLinksByClaim,
  indexSources,
  type ClaimCoverage,
  type ClaimEvidenceLinkRecord,
  type EvidenceSourceRecord,
} from '@/lib/worldforge/evidence-view';
import type { FlatClaim } from '@/lib/worldforge/research-view';
import { domainStyle } from '@/lib/worldforge/research-view';
import { ScientificConfidenceChip } from '@/components/worldforge/ScientificConfidenceChip';
import { SupportTypeBadge } from './SupportTypeBadge';

export interface ClaimEvidenceListProps {
  /** Every claim across all agents (so unsupported claims are shown, not hidden). */
  claims: FlatClaim[];
  links: ClaimEvidenceLinkRecord[];
  sources: EvidenceSourceRecord[];
  className?: string;
}

const FILTERS: { key: ClaimCoverage | 'all'; label: string }[] = [
  { key: 'all', label: 'All claims' },
  { key: 'supported', label: 'Supported' },
  { key: 'contradicted', label: 'Contradicted' },
  { key: 'background', label: 'Background only' },
  { key: 'unsupported', label: 'Unsupported' },
];

/**
 * Claim → source links, grouped per claim. Each linked source shows a support
 * badge + relevance + confidence. Claims with NO link are rendered as
 * "Unsupported" — honest, never hidden.
 */
export function ClaimEvidenceList({
  claims,
  links,
  sources,
  className = '',
}: ClaimEvidenceListProps) {
  const groups = useMemo(() => groupLinksByClaim(links), [links]);
  const sourceIndex = useMemo(() => indexSources(sources), [sources]);
  const [filter, setFilter] = useState<ClaimCoverage | 'all'>('all');

  // Each claim → its coverage verdict (unsupported when no link exists).
  const rows = useMemo(
    () =>
      claims.map((claim) => {
        const group = groups.get(claim.claimId);
        return {
          claim,
          coverage: (group?.coverage ?? 'unsupported') as ClaimCoverage,
          links: group?.links ?? [],
        };
      }),
    [claims, groups],
  );

  const counts = useMemo(() => {
    const m: Record<ClaimCoverage, number> = {
      supported: 0,
      contradicted: 0,
      background: 0,
      unsupported: 0,
    };
    for (const r of rows) m[r.coverage] += 1;
    return m;
  }, [rows]);

  const visible = filter === 'all' ? rows : rows.filter((r) => r.coverage === filter);

  return (
    <div className={`space-y-4 ${className}`}>
      <Card className="space-y-3" padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Link2 className="h-4 w-4 text-electric" /> Claim → evidence links
        </h3>
        <p className="text-caption text-text-muted">
          Every claim is shown with its supporting, contradicting, or background
          sources. Claims with no matching source are marked{' '}
          <span className="font-semibold" style={{ color: coverageStyle('unsupported').color }}>
            unsupported
          </span>{' '}
          — weak evidence is never presented as strong.
        </p>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const color = f.key === 'all' ? '#94A3B8' : coverageStyle(f.key).color;
            const count = f.key === 'all' ? rows.length : counts[f.key];
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-semibold transition"
                style={{
                  backgroundColor: active ? `${color}26` : 'rgba(148,163,184,0.08)',
                  color: active ? color : '#94A3B8',
                  border: `1px solid ${active ? `${color}88` : 'rgba(148,163,184,0.2)'}`,
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                {f.label}
                <span className="opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-2/40 px-3 py-3 text-caption text-text-muted">
          No claims in this category.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {visible.map(({ claim, coverage, links: claimLinks }) => {
            const cs = coverageStyle(coverage);
            const ds = domainStyle(claim.domain);
            const DIcon = ds.icon;
            return (
              <li
                key={`${claim.domain}-${claim.claimId}`}
                className="rounded-lg border bg-surface-2/40 p-3"
                style={{ borderColor: cs.border }}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-body-sm leading-relaxed text-text-primary">
                    {claim.text}
                  </p>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: cs.soft, color: cs.color, border: `1px solid ${cs.border}` }}
                    >
                      {coverage === 'unsupported' ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : null}
                      {cs.label}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ backgroundColor: `${ds.color}1f`, color: ds.color }}
                    >
                      <DIcon className="h-3 w-3" />
                      {ds.label}
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <ScientificConfidenceChip tier={claim.tier} confidence={claim.confidence} />
                  <span className="font-mono text-[11px] text-text-muted">{claim.claimId}</span>
                </div>

                {claimLinks.length ? (
                  <ul className="mt-2.5 space-y-1.5 border-l border-border pl-3">
                    {claimLinks.map((link) => {
                      const src = sourceIndex.get(link.evidence_source_id);
                      return (
                        <li
                          key={link.id}
                          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]"
                        >
                          <SupportTypeBadge
                            support={link.support_type ?? 'unclear'}
                            compact
                          />
                          <span className="text-text-secondary">
                            {src ? src.title : link.evidence_source_id}
                            {src?.year ? ` (${src.year})` : ''}
                          </span>
                          {src?.is_fixture ? (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{
                                backgroundColor: 'rgba(245,158,11,0.14)',
                                color: '#F59E0B',
                              }}
                            >
                              Demo
                            </span>
                          ) : null}
                          {typeof link.relevance_score === 'number' ? (
                            <span className="text-[11px] text-text-muted">
                              rel {fmtPct01(link.relevance_score)}
                            </span>
                          ) : null}
                          {typeof link.confidence === 'number' ? (
                            <span className="text-[11px] text-text-muted">
                              conf {fmtPct01(link.confidence)}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-[11px] font-medium" style={{ color: cs.color }}>
                    No matching evidence source — this claim is unsupported.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
