'use client';

import { useMemo, useState } from 'react';
import { Card } from '@hsi/ui';
import { GitBranch, Route } from 'lucide-react';
import type { AgentOutput } from '@hsi/research-agents';
import {
  PROVENANCE_SOURCE_ORDER,
  domainStyle,
  flattenClaims,
  provenanceSourceStyle,
  type FlatClaim,
} from '@/lib/worldforge/research-view';
import {
  coverageStyle,
  fmtPct01,
  reviewStatusStyle,
  REVIEW_STATUS_ICON,
  type ClaimEvidenceGroup,
  type UiReviewStatus,
  type EvidenceSourceRecord,
} from '@/lib/worldforge/evidence-view';
import { ScientificConfidenceChip } from '@/components/worldforge/ScientificConfidenceChip';
import { ProvenanceSourceChip } from './ProvenanceSourceChip';
import { SupportTypeBadge } from './SupportTypeBadge';

/**
 * Optional Phase-4 evidence overlay for the provenance explorer. When present,
 * each claim row is extended with the full chain: Claim → Agent → Provenance
 * type → Scientific tier → Evidence source(s) + support badge → Reviewer status.
 */
export interface ProvenanceEvidenceOverlay {
  /** claim_id → grouped evidence links (best-first) + coverage verdict. */
  evidenceByClaim: Map<string, ClaimEvidenceGroup>;
  /** evidence_source_id → source record (for titles). */
  sourcesById: Map<string, EvidenceSourceRecord>;
  /** evidence_source_id → reviewer status (defaults to 'unreviewed'). */
  reviewBySource: Map<string, UiReviewStatus>;
}

export interface ProvenanceExplorerProps {
  agents: AgentOutput[];
  /** When provided, claim rows gain evidence + reviewer columns (Phase 4). */
  evidence?: ProvenanceEvidenceOverlay;
}

/**
 * Traceability explorer: every claim across all agents, mapped to its
 * ProvenanceSource. Filter by source; each row shows tier + confidence + the
 * originating agent + dependsOn links — mirroring the HSI provenance style.
 */
export function ProvenanceExplorer({
  agents,
  evidence,
}: ProvenanceExplorerProps) {
  const claims = useMemo(() => flattenClaims(agents), [agents]);
  const [active, setActive] = useState<string | 'all'>('all');

  // id → label map so dependsOn links resolve to a claim snippet or domain.
  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of claims) m.set(c.claimId, c.text);
    for (const a of agents) m.set(a.domain, domainStyle(a.domain).label);
    return m;
  }, [claims, agents]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of claims) m.set(c.source, (m.get(c.source) ?? 0) + 1);
    return m;
  }, [claims]);

  const filtered = useMemo(
    () => (active === 'all' ? claims : claims.filter((c) => c.source === active)),
    [claims, active],
  );

  const resolve = (id: string) => labelById.get(id) ?? id;

  return (
    <div className="space-y-4">
      {/* Source legend / filter */}
      <Card className="space-y-3" padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Route className="h-4 w-4 text-electric" /> Trace by source
        </h3>
        <p className="text-caption text-text-muted">
          Every claim is tagged with exactly one of the six traceability
          categories — so you can always answer &ldquo;where did this come
          from?&rdquo;
        </p>
        <div className="flex flex-wrap gap-2">
          <FilterPill
            label="All"
            color="#94A3B8"
            count={claims.length}
            active={active === 'all'}
            onClick={() => setActive('all')}
          />
          {PROVENANCE_SOURCE_ORDER.map((src) => {
            const s = provenanceSourceStyle(src);
            return (
              <FilterPill
                key={src}
                label={s.label}
                color={s.color}
                count={counts.get(src) ?? 0}
                active={active === src}
                onClick={() => setActive(src)}
              />
            );
          })}
        </div>
        {active !== 'all' ? (
          <p className="text-caption text-text-secondary">
            {provenanceSourceStyle(active).description}
          </p>
        ) : null}
      </Card>

      {/* Claim rows grouped by source when "all", else flat list */}
      {active === 'all' ? (
        <div className="space-y-5">
          {PROVENANCE_SOURCE_ORDER.map((src) => {
            const group = claims.filter((c) => c.source === src);
            if (!group.length) return null;
            const s = provenanceSourceStyle(src);
            return (
              <section key={src} className="space-y-2">
                <div className="flex items-center gap-2">
                  <ProvenanceSourceChip source={src} />
                  <span className="text-caption text-text-muted">
                    {group.length} claims · {s.description}
                  </span>
                </div>
                <ClaimRows claims={group} resolve={resolve} evidence={evidence} />
              </section>
            );
          })}
        </div>
      ) : (
        <ClaimRows claims={filtered} resolve={resolve} evidence={evidence} />
      )}
    </div>
  );
}

function FilterPill({
  label,
  color,
  count,
  active,
  onClick,
}: {
  label: string;
  color: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-semibold transition"
      style={{
        backgroundColor: active ? `${color}26` : 'rgba(148,163,184,0.08)',
        color: active ? color : '#94A3B8',
        border: `1px solid ${active ? `${color}88` : 'rgba(148,163,184,0.2)'}`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
      <span className="opacity-70">{count}</span>
    </button>
  );
}

function ClaimRows({
  claims,
  resolve,
  evidence,
}: {
  claims: FlatClaim[];
  resolve: (id: string) => string;
  evidence?: ProvenanceEvidenceOverlay;
}) {
  if (!claims.length) {
    return (
      <p className="rounded-lg border border-border bg-surface-2/40 px-3 py-3 text-caption text-text-muted">
        No claims in this category.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {claims.map((c) => {
        const ds = domainStyle(c.domain);
        const DIcon = ds.icon;
        return (
          <li
            key={`${c.domain}-${c.claimId}`}
            className="rounded-lg border border-border bg-surface-2/40 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-body-sm leading-relaxed text-text-primary">
                {c.text}
              </p>
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: `${ds.color}1f`, color: ds.color }}
              >
                <DIcon className="h-3 w-3" />
                {ds.label}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <ProvenanceSourceChip source={c.source} compact />
              <ScientificConfidenceChip tier={c.tier} confidence={c.confidence} />
              <span className="font-mono text-[11px] text-text-muted">
                {c.claimId}
              </span>
              {c.dependsOn.length ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
                  <GitBranch className="h-3 w-3" />
                  {c.dependsOn.map((d) => (
                    <span
                      key={d}
                      className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-text-secondary"
                      title={resolve(d)}
                    >
                      {resolve(d).length > 28
                        ? `${resolve(d).slice(0, 27)}…`
                        : resolve(d)}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-[11px] text-text-muted">
                  Root — traces to user input.
                </span>
              )}
            </div>
            {evidence ? (
              <ClaimEvidenceRow claimId={c.claimId} evidence={evidence} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The Phase-4 tail of the provenance chain for one claim:
 * Evidence source(s) + support badge → coverage verdict → reviewer status.
 * Honest: a claim with no evidence link is shown as Unsupported, not hidden.
 */
function ClaimEvidenceRow({
  claimId,
  evidence,
}: {
  claimId: string;
  evidence: ProvenanceEvidenceOverlay;
}) {
  const group = evidence.evidenceByClaim.get(claimId);
  const coverage = group?.coverage ?? 'unsupported';
  const cs = coverageStyle(coverage);
  const links = group?.links ?? [];

  return (
    <div className="mt-2 border-t border-border/60 pt-2">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Evidence
        </span>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: cs.soft, color: cs.color, border: `1px solid ${cs.border}` }}
        >
          {cs.label}
        </span>
      </div>
      {links.length === 0 ? (
        <p className="text-[11px] font-medium" style={{ color: cs.color }}>
          No evidence source — this claim is unsupported.
        </p>
      ) : (
        <ul className="space-y-1">
          {links.map((link) => {
            const src = evidence.sourcesById.get(link.evidence_source_id);
            const reviewStatus =
              evidence.reviewBySource.get(link.evidence_source_id) ?? 'unreviewed';
            const rs = reviewStatusStyle(reviewStatus);
            const RIcon = REVIEW_STATUS_ICON[reviewStatus] ?? REVIEW_STATUS_ICON.unreviewed;
            return (
              <li
                key={link.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"
              >
                <SupportTypeBadge support={link.support_type ?? 'unclear'} compact />
                <span className="text-text-secondary">
                  {src ? src.title : link.evidence_source_id}
                  {src?.year ? ` (${src.year})` : ''}
                </span>
                {src?.is_fixture ? (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: 'rgba(245,158,11,0.14)', color: '#F59E0B' }}
                  >
                    Demo
                  </span>
                ) : null}
                {typeof link.relevance_score === 'number' ? (
                  <span className="text-text-muted">rel {fmtPct01(link.relevance_score)}</span>
                ) : null}
                <span
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ backgroundColor: rs.soft, color: rs.color, border: `1px solid ${rs.border}` }}
                  title={`Reviewer status: ${rs.label}`}
                >
                  <RIcon className="h-2.5 w-2.5" />
                  {rs.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
