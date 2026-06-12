'use client';

// =============================================================================
// HSI Phase 22 — secondary in-page nav for the Executive Command Center:
// Command, Priorities, Risks, Opportunities, Briefings, Governance.
// =============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Command, ListChecks, ShieldAlert, Sparkles, FileText, Gavel, type LucideProps } from 'lucide-react';
import { type ComponentType } from 'react';
import { cn } from '@hsi/ui';

interface NavItem { label: string; href: string; icon: ComponentType<LucideProps> }

const ITEMS: NavItem[] = [
  { label: 'Command', href: '/dashboard/executive', icon: Command },
  { label: 'Priorities', href: '/dashboard/priorities', icon: ListChecks },
  { label: 'Risks', href: '/dashboard/risks', icon: ShieldAlert },
  { label: 'Opportunities', href: '/dashboard/opportunities', icon: Sparkles },
  { label: 'Briefings', href: '/dashboard/briefings', icon: FileText },
  { label: 'Governance', href: '/dashboard/exec-governance', icon: Gavel },
];

export function ExecutiveNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1.5 rounded-card border border-border bg-surface/50 p-1.5">
      <span className="ml-1 mr-1 inline-flex items-center gap-1.5 text-label text-electric">
        <Command className="h-3.5 w-3.5" /> Command Center
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
