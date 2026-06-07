'use client';

import { useState, type ComponentType } from 'react';
import {
  LayoutDashboard,
  Database,
  Inbox,
  Archive,
  ScanText,
  Gauge,
  Network,
  ListChecks,
  Bell,
  Megaphone,
  FileBarChart,
  ShieldAlert,
  Settings,
  Activity,
  Menu,
  X,
  Search,
  Globe2,
  FlaskConical,
  SlidersHorizontal,
  CalendarClock,
  Workflow,
  GitCompareArrows,
  Route,
  Orbit,
  type LucideProps,
} from 'lucide-react';
import { cn } from './utils';
import { Button } from './primitives';

/* -------------------------------------------------------------------------- */
/* Brand mark                                                                   */
/* -------------------------------------------------------------------------- */

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <a href="/" className="flex items-center gap-2.5">
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent shadow-glow">
        <Activity className="h-4 w-4 text-white" />
      </span>
      {!compact ? (
        <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-text-primary">
          Human Signal Index
        </span>
      ) : null}
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/* PublicNav                                                                     */
/* -------------------------------------------------------------------------- */

export const publicNavLinks = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Methodology', href: '/methodology' },
  { label: 'Signal Library', href: '/signal-library' },
  { label: 'Research Reports', href: '/research-reports' },
  { label: 'Education Hub', href: '/education-hub' },
  { label: 'Submit a Signal', href: '/submit-a-signal' },
  { label: 'Transparency', href: '/transparency' },
  { label: 'Ethics', href: '/ethics' },
  { label: 'Contact', href: '/contact' },
];

export function PublicNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-3.5">
        <BrandMark />
        <nav className="hidden items-center gap-5 xl:flex">
          {publicNavLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[13px] font-medium text-text-secondary transition hover:text-text-primary"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-3 xl:flex">
          <a href="/dashboard">
            <Button variant="primary" size="sm">
              Explore Dashboard
            </Button>
          </a>
        </div>
        <button
          className="rounded-lg p-2 text-text-secondary xl:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open ? (
        <div className="border-t border-border bg-surface px-6 py-4 xl:hidden">
          <nav className="grid gap-1">
            {publicNavLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm text-text-secondary transition hover:bg-surface-2 hover:text-text-primary"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <a href="/dashboard" className="mt-2">
              <Button variant="primary" size="sm" className="w-full">
                Explore Dashboard
              </Button>
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Footer                                                                        */
/* -------------------------------------------------------------------------- */

const footerColumns: { title: string; links: { label: string; href: string }[] }[] =
  [
    {
      title: 'Platform',
      links: [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Signal Library', href: '/signal-library' },
        { label: 'Research Reports', href: '/research-reports' },
        { label: 'Submit a Signal', href: '/submit-a-signal' },
      ],
    },
    {
      title: 'About',
      links: [
        { label: 'Our Mission', href: '/about' },
        { label: 'Methodology', href: '/methodology' },
        { label: 'Education Hub', href: '/education-hub' },
        { label: 'Contact', href: '/contact' },
      ],
    },
    {
      title: 'Trust',
      links: [
        { label: 'Transparency', href: '/transparency' },
        { label: 'Ethics', href: '/ethics' },
        { label: 'Methodology', href: '/methodology' },
      ],
    },
  ];

export function Footer() {
  return (
    <footer className="border-t border-border bg-background-deep">
      <div className="mx-auto max-w-[1180px] px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="space-y-4">
            <BrandMark />
            <p className="max-w-xs text-body-sm leading-relaxed text-text-secondary">
              A public-interest observatory mapping the narratives that shape
              humanity — with traceability, transparency, and human review at
              every step.
            </p>
            <p className="text-caption text-text-muted">
              Evidence first. Traceability always. Humanity above all.
            </p>
          </div>
          {footerColumns.map((col) => (
            <div key={col.title}>
              <h5 className="text-label text-text-muted">{col.title}</h5>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label + link.href}>
                    <a
                      href={link.href}
                      className="text-body-sm text-text-secondary transition hover:text-text-primary"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-caption text-text-muted sm:flex-row">
          <span>© {new Date().getFullYear()} Human Signal Index. A public-interest project.</span>
          <span>Mapping the narratives that shape humanity.</span>
        </div>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */
/* DashboardSidebar                                                              */
/* -------------------------------------------------------------------------- */

interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<LucideProps>;
}

export const dashboardNavGroups: { group: string; items: NavItem[] }[] = [
  {
    group: 'Operations',
    items: [
      { label: 'Mission Control', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Source Registry', href: '/dashboard/source-registry', icon: Database },
      { label: 'Signal Intake', href: '/dashboard/signal-intake', icon: Inbox },
      { label: 'Evidence Vault', href: '/dashboard/evidence-vault', icon: Archive },
    ],
  },
  {
    group: 'Intelligence',
    items: [
      { label: 'Rhetoric Classifier', href: '/dashboard/rhetoric-classifier', icon: ScanText },
      { label: 'Risk Scoring', href: '/dashboard/risk-scoring', icon: Gauge },
      { label: 'Traceability Engine', href: '/dashboard/traceability-engine', icon: Network },
    ],
  },
  {
    group: 'Workflow',
    items: [
      { label: 'Review Queue', href: '/dashboard/review-queue', icon: ListChecks },
      { label: 'Alerts', href: '/dashboard/alerts', icon: Bell },
      { label: 'Counter-Narrative Studio', href: '/dashboard/counter-narrative', icon: Megaphone },
      { label: 'Public Reports', href: '/dashboard/public-reports', icon: FileBarChart },
    ],
  },
  {
    group: 'WorldForge',
    items: [
      { label: 'Overview', href: '/dashboard/worldforge', icon: Globe2 },
      { label: 'Simulations', href: '/dashboard/worldforge/simulations', icon: Orbit },
      { label: 'Scenario Sandbox', href: '/dashboard/worldforge/scenarios', icon: SlidersHorizontal },
      { label: 'Timelines', href: '/dashboard/worldforge/timelines', icon: CalendarClock },
      { label: 'Dependency Graph', href: '/dashboard/worldforge/dependency-graph', icon: Workflow },
      { label: 'Counterfactuals', href: '/dashboard/worldforge/counterfactuals', icon: GitCompareArrows },
      { label: 'Provenance', href: '/dashboard/worldforge/provenance', icon: Route },
      { label: 'Universe Forge', href: '/dashboard/worldforge/universes', icon: FlaskConical },
    ],
  },
  {
    group: 'System',
    items: [
      { label: 'Security Monitor', href: '/dashboard/security-monitor', icon: ShieldAlert },
      { label: 'Settings', href: '/dashboard/settings', icon: Settings },
    ],
  },
];

export function DashboardSidebar({ activeHref }: { activeHref?: string }) {
  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-background-deep lg:sticky lg:top-0 lg:flex">
      <div className="flex h-[57px] items-center border-b border-border px-5">
        <BrandMark />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {dashboardNavGroups.map((group) => (
          <div key={group.group}>
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              {group.group}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.href === activeHref;
                const Icon = item.icon;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition',
                      active
                        ? 'bg-primary/15 text-white shadow-[inset_0_0_0_1px_rgba(37,99,235,0.4)]'
                        : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
                    )}
                  >
                    <Icon
                      className={cn('h-4 w-4', active ? 'text-electric' : 'text-text-muted')}
                    />
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-4">
        <div className="rounded-card border border-border bg-surface/60 p-3">
          <div className="flex items-center gap-2 text-caption text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-verified shadow-[0_0_8px_#10B981]" />
            All systems operational
          </div>
        </div>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* TopNav (dashboard)                                                           */
/* -------------------------------------------------------------------------- */

export function TopNav({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-[57px] items-center justify-between gap-4 border-b border-border bg-background/80 px-5 backdrop-blur-xl">
      <div className="min-w-0">
        <h1 className="truncate text-h6 font-semibold text-text-primary">{title}</h1>
        {subtitle ? (
          <p className="truncate text-caption text-text-muted">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            placeholder="Search signals, sources…"
            className="w-56 rounded-btn border border-border bg-surface/80 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-electric"
          />
        </div>
        <button className="relative rounded-lg border border-border bg-surface/80 p-2 text-text-secondary transition hover:text-white">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-risk" />
        </button>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-caption font-bold text-white">
          AX
        </span>
      </div>
    </header>
  );
}
