// =============================================================================
// HSI Phase 47 — Mission Control: analyst quick actions. Role-aware shortcuts —
// shows ONLY links the signed-in role can already see (via the shared nav-roles
// `canSeeRoute`). UX-only; RBAC + middleware still gate every route. Never alters
// permissions.
// =============================================================================

import { canSeeRoute } from '@hsi/ui';
import { Send, ClipboardCheck, Database, Library, FileText, ArrowUpRight } from 'lucide-react';

const ACTIONS: { href: string; label: string; icon: typeof Send; external?: boolean }[] = [
  { href: '/submit-a-signal', label: 'Submit Signal', icon: Send, external: true },
  { href: '/dashboard/review', label: 'Review Queue', icon: ClipboardCheck },
  { href: '/dashboard/source-registry', label: 'Source Registry', icon: Database },
  { href: '/signal-library', label: 'Signal Library', icon: Library, external: true },
  { href: '/research-reports', label: 'Research Reports', icon: FileText, external: true },
];

export function QuickActions({ role }: { role: string | null }) {
  const visible = ACTIONS.filter((a) => canSeeRoute(a.href, role));
  if (visible.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {visible.map((a) => {
        const Icon = a.icon;
        return (
          <a
            key={a.href}
            href={a.href}
            className="group flex items-center gap-2 rounded-card border border-border bg-surface/60 px-4 py-3 transition hover:-translate-y-0.5 hover:border-electric/60"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-electric/15 text-electric"><Icon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-text-primary">{a.label}</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-text-muted group-hover:text-electric" />
          </a>
        );
      })}
    </div>
  );
}
