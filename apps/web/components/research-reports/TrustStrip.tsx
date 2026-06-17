// =============================================================================
// HSI Phase 45 — Trust & Governance strip. A core HSI trust signal shown on the
// Research Reports intelligence center (and compactly inside each report drawer).
// Static, presentational, public-safe.
// =============================================================================

import { CheckCircle2, ShieldCheck, Link2, GitBranch, Users } from 'lucide-react';

const ITEMS = [
  { icon: Users, label: 'Human Reviewed' },
  { icon: Link2, label: 'Evidence Linked' },
  { icon: ShieldCheck, label: 'Traceable' },
  { icon: GitBranch, label: 'Version Controlled' },
  { icon: CheckCircle2, label: 'Public Interest Research' },
] as const;

export function TrustStrip({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'flex flex-wrap gap-2' : 'flex flex-wrap items-center justify-center gap-2 rounded-card border border-border bg-surface/40 p-3 sm:gap-3'}>
      {ITEMS.map((it) => {
        const Icon = it.icon;
        return (
          <span
            key={it.label}
            className={`inline-flex items-center gap-1.5 rounded-full border border-verified/30 bg-verified/10 px-3 py-1 font-medium text-verified ${compact ? 'text-[10px]' : 'text-caption'}`}
          >
            <Icon className="h-3.5 w-3.5" /> {it.label}
          </span>
        );
      })}
    </div>
  );
}
