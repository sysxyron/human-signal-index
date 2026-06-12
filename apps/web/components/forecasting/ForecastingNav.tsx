'use client';

// =============================================================================
// HSI Phase 21 — secondary in-page nav for the forecasting section:
// Forecasts, Scenarios, Warnings.
// =============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TrendingUp, GitBranch, Siren, type LucideProps } from 'lucide-react';
import { type ComponentType } from 'react';
import { cn } from '@hsi/ui';

interface NavItem { label: string; href: string; icon: ComponentType<LucideProps> }

const ITEMS: NavItem[] = [
  { label: 'Forecasts', href: '/dashboard/forecasts', icon: TrendingUp },
  { label: 'Scenarios', href: '/dashboard/scenarios', icon: GitBranch },
  { label: 'Warnings', href: '/dashboard/warnings', icon: Siren },
];

export function ForecastingNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1.5 rounded-card border border-border bg-surface/50 p-1.5">
      <span className="ml-1 mr-1 inline-flex items-center gap-1.5 text-label text-electric">
        <TrendingUp className="h-3.5 w-3.5" /> Forecasting
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
