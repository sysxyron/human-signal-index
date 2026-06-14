'use client';

// =============================================================================
// HSI Phase 24 — secondary in-page nav for the Human Operations section.
// =============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, ClipboardList, Gauge, Users, Bell, Command, UserCog, type LucideProps } from 'lucide-react';
import { type ComponentType } from 'react';
import { cn } from '@hsi/ui';

interface NavItem { label: string; href: string; icon: ComponentType<LucideProps> }

const ITEMS: NavItem[] = [
  { label: 'Center', href: '/dashboard/operations-center', icon: Activity },
  { label: 'My Work', href: '/dashboard/my-work', icon: ClipboardList },
  { label: 'Workloads', href: '/dashboard/workloads', icon: Gauge },
  { label: 'Teams', href: '/dashboard/teams', icon: Users },
  { label: 'Alerts', href: '/dashboard/operations-alerts', icon: Bell },
  { label: 'Executive', href: '/dashboard/executive-operations', icon: Command },
  { label: 'Contributors', href: '/dashboard/contributor-ops', icon: UserCog },
];

export function OperationsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1.5 rounded-card border border-border bg-surface/50 p-1.5">
      <span className="ml-1 mr-1 inline-flex items-center gap-1.5 text-label text-electric">
        <Activity className="h-3.5 w-3.5" /> Human Operations
      </span>
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href as never}
            className={cn('inline-flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-[13px] font-medium transition',
              active ? 'bg-primary/15 text-white shadow-[inset_0_0_0_1px_rgba(37,99,235,0.4)]' : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary')}>
            <Icon className={cn('h-4 w-4', active ? 'text-electric' : 'text-text-muted')} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
