'use client';

// =============================================================================
// HSI Phase 49 — interactive traceability explainer. A selectable stepper that
// walks the public through how evidence becomes intelligence, how traceability
// works, and how reviewers participate. Pure UI state (no data, no I/O); keyboard
// accessible. Reduced-motion safe (no essential animation).
// =============================================================================

import { useState } from 'react';
import { Card } from '@hsi/ui';
import { Radio, Link2, ScanText, Users, BadgeCheck } from 'lucide-react';

const STEPS = [
  { icon: Radio, label: 'Signal', color: '#3B82F6', heading: 'A public signal is captured', body: 'A narrative or campaign is observed in public sources and recorded with its capture time. Nothing is acted on yet — it simply enters the pipeline as raw input.' },
  { icon: Link2, label: 'Evidence', color: '#10B981', heading: 'Evidence is linked and sealed', body: 'The underlying material is archived and hash-sealed so its integrity can be verified later. Every downstream claim can be traced back to this evidence.' },
  { icon: ScanText, label: 'Analysis', color: '#8B5CF6', heading: 'Analysis turns evidence into intelligence', body: 'The signal is classified by narrative category and scored for risk and confidence using an explainable framework — never an opaque black box.' },
  { icon: Users, label: 'Human Review', color: '#F59E0B', heading: 'A human reviewer decides', body: 'A trained reviewer weighs the evidence and competing explanations and approves or rejects publication. The decision is recorded and reversible.' },
  { icon: BadgeCheck, label: 'Publication', color: '#10B981', heading: 'Published with its full trail', body: 'Only reviewed findings publish — each keeping its sources, traceability score, and audit trail so anyone can independently check the conclusion.' },
] as const;

export function TraceabilityExplainer() {
  const [active, setActive] = useState(0);
  const step = STEPS[active];
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-h6 font-semibold text-text-primary">How evidence becomes intelligence</h3>
        <p className="text-caption text-text-muted">Select a stage to see how traceability and human review work at each step.</p>
      </div>

      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const on = i === active;
          const last = i === STEPS.length - 1;
          return (
            <div key={s.label} className="flex items-center gap-1">
              <button
                onClick={() => setActive(i)}
                aria-pressed={on}
                className={`flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-card border px-2 py-3 transition ${on ? 'border-electric bg-electric/5' : 'border-border hover:border-border/80'}`}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${s.color}1f`, color: s.color }}><Icon className="h-4 w-4" /></span>
                <span className="text-center text-[10px] font-medium uppercase tracking-wide text-text-secondary">{s.label}</span>
              </button>
              {!last ? <span className="h-px w-4 shrink-0 bg-border" aria-hidden /> : null}
            </div>
          );
        })}
      </div>

      <div className="rounded-card border border-border bg-background-deep/40 p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full text-caption font-bold" style={{ backgroundColor: `${step.color}1f`, color: step.color }}>{active + 1}</span>
          <h4 className="text-body-sm font-semibold text-text-primary">{step.heading}</h4>
        </div>
        <p className="mt-2 text-body-sm leading-relaxed text-text-secondary">{step.body}</p>
      </div>
    </Card>
  );
}
