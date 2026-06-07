'use client';

import { ShieldCheck, GitBranch, FileText } from 'lucide-react';
import type { Provenance } from '@hsi/world-models';
import { ScientificConfidenceChip } from './ScientificConfidenceChip';

export interface ProvenancePanelProps {
  provenance: Provenance;
  /** Optional title above the panel. */
  title?: string;
  /** Optionally resolve a dependsOn id to a human label. */
  resolveLabel?: (id: string) => string;
  className?: string;
}

/** Source / Reason / Depends On / Confidence — the WorldForge traceability card. */
export function ProvenancePanel({
  provenance,
  title,
  resolveLabel,
  className = '',
}: ProvenancePanelProps) {
  const sci = provenance.scientificConfidence;
  return (
    <div
      className={`space-y-3 rounded-card border border-border bg-surface-2/50 p-4 ${className}`}
    >
      {title ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-label text-text-secondary">{title}</span>
          <ScientificConfidenceChip tier={sci.tier} confidence={sci.confidence} />
        </div>
      ) : null}

      <Row icon={<FileText className="h-3.5 w-3.5" />} label="Source">
        <span className="text-text-primary">{provenance.source}</span>
      </Row>

      <Row icon={<FileText className="h-3.5 w-3.5" />} label="Reason">
        <span className="text-text-secondary">{provenance.reason}</span>
      </Row>

      <Row icon={<GitBranch className="h-3.5 w-3.5" />} label="Depends On">
        {provenance.dependsOn.length ? (
          <div className="flex flex-wrap gap-1.5">
            {provenance.dependsOn.map((d) => (
              <span
                key={d}
                className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-text-secondary"
              >
                {resolveLabel ? resolveLabel(d) : d}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-text-muted">Root input — taken directly from world state.</span>
        )}
      </Row>

      <Row icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Confidence">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round(provenance.confidence * 100)}%`,
                backgroundColor: '#10B981',
              }}
            />
          </div>
          <span className="text-text-primary">
            {Math.round(provenance.confidence * 100)}%
          </span>
          {!title ? <ScientificConfidenceChip tier={sci.tier} /> : null}
        </div>
      </Row>

      <p className="border-t border-border/60 pt-2 text-caption text-text-muted">
        {sci.reason}
      </p>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 text-caption">
      <span className="flex items-center gap-1.5 text-text-muted">
        {icon}
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
