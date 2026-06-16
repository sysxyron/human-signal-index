'use client';

// =============================================================================
// HSI Phase 41 — secondary in-page nav for the Compliance Control Center.
// =============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldCheck, FileText, AlertTriangle, ScrollText, Timer, UserCheck, Siren, Building, type LucideProps,
} from 'lucide-react';
import { type ComponentType } from 'react';
import { cn } from '@hsi/ui';

interface NavItem { label: string; href: string; icon: ComponentType<LucideProps> }
const BASE = '/dashboard/admin/compliance';
const ITEMS: NavItem[] = [
  { label: 'Overview', href: BASE, icon: ShieldCheck },
  { label: 'Evidence', href: `${BASE}/evidence`, icon: FileText },
  { label: 'Risks', href: `${BASE}/risks`, icon: AlertTriangle },
  { label: 'Policies', href: `${BASE}/policies`, icon: ScrollText },
  { label: 'Retention', href: `${BASE}/retention`, icon: Timer },
  { label: 'Access Reviews', href: `${BASE}/access-reviews`, icon: UserCheck },
  { label: 'Incidents', href: `${BASE}/incidents`, icon: Siren },
  { label: 'Vendors', href: `${BASE}/vendors`, icon: Building },
];

export function ComplianceNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1.5 rounded-card border border-border bg-surface/50 p-1.5">
      <span className="ml-1 mr-1 inline-flex items-center gap-1.5 text-label text-electric">
        <ShieldCheck className="h-3.5 w-3.5" /> Compliance
      </span>
      {ITEMS.map((item) => {
        const active = item.href === BASE ? pathname === BASE : pathname.startsWith(item.href);
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

/** The always-visible "ready, not certified" disclaimer banner (Deliverable M). */
export function ComplianceDisclaimer() {
  return (
    <div className="flex items-start gap-2.5 rounded-card border border-warning/40 bg-warning/10 p-3">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <p className="text-caption text-text-secondary">
        <span className="font-semibold text-text-primary">HSI is compliance-ready, not certified.</span>{' '}
        The platform is not currently certified under SOC 2, ISO 27001, HIPAA, PCI DSS, or FERPA. These
        controls, evidence, and readiness states support customer due diligence and future certification.
      </p>
    </div>
  );
}
