'use client';

// =============================================================================
// HSI Phase 7 — secondary in-dashboard nav shown on every Intelligence page.
// The shared @hsi/ui DashboardSidebar can't be extended from here, so this gives
// the 7 new sections first-class discoverability + cross-linking. Highlights the
// active section from the pathname.
// =============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Radar,
  Database,
  Inbox,
  ListChecks,
  Bell,
  BarChart3,
  type LucideProps,
} from 'lucide-react';
import { type ComponentType } from 'react';
import { cn } from '@hsi/ui';

interface IntelNavItem {
  label: string;
  href: string;
  icon: ComponentType<LucideProps>;
}

const ITEMS: IntelNavItem[] = [
  { label: 'Intelligence', href: '/dashboard/intelligence', icon: BarChart3 },
  { label: 'Sources', href: '/dashboard/sources', icon: Database },
  { label: 'Signals', href: '/dashboard/signals', icon: Inbox },
  { label: 'Watchlists', href: '/dashboard/watchlists', icon: ListChecks },
  { label: 'Alerts', href: '/dashboard/alerts', icon: Bell },
];

export function IntelNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1.5 rounded-card border border-border bg-surface/50 p-1.5">
      <span className="ml-1 mr-1 inline-flex items-center gap-1.5 text-label text-electric">
        <Radar className="h-3.5 w-3.5" />
        HSI
      </span>
      {ITEMS.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== '/dashboard/intelligence' &&
            pathname.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href as never}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-[13px] font-medium transition',
              active
                ? 'bg-primary/15 text-white shadow-[inset_0_0_0_1px_rgba(37,99,235,0.4)]'
                : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
            )}
          >
            <Icon
              className={cn('h-4 w-4', active ? 'text-electric' : 'text-text-muted')}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
