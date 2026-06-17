'use client';

// =============================================================================
// HSI Phase 42 — "AI assists. Humans decide." Human-in-the-loop section.
// =============================================================================

import { FileSearch, Scale, ScrollText, Network } from 'lucide-react';
import { Reveal, RevealGroup, RevealItem } from './motion';

const PILLARS = [
  { icon: FileSearch, title: 'Evidence review', body: 'Trained reviewers read the sources and weigh the evidence before anything is published.' },
  { icon: Scale, title: 'Governance', body: 'Decisions follow a defined review and approval process, not a single judgment call.' },
  { icon: ScrollText, title: 'Auditability', body: 'Every review, approval, and change is written to an audit log that can be inspected.' },
  { icon: Network, title: 'Traceability', body: 'Each conclusion links back to the exact sources and steps that produced it.' },
];

export function HumanInLoop() {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <Reveal>
        <div className="space-y-3">
          <h2 className="text-h3 font-bold lg:text-h2">
            AI assists. <span className="text-electric">Humans decide.</span>
          </h2>
          <p className="text-body text-text-secondary">
            Models surface patterns and draft analysis at scale, but no finding is published until a
            person has reviewed the evidence and made the call. Automation accelerates the work; it never
            replaces human judgment.
          </p>
        </div>
      </Reveal>
      <RevealGroup className="grid gap-3 sm:grid-cols-2">
        {PILLARS.map((p) => {
          const Icon = p.icon;
          return (
            <RevealItem key={p.title} className="space-y-2 rounded-card border border-border bg-surface/60 p-4 transition hover:border-electric/60">
              <Icon className="h-5 w-5 text-electric" />
              <h3 className="text-h6 font-semibold text-text-primary">{p.title}</h3>
              <p className="text-body-sm text-text-secondary">{p.body}</p>
            </RevealItem>
          );
        })}
      </RevealGroup>
    </div>
  );
}
