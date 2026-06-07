'use client';

import { Search, ArrowRight } from 'lucide-react';
import type { Dispute } from '@hsi/research-agents';
import {
  disputeStatusColor,
  domainStyle,
  severityColor,
} from '@/lib/worldforge/research-view';

export interface DisputeCardProps {
  dispute: Dispute;
  className?: string;
}

/** A single skeptic challenge: target domain, severity, status, resolution. */
export function DisputeCard({ dispute, className = '' }: DisputeCardProps) {
  const sevColor = severityColor(dispute.severity);
  const statusColor = disputeStatusColor(dispute.status);
  const target = domainStyle(dispute.targetDomain);
  const TargetIcon = target.icon;

  return (
    <div
      className={`space-y-2 rounded-card border bg-surface-2/40 p-4 ${className}`}
      style={{ borderColor: `${sevColor}55` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-text-secondary">
          <Search className="h-3.5 w-3.5 text-warning" />
          Skeptic challenge
          <ArrowRight className="h-3 w-3 text-text-muted" />
          <span
            className="inline-flex items-center gap-1"
            style={{ color: target.color }}
          >
            <TargetIcon className="h-3.5 w-3.5" />
            {target.label}
          </span>
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: `${sevColor}1f`, color: sevColor }}
          >
            {dispute.severity}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ backgroundColor: `${statusColor}1f`, color: statusColor }}
          >
            {dispute.status}
          </span>
        </div>
      </div>

      <p className="text-body-sm leading-relaxed text-text-primary">
        {dispute.challenge}
      </p>

      {dispute.targetClaimId ? (
        <p className="text-[11px] text-text-muted">
          Targets claim{' '}
          <span className="font-mono text-text-secondary">
            {dispute.targetClaimId}
          </span>
        </p>
      ) : null}

      {dispute.resolution ? (
        <p className="border-t border-border/60 pt-2 text-caption leading-relaxed text-text-secondary">
          <span className="font-semibold text-verified">Resolution: </span>
          {dispute.resolution}
        </p>
      ) : null}
    </div>
  );
}
