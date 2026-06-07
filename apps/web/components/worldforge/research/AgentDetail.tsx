'use client';

import { Card } from '@hsi/ui';
import {
  BookOpenCheck,
  Sigma,
  FlaskConical,
  ShieldQuestion,
  Link2,
  SlidersHorizontal,
} from 'lucide-react';
import type { AgentOutput, Dispute } from '@hsi/research-agents';
import { domainStyle, fmtNum } from '@/lib/worldforge/research-view';
import { ScientificConfidenceChip } from '@/components/worldforge/ScientificConfidenceChip';
import { ConfidenceScore } from './ConfidenceScore';
import { ClaimList } from './ClaimList';
import { DisagreementMarker } from './DisagreementMarker';
import { DisputeCard } from './DisputeCard';

export interface AgentDetailProps {
  output: AgentOutput;
  /** Disputes targeting this agent's domain (from the skeptic). */
  disputes: Dispute[];
}

function fmtParam(value: number | string | boolean): string {
  if (typeof value === 'number') return fmtNum(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value;
}

/** Full detail for a single agent output. */
export function AgentDetail({ output, disputes }: AgentDetailProps) {
  const style = domainStyle(output.domain);
  const Icon = style.icon;
  const params = Object.entries(output.recommendedParameters);
  const highestSeverity = disputes.reduce<'low' | 'medium' | 'high'>(
    (acc, d) => {
      const rank = { low: 1, medium: 2, high: 3 } as const;
      return rank[d.severity] > rank[acc] ? d.severity : acc;
    },
    'low',
  );

  return (
    <Card className="space-y-5 scroll-mt-24" padded id={output.domain}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${style.color}1f`, color: style.color }}
          >
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: style.color }}
            >
              {style.label}
            </p>
            <h3 className="text-h5 font-semibold text-text-primary">
              {output.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-muted">
                Uncertainty {Math.round(output.uncertaintyScore)}
              </span>
              <DisagreementMarker
                count={disputes.length}
                severity={highestSeverity}
              />
            </div>
          </div>
        </div>
        <ConfidenceScore score={output.confidenceScore} label="Confidence" size={60} />
      </div>

      <p className="text-body-sm leading-relaxed text-text-secondary">
        {output.summary}
      </p>

      {/* Assumptions */}
      {output.assumptions.length ? (
        <Section icon={<ShieldQuestion className="h-4 w-4 text-warning" />} title="Assumptions">
          <ul className="space-y-1">
            {output.assumptions.map((a, i) => (
              <li key={i} className="text-caption text-text-secondary">
                • {a}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Equations */}
      {output.equations.length ? (
        <Section icon={<Sigma className="h-4 w-4 text-electric" />} title="Equations">
          <div className="space-y-2">
            {output.equations.map((eq, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-surface-2/40 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-body-sm font-semibold text-text-primary">
                    {eq.name}
                  </span>
                  <ScientificConfidenceChip tier={eq.tier} />
                </div>
                <p className="mt-1 font-mono text-caption text-electric">
                  {eq.expression}
                </p>
                <p className="mt-1 text-caption text-text-muted">
                  {eq.explanation}
                </p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Tiered findings */}
      <div className="grid gap-3 lg:grid-cols-3">
        <TierColumn
          title="Known science"
          tier="known-science"
          items={output.knownScience}
        />
        <TierColumn
          title="Plausible extrapolations"
          tier="plausible-science"
          items={output.plausibleExtrapolations}
        />
        <TierColumn
          title="Speculative claims"
          tier="speculative"
          items={output.speculativeClaims}
        />
      </div>

      {/* Counterarguments */}
      {output.counterarguments.length ? (
        <Section
          icon={<ShieldQuestion className="h-4 w-4 text-warning" />}
          title="Counterarguments"
        >
          <ul className="space-y-1">
            {output.counterarguments.map((c, i) => (
              <li key={i} className="text-caption text-text-secondary">
                • {c}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Dependencies */}
      {output.dependencies.length ? (
        <Section icon={<Link2 className="h-4 w-4 text-electric" />} title="Dependencies">
          <div className="flex flex-wrap gap-1.5">
            {output.dependencies.map((dep) => {
              const ds = domainStyle(dep);
              const DepIcon = ds.icon;
              return (
                <span
                  key={dep}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    backgroundColor: `${ds.color}1f`,
                    color: ds.color,
                    border: `1px solid ${ds.color}55`,
                  }}
                >
                  <DepIcon className="h-3 w-3" />
                  {ds.label}
                </span>
              );
            })}
          </div>
        </Section>
      ) : null}

      {/* Recommended parameters */}
      {params.length ? (
        <Section
          icon={<SlidersHorizontal className="h-4 w-4 text-electric" />}
          title="Recommended parameters"
        >
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {params.map(([key, value]) => (
                  <tr
                    key={key}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-3 py-2 font-mono text-caption text-text-secondary">
                      {key}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-caption text-text-primary">
                      {fmtParam(value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {/* Claims with provenance */}
      <Section
        icon={<BookOpenCheck className="h-4 w-4 text-electric" />}
        title={`Traceable claims (${output.claims.length})`}
      >
        <ClaimList claims={output.claims} />
      </Section>

      {/* Disputes against this agent */}
      {disputes.length ? (
        <Section
          icon={<FlaskConical className="h-4 w-4 text-warning" />}
          title={`Skeptic disputes (${disputes.length})`}
        >
          <div className="space-y-2">
            {disputes.map((d) => (
              <DisputeCard key={d.id} dispute={d} />
            ))}
          </div>
        </Section>
      ) : null}
    </Card>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-2 text-label text-text-muted">
        {icon}
        {title}
      </h4>
      {children}
    </div>
  );
}

function TierColumn({
  title,
  tier,
  items,
}: {
  title: string;
  tier: string;
  items: string[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ScientificConfidenceChip tier={tier} label={title} />
      </div>
      {items.length ? (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="text-caption leading-relaxed text-text-secondary">
              • {it}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption text-text-muted">None.</p>
      )}
    </div>
  );
}
