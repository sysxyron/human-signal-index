'use client';

// =============================================================================
// HSI Phase 17 — secondary in-page nav for the Public Trust & Governance section:
// Public trust, Trust history, Recalibration proposals, Trust drift, plus a link
// back to the Phase-16 Trust scores page. Highlights the active section.
// =============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Eye,
  History,
  ShieldCheck,
  Sliders,
  Waves,
  type LucideProps,
} from 'lucide-react';
import { type ComponentType } from 'react';
import { cn } from '@hsi/ui';

interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<LucideProps>;
}

const ITEMS: NavItem[] = [
  { label: 'Public trust', href: '/dashboard/trust/public', icon: Eye },
  { label: 'History', href: '/dashboard/trust/history', icon: History },
  { label: 'Proposals', href: '/dashboard/trust/proposals', icon: Sliders },
  { label: 'Drift', href: '/dashboard/trust/drift', icon: Waves },
  { label: 'Trust scores', href: '/dashboard/trust', icon: ShieldCheck },
];

export function TrustGovernanceNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1.5 rounded-card border border-border bg-surface/50 p-1.5">
      <span className="ml-1 mr-1 inline-flex items-center gap-1.5 text-label text-electric">
        <ShieldCheck className="h-3.5 w-3.5" />
        Trust &amp; governance
      </span>
      {ITEMS.map((item) => {
        const active =
          item.href === '/dashboard/trust'
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
            <Icon className={cn('h-4 w-4', active ? 'text-electric' : 'text-text-muted')} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
