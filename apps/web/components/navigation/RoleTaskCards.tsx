'use client';

// =============================================================================
// HSI Phase 24D — RoleTaskCards. Shows the signed-in user clear next steps for
// their role on the dashboard home. Fetches the role via the read-only profile
// action; renders the canonical per-role task list. Read-only; links point only
// at routes the role can actually open.
// =============================================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@hsi/ui';
import { ListChecks, ArrowRight } from 'lucide-react';
import { getMyProfileAction } from '@/lib/profile/actions';
import { ROLE_LABEL, isRole, tasksForRole, type Role, type RoleTask } from '@/lib/navigation/role-tasks';

export function RoleTaskCards() {
  const [role, setRole] = useState<Role | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    getMyProfileAction()
      .then((res) => { if (active) { if (res.ok && isRole(res.data.role)) setRole(res.data.role); setLoaded(true); } })
      .catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  if (!loaded) {
    return (
      <Card className="border-border" padded>
        <div className="h-16 animate-pulse rounded-card bg-surface-2/40" />
      </Card>
    );
  }

  const tasks: RoleTask[] = tasksForRole(role);
  const label = role ? ROLE_LABEL[role] : 'Viewer';

  return (
    <Card className="space-y-3 border-border" padded>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <ListChecks className="h-4 w-4 text-electric" /> Your next steps
        </h3>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-label font-semibold uppercase tracking-wide text-text-secondary">{label}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {tasks.map((t) => (
          <Link key={t.href + t.label} href={t.href as never} className="flex items-center justify-between gap-2 rounded-card border border-border bg-surface/50 px-3 py-2.5 text-caption text-text-secondary transition hover:border-electric/50 hover:text-text-primary">
            <span>{t.label}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          </Link>
        ))}
      </div>
      <p className="text-label text-text-muted">
        See your role, status, and what your account can do on your{' '}
        <Link href={'/dashboard/profile' as never} className="font-semibold text-electric hover:text-white">profile</Link>.
      </p>
    </Card>
  );
}
