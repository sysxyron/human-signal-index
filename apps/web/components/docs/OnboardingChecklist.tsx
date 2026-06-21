'use client';
// =============================================================================
// HSI Phase 73.4 — New user onboarding checklist (client). Client-side only, no
// persistence — visual progress for a first-time user. Items link to real pages.
// =============================================================================

import { useState } from 'react';
import { Card } from '@hsi/ui';
import { CheckCircle2, Circle } from 'lucide-react';
import { appHref } from '@/lib/env/app-url';

interface Item { label: string; href: string; external?: boolean }

const ITEMS: Item[] = [
  { label: 'Create an account', href: appHref('/sign-up'), external: true },
  { label: 'Explore the dashboard', href: appHref('/dashboard'), external: true },
  { label: 'Review the methodology', href: '/docs/methodology' },
  { label: 'Read the core concepts', href: '/docs/concepts' },
  { label: 'Add your first source', href: appHref('/dashboard/source-discovery'), external: true },
  { label: 'Create your first signal', href: appHref('/dashboard/signal-intake'), external: true },
  { label: 'Review the documentation', href: '/docs' },
  { label: 'Request help', href: '/contact' },
];

export function OnboardingChecklist() {
  const [done, setDone] = useState<boolean[]>(() => ITEMS.map(() => false));
  const completed = done.filter(Boolean).length;
  const pct = Math.round((completed / ITEMS.length) * 100);
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-h6 font-semibold text-text-primary">New user checklist</h2>
        <span className="text-caption text-text-muted">{completed}/{ITEMS.length}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2/50"><div className="h-full rounded-full bg-electric transition-all" style={{ width: `${pct}%` }} /></div>
      <ul className="space-y-1.5">
        {ITEMS.map((it, i) => (
          <li key={it.label} className="flex items-center gap-2">
            <button type="button" aria-pressed={done[i]} onClick={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))} className="shrink-0 text-text-muted hover:text-electric">
              {done[i] ? <CheckCircle2 className="h-5 w-5 text-verified" /> : <Circle className="h-5 w-5" />}
            </button>
            <a href={it.href} target={it.external ? '_blank' : undefined} rel={it.external ? 'noreferrer noopener' : undefined} className={`text-body-sm hover:text-electric ${done[i] ? 'text-text-muted line-through' : 'text-text-secondary'}`}>{it.label}</a>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-text-muted">Progress is for this session only and is not saved.</p>
    </Card>
  );
}
