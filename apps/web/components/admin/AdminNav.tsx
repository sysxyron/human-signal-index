'use client';

// =============================================================================
// HSI Phase 24B — secondary in-page nav for the Administration (IAM) section.
// =============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserCog, UsersRound, GraduationCap, ScrollText, ClipboardCheck, Activity, ShieldAlert, Target, Network, FileText, Rocket, type LucideProps } from 'lucide-react';
import { type ComponentType } from 'react';
import { cn } from '@hsi/ui';

interface NavItem { label: string; href: string; icon: ComponentType<LucideProps> }
const ITEMS: NavItem[] = [
  { label: 'Users', href: '/dashboard/admin/users', icon: UserCog },
  { label: 'Content', href: '/dashboard/admin/cms', icon: FileText },
  { label: 'Teams', href: '/dashboard/admin/teams', icon: UsersRound },
  { label: 'Applications', href: '/dashboard/admin/applications', icon: ClipboardCheck },
  { label: 'Contribution Monitoring', href: '/dashboard/admin/contribution-monitoring', icon: Activity },
  { label: 'Trust Monitoring', href: '/dashboard/admin/trust-monitoring', icon: ShieldAlert },
  { label: 'Outcome Monitoring', href: '/dashboard/admin/outcome-monitoring', icon: Target },
  { label: 'Graph Explorer', href: '/dashboard/admin/graph-explorer', icon: Network },
  { label: 'Graph Health', href: '/dashboard/admin/graph-health', icon: Activity },
  { label: 'Beta Ops', href: '/dashboard/admin/tester-ops', icon: Rocket },
  { label: 'Testers', href: '/dashboard/admin/testers', icon: GraduationCap },
  { label: 'Access Logs', href: '/dashboard/admin/access-logs', icon: ScrollText },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1.5 rounded-card border border-border bg-surface/50 p-1.5">
      <span className="ml-1 mr-1 inline-flex items-center gap-1.5 text-label text-electric">
        <UserCog className="h-3.5 w-3.5" /> Administration
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
