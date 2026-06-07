'use client';

import { GitBranch } from 'lucide-react';
import type { Claim } from '@hsi/research-agents';
import { ScientificConfidenceChip } from '@/components/worldforge/ScientificConfidenceChip';
import { ProvenanceSourceChip } from './ProvenanceSourceChip';

export interface ClaimListProps {
  claims: Claim[];
  /** Show ProvenanceSource chip per claim. Default true. */
  showSource?: boolean;
  /** Show dependsOn ids. Default true. */
  showDependsOn?: boolean;
  /** Resolve a dependsOn id to a friendly label (e.g. claim text / domain). */
  resolveLabel?: (id: string) => string;
  className?: string;
}

/** A list of atomic claims, each with its ProvenanceSource + tier + confidence. */
export function ClaimList({
  claims,
  showSource = true,
  showDependsOn = true,
  resolveLabel,
  className = '',
}: ClaimListProps) {
  if (!claims.length) {
    return (
      <p className="text-caption text-text-muted">No claims recorded.</p>
    );
  }
  return (
    <ul className={`space-y-2 ${className}`}>
      {claims.map((claim) => (
        <li
          key={claim.id}
          className="rounded-lg border border-border bg-surface-2/40 p-3"
        >
          <p className="text-body-sm leading-relaxed text-text-primary">
            {claim.text}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {showSource ? <ProvenanceSourceChip source={claim.source} /> : null}
            <ScientificConfidenceChip
              tier={claim.tier}
              confidence={claim.confidence}
            />
            {showDependsOn && claim.dependsOn && claim.dependsOn.length ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
                <GitBranch className="h-3 w-3" />
                {claim.dependsOn.map((d) => (
                  <span
                    key={d}
                    className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-text-secondary"
                  >
                    {resolveLabel ? resolveLabel(d) : d}
                  </span>
                ))}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
