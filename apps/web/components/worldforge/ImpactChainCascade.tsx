'use client';

import { ArrowDown, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import type { ImpactStep } from '@hsi/simulation-engine';
import { fmtNum } from '@/lib/worldforge/confidence';

export interface ImpactChainCascadeProps {
  /** Label of the triggering change, shown at the top. */
  trigger: string;
  steps: ImpactStep[];
  /** Hide zero-delta steps. Default true. */
  changedOnly?: boolean;
  className?: string;
}

/** Vertical cascade: Trigger ↓ Step ↓ Step ↓ ... */
export function ImpactChainCascade({
  trigger,
  steps,
  changedOnly = true,
  className = '',
}: ImpactChainCascadeProps) {
  const shown = changedOnly ? steps.filter((s) => s.delta !== 0) : steps;
  // Dedupe by label keeping the last (final) value for a clean cascade.
  const seen = new Map<string, ImpactStep>();
  for (const s of shown) seen.set(s.label, s);
  const list = Array.from(seen.values());

  return (
    <div className={`space-y-0 ${className}`}>
      <CascadeNode label={trigger} highlight />
      {list.length === 0 ? (
        <>
          <Connector />
          <div className="rounded-card border border-border bg-surface-2/50 px-4 py-3 text-caption text-text-muted">
            No downstream nodes changed value.
          </div>
        </>
      ) : (
        list.map((step) => (
          <div key={step.nodeId}>
            <Connector />
            <CascadeStep step={step} />
          </div>
        ))
      )}
    </div>
  );
}

function Connector() {
  return (
    <div className="flex justify-center py-1">
      <ArrowDown className="h-4 w-4 text-text-muted" />
    </div>
  );
}

function CascadeNode({ label, highlight = false }: { label: string; highlight?: boolean }) {
  return (
    <div
      className="rounded-card border px-4 py-3 text-body-sm font-semibold"
      style={
        highlight
          ? {
              borderColor: 'rgba(37,99,235,0.5)',
              backgroundColor: 'rgba(37,99,235,0.12)',
              color: '#F8FAFC',
            }
          : { borderColor: 'var(--border)', backgroundColor: 'rgba(17,26,46,0.5)' }
      }
    >
      {label}
    </div>
  );
}

function CascadeStep({ step }: { step: ImpactStep }) {
  const up = step.delta > 0;
  const flat = step.delta === 0;
  const color = flat ? '#94A3B8' : up ? '#10B981' : '#F59E0B';
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="rounded-card border border-border bg-surface-2/50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-body-sm font-semibold text-text-primary">{step.label}</span>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          <Icon className="h-3 w-3" />
          {up ? 'increased' : flat ? 'unchanged' : 'decreased'}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-caption text-text-muted">
        <span className="font-mono">{fmtNum(step.before)}</span>
        <ArrowUpRight className="h-3 w-3 rotate-45" />
        <span className="font-mono text-text-secondary">{fmtNum(step.after)}</span>
        <span style={{ color }}>
          (Δ {step.delta > 0 ? '+' : ''}
          {fmtNum(step.delta)})
        </span>
      </div>
      {step.reason ? (
        <p className="mt-1 text-caption leading-snug text-text-muted">{step.reason}</p>
      ) : null}
    </div>
  );
}
