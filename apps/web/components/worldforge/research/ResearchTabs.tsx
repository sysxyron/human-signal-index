'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Scale, Route } from 'lucide-react';

export interface ResearchTabsProps {
  /** Run id (or 'demo-chronid'). */
  runId: string;
  /** Preserve the ?demo=1 flag across tabs when present. */
  demoQuery?: boolean;
}

/** In-page sub-nav across a run's Overview / Agents / Consensus / Provenance. */
export function ResearchTabs({ runId, demoQuery = false }: ResearchTabsProps) {
  const pathname = usePathname();
  const base = `/dashboard/worldforge/research/${runId}`;
  const suffix = demoQuery ? '?demo=1' : '';

  const tabs = [
    { href: base, label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: `${base}/agents`, label: 'Agents', icon: Users, exact: false },
    { href: `${base}/consensus`, label: 'Consensus', icon: Scale, exact: false },
    {
      href: `${base}/provenance`,
      label: 'Provenance',
      icon: Route,
      exact: false,
    },
  ];

  return (
    <nav className="flex flex-wrap gap-1.5 rounded-card border border-border bg-surface-2/40 p-1.5">
      {tabs.map((t) => {
        const active = t.exact
          ? pathname === t.href
          : pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={`${t.href}${suffix}` as never}
            className={`inline-flex items-center gap-2 rounded-btn px-3.5 py-2 text-caption font-semibold transition ${
              active
                ? 'bg-primary/15 text-white'
                : 'text-text-secondary hover:bg-surface-3 hover:text-white'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
