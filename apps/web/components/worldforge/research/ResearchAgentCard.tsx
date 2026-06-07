'use client';

import { Card } from '@hsi/ui';
import type { AgentOutput } from '@hsi/research-agents';
import { domainStyle } from '@/lib/worldforge/research-view';
import { ConfidenceScore } from './ConfidenceScore';
import { DisagreementMarker } from './DisagreementMarker';

export interface ResearchAgentCardProps {
  output: AgentOutput;
  /** Number of disputes the skeptic raised against this domain. */
  disputeCount?: number;
  /** Highest dispute severity for this domain. */
  disputeSeverity?: 'low' | 'medium' | 'high' | string;
  className?: string;
}

/**
 * Compact agent summary card: domain icon, title, confidence ring, uncertainty,
 * a few key claims, and a disagreement marker if the skeptic targeted it.
 */
export function ResearchAgentCard({
  output,
  disputeCount = 0,
  disputeSeverity = 'medium',
  className = '',
}: ResearchAgentCardProps) {
  const style = domainStyle(output.domain);
  const Icon = style.icon;
  const keyClaims = output.claims.slice(0, 3);

  return (
    <Card className={`flex h-full flex-col gap-3 ${className}`} padded>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${style.color}1f`, color: style.color }}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: style.color }}
            >
              {style.label}
            </p>
            <h4 className="text-h6 font-semibold leading-tight text-text-primary">
              {output.title}
            </h4>
          </div>
        </div>
        <ConfidenceScore score={output.confidenceScore} size={52} />
      </div>

      <p className="line-clamp-3 text-caption leading-relaxed text-text-secondary">
        {output.summary}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-muted">
          Uncertainty {Math.round(output.uncertaintyScore)}
        </span>
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-muted">
          {output.claims.length} claims
        </span>
        <DisagreementMarker count={disputeCount} severity={disputeSeverity} />
      </div>

      {keyClaims.length ? (
        <ul className="mt-auto space-y-1.5 border-t border-border/60 pt-3">
          {keyClaims.map((c) => (
            <li
              key={c.id}
              className="flex items-start gap-2 text-caption text-text-secondary"
            >
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: style.color }}
              />
              <span className="line-clamp-2">{c.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
